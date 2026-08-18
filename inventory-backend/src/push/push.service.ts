import { Injectable } from '@nestjs/common';
import * as webpush from 'web-push';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class PushService {
  private enabled = false;

  constructor(private prisma: PrismaService) {
    if (process.env.VAPID_SUBJECT && process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
      webpush.setVapidDetails(
        process.env.VAPID_SUBJECT,
        process.env.VAPID_PUBLIC_KEY,
        process.env.VAPID_PRIVATE_KEY,
      );
      this.enabled = true;
    }
  }

  async subscribe(userId: number, sub: { endpoint: string; keys: { p256dh: string; auth: string } }) {
    await this.prisma.pushSubscription.upsert({
      where: { endpoint: sub.endpoint },
      update: { userId, p256dh: sub.keys.p256dh, auth: sub.keys.auth },
      create: { userId, endpoint: sub.endpoint, p256dh: sub.keys.p256dh, auth: sub.keys.auth },
    });
  }

  async sendToUser(userId: number, payload: { title: string; body: string; url?: string }) {
    if (!this.enabled) return;
    const subs = await this.prisma.pushSubscription.findMany({ where: { userId } });
    for (const sub of subs) {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          JSON.stringify(payload),
        );
      } catch (e: any) {
        if (e.statusCode === 410 || e.statusCode === 404) {
          await this.prisma.pushSubscription.delete({ where: { id: sub.id } });
        }
      }
    }
  }

  async sendToRoleId(payload: { title: string; body: string; url?: string }, roleId: number) {
    if (!this.enabled) return;
    const users = await this.prisma.user.findMany({ where: { roleId } });
    for (const user of users) {
      await this.sendToUser(user.id, payload);
    }
  }

  async sendToLocation(payload: { title: string; body: string; url?: string }, locationId: number) {
    if (!this.enabled) return;
    const users = await this.prisma.user.findMany({ where: { locationId } });
    for (const user of users) {
      await this.sendToUser(user.id, payload);
    }
  }
}