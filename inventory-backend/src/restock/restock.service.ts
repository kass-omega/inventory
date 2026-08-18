import { BadRequestException, Injectable } from '@nestjs/common';
import {
  LocationType,
  RequestItemStatus,
  RequestStatus,
  RequestType,
} from '@prisma/client';
import { JwtPayload } from '../common/interfaces/jwt-payload.interface';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { RestockDto } from './dto/restock.dto';

@Injectable()
export class RestockService {
  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService,
  ) {}

  async restock(dto: RestockDto, user: JwtPayload) {
    const product = await this.prisma.product.findUnique({
      where: { id: dto.productId },
    });
    if (!product) throw new BadRequestException('Product not found');

    const store = await this.prisma.location.findUnique({
      where: { id: dto.storeId },
    });
    if (!store || store.type !== LocationType.STORE) {
      throw new BadRequestException('Store not found');
    }

    const request = await this.prisma.$transaction(async (tx) => {
      // 1. Check if price changed, if so, log to PriceHistory
      if (
        product.currentBuyPrice !== dto.newBuyPrice ||
        product.currentSellPrice !== dto.newSellPrice
      ) {
        await tx.priceHistory.create({
          data: {
            productId: dto.productId,
            oldBuyPrice: product.currentBuyPrice,
            newBuyPrice: dto.newBuyPrice,
            oldSellPrice: product.currentSellPrice,
            newSellPrice: dto.newSellPrice,
            updatedById: user.sub,
          },
        });
      }

      // 2. Update Product Master Prices
      await tx.product.update({
        where: { id: dto.productId },
        data: {
          currentBuyPrice: dto.newBuyPrice,
          currentSellPrice: dto.newSellPrice,
        },
      });

      // 3. Create a STORE_TO_OWNER request with a STORED item so the
      //    storekeeper must confirm receipt before inventory is finalized.
      const req = await tx.stockRequest.create({
        data: {
          requestType: RequestType.STORE_TO_OWNER,
          storeId: dto.storeId,
          createdById: user.sub,
          status: RequestStatus.PENDING,
          items: {
            create: {
              productId: dto.productId,
              quantityStored: dto.quantity,
              status: RequestItemStatus.STORED,
            },
          },
        },
      });

      // 4. Create Audit Log
      await tx.auditLog.create({
        data: {
          userId: user.sub,
          action: 'RESTOCK',
          details: `Restocked ${dto.quantity} units of ${product.brand} ${product.baseName} to ${store.name} (pending confirmation)`,
        },
      });

      return req;
    });

    // 5. Notify the storekeeper to count and confirm receipt
    await this.notifications.notifyLocation(
      'Stock Ready for Receipt',
      `Request #${request.id}: ${dto.quantity} units of ${product.brand} ${product.baseName} ready for you to confirm`,
      dto.storeId,
      { productId: dto.productId },
    );

    return {
      message: 'Restock submitted — pending storekeeper confirmation',
      requestId: request.id,
    };
  }
}
