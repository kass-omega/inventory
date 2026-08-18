import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Observable, Subject } from 'rxjs';
import { JwtPayload } from '../common/interfaces/jwt-payload.interface';
import { PrismaService } from '../prisma/prisma.service';
import { PushService } from '../push/push.service';

const LOW_STOCK_THRESHOLD = 10;

@Injectable()
export class NotificationsService {
  private readonly events = new Subject<{ data: string }>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly push: PushService,
  ) {}

  /** SSE stream of notification refresh events. */
  getStream(): Observable<{ data: string }> {
    return this.events.asObservable();
  }

  private async getOwnerRoleId(): Promise<number | null> {
    const role = await this.prisma.role.findFirst({ where: { isSystem: true } });
    return role?.id ?? null;
  }

  async checkAndNotifyLowStock(
    productId: number,
    locationId: number,
  ): Promise<void> {
    const inventory = await this.prisma.inventory.findUnique({
      where: {
        productId_locationId: { productId, locationId },
      },
      include: { product: true, location: true },
    });

    if (!inventory) return;

    const qty = inventory.quantity;

    if (qty < LOW_STOCK_THRESHOLD) {
      const productName = `${inventory.product.brand} ${inventory.product.baseName}`;

      const ownerRoleId = await this.getOwnerRoleId();
      if (ownerRoleId) {
        const existingOwner = await this.prisma.notification.findFirst({
          where: {
            type: 'LOW_STOCK',
            productId,
            locationId,
            targetRoleId: ownerRoleId,
            isRead: false,
          },
        });

        if (!existingOwner) {
          await this.prisma.notification.create({
            data: {
              type: 'LOW_STOCK',
              title: 'Low Stock Alert',
              message: `${productName} is running low (${qty} remaining) at ${inventory.location.name}.`,
              productId,
              locationId,
              targetRoleId: ownerRoleId,
            },
          });
        }
      }

      const existingLocation = await this.prisma.notification.findFirst({
        where: {
          type: 'LOW_STOCK',
          productId,
          locationId,
          targetRoleId: null,
          targetLocationId: locationId,
          isRead: false,
        },
      });

      if (!existingLocation) {
        await this.prisma.notification.create({
          data: {
            type: 'LOW_STOCK',
            title: 'Low Stock Alert',
            message: `${productName} is running low (${qty} remaining) at ${inventory.location.name}.`,
            productId,
            locationId,
            targetRoleId: null,
            targetLocationId: locationId,
          },
        });
      }

      this.push
        .sendToLocation({
          title: 'Low Stock Alert',
          body: `${productName} is running low (${qty} remaining)`,
        }, locationId)
        .catch(() => {});
    }
  }

  async notifyOwner(
    title: string,
    message: string,
    opts: { productId?: number; locationId?: number } = {},
  ): Promise<void> {
    const ownerRoleId = await this.getOwnerRoleId();

    await this.prisma.notification.create({
      data: {
        type: 'REQUEST_STATUS',
        title,
        message,
        targetRoleId: ownerRoleId,
        targetLocationId: null,
        productId: opts.productId ?? null,
        locationId: opts.locationId ?? null,
      },
    });

    this.events.next({ data: 'refresh' });

    if (ownerRoleId) {
      this.push
        .sendToRoleId({ title, body: message }, ownerRoleId)
        .catch(() => {});
    }
  }

  async notifyLocation(
    title: string,
    message: string,
    locationId: number,
    opts: { productId?: number } = {},
  ): Promise<void> {
    await this.prisma.notification.create({
      data: {
        type: 'REQUEST_STATUS',
        title,
        message,
        targetRoleId: null,
        targetLocationId: locationId,
        productId: opts.productId ?? null,
        locationId: locationId,
      },
    });

    this.events.next({ data: 'refresh' });

    this.push
      .sendToLocation({ title, body: message }, locationId)
      .catch(() => {});
  }

  async checkAllLowStockForLocation(locationId: number): Promise<void> {
    const inventories = await this.prisma.inventory.findMany({
      where: { locationId },
    });

    for (const inv of inventories) {
      await this.checkAndNotifyLowStock(inv.productId, locationId);
    }
  }

  async findAll(user: JwtPayload) {
    const where: any = {};

    if (!user.isSuperuser) {
      where.OR = [
        {
          targetRoleId: user.roleId,
          targetLocationId: user.locationId ?? undefined,
        },
        { targetRoleId: user.roleId, targetLocationId: null },
        { targetRoleId: null, targetLocationId: user.locationId ?? undefined },
        {
          targetRoleId: null,
          targetLocationId: null,
        },
      ];
    }

    return this.prisma.notification.findMany({
      where,
      include: {
        product: true,
        location: true,
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  async getUnreadCount(user: JwtPayload): Promise<{ count: number }> {
    const where: any = { isRead: false };

    if (!user.isSuperuser) {
      where.OR = [
        {
          targetRoleId: user.roleId,
          targetLocationId: user.locationId ?? undefined,
        },
        { targetRoleId: user.roleId, targetLocationId: null },
        { targetRoleId: null, targetLocationId: user.locationId ?? undefined },
        {
          targetRoleId: null,
          targetLocationId: null,
        },
      ];
    }

    const count = await this.prisma.notification.count({ where });
    return { count };
  }

  async markAsRead(id: number, user: JwtPayload): Promise<void> {
    const notification = await this.prisma.notification.findUnique({
      where: { id },
    });
    if (!notification) {
      throw new NotFoundException('Notification not found');
    }
    if (!user.isSuperuser && !this.isVisibleTo(notification, user)) {
      throw new ForbiddenException('You cannot read this notification');
    }

    await this.prisma.notification.update({
      where: { id },
      data: { isRead: true },
    });
  }

  async markAllAsRead(user: JwtPayload): Promise<void> {
    const where: any = { isRead: false };

    if (!user.isSuperuser) {
      where.OR = [
        {
          targetRoleId: user.roleId,
          targetLocationId: user.locationId ?? undefined,
        },
        { targetRoleId: user.roleId, targetLocationId: null },
        { targetRoleId: null, targetLocationId: user.locationId ?? undefined },
        {
          targetRoleId: null,
          targetLocationId: null,
        },
      ];
    }

    await this.prisma.notification.updateMany({
      where,
      data: { isRead: true },
    });
  }

  private isVisibleTo(
    n: { targetRoleId: number | null; targetLocationId: number | null },
    user: JwtPayload,
  ): boolean {
    const matchesRole =
      n.targetRoleId === null || n.targetRoleId === user.roleId;
    const matchesLocation =
      n.targetLocationId === null || n.targetLocationId === user.locationId;
    return matchesRole && matchesLocation;
  }
}
