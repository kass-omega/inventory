import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import {
  RequestItemStatus,
  RequestStatus,
  RequestType,
} from '@prisma/client';
import { JwtPayload } from '../common/interfaces/jwt-payload.interface';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { AdjustStockDto } from './dto/adjust-stock.dto';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';

@Injectable()
export class ProductsService {
  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService,
  ) {}

  async create(dto: CreateProductDto, user: JwtPayload) {
    const sku = `${dto.brand.slice(0, 3).toUpperCase()}-${dto.baseName.slice(0, 3).toUpperCase()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;

    const product = await this.prisma.product.create({
      data: {
        brand: dto.brand,
        baseName: dto.baseName,
        attributes: dto.attributes,
        currentBuyPrice: dto.currentBuyPrice,
        currentSellPrice: dto.currentSellPrice,
        categoryId: dto.categoryId,
        unitId: dto.unitId ?? null,
        sku,
      },
    });

    // Initial stock goes through a STORE_TO_OWNER request so the storekeeper
    // must confirm receipt before the inventory is finalized.
    if (dto.storeId && dto.quantity && dto.quantity > 0) {
      const request = await this.prisma.stockRequest.create({
        data: {
          requestType: RequestType.STORE_TO_OWNER,
          storeId: dto.storeId,
          createdById: user.sub,
          status: RequestStatus.PENDING,
          items: {
            create: {
              productId: product.id,
              quantityStored: dto.quantity,
              status: RequestItemStatus.STORED,
            },
          },
        },
      });

      await this.notifications.notifyLocation(
        'New Stock Ready for Receipt',
        `Request #${request.id}: ${dto.quantity} units of ${product.brand} ${product.baseName} ready for you to confirm`,
        dto.storeId,
        { productId: product.id },
      );
    }

    return product;
  }

  async findAll(user: JwtPayload, search?: string, categoryId?: string, locationId?: number) {
    const conditions: any[] = [];

    if (search) {
      const attrIds = await this.prisma.findProductIdsByAttributes(search);
      conditions.push({
        OR: [
          { baseName: { contains: search, mode: 'insensitive' } },
          { brand: { contains: search, mode: 'insensitive' } },
          { sku: { contains: search, mode: 'insensitive' } },
          ...(attrIds.length > 0 ? [{ id: { in: attrIds } }] : []),
        ],
      });
    }

    if (categoryId) {
      conditions.push({ categoryId: Number(categoryId) });
    }

    // Determine which location to filter inventory by
    const invLocationId = locationId ?? user.locationId ?? undefined;

    // Non-owner users should only see products in their location's inventory
    if (!locationId && user.locationId) {
      conditions.push({
        inventory: {
          some: { locationId: user.locationId },
        },
      });
    }

    const where: any = conditions.length > 0 ? { AND: conditions } : {};

    return this.prisma.product.findMany({
      where,
      include: {
        category: true,
        unit: true,
        inventory: invLocationId
          ? { where: { locationId: invLocationId }, include: { location: true } }
          : { include: { location: true } },
      },
    });
  }

  async findOne(id: number, user: JwtPayload) {
    const include: any = {
      priceHistory: { orderBy: { updatedAt: 'desc' } },
      category: true,
      unit: true,
      inventory: user.locationId
        ? { where: { locationId: user.locationId }, include: { location: true } }
        : { include: { location: true } },
    };

    const product = await this.prisma.product.findFirst({
      where: { id },
      include,
    });

    if (!product) throw new NotFoundException('Product not found');

    // If non-owner and product has no inventory at their location, deny access
    if (
      user.locationId &&
      (!product.inventory || product.inventory.length === 0)
    ) {
      throw new NotFoundException('Product not found');
    }

    return product;
  }

  async update(id: number, dto: UpdateProductDto) {
    if (dto.currentBuyPrice || dto.currentSellPrice) {
      const existing = await this.prisma.product.findUnique({ where: { id } });
      if (existing) {
        await this.prisma.priceHistory.create({
          data: {
            productId: id,
            oldBuyPrice: existing.currentBuyPrice,
            newBuyPrice: dto.currentBuyPrice ?? existing.currentBuyPrice,
            oldSellPrice: existing.currentSellPrice,
            newSellPrice: dto.currentSellPrice ?? existing.currentSellPrice,
            updatedById: 1, // Hardcoded for now
          },
        });
      }
    }
    return this.prisma.product.update({ where: { id }, data: dto });
  }

  async remove(id: number) {
    const product = await this.prisma.product.findUnique({ where: { id } });
    if (!product) throw new NotFoundException('Product not found');

    // Prevent deletion of products that are referenced by transactional history
    const [sales, creditItems, requestItems, returnItems] = await Promise.all([
      this.prisma.saleItem.count({ where: { productId: id } }),
      this.prisma.creditSaleItem.count({ where: { productId: id } }),
      this.prisma.requestItem.count({ where: { productId: id } }),
      this.prisma.returnItem.count({ where: { productId: id } }),
    ]);

    if (sales + creditItems + requestItems + returnItems > 0) {
      throw new BadRequestException(
        'Cannot delete a product that has sales, credit, request, or return history',
      );
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.notification.deleteMany({ where: { productId: id } });
      await tx.priceHistory.deleteMany({ where: { productId: id } });
      await tx.inventory.deleteMany({ where: { productId: id } });
      await tx.product.delete({ where: { id } });
    });

    return { message: 'Product deleted' };
  }

  async adjustStock(
    productId: number,
    dto: AdjustStockDto,
    user: JwtPayload,
  ) {
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
    });
    if (!product) throw new NotFoundException('Product not found');

    const location = await this.prisma.location.findUnique({
      where: { id: dto.locationId },
    });
    if (!location) throw new NotFoundException('Location not found');

    await this.prisma.inventory.upsert({
      where: {
        productId_locationId: { productId, locationId: dto.locationId },
      },
      create: { productId, locationId: dto.locationId, quantity: dto.quantity },
      update: { quantity: dto.quantity },
    });

    await this.prisma.auditLog.create({
      data: {
        userId: user.sub,
        action: 'STOCK_ADJUST',
        details: `Adjusted ${product.brand} ${product.baseName} to ${dto.quantity} at ${location.name}${dto.reason ? ` — ${dto.reason}` : ''}`,
      },
    });

    await this.notifications.checkAndNotifyLowStock(productId, dto.locationId);

    return { message: 'Stock adjusted successfully' };
  }
}
