import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { JwtPayload } from '../common/interfaces/jwt-payload.interface';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateSaleDto } from './dto/create-sale.dto';
import { ReturnSaleDto } from './dto/return-sale.dto';

// Define the structure of the mapped items we are collecting
interface SaleItemCreationInput {
  productId: number;
  quantity: number;
  unitSellPrice: number;
  unitBuyPrice: number;
}

@Injectable()
export class SalesService {
  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService,
  ) {}

  async createSale(dto: CreateSaleDto, user: JwtPayload) {
    // Owner must select a shop; shopkeepers use their own location
    const shopId = user.locationId ?? dto.shopId;
    if (!shopId) throw new BadRequestException('Shop location is required');

    const saleType = (dto.saleType ?? 'FULLY_PAID') as any;

    return this.prisma.$transaction(async (tx) => {
      let totalAmount = 0;
      let totalCost = 0;

      const saleItemsData: SaleItemCreationInput[] = [];

      for (const item of dto.items) {
        const inventory = await tx.inventory.findUnique({
          where: {
            productId_locationId: {
              productId: item.productId,
              locationId: shopId,
            },
          },
          include: { product: true },
        });

        if (!inventory || inventory.quantity < item.quantity) {
          throw new BadRequestException(
            `Insufficient stock for Product ID: ${item.productId}`,
          );
        }

        // Deduct inventory
        await tx.inventory.update({
          where: { id: inventory.id },
          data: { quantity: { decrement: item.quantity } },
        });

        const unitSellPrice = item.customPrice ?? inventory.product.currentSellPrice;
        const unitBuyPrice = inventory.product.currentBuyPrice;

        const itemTotal = unitSellPrice * item.quantity;
        const itemCost = unitBuyPrice * item.quantity;

        totalAmount += itemTotal;
        totalCost += itemCost;

        saleItemsData.push({
          productId: item.productId,
          quantity: item.quantity,
          unitSellPrice,
          unitBuyPrice,
        });
      }

      const profit = totalAmount - totalCost;

      let paidAmount: number;
      let remainingAmount: number;

      if (saleType === 'FULLY_PAID') {
        paidAmount = totalAmount;
        remainingAmount = 0;
      } else if (saleType === 'PARTIALLY_PAID') {
        paidAmount = dto.paidAmount ?? 0;
        if (paidAmount <= 0) throw new BadRequestException('Paid amount required for partially paid');
        if (paidAmount >= totalAmount) throw new BadRequestException('Paid amount must be less than total');
        remainingAmount = totalAmount - paidAmount;
      } else {
        paidAmount = 0;
        remainingAmount = totalAmount;
      }

      if ((saleType === 'FULLY_PAID' || saleType === 'PARTIALLY_PAID') && !dto.paymentMethodId) {
        throw new BadRequestException('Payment method is required');
      }
      if ((saleType === 'PARTIALLY_PAID' || saleType === 'CREDITED') && !dto.customerId) {
        throw new BadRequestException('Customer is required for credit/partial');
      }

      const sale = await tx.sale.create({
        data: {
          invoiceNumber: `INV-${Date.now()}`,
          shopId,
          totalAmount,
          totalCost,
          profit,
          soldById: user.sub,
          paidAmount,
          remainingAmount,
          saleType,
          paymentMethodId: dto.paymentMethodId ?? null,
          customerId: dto.customerId ?? null,
          notes: dto.notes ?? null,
          items: { create: saleItemsData },
        },
      });

      if (saleType === 'PARTIALLY_PAID' || saleType === 'CREDITED') {
        await tx.creditSale.create({
          data: {
            customerId: dto.customerId!,
            saleId: sale.id,
            shopId,
            totalAmount: remainingAmount,
            items: { create: saleItemsData.map((si) => ({
              productId: si.productId, quantity: si.quantity, unitPrice: si.unitSellPrice,
            })) },
          },
        });
      }

      await tx.auditLog.create({
        data: {
          userId: user.sub,
          action: 'SALE',
          details: `Sale #${sale.invoiceNumber}: $${totalAmount.toFixed(2)} (${saleType}) at Shop ID ${shopId}`,
        },
      });

      // Check low stock for each product after sale
      for (const item of dto.items) {
        await this.notifications.checkAndNotifyLowStock(item.productId, shopId);
      }

      return sale;
    });
  }

  findAll(user: JwtPayload) {
    const where: Record<string, unknown> = {};

    // Shopkeepers see only their shop's sales, storekeepers see sales related to their store
    if (user.locationId) {
      if (user.locationType === 'SHOP') {
        where.shopId = user.locationId;
      } else {
        where.shopId = -1; // returns empty result
      }
    }

    return this.prisma.sale.findMany({
      where,
      include: {
        items: { include: { product: true } },
        shop: true,
        paymentMethod: true,
        customer: true,
        purchase: true,
        soldBy: true,
      },
      orderBy: { saleDate: 'desc' },
    });
  }

  async findOne(id: number, user: JwtPayload) {
    const where: Record<string, unknown> = { id };

    if (user.locationId) {
      if (user.locationType === 'SHOP') {
        where.shopId = user.locationId;
      } else {
        where.shopId = -1;
      }
    }

    const sale = await this.prisma.sale.findFirst({
      where,
      include: {
        items: { include: { product: true } },
        shop: true,
        paymentMethod: true,
        customer: true,
        purchase: true,
        soldBy: true,
      },
    });

    if (!sale) throw new NotFoundException('Sale not found');
    return sale;
  }

  async updateSale(id: number, dto: CreateSaleDto, user: JwtPayload) {
    return this.prisma.$transaction(async (tx) => {
      // 1. Find old sale
      const oldSale = await tx.sale.findUnique({
        where: { id },
        include: { items: true, creditSale: true },
      });
      if (!oldSale) throw new NotFoundException('Sale not found');

      // Determine shopId: owner uses dto.shopId or old sale's shopId, shopkeeper uses their location
      const shopId = user.locationId ?? dto.shopId ?? oldSale.shopId;
      if (!shopId) throw new BadRequestException('Shop location is required');

      // 2. Restore old inventory
      for (const oldItem of oldSale.items) {
        await tx.inventory.upsert({
          where: { productId_locationId: { productId: oldItem.productId, locationId: oldSale.shopId } },
          update: { quantity: { increment: oldItem.quantity } },
          create: { productId: oldItem.productId, locationId: oldSale.shopId, quantity: oldItem.quantity },
        });
      }

      // 3. Process new items
      let totalAmount = 0;
      let totalCost = 0;
      const saleItemsData: SaleItemCreationInput[] = [];

      for (const item of dto.items) {
        const inventory = await tx.inventory.findUnique({
          where: { productId_locationId: { productId: item.productId, locationId: shopId } },
          include: { product: true },
        });
        if (!inventory || inventory.quantity < item.quantity)
          throw new BadRequestException(`Insufficient stock for Product ID: ${item.productId}`);

        await tx.inventory.update({
          where: { id: inventory.id },
          data: { quantity: { decrement: item.quantity } },
        });

        const unitSellPrice = item.customPrice ?? inventory.product.currentSellPrice;
        const unitBuyPrice = inventory.product.currentBuyPrice;
        totalAmount += unitSellPrice * item.quantity;
        totalCost += unitBuyPrice * item.quantity;

        saleItemsData.push({ productId: item.productId, quantity: item.quantity, unitSellPrice, unitBuyPrice });
      }

      // 4. Determine payment fields
      const saleType = (dto.saleType ?? oldSale.saleType) as any;
      let paidAmount: number;
      let remainingAmount: number;

      if (saleType === 'FULLY_PAID') {
        paidAmount = totalAmount;
        remainingAmount = 0;
      } else if (saleType === 'PARTIALLY_PAID') {
        paidAmount = dto.paidAmount ?? oldSale.paidAmount;
        if (paidAmount <= 0) throw new BadRequestException('Paid amount required');
        if (paidAmount >= totalAmount) throw new BadRequestException('Paid amount must be less than total');
        remainingAmount = totalAmount - paidAmount;
      } else {
        paidAmount = 0;
        remainingAmount = totalAmount;
      }

      // 5. Delete old items and update sale
      await tx.saleItem.deleteMany({ where: { saleId: id } });
      const updated = await tx.sale.update({
        where: { id },
        data: {
          shopId,
          totalAmount,
          totalCost,
          profit: totalAmount - totalCost,
          paidAmount,
          remainingAmount,
          saleType,
          paymentMethodId: dto.paymentMethodId ?? oldSale.paymentMethodId,
          customerId: dto.customerId !== undefined ? dto.customerId : oldSale.customerId,
          notes: dto.notes !== undefined ? dto.notes : oldSale.notes,
          items: { create: saleItemsData },
        },
      });

      // 6. Handle credit sale
      if (oldSale.creditSale) {
        await tx.creditSale.delete({ where: { id: oldSale.creditSale.id } });
      }
      if (saleType === 'PARTIALLY_PAID' || saleType === 'CREDITED') {
        if (!dto.customerId && !oldSale.customerId)
          throw new BadRequestException('Customer is required');
        await tx.creditSale.create({
          data: {
            customerId: (dto.customerId ?? oldSale.customerId)!,
            saleId: id,
            shopId,
            totalAmount: remainingAmount,
            items: { create: saleItemsData.map((si) => ({
              productId: si.productId, quantity: si.quantity, unitPrice: si.unitSellPrice,
            })) },
          },
        });
      }

      await tx.auditLog.create({
        data: {
          userId: user.sub,
          action: 'UPDATE_SALE',
          details: `Updated sale #${oldSale.invoiceNumber}: $${totalAmount.toFixed(2)} (${saleType})`,
        },
      });

      return updated;
    }).then(async (updated) => {
      for (const item of dto.items) {
        await this.notifications.checkAndNotifyLowStock(item.productId, updated.shopId);
      }
      return updated;
    });
  }

  async remove(id: number) {
    // In a real app, you'd reverse the inventory deductions here
    return this.prisma.sale.delete({ where: { id } });
  }

  async returnSale(saleId: number, dto: ReturnSaleDto, user: JwtPayload) {
    const sale = await this.prisma.sale.findUnique({
      where: { id: saleId },
      include: {
        items: { include: { product: true } },
        returns: { include: { items: true } },
        creditSale: true,
      },
    });
    if (!sale) throw new NotFoundException('Sale not found');

    if (user.locationId !== null && user.locationId !== sale.shopId) {
      throw new ForbiddenException('You can only return sales from your own shop');
    }

    return this.prisma.$transaction(async (tx) => {
      let totalRefund = 0;
      const returnItemsData: { productId: number; quantity: number; unitPrice: number; unitBuyPrice: number }[] = [];

      for (const item of dto.items) {
        const saleItem = sale.items.find((i) => i.productId === item.productId);
        if (!saleItem) {
          throw new BadRequestException(`Product ${item.productId} was not in this sale`);
        }

        const alreadyReturned = sale.returns.reduce(
          (sum, r) =>
            sum +
            r.items
              .filter((ri) => ri.productId === item.productId)
              .reduce((s, ri) => s + ri.quantity, 0),
          0,
        );
        const maxReturnable = saleItem.quantity - alreadyReturned;
        if (item.quantity > maxReturnable) {
          throw new BadRequestException(
            `Cannot return ${item.quantity} of product ${item.productId} (max ${maxReturnable})`,
          );
        }

        // Restore inventory at the shop
        await tx.inventory.upsert({
          where: {
            productId_locationId: {
              productId: item.productId,
              locationId: sale.shopId,
            },
          },
          create: {
            productId: item.productId,
            locationId: sale.shopId,
            quantity: item.quantity,
          },
          update: { quantity: { increment: item.quantity } },
        });

        const refund = saleItem.unitSellPrice * item.quantity;
        totalRefund += refund;
        returnItemsData.push({
          productId: item.productId,
          quantity: item.quantity,
          unitPrice: saleItem.unitSellPrice,
          unitBuyPrice: saleItem.unitBuyPrice,
        });
      }

      const created = await tx.return.create({
        data: {
          saleId,
          shopId: sale.shopId,
          totalRefund,
          reason: dto.reason,
          refundMethodId: dto.refundMethodId ?? null,
          createdById: user.sub,
          items: { create: returnItemsData },
        },
        include: { items: true },
      });

      // Money side: refund cash out, or reduce the outstanding credit balance
      if (sale.saleType === 'FULLY_PAID') {
        await tx.cashEntry.create({
          data: {
            shopId: sale.shopId,
            type: 'OUTFLOW',
            amount: totalRefund,
            source: 'RETURN',
            refId: created.id,
            description: `Refund for sale #${sale.invoiceNumber}`,
            createdById: user.sub,
          },
        });
      } else if (sale.creditSale || sale.remainingAmount > 0) {
        const newRemaining = Math.max(0, sale.remainingAmount - totalRefund);
        await tx.sale.update({
          where: { id: sale.id },
          data: { remainingAmount: newRemaining },
        });
        if (sale.creditSale) {
          const newCredit = Math.max(0, sale.creditSale.totalAmount - totalRefund);
          if (newCredit <= 0) {
            await tx.creditSale.delete({ where: { id: sale.creditSale.id } });
          } else {
            await tx.creditSale.update({
              where: { id: sale.creditSale.id },
              data: { totalAmount: newCredit },
            });
          }
        }
      }

      await tx.auditLog.create({
        data: {
          userId: user.sub,
          action: 'RETURN_SALE',
          details: `Returned items from sale #${sale.invoiceNumber}: ${totalRefund.toFixed(2)} refund`,
        },
      });

      return created;
    }).then(async (created) => {
      for (const item of dto.items) {
        await this.notifications.checkAndNotifyLowStock(item.productId, sale.shopId);
      }
      return created;
    });
  }

  async findReturns(user: JwtPayload) {
    return this.prisma.return.findMany({
      where:
        user.locationId === null
          ? {}
          : { shopId: user.locationId ?? undefined },
      include: {
        items: { include: { product: true } },
        sale: { select: { invoiceNumber: true } },
        shop: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }
}
