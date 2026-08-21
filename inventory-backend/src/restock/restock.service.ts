import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
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

  /**
   * Owner-created restocks are stored immediately and the storekeeper confirms
   * receipt. Any other user with the restock permission can request a restock
   * for their own store, but the owner must approve (store) the items first;
   * the creator then confirms receipt once the stock is stored.
   */
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

    const isOwner = user.isSuperuser === true;

    // Non-owners may only restock their own store and cannot change prices.
    if (!isOwner) {
      if (
        user.locationType !== LocationType.STORE ||
        user.locationId !== dto.storeId
      ) {
        throw new ForbiddenException('You can only restock your own store');
      }
      if (dto.newBuyPrice != null || dto.newSellPrice != null) {
        throw new BadRequestException(
          'Only the owner can change prices on a restock',
        );
      }
    }

    const request = await this.prisma.$transaction(async (tx) => {
      // Owner: apply price changes (when provided) + record price history.
      if (isOwner) {
        const newBuyPrice = dto.newBuyPrice ?? product.currentBuyPrice;
        const newSellPrice = dto.newSellPrice ?? product.currentSellPrice;
        if (
          product.currentBuyPrice !== newBuyPrice ||
          product.currentSellPrice !== newSellPrice
        ) {
          await tx.priceHistory.create({
            data: {
              productId: dto.productId,
              oldBuyPrice: product.currentBuyPrice,
              newBuyPrice,
              oldSellPrice: product.currentSellPrice,
              newSellPrice,
              updatedById: user.sub,
            },
          });
        }
        await tx.product.update({
          where: { id: dto.productId },
          data: { currentBuyPrice: newBuyPrice, currentSellPrice: newSellPrice },
        });
      }

      // Owner-created restocks are stored immediately and await the store's
      // receipt confirmation. Non-owner restocks are submitted for owner
      // approval first (item stays PENDING until the owner stores it).
      const req = await tx.stockRequest.create({
        data: {
          requestType: RequestType.STORE_TO_OWNER,
          storeId: dto.storeId,
          createdById: user.sub,
          status: isOwner
            ? RequestStatus.AWAITING_CONFIRMATION
            : RequestStatus.PENDING,
          items: {
            create: isOwner
              ? {
                  productId: dto.productId,
                  quantityStored: dto.quantity,
                  status: RequestItemStatus.STORED,
                }
              : {
                  productId: dto.productId,
                  quantityRequested: dto.quantity,
                  status: RequestItemStatus.PENDING,
                },
          },
        },
      });

      await tx.auditLog.create({
        data: {
          userId: user.sub,
          action: 'RESTOCK',
          details: isOwner
            ? `Restocked ${dto.quantity} units of ${product.brand} ${product.baseName} to ${store.name} (pending store confirmation)`
            : `Restock requested for ${store.name}: ${dto.quantity} units of ${product.brand} ${product.baseName} (pending owner approval)`,
        },
      });

      return req;
    });

    if (isOwner) {
      // Notify the storekeeper to count and confirm receipt.
      await this.notifications.notifyLocation(
        'Stock Ready for Receipt',
        `Request #${request.id}: ${dto.quantity} units of ${product.brand} ${product.baseName} ready for you to confirm`,
        dto.storeId,
        { productId: dto.productId },
      );

      // Safeguard: if no user is assigned to the store, the request can never
      // be confirmed — surface that to the owner immediately.
      const storeUsers = await this.prisma.user.count({
        where: { locationId: dto.storeId },
      });
      if (storeUsers === 0) {
        await this.notifications
          .notifyOwner(
            'Restock: no storekeeper assigned',
            `Request #${request.id}: ${dto.quantity} units of ${product.brand} ${product.baseName} were sent to ${store.name}, but no user is assigned to that store. Assign one in Manage Users so they can confirm receipt.`,
          )
          .catch(() => undefined);

        return {
          message:
            'Restock submitted — but no storekeeper is assigned to this store. Assign one in Manage Users so they can confirm receipt.',
          requestId: request.id,
          warning: 'no-storekeeper-assigned',
        };
      }

      return {
        message: 'Restock submitted — pending storekeeper confirmation',
        requestId: request.id,
      };
    }

    // Non-owner: notify the owner to review and store/reject the request.
    await this.notifications
      .notifyOwner(
        'Restock Awaiting Approval',
        `${dto.quantity} units of ${product.brand} ${product.baseName} for ${store.name} are waiting for your approval (store) or rejection.`,
        { locationId: dto.storeId, productId: dto.productId },
      )
      .catch(() => undefined);

    return {
      message: 'Restock submitted — awaiting owner approval',
      requestId: request.id,
    };
  }
}
