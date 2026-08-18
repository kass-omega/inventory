import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class CreditSalesService {
  constructor(private prisma: PrismaService) {}

  async create(data: {
    customerId: number;
    totalAmount: number;
    shopId: number;
    items: { productId: number; quantity: number; unitPrice: number }[];
    saleId?: number;
  }) {
    return this.prisma.creditSale.create({
      data: {
        customerId: data.customerId,
        totalAmount: data.totalAmount,
        shopId: data.shopId,
        saleId: data.saleId,
        items: {
          create: data.items.map((i) => ({
            productId: i.productId,
            quantity: i.quantity,
            unitPrice: i.unitPrice,
          })),
        },
      },
      include: { items: true },
    });
  }

  findOne(id: number) {
    return this.prisma.creditSale.findUnique({
      where: { id },
      include: { items: { include: { product: true } }, customer: true },
    });
  }

  async remove(id: number) {
    return this.prisma.creditSale.delete({ where: { id } });
  }
}