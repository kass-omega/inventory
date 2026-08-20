import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import PDFDocument from 'pdfkit';
import { JwtPayload } from '../common/interfaces/jwt-payload.interface';
import { PrismaService } from '../prisma/prisma.service';
import {
  AuditLogResponse,
  InventoryBreakdownResponse,
  InventoryBreakdownRow,
  PaymentMethodBreakdown,
  SalesSummaryResponse,
  SalesTrendPoint,
  TopProduct,
} from './entities/report.entity';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const LOW_STOCK_THRESHOLD = 10;
const DEAD_STOCK_MONTHS = 3;
const TOP_PRODUCTS_COUNT = 5;
const AUDIT_TRAIL_LIMIT = 50;

type ReportSection = {
  title: string;
  headers: string[];
  rows: (string | number)[][];
};

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  // =========================================================================
  // Inventory
  // =========================================================================

  async getInventoryBreakdown(
    user: JwtPayload,
    locationId?: number,
    categoryId?: number,
    search?: string,
  ): Promise<InventoryBreakdownResponse> {
    const targetLocationId = this.resolveLocationId(user, locationId);
    const productWhere = await this.buildProductWhereClause(categoryId, search);

    const inventories = await this.prisma.inventory.findMany({
      where: {
        ...(targetLocationId !== undefined &&
        targetLocationId !== null &&
        targetLocationId > 0
          ? { locationId: targetLocationId }
          : {}),
        product: productWhere,
      },
      include: {
        product: { include: { category: true } },
        location: true,
      },
    });

    const locations = await this.prisma.location.findMany();
    const productMap = new Map<number, InventoryBreakdownRow>();

    for (const inv of inventories) {
      const existing = productMap.get(inv.productId);

      if (!existing) {
        productMap.set(inv.productId, {
          productName: `${inv.product.brand} ${inv.product.baseName}`,
          category: inv.product.category?.name ?? 'Uncategorized',
          total: 0,
          locations: {},
        });
      }

      const data = productMap.get(inv.productId)!;
      data.total += inv.quantity;
      data.locations[inv.location.name] = inv.quantity;
    }

    return {
      columns: locations.map((l) => l.name),
      rows: Array.from(productMap.values()),
    };
  }

  // =========================================================================
  // Sales
  // =========================================================================

  async getSalesSummary(
    user: JwtPayload,
    startDate?: string,
    endDate?: string,
    locationId?: number,
    categoryId?: number,
    search?: string,
  ): Promise<SalesSummaryResponse> {
    const targetLocationId = this.resolveLocationId(user, locationId);
    const saleWhere = this.buildSaleWhereClause(
      startDate,
      endDate,
      targetLocationId,
    );

    const sales = await this.prisma.sale.findMany({
      where: saleWhere,
      include: {
        items: { include: { product: { include: { category: true } } } },
      },
    });

    const categoryNum =
      categoryId !== undefined && !Number.isNaN(categoryId) && categoryId > 0
        ? categoryId
        : null;
    const searchTerm = search?.toLowerCase() || null;

    let totalRevenue = 0;
    let totalCost = 0;
    const productSales: Record<string, number> = {};

    // Sale type breakdowns
    let fullyPaidRevenue = 0;
    let fullyPaidCost = 0;
    let partiallyPaidRevenue = 0;
    let partiallyPaidCost = 0;
    let creditedRevenue = 0;
    let creditedCost = 0;

    for (const sale of sales) {
      if (sale.items.length === 0) {
        // Quick-purchase flip: no line items — use the sale totals directly.
        if (categoryNum || searchTerm) continue;
        totalRevenue += sale.totalAmount;
        totalCost += sale.totalCost;
        if (sale.saleType === 'FULLY_PAID') {
          fullyPaidRevenue += sale.totalAmount;
          fullyPaidCost += sale.totalCost;
        } else if (sale.saleType === 'PARTIALLY_PAID') {
          partiallyPaidRevenue += sale.totalAmount;
          partiallyPaidCost += sale.totalCost;
        } else {
          creditedRevenue += sale.totalAmount;
          creditedCost += sale.totalCost;
        }
        continue;
      }

      for (const item of sale.items) {
        if (!this.matchesFilters(item, categoryNum, searchTerm)) continue;

        const itemRevenue = item.unitSellPrice * item.quantity;
        const itemCost = item.unitBuyPrice * item.quantity;

        totalRevenue += itemRevenue;
        totalCost += itemCost;

        if (sale.saleType === 'FULLY_PAID') {
          fullyPaidRevenue += itemRevenue;
          fullyPaidCost += itemCost;
        } else if (sale.saleType === 'PARTIALLY_PAID') {
          partiallyPaidRevenue += itemRevenue;
          partiallyPaidCost += itemCost;
        } else {
          creditedRevenue += itemRevenue;
          creditedCost += itemCost;
        }

        const name = `${item.product.brand} ${item.product.baseName}`;
        productSales[name] = (productSales[name] || 0) + item.quantity;
      }
    }

    // Collected (cash received) vs outstanding per sale type. The sale payment
    // fields are kept in sync whenever a credit payment is recorded against a
    // sale, so this reflects the actual money received so far.
    const paymentTotals = {
      fullyPaid: { collected: 0, outstanding: 0 },
      partiallyPaid: { collected: 0, outstanding: 0 },
      credited: { collected: 0, outstanding: 0 },
    };
    for (const sale of sales) {
      const matched =
        sale.items.length === 0
          ? !categoryNum && !searchTerm
          : sale.items.some((item) =>
              this.matchesFilters(item, categoryNum, searchTerm),
            );
      if (!matched) continue;
      const key =
        sale.saleType === 'FULLY_PAID'
          ? 'fullyPaid'
          : sale.saleType === 'PARTIALLY_PAID'
            ? 'partiallyPaid'
            : 'credited';
      paymentTotals[key].collected += sale.paidAmount || 0;
      paymentTotals[key].outstanding += sale.remainingAmount || 0;
    }

    // Subtract returns/refunds within the same shop + date window
    const returnWhere: any = {};
    if (targetLocationId) returnWhere.shopId = targetLocationId;
    if (startDate && endDate) {
      const eod = new Date(endDate);
      eod.setHours(23, 59, 59, 999);
      returnWhere.createdAt = { gte: new Date(startDate), lte: eod };
    }
    const returns = await this.prisma.return.findMany({
      where: returnWhere,
      include: { items: true },
    });
    let returnsRefund = 0;
    let returnsCost = 0;
    for (const r of returns) {
      returnsRefund += r.totalRefund;
      for (const ri of r.items) returnsCost += ri.unitBuyPrice * ri.quantity;
    }

    const netRevenue = totalRevenue - returnsRefund;
    const netCost = totalCost - returnsCost;
    const totalProfit = netRevenue - netCost;

    const topProducts: TopProduct[] = Object.entries(productSales)
      .map(([name, qty]) => ({ name, qty }))
      .sort((a, b) => b.qty - a.qty)
      .slice(0, TOP_PRODUCTS_COUNT);

    return {
      totalRevenue: netRevenue,
      totalCost: netCost,
      totalProfit,
      returns: { refund: returnsRefund, cost: returnsCost },
      margin: netRevenue > 0 ? ((totalProfit / netRevenue) * 100).toFixed(2) : '0.00',
      topProducts,
      breakdown: {
        fullyPaid: {
          revenue: fullyPaidRevenue,
          cost: fullyPaidCost,
          profit: fullyPaidRevenue - fullyPaidCost,
          collected: paymentTotals.fullyPaid.collected,
          outstanding: paymentTotals.fullyPaid.outstanding,
        },
        partiallyPaid: {
          revenue: partiallyPaidRevenue,
          cost: partiallyPaidCost,
          profit: partiallyPaidRevenue - partiallyPaidCost,
          collected: paymentTotals.partiallyPaid.collected,
          outstanding: paymentTotals.partiallyPaid.outstanding,
        },
        credited: {
          revenue: creditedRevenue,
          cost: creditedCost,
          profit: creditedRevenue - creditedCost,
          collected: paymentTotals.credited.collected,
          outstanding: paymentTotals.credited.outstanding,
        },
      },
    };
  }

  async getSalesTrend(
    user: JwtPayload,
    startDate?: string,
    endDate?: string,
    locationId?: number,
    categoryId?: number,
    search?: string,
  ): Promise<SalesTrendPoint[]> {
    const targetLocationId = this.resolveLocationId(user, locationId);
    const saleWhere = this.buildSaleWhereClause(startDate, endDate, targetLocationId);

    const sales = await this.prisma.sale.findMany({
      where: saleWhere,
      include: { items: { include: { product: true } } },
    });

    const categoryNum = categoryId && !Number.isNaN(categoryId) && categoryId > 0 ? categoryId : null;
    const searchTerm = search?.toLowerCase() || null;
    const trend: Record<string, { sales: number; flips: number; collections: number }> = {};

    for (const sale of sales) {
      const date = sale.saleDate.toISOString().slice(0, 10);
      trend[date] = trend[date] || { sales: 0, flips: 0, collections: 0 };
      if (sale.items.length === 0) {
        // Quick-purchase flip
        if (!categoryNum && !searchTerm) trend[date].flips += sale.totalAmount;
      } else {
        let dailyTotal = 0;
        for (const item of sale.items) {
          if (!this.matchesFilters(item, categoryNum, searchTerm)) continue;
          dailyTotal += item.unitSellPrice * item.quantity;
        }
        trend[date].sales += dailyTotal;
      }
    }

    // Credit collections, bucketed on the day the money actually arrived.
    const paymentWhere: any = {};
    if (startDate && endDate) {
      const endOfDay = new Date(endDate);
      endOfDay.setHours(23, 59, 59, 999);
      paymentWhere.paidAt = { gte: new Date(startDate), lte: endOfDay };
    }
    const creditPayments = await this.prisma.creditPayment.findMany({
      where: paymentWhere,
      include: {
        sale: { include: { items: { include: { product: true } } } },
        customer: true,
      },
    });
    for (const payment of creditPayments) {
      const shopId = payment.sale?.shopId ?? payment.customer?.shopId ?? null;
      if (targetLocationId && shopId !== targetLocationId) continue;
      if (categoryNum || searchTerm) {
        if (!payment.sale) continue; // unlinked payments only count without product filters
        const matched = payment.sale.items.some((item) =>
          this.matchesFilters(item, categoryNum, searchTerm),
        );
        if (!matched) continue;
      }
      const date = payment.paidAt.toISOString().slice(0, 10);
      trend[date] = trend[date] || { sales: 0, flips: 0, collections: 0 };
      trend[date].collections += payment.amount;
    }

    return Object.entries(trend)
      .map(([date, d]) => ({
        date,
        sales: Math.round(d.sales * 100) / 100,
        flips: Math.round(d.flips * 100) / 100,
        collections: Math.round(d.collections * 100) / 100,
      }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }

  async getMostSold(
    user: JwtPayload,
    locationId?: number,
    categoryId?: number,
    search?: string,
    startDate?: string,
    endDate?: string,
  ): Promise<TopProduct[]> {
    const targetLocationId = this.resolveLocationId(user, locationId);

    // Build date filter for sale via SaleItem relation
    let dateFilter: any = undefined;
    if (startDate && endDate) {
      const eod = new Date(endDate); eod.setHours(23, 59, 59, 999);
      dateFilter = { gte: new Date(startDate), lte: eod };
    }

    const saleWhere: any = {};
    if (targetLocationId) saleWhere.shopId = targetLocationId;
    if (dateFilter) saleWhere.saleDate = dateFilter;

    const items = await this.prisma.saleItem.findMany({
      where: { sale: saleWhere },
      include: { product: true },
    });

    const categoryNum = categoryId && !Number.isNaN(categoryId) && categoryId > 0 ? categoryId : null;
    const searchTerm = search?.toLowerCase() || null;

    const filteredItems = items.filter((item) =>
      this.matchesFilters(item, categoryNum, searchTerm),
    );

    const productMap: Record<string, number> = {};
    for (const item of filteredItems) {
      const name = `${item.product.brand} ${item.product.baseName}`;
      productMap[name] = (productMap[name] || 0) + item.quantity;
    }

    return Object.entries(productMap)
      .map(([name, qty]) => ({ name, qty }))
      .sort((a, b) => b.qty - a.qty)
      .slice(0, TOP_PRODUCTS_COUNT);
  }

  // =========================================================================
  // Stock Health
  // =========================================================================

  // =========================================================================
  // Payment Methods
  // =========================================================================

  async getPaymentMethodsBreakdown(
    user: JwtPayload,
    startDate?: string,
    endDate?: string,
    locationId?: number,
    categoryId?: number,
    search?: string,
  ): Promise<PaymentMethodBreakdown[]> {
    const targetLocationId = this.resolveLocationId(user, locationId);
    const saleWhere = this.buildSaleWhereClause(startDate, endDate, targetLocationId);

    const sales = await this.prisma.sale.findMany({
      where: saleWhere,
      include: { paymentMethod: true, items: { include: { product: true } } },
    });

    const categoryNum = categoryId && !Number.isNaN(categoryId) && categoryId > 0 ? categoryId : null;
    const searchTerm = search?.toLowerCase() || null;

    let start: Date | undefined;
    let endOfDay: Date | undefined;
    if (startDate && endDate) {
      start = new Date(startDate);
      endOfDay = new Date(endDate);
      endOfDay.setHours(23, 59, 59, 999);
    }

    const map = new Map<string, { count: number; total: number }>();
    const add = (method: string, amount: number) => {
      if (amount <= 0) return;
      const entry = map.get(method) || { count: 0, total: 0 };
      entry.count += 1;
      entry.total += amount;
      map.set(method, entry);
    };

    // Money received at sale time — fully paid sales and the initial portion of
    // partial sales — labelled with the sale type (e.g. "Cash (Fully Paid)",
    // "Cash (Partial)").
    const partialSaleIds = sales
      .filter((s) => s.saleType === 'PARTIALLY_PAID')
      .map((s) => s.id);
    const linkedTotals = partialSaleIds.length
      ? await this.prisma.creditPayment.groupBy({
          by: ['saleId'],
          where: { saleId: { in: partialSaleIds } },
          _sum: { amount: true },
        })
      : [];
    const linkedBySale = new Map<number, number>(
      linkedTotals.map((l) => [l.saleId as number, l._sum.amount || 0]),
    );

    for (const sale of sales) {
      let saleTotal = 0;
      if (sale.items.length === 0) {
        if (!categoryNum && !searchTerm) saleTotal = sale.totalAmount;
      } else {
        for (const item of sale.items) {
          if (!this.matchesFilters(item, categoryNum, searchTerm)) continue;
          saleTotal += item.unitSellPrice * item.quantity;
        }
      }
      if (saleTotal === 0) continue;

      const methodName = sale.paymentMethod?.name ?? 'Unspecified';
      if (sale.saleType === 'FULLY_PAID') {
        add(`${methodName} (Fully Paid)`, sale.paidAmount || sale.totalAmount);
      } else if (sale.saleType === 'PARTIALLY_PAID') {
        // The initial partial amount excludes anything already settled through
        // linked credit payments (those are reported separately below).
        const settled = linkedBySale.get(sale.id) || 0;
        const initialPaid = Math.max(0, (sale.paidAmount || 0) - settled);
        add(`${methodName} (Partial)`, initialPaid);
      }
      // CREDITED sales contribute nothing at sale time — only their credit
      // payments (below) count as money received.
    }

    // Credit payments received in the window, by their own payment method.
    const paymentWhere: any = {};
    if (start && endOfDay) paymentWhere.paidAt = { gte: start, lte: endOfDay };
    const creditPayments = await this.prisma.creditPayment.findMany({
      where: paymentWhere,
      include: {
        paymentMethod: true,
        sale: { include: { items: { include: { product: true } } } },
        customer: true,
      },
    });

    for (const payment of creditPayments) {
      const shopId = payment.sale?.shopId ?? payment.customer?.shopId ?? null;
      if (targetLocationId && shopId !== targetLocationId) continue;

      if (categoryNum || searchTerm) {
        if (!payment.sale) continue; // unlinked payments only count without product filters
        const matched = payment.sale.items.some((item) =>
          this.matchesFilters(item, categoryNum, searchTerm),
        );
        if (!matched) continue;
      }

      const methodName = payment.paymentMethod?.name ?? 'Cash';
      add(`${methodName} (Credit)`, payment.amount);
    }

    return Array.from(map.entries()).map(([method, data]) => ({
      method,
      count: data.count,
      totalAmount: Math.round(data.total * 100) / 100,
    }));
  }

  // =========================================================================
  // Low Stock / Dead Stock
  // =========================================================================

  async getLowStock(
    user: JwtPayload,
    search?: string,
    categoryId?: string,
    locationId?: string,
  ) {
    const targetLocationId =
      user.locationId !== null
        ? user.locationId
        : locationId
          ? Number(locationId)
          : undefined;

    const where: any = {};
    if (categoryId) where.categoryId = Number(categoryId);
    if (search) {
      const attrIds = await this.prisma.findProductIdsByAttributes(search);
      where.OR = [
        { baseName: { contains: search, mode: 'insensitive' } },
        { brand: { contains: search, mode: 'insensitive' } },
        { sku: { contains: search, mode: 'insensitive' } },
        ...(attrIds.length > 0 ? [{ id: { in: attrIds } }] : []),
      ];
    }

    // Get all low-stock inventory entries directly, grouped by product
    const lowInventories = await this.prisma.inventory.findMany({
      where: {
        quantity: { lt: LOW_STOCK_THRESHOLD },
        ...(targetLocationId ? { locationId: targetLocationId } : {}),
        product: where,
      },
      include: {
        product: true,
        location: true,
      },
    });

    // Group by product and sum quantities across locations for the total
    const productMap = new Map<
      number,
      { id: number; name: string; total: number; locations: string[] }
    >();

    for (const inv of lowInventories) {
      if (!productMap.has(inv.productId)) {
        productMap.set(inv.productId, {
          id: inv.productId,
          name: `${inv.product.brand} ${inv.product.baseName}`,
          total: 0,
          locations: [],
        });
      }
      const entry = productMap.get(inv.productId)!;
      entry.total += inv.quantity;
      entry.locations.push(inv.location.name);
    }

    // If Shopkeeper, find their active requests to prevent duplicates
    const pendingRequests = new Map<number, string>();
    if (user.locationType === 'SHOP' && user.locationId) {
      const activeRequests = await this.prisma.requestItem.findMany({
        where: {
          request: {
            shopId: user.locationId,
            status: {
              in: [
                'PENDING',
                'PARTIALLY_APPROVED',
                'APPROVED',
                'PARTIALLY_DISPATCHED',
              ],
            },
          },
          status: { in: ['PENDING', 'APPROVED'] },
        },
        include: { request: true },
      });

      for (const reqItem of activeRequests) {
        if (!pendingRequests.has(reqItem.productId)) {
          pendingRequests.set(
            reqItem.productId,
            reqItem.request.status.replace(/_/g, ' '),
          );
        }
      }
    }

    return Array.from(productMap.values())
      .map((p) => ({
        id: p.id,
        name: p.name,
        total: p.total,
        locationName: p.locations[0] || null,
        requestedStatus: pendingRequests.get(p.id) || null,
      }))
      .sort((a, b) => a.total - b.total);
  }

  async getDeadStock(
    user: JwtPayload,
    search?: string,
    categoryId?: string,
    locationId?: string,
  ) {
    const threeMonthsAgo = new Date();
    threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - DEAD_STOCK_MONTHS);

    const productWhere: any = {};
    if (categoryId) productWhere.categoryId = Number(categoryId);
    if (search) {
      const attrIds = await this.prisma.findProductIdsByAttributes(search);
      productWhere.OR = [
        { baseName: { contains: search, mode: 'insensitive' } },
        { brand: { contains: search, mode: 'insensitive' } },
        { sku: { contains: search, mode: 'insensitive' } },
        ...(attrIds.length > 0 ? [{ id: { in: attrIds } }] : []),
      ];
    }

    // Determine which location(s) to check inventory for
    let inventoryLocationId: number | undefined;
    if (user.locationId === null) {
      inventoryLocationId =
        locationId && Number(locationId) > 0 ? Number(locationId) : undefined;
    } else {
      inventoryLocationId = user.locationId ?? undefined;
    }

    // Get inventory at the target location with quantity > 0
    const inventories = await this.prisma.inventory.findMany({
      where: {
        quantity: { gt: 0 },
        ...(inventoryLocationId ? { locationId: inventoryLocationId } : {}),
        product: productWhere,
      },
      include: {
        product: true,
        location: true,
      },
    });

    // Check if each product was sold from that specific location (shop) recently.
    // Products stocked in stores (warehouses) naturally have no sales,
    // so they correctly appear as dead stock.
    const result: {
      id: number;
      name: string;
      locationName: string;
    }[] = [];

    for (const inv of inventories) {
      const recentSaleItems = await this.prisma.saleItem.findFirst({
        where: {
          productId: inv.productId,
          sale: {
            shopId: inv.locationId,
            saleDate: { gte: threeMonthsAgo },
          },
        },
      });

      if (!recentSaleItems) {
        result.push({
          id: inv.productId,
          name: `${inv.product.brand} ${inv.product.baseName}`,
          locationName: inv.location.name,
        });
      }
    }

    return result;
  }

  // =========================================================================
  // Audit
  // =========================================================================

  async getAuditTrail(): Promise<AuditLogResponse[]> {
    const logs = await this.prisma.auditLog.findMany({
      include: {
        user: { select: { id: true, email: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: AUDIT_TRAIL_LIMIT,
    });

    return logs.map((log) => ({
      id: log.id,
      userId: log.userId,
      action: log.action,
      details: log.details,
      createdAt: log.createdAt,
      user: {
        id: log.user.id,
        email: log.user.email,
        name: log.user.name,
      },
    }));
  }

  // =========================================================================
  // Private helpers
  // =========================================================================

  /**
   * Owners can query any location; non-owners are locked to their own.
   * Returns undefined for owner with no locationId filter (show all).
   * Returns 0 or negative as undefined to avoid filtering on invalid IDs.
   */
  private resolveLocationId(
    user: JwtPayload,
    locationId?: number,
  ): number | undefined {
    if (user.locationId !== null) {
      return user.locationId ?? undefined;
    }

    // Owner: if locationId is 0, NaN, or negative, treat as "no filter"
    if (
      locationId === undefined ||
      locationId === null ||
      Number.isNaN(locationId) ||
      locationId <= 0
    ) {
      return undefined;
    }

    return locationId;
  }

  /**
   * Build a `Prisma.ProductWhereInput` from optional category and search.
   */
  private async buildProductWhereClause(
    categoryId?: number,
    search?: string,
  ): Promise<Prisma.ProductWhereInput> {
    const where: Prisma.ProductWhereInput = {};

    if (
      categoryId !== undefined &&
      categoryId !== null &&
      !Number.isNaN(categoryId) &&
      categoryId > 0
    ) {
      where.categoryId = categoryId;
    }

    if (search) {
      const attrIds = await this.prisma.findProductIdsByAttributes(search);
      where.OR = [
        { baseName: { contains: search, mode: 'insensitive' } },
        { brand: { contains: search, mode: 'insensitive' } },
        { sku: { contains: search, mode: 'insensitive' } },
        ...(attrIds.length > 0 ? [{ id: { in: attrIds } }] : []),
      ];
    }

    return where;
  }

  /**
   * Build a `Prisma.SaleWhereInput` from optional date range and location.
   */
  private buildSaleWhereClause(
    startDate?: string,
    endDate?: string,
    locationId?: number,
  ): Prisma.SaleWhereInput {
    const where: Prisma.SaleWhereInput = {};

    if (startDate && endDate) {
      const endOfDay = new Date(endDate);
      endOfDay.setHours(23, 59, 59, 999);
      where.saleDate = {
        gte: new Date(startDate),
        lte: endOfDay,
      };
    }

    if (
      locationId !== undefined &&
      locationId !== null &&
      !Number.isNaN(locationId) &&
      locationId > 0
    ) {
      where.shopId = locationId;
    }

    return where;
  }

  /**
   * Check whether a sale item matches the given category and search filters.
   * Accepts any object with a `product` that has `categoryId`, `baseName`,
   * and `brand` fields — works across SaleItem and other item-like shapes.
   */
  private matchesFilters(
    item: {
      product: {
        categoryId: number | null;
        baseName: string;
        brand: string;
        sku?: string;
        attributes?: unknown;
      };
    },
    categoryId: number | null,
    searchTerm: string | null,
  ): boolean {
    if (
      categoryId !== null &&
      !Number.isNaN(categoryId) &&
      categoryId > 0 &&
      item.product.categoryId !== categoryId
    ) {
      return false;
    }

    if (searchTerm !== null) {
      const haystack = [
        item.product.baseName,
        item.product.brand,
        item.product.sku ?? '',
        JSON.stringify(item.product.attributes ?? {}),
      ]
        .join(' ')
        .toLowerCase();
      if (!haystack.includes(searchTerm)) {
        return false;
      }
    }

    return true;
  }

  // =========================================================================
  // Unified Stats (Sales + Purchases)
  // =========================================================================

  async getUnifiedStats(user: JwtPayload, locationId?: number, startDate?: string, endDate?: string, categoryId?: number, search?: string) {
    const shopId = this.resolveLocationId(user, locationId);

    let dateFilter: any = undefined;
    if (startDate && endDate) {
      const endOfDay = new Date(endDate);
      endOfDay.setHours(23, 59, 59, 999);
      dateFilter = { gte: new Date(startDate), lte: endOfDay };
    }

    const baseWhere: any = {};
    if (shopId) baseWhere.shopId = shopId;
    else if (user.locationType === 'SHOP') baseWhere.shopId = user.locationId;
    if (dateFilter) baseWhere.saleDate = dateFilter;

    // Optional item-level filter (regular sales only; flips have no items)
    let itemFilter: any = undefined;
    if (categoryId) itemFilter = { product: { categoryId: +categoryId } };
    if (search) {
      itemFilter = {
        ...(itemFilter || {}),
        product: {
          ...(itemFilter?.product || {}),
          OR: [
            { brand: { contains: search, mode: 'insensitive' } },
            { baseName: { contains: search, mode: 'insensitive' } },
          ],
        },
      };
    }
    const salesWhere: any = { ...baseWhere, ...(itemFilter ? { items: { some: itemFilter } } : {}) };

    const regularSales = await this.prisma.sale.aggregate({
      where: { ...salesWhere, purchaseId: null },
      _sum: { totalAmount: true, totalCost: true, profit: true },
      _count: true,
    });

    const flips = await this.prisma.sale.aggregate({
      where: { ...baseWhere, purchaseId: { not: null } },
      _sum: { totalAmount: true, totalCost: true, profit: true },
      _count: true,
    });

    // Sale type breakdown (gross, all sales) + actual collections per type
    const [fullyPaid, partiallyPaid, credited] = await Promise.all([
      this.prisma.sale.aggregate({ where: { ...baseWhere, saleType: 'FULLY_PAID' }, _sum: { totalAmount: true, profit: true, paidAmount: true, remainingAmount: true } }),
      this.prisma.sale.aggregate({ where: { ...baseWhere, saleType: 'PARTIALLY_PAID' }, _sum: { totalAmount: true, profit: true, paidAmount: true, remainingAmount: true } }),
      this.prisma.sale.aggregate({ where: { ...baseWhere, saleType: 'CREDITED' }, _sum: { totalAmount: true, profit: true, paidAmount: true, remainingAmount: true } }),
    ]);

    // Returns within the same window
    const returnWhere: any = {};
    if (shopId) returnWhere.shopId = shopId;
    else if (user.locationType === 'SHOP') returnWhere.shopId = user.locationId;
    if (dateFilter) returnWhere.createdAt = dateFilter;

    const returns = await this.prisma.return.findMany({
      where: returnWhere,
      include: { items: true },
    });
    let returnsRefund = 0;
    let returnsCost = 0;
    for (const r of returns) {
      returnsRefund += r.totalRefund;
      for (const ri of r.items) returnsCost += ri.unitBuyPrice * ri.quantity;
    }

    const grossRevenue = (regularSales._sum.totalAmount || 0) + (flips._sum.totalAmount || 0);
    const grossCost = (regularSales._sum.totalCost || 0) + (flips._sum.totalCost || 0);

    const netRevenue = grossRevenue - returnsRefund;
    const netCost = grossCost - returnsCost;
    const netProfit = netRevenue - netCost;
    const margin = netRevenue > 0 ? (netProfit / netRevenue) * 100 : 0;

    const pendingCount = await this.prisma.purchase.count({
      where: { status: 'PENDING', ...(shopId ? { shopId } : {}) },
    });

    const salesRevenue = regularSales._sum.totalAmount || 0;
    const salesProfit = regularSales._sum.profit || 0;
    const flipsRevenue = flips._sum.totalAmount || 0;
    const flipsProfit = flips._sum.profit || 0;
    const salesMargin = salesRevenue > 0 ? (salesProfit / salesRevenue) * 100 : 0;
    const flipsMargin = flipsRevenue > 0 ? (flipsProfit / flipsRevenue) * 100 : 0;

    return {
      sales: {
        revenue: salesRevenue,
        cost: regularSales._sum.totalCost || 0,
        profit: salesProfit,
        count: regularSales._count,
        margin: +salesMargin.toFixed(1),
        breakdown: {
          fullyPaid: {
            revenue: fullyPaid._sum.totalAmount || 0,
            profit: fullyPaid._sum.profit || 0,
            collected: fullyPaid._sum.paidAmount || 0,
            outstanding: fullyPaid._sum.remainingAmount || 0,
          },
          partiallyPaid: {
            revenue: partiallyPaid._sum.totalAmount || 0,
            profit: partiallyPaid._sum.profit || 0,
            collected: partiallyPaid._sum.paidAmount || 0,
            outstanding: partiallyPaid._sum.remainingAmount || 0,
          },
          credited: {
            revenue: credited._sum.totalAmount || 0,
            profit: credited._sum.profit || 0,
            collected: credited._sum.paidAmount || 0,
            outstanding: credited._sum.remainingAmount || 0,
          },
        },
      },
      flips: {
        revenue: flipsRevenue,
        cost: flips._sum.totalCost || 0,
        profit: flipsProfit,
        count: flips._count,
        margin: +flipsMargin.toFixed(1),
      },
      returns: { refund: returnsRefund, cost: returnsCost },
      pendingPurchases: pendingCount,
      combined: {
        totalRevenue: netRevenue,
        totalCost: netCost,
        netProfit,
        margin: +margin.toFixed(1),
      },
    };
  }

  // =========================================================================
  // Cash Ledger & Day Sheet
  // =========================================================================

  async getCashLedger(user: JwtPayload, locationId?: number, startDate?: string, endDate?: string) {
    const shopId = this.resolveLocationId(user, locationId);
    const where: any = {};
    if (shopId) where.shopId = shopId;
    else if (user.locationType === 'SHOP') where.shopId = user.locationId;
    if (startDate && endDate) {
      const eod = new Date(endDate);
      eod.setHours(23, 59, 59, 999);
      where.createdAt = { gte: new Date(startDate), lte: eod };
    }
    return this.prisma.cashEntry.findMany({
      where,
      include: { shop: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getDaySheet(user: JwtPayload, locationId?: number, startDate?: string, endDate?: string) {
    const shopId = this.resolveLocationId(user, locationId);
    const shopWhere: any = {};
    if (shopId) shopWhere.shopId = shopId;
    else if (user.locationType === 'SHOP') shopWhere.shopId = user.locationId;

    let start: Date | undefined;
    let end: Date | undefined;
    if (startDate && endDate) {
      start = new Date(startDate);
      end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
    }

    // Opening balance = net of all entries before the window
    const beforeWhere: any = { ...shopWhere };
    if (start) beforeWhere.createdAt = { lt: start };

    const beforeEntries = await this.prisma.cashEntry.findMany({ where: beforeWhere });
    let balance = 0;
    for (const e of beforeEntries) {
      balance += e.type === 'INFLOW' ? e.amount : -e.amount;
    }
    const opening = balance;

    // Entries within the window, grouped by day
    const inWhere: any = { ...shopWhere };
    if (start && end) inWhere.createdAt = { gte: start, lte: end };

    const entries = await this.prisma.cashEntry.findMany({
      where: inWhere,
      orderBy: { createdAt: 'asc' },
    });

    const days: Record<string, { date: string; inflow: number; outflow: number; closing: number }> = {};
    let totalInflow = 0;
    let totalOutflow = 0;
    for (const e of entries) {
      const date = e.createdAt.toISOString().slice(0, 10);
      days[date] = days[date] || { date, inflow: 0, outflow: 0, closing: 0 };
      if (e.type === 'INFLOW') {
        days[date].inflow += e.amount;
        totalInflow += e.amount;
        balance += e.amount;
      } else {
        days[date].outflow += e.amount;
        totalOutflow += e.amount;
        balance -= e.amount;
      }
      days[date].closing = balance;
    }

    return {
      opening,
      totalInflow,
      totalOutflow,
      closing: balance,
      days: Object.values(days).sort((a, b) => a.date.localeCompare(b.date)),
    };
  }

  // =========================================================================
  // CSV exports
  // =========================================================================

  private toCsv(headers: string[], rows: (string | number)[][]): string {
    const escape = (value: string | number) => {
      const s = String(value ?? '');
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    return [
      headers.map(escape).join(','),
      ...rows.map((row) => row.map(escape).join(',')),
    ].join('\n');
  }

  private buildCsv(sections: ReportSection[]): string {
    const escape = (value: string | number) => {
      const s = String(value ?? '');
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    return sections
      .map((section) => {
        const headerRow = section.headers.map(escape).join(',');
        const dataRows = section.rows.map((row) =>
          row.map(escape).join(','),
        );
        return [section.title, headerRow, ...dataRows].join('\n');
      })
      .join('\n\n');
  }

  async getInventoryBreakdownCsv(
    user: JwtPayload,
    locationId?: number,
    categoryId?: number,
    search?: string,
  ): Promise<string> {
    const data = await this.getInventoryBreakdown(
      user,
      locationId,
      categoryId,
      search,
    );
    const headers = ['Product', 'Category', 'Total', ...data.columns];
    const rows = data.rows.map((r) => [
      r.productName,
      r.category,
      r.total,
      ...data.columns.map((c) => r.locations[c] ?? 0),
    ]);
    return this.toCsv(headers, rows);
  }

  async getLowStockCsv(
    user: JwtPayload,
    search?: string,
    categoryId?: string,
    locationId?: string,
  ): Promise<string> {
    const data = await this.getLowStock(user, search, categoryId, locationId);
    const headers = ['Product', 'Total', 'Location', 'Request Status'];
    const rows = data.map((d) => [
      d.name,
      d.total,
      d.locationName ?? '',
      d.requestedStatus ?? '',
    ]);
    return this.toCsv(headers, rows);
  }

  async getDeadStockCsv(
    user: JwtPayload,
    search?: string,
    categoryId?: string,
    locationId?: string,
  ): Promise<string> {
    const data = await this.getDeadStock(user, search, categoryId, locationId);
    const headers = ['Product', 'Location'];
    const rows = data.map((d) => [d.name, d.locationName]);
    return this.toCsv(headers, rows);
  }

  // =========================================================================
  // PDF exports
  // =========================================================================

  private buildPdf(sections: ReportSection[]): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({
        size: 'A4',
        layout: 'landscape',
        margin: 40,
      });
      const chunks: Buffer[] = [];
      doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      sections.forEach((section, idx) => {
        if (idx > 0) doc.addPage();

        const { headers, rows } = section;
        const colCount = Math.max(headers.length, 1);
        const left = 40;
        const colWidth = (doc.page.width - 80) / colCount;
        const lineHeight = 16;

        doc.font('Helvetica-Bold').fontSize(14).text(section.title);
        doc.moveDown(0.4);

        const renderRow = (cells: (string | number)[], bold: boolean) => {
          const startY = doc.y;
          cells.forEach((cell, i) => {
            doc
              .font(bold ? 'Helvetica-Bold' : 'Helvetica')
              .fontSize(bold ? 9 : 8)
              .text(String(cell ?? ''), left + i * colWidth, startY, {
                width: colWidth - 6,
                height: lineHeight,
                ellipsis: true,
                lineBreak: false,
              });
          });
          doc.y = startY + lineHeight;
        };

        if (doc.y > doc.page.height - 80) doc.addPage();
        renderRow(headers, true);
        doc.moveDown(0.2);

        for (const row of rows) {
          if (doc.y > doc.page.height - 80) doc.addPage();
          renderRow(row, false);
        }
      });

      doc.end();
    });
  }

  async getInventoryBreakdownPdf(
    user: JwtPayload,
    locationId?: number,
    categoryId?: number,
    search?: string,
  ): Promise<Buffer> {
    const data = await this.getInventoryBreakdown(
      user,
      locationId,
      categoryId,
      search,
    );
    const headers = ['Product', 'Category', 'Total', ...data.columns];
    const rows = data.rows.map((r) => [
      r.productName,
      r.category,
      r.total,
      ...data.columns.map((c) => r.locations[c] ?? 0),
    ]);
    return this.buildPdf([{ title: 'Inventory Breakdown', headers, rows }]);
  }

  async getLowStockPdf(
    user: JwtPayload,
    search?: string,
    categoryId?: string,
    locationId?: string,
  ): Promise<Buffer> {
    const data = await this.getLowStock(user, search, categoryId, locationId);
    const headers = ['Product', 'Total', 'Location', 'Request Status'];
    const rows = data.map((d) => [
      d.name,
      d.total,
      d.locationName ?? '',
      d.requestedStatus ?? '',
    ]);
    return this.buildPdf([{ title: 'Low Stock Report', headers, rows }]);
  }

  async getDeadStockPdf(
    user: JwtPayload,
    search?: string,
    categoryId?: string,
    locationId?: string,
  ): Promise<Buffer> {
    const data = await this.getDeadStock(user, search, categoryId, locationId);
    const headers = ['Product', 'Location'];
    const rows = data.map((d) => [d.name, d.locationName]);
    return this.buildPdf([{ title: 'Dead Stock Report', headers, rows }]);
  }

  // =========================================================================
  // Sales & combined exports
  // =========================================================================

  private async getSalesSections(
    user: JwtPayload,
    startDate?: string,
    endDate?: string,
    locationId?: number,
    categoryId?: number,
    search?: string,
  ): Promise<ReportSection[]> {
    const summary = await this.getSalesSummary(
      user,
      startDate,
      endDate,
      locationId,
      categoryId,
      search,
    );
    const paymentMethods = await this.getPaymentMethodsBreakdown(
      user,
      startDate,
      endDate,
      locationId,
      categoryId,
      search,
    );
    const salesList = await this.getSalesListSection(
      user,
      startDate,
      endDate,
      locationId,
      categoryId,
      search,
    );

    return [
      {
        title: 'Sales Summary',
        headers: ['Metric', 'Value'],
        rows: [
          ['Revenue', summary.totalRevenue],
          ['Cost', summary.totalCost],
          ['Profit', summary.totalProfit],
          ['Margin', `${summary.margin}%`],
        ],
      },
      {
        title: 'Sale Type Breakdown',
        headers: ['Type', 'Revenue', 'Cost', 'Profit', 'Collected', 'Outstanding'],
        rows: [
          [
            'Fully Paid',
            summary.breakdown.fullyPaid.revenue,
            summary.breakdown.fullyPaid.cost,
            summary.breakdown.fullyPaid.profit,
            summary.breakdown.fullyPaid.collected,
            summary.breakdown.fullyPaid.outstanding,
          ],
          [
            'Partially Paid',
            summary.breakdown.partiallyPaid.revenue,
            summary.breakdown.partiallyPaid.cost,
            summary.breakdown.partiallyPaid.profit,
            summary.breakdown.partiallyPaid.collected,
            summary.breakdown.partiallyPaid.outstanding,
          ],
          [
            'Credited',
            summary.breakdown.credited.revenue,
            summary.breakdown.credited.cost,
            summary.breakdown.credited.profit,
            summary.breakdown.credited.collected,
            summary.breakdown.credited.outstanding,
          ],
        ],
      },
      {
        title: 'Top Selling Products',
        headers: ['Product', 'Quantity'],
        rows: summary.topProducts.map((p) => [p.name, p.qty]),
      },
      {
        title: 'Payment Methods',
        headers: ['Method', 'Count', 'Total Amount'],
        rows: paymentMethods.map((p) => [p.method, p.count, p.totalAmount]),
      },
      {
        title: 'Credit Collections by Payment Method',
        headers: ['Method', 'Count', 'Total Amount'],
        rows: paymentMethods
          .filter((p) => p.method.includes('(Credit)'))
          .map((p) => [p.method, p.count, p.totalAmount]),
      },
      salesList,
    ];
  }

  private async getSalesListSection(
    user: JwtPayload,
    startDate?: string,
    endDate?: string,
    locationId?: number,
    categoryId?: number,
    search?: string,
  ): Promise<ReportSection> {
    const targetLocationId = this.resolveLocationId(user, locationId);
    const saleWhere = this.buildSaleWhereClause(
      startDate,
      endDate,
      targetLocationId,
    );
    const categoryNum =
      categoryId !== undefined &&
      categoryId !== null &&
      !Number.isNaN(categoryId) &&
      categoryId > 0
        ? categoryId
        : null;
    const searchTerm = search?.toLowerCase() || null;

    const sales = await this.prisma.sale.findMany({
      where: saleWhere,
      include: {
        items: { include: { product: { include: { category: true } } } },
        shop: true,
      },
      orderBy: { saleDate: 'desc' },
      take: 500,
    });

    const rows = sales
      .filter((s) => {
        if (!categoryNum && !searchTerm) return true;
        return s.items.some((item) =>
          this.matchesFilters(item, categoryNum, searchTerm),
        );
      })
      .map((s) => [
        s.invoiceNumber,
        s.saleDate.toISOString().slice(0, 10),
        s.shop?.name ?? '',
        s.items.map((i) => `${i.quantity}x ${i.product.baseName}`).join(', '),
        s.totalAmount,
        s.saleType,
      ]);

    return {
      title: 'Sales List',
      headers: ['Invoice', 'Date', 'Shop', 'Items', 'Total', 'Type'],
      rows,
    };
  }

  async getSalesCsv(
    user: JwtPayload,
    startDate?: string,
    endDate?: string,
    locationId?: number,
    categoryId?: number,
    search?: string,
  ): Promise<string> {
    const sections = await this.getSalesSections(
      user,
      startDate,
      endDate,
      locationId,
      categoryId,
      search,
    );
    return this.buildCsv(sections);
  }

  async getSalesPdf(
    user: JwtPayload,
    startDate?: string,
    endDate?: string,
    locationId?: number,
    categoryId?: number,
    search?: string,
  ): Promise<Buffer> {
    const sections = await this.getSalesSections(
      user,
      startDate,
      endDate,
      locationId,
      categoryId,
      search,
    );
    return this.buildPdf(sections);
  }

  private async getFullReportSections(
    user: JwtPayload,
    startDate?: string,
    endDate?: string,
    locationId?: number,
    categoryId?: number,
    search?: string,
  ): Promise<ReportSection[]> {
    const salesSections = await this.getSalesSections(
      user,
      startDate,
      endDate,
      locationId,
      categoryId,
      search,
    );

    const inventory = await this.getInventoryBreakdown(
      user,
      locationId,
      categoryId,
      search,
    );

    const categoryStr =
      categoryId !== undefined && categoryId > 0
        ? String(categoryId)
        : undefined;
    const locationStr =
      locationId !== undefined && locationId > 0
        ? String(locationId)
        : undefined;

    const lowStock = await this.getLowStock(
      user,
      search,
      categoryStr,
      locationStr,
    );
    const deadStock = await this.getDeadStock(
      user,
      search,
      categoryStr,
      locationStr,
    );

    return [
      ...salesSections,
      {
        title: 'Inventory Breakdown',
        headers: ['Product', 'Category', 'Total', ...inventory.columns],
        rows: inventory.rows.map((r) => [
          r.productName,
          r.category,
          r.total,
          ...inventory.columns.map((c) => r.locations[c] ?? 0),
        ]),
      },
      {
        title: 'Low Stock',
        headers: ['Product', 'Total', 'Location', 'Request Status'],
        rows: lowStock.map((d) => [
          d.name,
          d.total,
          d.locationName ?? '',
          d.requestedStatus ?? '',
        ]),
      },
      {
        title: 'Dead Stock',
        headers: ['Product', 'Location'],
        rows: deadStock.map((d) => [d.name, d.locationName]),
      },
    ];
  }

  async getFullReportCsv(
    user: JwtPayload,
    startDate?: string,
    endDate?: string,
    locationId?: number,
    categoryId?: number,
    search?: string,
  ): Promise<string> {
    const sections = await this.getFullReportSections(
      user,
      startDate,
      endDate,
      locationId,
      categoryId,
      search,
    );
    return this.buildCsv(sections);
  }

  async getFullReportPdf(
    user: JwtPayload,
    startDate?: string,
    endDate?: string,
    locationId?: number,
    categoryId?: number,
    search?: string,
  ): Promise<Buffer> {
    const sections = await this.getFullReportSections(
      user,
      startDate,
      endDate,
      locationId,
      categoryId,
      search,
    );
    return this.buildPdf(sections);
  }
}
