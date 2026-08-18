import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class CreditPaymentsService {
  constructor(private prisma: PrismaService) {}

  create(data: { customerId: number; amount: number; notes?: string; paymentMethodId?: number }) {
    return this.prisma.creditPayment.create({ data });
  }

  update(id: number, data: { amount?: number; notes?: string; paymentMethodId?: number; paidAt?: string }) {
    return this.prisma.creditPayment.update({ where: { id }, data });
  }

  remove(id: number) {
    return this.prisma.creditPayment.delete({ where: { id } });
  }
}