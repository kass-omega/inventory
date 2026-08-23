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
   * Restock a location (STORE or SHOP).
   *
   * - Owner + receivers assigned → deposit: STORE_TO_OWNER request,
   *   AWAITING_CONFIRMATION, item STORED; the receiver confirms receipt.
   * - Owner + no receiver assigned → direct stock: inventory is upserted
   *   immediately and a COMPLETED request is recorded so the restock stays
   *   fully queryable in StockRequest history.
   * - Non-owner (storekeeper or shop employee) → PENDING request for the
   *   owner to store/reject; the requester then confirms receipt.
   *
   * Shop-target requests set shopId = target.id (alongside storeId) so the
   * shop sees them in the Requests list and reports keep working.
   */
  async restock(dto: RestockDto, user: JwtPayload) {
    const product = await this.prisma.product.findUnique({
      where: { id: dto.productId },
    });
    if (!product) throw new BadRequestException('Product not found');

    const target = await this.prisma.location.findUnique({
      where: { id: dto.storeId },
    });
    if (
      !target ||
      (target.type !== LocationType.STORE && target.type !== LocationType.SHOP)
    ) {
      throw new BadRequestException('Location not found');
    }

    const isOwner = user.isSuperuser === true;
    // StockRequest.storeId is the receiving location. When that location is a
    // SHOP we also populate shopId so the shop can see its own restock
    // requests (the Requests list filters shop users by shopId).
    const shopId = target.type === LocationType.SHOP ? target.id : null;

    // Non-owners may only restock their own location and cannot change prices.
    if (!isOwner) {
      if (user.locationId !== dto.storeId) {
        throw new ForbiddenException(
          'You can only restock your own store/shop',
        );
      }
      if (dto.newBuyPrice != null || dto.newSellPrice != null) {
        throw new BadRequestException(
          'Only the owner can change prices on a restock',
        );
      }
    }

    const result = await this.prisma.$transaction(async (tx) => {
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
          await tx.product.update({
            where: { id: dto.productId },
            data: {
              currentBuyPrice: newBuyPrice,
              currentSellPrice: newSellPrice,
            },
          });
        }
      }

      // --- Owner path ---
      if (isOwner) {
        // Receivers = non-system users assigned to the target location.
        // (System roles never count as a receiver.)
        const receiverCount = await tx.user.count({
          where: {
            locationId: target.id,
            NOT: { role: { isSystem: true } },
          },
        });

        // Owner-operated location (no staff): stock directly. A COMPLETED
        // request is still written so 100% of restock activity is queryable.
        if (receiverCount === 0) {
          await tx.inventory.upsert({
            where: {
              productId_locationId: {
                productId: dto.productId,
                locationId: target.id,
              },
            },
            create: {
              productId: dto.productId,
              locationId: target.id,
              quantity: dto.quantity,
            },
            update: { quantity: { increment: dto.quantity } },
          });

          const req = await tx.stockRequest.create({
            data: {
              requestType: RequestType.STORE_TO_OWNER,
              storeId: target.id,
              shopId,
              createdById: user.sub,
              approvedById: user.sub,
              status: RequestStatus.COMPLETED,
              items: {
                create: {
                  productId: dto.productId,
                  quantityStored: dto.quantity,
                  quantityReceived: dto.quantity,
                  status: RequestItemStatus.RECEIVED,
                  confirmedById: user.sub,
                  confirmedAt: new Date(),
                },
              },
            },
          });

          await tx.requestActivity.create({
            data: {
              requestId: req.id,
              action: 'CREATED',
              actorId: user.sub,
              details: 'Stocked directly — no confirmation required',
            },
          });

          await tx.auditLog.create({
            data: {
              userId: user.sub,
              action: 'RESTOCK',
              details: `Directly stocked ${dto.quantity} units of ${product.brand} ${product.baseName} to ${target.name}`,
            },
          });

          return { req, mode: 'direct' as const };
        }

        // Receivers are assigned: deposit the goods and let them confirm.
        const req = await tx.stockRequest.create({
          data: {
            requestType: RequestType.STORE_TO_OWNER,
            storeId: target.id,
            shopId,
            createdById: user.sub,
            status: RequestStatus.AWAITING_CONFIRMATION,
            items: {
              create: {
                productId: dto.productId,
                quantityStored: dto.quantity,
                status: RequestItemStatus.STORED,
              },
            },
          },
        });

        await tx.requestActivity.create({
          data: {
            requestId: req.id,
            action: 'CREATED',
            actorId: user.sub,
            details: `${dto.quantity} unit(s) deposited — awaiting receipt confirmation`,
          },
        });

        await tx.auditLog.create({
          data: {
            userId: user.sub,
            action: 'RESTOCK',
            details: `Deposited ${dto.quantity} units of ${product.brand} ${product.baseName} to ${target.name} (pending receipt confirmation)`,
          },
        });

        return { req, mode: 'deposit' as const };
      }

      // --- Non-owner path (storekeeper or shop employee) ---
      const req = await tx.stockRequest.create({
        data: {
          requestType: RequestType.STORE_TO_OWNER,
          storeId: target.id,
          shopId,
          createdById: user.sub,
          status: RequestStatus.PENDING,
          items: {
            create: {
              productId: dto.productId,
              quantityRequested: dto.quantity,
              status: RequestItemStatus.PENDING,
            },
          },
        },
      });

      await tx.requestActivity.create({
        data: {
          requestId: req.id,
          action: 'CREATED',
          actorId: user.sub,
          details: `Requested ${dto.quantity} unit(s) — awaiting owner approval`,
        },
      });

      await tx.auditLog.create({
        data: {
          userId: user.sub,
          action: 'RESTOCK',
          details: `Restock requested for ${target.name}: ${dto.quantity} units of ${product.brand} ${product.baseName} (pending owner approval)`,
        },
      });

      return { req, mode: 'pending' as const };
    });

    // --- Notifications + responses ---
    if (result.mode === 'direct') {
      await this.notifications
        .notifyLocation(
          'Stock Added',
          `${dto.quantity} units of ${product.brand} ${product.baseName} were stocked directly at ${target.name}`,
          target.id,
          { productId: dto.productId },
        )
        .catch(() => undefined);

      return {
        message: 'Restock stocked directly — no confirmation needed.',
        requestId: result.req.id,
      };
    }

    if (result.mode === 'deposit') {
      await this.notifications.notifyLocation(
        'Stock Ready for Receipt',
        `Request #${result.req.id}: ${dto.quantity} units of ${product.brand} ${product.baseName} ready for you to confirm`,
        target.id,
        { productId: dto.productId },
      );

      return {
        message: 'Restock submitted — pending receiver confirmation.',
        requestId: result.req.id,
      };
    }

    // pending: notify the owner to review and store/reject the request.
    await this.notifications
      .notifyOwner(
        'Restock Awaiting Approval',
        `${dto.quantity} units of ${product.brand} ${product.baseName} for ${target.name} are waiting for your approval (store) or rejection.`,
        { locationId: target.id, productId: dto.productId },
      )
      .catch(() => undefined);

    return {
      message: 'Restock submitted — awaiting owner approval.',
      requestId: result.req.id,
    };
  }
}
