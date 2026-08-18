import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { RequestItemStatus, RequestStatus, RequestType } from '@prisma/client';
import { JwtPayload } from '../common/interfaces/jwt-payload.interface';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateRequestDto } from './dto/create-request.dto';

@Injectable()
export class RequestsService {
  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService,
  ) {}

  async createRequest(dto: CreateRequestDto, user: JwtPayload) {
    if (!user.locationId)
      throw new ForbiddenException('You must be assigned to a location');

    const isStorekeeper = user.locationType === 'STORE';

    let requestType: RequestType;
    let shopId: number | null;
    let storeId: number;
    let fromStoreId: number | null = null;

    if (isStorekeeper) {
      if (dto.requestType === 'STORE_TO_STORE') {
        requestType = RequestType.STORE_TO_STORE;
        storeId = user.locationId; // receiver
        fromStoreId = dto.fromStoreId ?? null;
        if (!fromStoreId) throw new BadRequestException('Source store is required for store transfers');
        shopId = null;
      } else {
        requestType = RequestType.STORE_TO_OWNER;
        storeId = user.locationId;
        shopId = null;
      }
    } else {
      requestType = RequestType.SHOP_TO_STORE;
      shopId = user.locationId;
      storeId = dto.storeId!;
      if (!storeId) throw new BadRequestException('Store ID is required for shop requests');
    }

    return this.prisma.stockRequest.create({
      data: {
        shopId,
        storeId,
        fromStoreId,
        requestType,
        createdById: user.sub,
        status: RequestStatus.PENDING,
        items: {
          create: dto.items.map((item) => ({
            productId: item.productId,
            quantityRequested: item.quantityRequested ?? null,
            status: RequestItemStatus.PENDING,
          })),
        },
      },
      include: {
        items: { include: { product: true } },
        shop: true,
        store: true,
        fromStore: true,
      },
    }).then(async (req) => {
      await this.notifications.notifyOwner(
        'New Stock Request',
        `Request #${req.id}: ${req.items.length} items from ${isStorekeeper ? 'Store' : req.shop?.name}`,
      );
      return req;
    });
  }

  async findAll(
    filters: {
      locationId?: string;
      categoryId?: string;
      productId?: string;
      startDate?: string;
      endDate?: string;
      status?: string;
    },
    user: JwtPayload,
  ) {
    const where: any = {};

    if (user.locationId) {
      if (user.locationType === 'SHOP') {
        where.shopId = user.locationId;
      } else {
        where.storeId = user.locationId;
      }
    } else {
      if (filters.locationId) {
        where.OR = [
          { shopId: Number(filters.locationId) },
          { storeId: Number(filters.locationId) },
        ];
      }
    }

    if (filters.status) {
      where.status = filters.status;
    }
    if (filters.startDate && filters.endDate) {
      where.createdAt = {
        gte: new Date(filters.startDate),
        lte: new Date(filters.endDate),
      };
    }
    if (filters.categoryId || filters.productId) {
      where.items = {
        some: {
          ...(filters.productId
            ? { productId: Number(filters.productId) }
            : {}),
          ...(filters.categoryId
            ? { product: { categoryId: Number(filters.categoryId) } }
            : {}),
        },
      };
    }

    return this.prisma.stockRequest.findMany({
      where,
      include: {
        items: { include: { product: true } },
        shop: true,
        store: true,
        fromStore: true,
      },
    });
  }

  async findOne(id: number) {
    const req = await this.prisma.stockRequest.findUnique({
      where: { id },
      include: {
        items: { include: { product: true } },
        shop: true,
        store: true,
        fromStore: true,
      },
    });
    if (!req) throw new NotFoundException('Request not found');
    return req;
  }

  // --- Helper: re-evaluate overall request status ---
  private async evaluateRequestStatus(
    tx: any,
    requestId: number,
  ): Promise<RequestStatus> {
    const items = await tx.requestItem.findMany({
      where: { requestId },
    });

    const allTerminal = items.every(
      (i: any) =>
        i.status === RequestItemStatus.RECEIVED ||
        i.status === RequestItemStatus.REJECTED,
    );
    const allRejected = items.every(
      (i: any) => i.status === RequestItemStatus.REJECTED,
    );

    if (allTerminal || allRejected)
      return allRejected ? RequestStatus.REJECTED : RequestStatus.CLOSED;

    const someDispatchedOrStored = items.some(
      (i: any) =>
        i.status === RequestItemStatus.DISPATCHED ||
        i.status === RequestItemStatus.STORED,
    );
    const someApproved = items.some(
      (i: any) => i.status === RequestItemStatus.APPROVED,
    );
    const allApprovedOrBeyond = items.every(
      (i: any) =>
        i.status === RequestItemStatus.APPROVED ||
        i.status === RequestItemStatus.DISPATCHED ||
        i.status === RequestItemStatus.STORED ||
        i.status === RequestItemStatus.RECEIVED ||
        i.status === RequestItemStatus.REJECTED,
    );
    const allDispatchedOrBeyond = items.every(
      (i: any) =>
        i.status === RequestItemStatus.DISPATCHED ||
        i.status === RequestItemStatus.STORED ||
        i.status === RequestItemStatus.RECEIVED ||
        i.status === RequestItemStatus.REJECTED,
    );

    if (allDispatchedOrBeyond && someDispatchedOrStored)
      return RequestStatus.COMPLETED;
    if (allApprovedOrBeyond && someApproved && !someDispatchedOrStored)
      return RequestStatus.APPROVED;
    if (someApproved && !allApprovedOrBeyond)
      return RequestStatus.PARTIALLY_APPROVED;
    if (someDispatchedOrStored && !allDispatchedOrBeyond)
      return RequestStatus.PARTIALLY_DISPATCHED;
    return RequestStatus.PENDING;
  }

  // Owner: Approve/Reject (shop→store) or Store/Reject (store→owner)
  async updateItemStatuses(
    requestId: number,
    itemUpdates: {
      id: number;
      status: RequestItemStatus;
      quantityStored?: number;
      newBuyPrice?: number;
      newSellPrice?: number;
    }[],
  ) {
    const request = await this.prisma.stockRequest.findUnique({
      where: { id: requestId },
      include: { items: { include: { product: true } } },
    });
    if (!request) throw new NotFoundException('Request not found');
    if (request.status === RequestStatus.CLOSED) {
      throw new BadRequestException('Cannot modify a closed request');
    }

    const isStoreToOwner = request.requestType === RequestType.STORE_TO_OWNER;
    const isStoreToStore = request.requestType === RequestType.STORE_TO_STORE;

    return this.prisma.$transaction(async (tx) => {
      for (const update of itemUpdates) {
        const item = request.items.find((i) => i.id === update.id);
        if (!item) continue;

        if (isStoreToOwner) {
          if (
            update.status !== RequestItemStatus.STORED &&
            update.status !== RequestItemStatus.REJECTED
          ) {
            throw new BadRequestException(
              'Store requests can only be STORED or REJECTED by owner',
            );
          }

          if (update.status === RequestItemStatus.STORED) {
            const qty = update.quantityStored || 0;
            if (qty <= 0) {
              throw new BadRequestException(
                `Quantity stored is required for ${item.product.brand} ${item.product.baseName}`,
              );
            }
            await tx.requestItem.update({
              where: { id: update.id },
              data: { status: update.status, quantityStored: qty },
            });

            if (
              update.newBuyPrice !== undefined &&
              update.newSellPrice !== undefined
            ) {
              await tx.priceHistory.create({
                data: {
                  productId: item.productId,
                  oldBuyPrice: item.product.currentBuyPrice,
                  newBuyPrice: update.newBuyPrice,
                  oldSellPrice: item.product.currentSellPrice,
                  newSellPrice: update.newSellPrice,
                  updatedById: request.createdById,
                },
              });
              await tx.product.update({
                where: { id: item.productId },
                data: {
                  currentBuyPrice: update.newBuyPrice,
                  currentSellPrice: update.newSellPrice,
                },
              });
            }
          } else {
            await tx.requestItem.update({
              where: { id: update.id },
              data: { status: update.status },
            });
          }
        } else {
          if (
            update.status !== RequestItemStatus.APPROVED &&
            update.status !== RequestItemStatus.REJECTED
          ) {
            throw new BadRequestException(
              'Shop requests can only be APPROVED or REJECTED by owner',
            );
          }
          await tx.requestItem.update({
            where: { id: update.id },
            data: { status: update.status },
          });
        }
      }

      const newStatus = await this.evaluateRequestStatus(tx, requestId);
      const updated = await tx.stockRequest.update({
        where: { id: requestId },
        data: { status: newStatus },
      });

      // Notify based on what happened
      if (isStoreToOwner) {
        // Notify storekeeper that owner has acted
        await this.notifications.notifyLocation(
          'Request Updated',
          `Request #${requestId}: Owner has ${updated.status === 'REJECTED' ? 'rejected' : 'stored'} items`,
          request.storeId,
        );
      } else {
        // Approvals notify whoever dispatches next:
        //   Shop→Store  -> the store
        //   Store→Store -> the source store
        const hasApproved = itemUpdates.some((u) => u.status === RequestItemStatus.APPROVED);
        if (hasApproved) {
          const dispatchLocationId = isStoreToStore ? request.fromStoreId : request.storeId;
          if (dispatchLocationId) {
            await this.notifications.notifyLocation(
              'Items Approved',
              `Request #${requestId}: Items approved for dispatch`,
              dispatchLocationId,
            );
          }
        }
        // Rejections notify the requester:
        //   Shop→Store  -> the shop
        //   Store→Store -> the receiving store
        const hasRejected = itemUpdates.some((u) => u.status === RequestItemStatus.REJECTED);
        if (hasRejected) {
          const requesterLocationId = isStoreToStore ? request.storeId : request.shopId;
          if (requesterLocationId) {
            await this.notifications.notifyLocation(
              'Items Rejected',
              `Request #${requestId}: Some items were rejected`,
              requesterLocationId,
            );
          }
        }
      }

      return updated;
    });
  }

  // Storekeeper: Dispatch quantities (shop→store only, no inventory movement)
  async dispatchItems(
    requestId: number,
    dispatchData: { id: number; quantityDispatched: number }[],
    user: JwtPayload,
  ) {
    const request = await this.prisma.stockRequest.findUnique({
      where: { id: requestId },
      include: { items: { include: { product: true } } },
    });
    if (!request) throw new NotFoundException('Request not found');
    const isStoreToStore = request.requestType === RequestType.STORE_TO_STORE;
    if (request.requestType !== RequestType.SHOP_TO_STORE && !isStoreToStore) {
      throw new BadRequestException('Dispatch is only for shop-to-store and store-to-store requests');
    }
    if (request.status === RequestStatus.CLOSED) {
      throw new BadRequestException('Cannot modify a closed request');
    }
    if (
      request.status !== RequestStatus.APPROVED &&
      request.status !== RequestStatus.PARTIALLY_APPROVED &&
      request.status !== RequestStatus.PARTIALLY_DISPATCHED &&
      request.status !== RequestStatus.COMPLETED
    ) {
      throw new BadRequestException('Request must be (partially) approved before dispatch');
    }

    // For store-to-store, source is fromStoreId; otherwise it's storeId
    const sourceLocationId = isStoreToStore ? request.fromStoreId! : request.storeId;

    const result = await this.prisma.$transaction(async (tx) => {
      for (const data of dispatchData) {
        if (data.quantityDispatched <= 0) continue;
        const item = request.items.find((i) => i.id === data.id);
        if (!item) throw new BadRequestException('Invalid item in dispatch data');
        if (item.status !== RequestItemStatus.APPROVED) {
          throw new BadRequestException(`Item is not approved for dispatch`);
        }

        const storeInventory = await tx.inventory.findUnique({
          where: { productId_locationId: { productId: item.productId, locationId: sourceLocationId } },
        });
        if (!storeInventory || storeInventory.quantity < data.quantityDispatched) {
          throw new BadRequestException(`Insufficient stock for ${item.product.baseName}`);
        }

        const totalDispatched = item.quantityDispatched + data.quantityDispatched;
        const targetQty = item.quantityRequested ?? data.quantityDispatched;
        await tx.requestItem.update({
          where: { id: item.id },
          data: {
            quantityDispatched: { increment: data.quantityDispatched },
            status: totalDispatched >= targetQty ? RequestItemStatus.DISPATCHED : RequestItemStatus.APPROVED,
          },
        });
      }
      const newStatus = await this.evaluateRequestStatus(tx, requestId);
      return tx.stockRequest.update({ where: { id: requestId }, data: { status: newStatus } });
    });

    const ids = dispatchData.map((d) => request.items.find((i) => i.id === d.id)?.productId).filter(Boolean) as number[];
    for (const pid of [...new Set(ids)]) {
      await this.notifications.checkAndNotifyLowStock(pid, sourceLocationId);
    }
    if (isStoreToStore) {
      await this.notifications.notifyLocation(
        'Items Dispatched',
        `Transfer #${requestId}: Items dispatched to your store`,
        request.storeId,
      );
    } else {
      if (request.shopId) {
        await this.notifications.notifyLocation(
          'Items Dispatched',
          `Request #${requestId}: Items dispatched to your shop`,
          request.shopId,
        );
      }
    }
    return result;
  }

  // Receiving party confirms receipt → inventory moves here.
  // For STORE_TO_OWNER the receiving storekeeper confirms (owner never confirms);
  // for other types the request creator confirms.
  async confirmReceipt(
    requestId: number,
    items: { id: number; quantityReceived?: number }[],
    user: JwtPayload,
  ) {
    const request = await this.prisma.stockRequest.findUnique({
      where: { id: requestId },
      include: { items: { include: { product: true } } },
    });
    if (!request) throw new NotFoundException('Request not found');
    if (request.status === RequestStatus.CLOSED) {
      throw new BadRequestException('Request is already closed');
    }

    const isStoreToOwner = request.requestType === RequestType.STORE_TO_OWNER;
    const isStoreToStore = request.requestType === RequestType.STORE_TO_STORE;

    if (isStoreToOwner) {
      if (user.locationType !== 'STORE' || user.locationId !== request.storeId) {
        throw new ForbiddenException('Only the receiving storekeeper can confirm receipt');
      }
    } else if (request.createdById !== user.sub) {
      throw new ForbiddenException('Only the request creator can confirm receipt');
    }

    return this.prisma.$transaction(async (tx) => {
      for (const update of items) {
        const item = request.items.find((i) => i.id === update.id);
        if (!item) throw new BadRequestException(`Invalid item ID: ${update.id}`);

        const validPrevStatus = isStoreToOwner
          ? RequestItemStatus.STORED
          : RequestItemStatus.DISPATCHED;

        if (item.status !== validPrevStatus) {
          throw new BadRequestException(
            `Item must be ${validPrevStatus} (current: ${item.status})`,
          );
        }

        const dispatchedOrStoredQty = isStoreToOwner
          ? item.quantityStored || 0
          : item.quantityDispatched || 0;

        // Default to the stocked/dispatched amount, unless the receiver
        // submits the actual received quantity.
        const receivedQty = update.quantityReceived ?? dispatchedOrStoredQty;
        if (receivedQty <= 0) {
          throw new BadRequestException('Received quantity must be greater than 0');
        }

        if (isStoreToOwner) {
          await tx.inventory.upsert({
            where: { productId_locationId: { productId: item.productId, locationId: request.storeId } },
            update: { quantity: { increment: receivedQty } },
            create: { productId: item.productId, locationId: request.storeId, quantity: receivedQty },
          });
        } else if (isStoreToStore) {
          if (dispatchedOrStoredQty > 0 && request.fromStoreId) {
            await tx.inventory.update({
              where: { productId_locationId: { productId: item.productId, locationId: request.fromStoreId } },
              data: { quantity: { decrement: dispatchedOrStoredQty } },
            });
            await tx.inventory.upsert({
              where: { productId_locationId: { productId: item.productId, locationId: request.storeId } },
              update: { quantity: { increment: receivedQty } },
              create: { productId: item.productId, locationId: request.storeId, quantity: receivedQty },
            });
          }
        } else {
          if (dispatchedOrStoredQty > 0 && request.shopId) {
            const storeInv = await tx.inventory.findUnique({
              where: { productId_locationId: { productId: item.productId, locationId: request.storeId } },
            });
            if (storeInv) {
              await tx.inventory.update({
                where: { id: storeInv.id },
                data: { quantity: { decrement: dispatchedOrStoredQty } },
              });
            }
            await tx.inventory.upsert({
              where: { productId_locationId: { productId: item.productId, locationId: request.shopId } },
              update: { quantity: { increment: receivedQty } },
              create: { productId: item.productId, locationId: request.shopId, quantity: receivedQty },
            });
          }
        }

        await tx.requestItem.update({
          where: { id: update.id },
          data: { status: RequestItemStatus.RECEIVED, confirmedById: user.sub, confirmedAt: new Date() },
        });

        const receiptLabel = isStoreToOwner ? 'Store' : isStoreToStore ? 'Receiving Store' : 'Shop';
        await tx.auditLog.create({
          data: {
            userId: user.sub,
            action: 'CONFIRM_RECEIPT',
            details: `Confirmed receipt of ${receivedQty} at ${receiptLabel}`,
          },
        });
      }

      const newStatus = await this.evaluateRequestStatus(tx, requestId);
      const result = await tx.stockRequest.update({ where: { id: requestId }, data: { status: newStatus } });

      // Check low stock for affected locations
      for (const update of items) {
        const item = request.items.find((i) => i.id === update.id);
        if (item) {
          await this.notifications.checkAndNotifyLowStock(item.productId, request.storeId);
          if (request.shopId) {
            await this.notifications.checkAndNotifyLowStock(item.productId, request.shopId);
          }
        }
      }

      // Notify the Owner that the storekeeper confirmed receipt
      await this.notifications.notifyOwner(
        'Receipt Confirmed',
        `Request #${requestId}: items confirmed as received`,
      );

      return result;
    });
  }
}
