import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class CustomersService {
  constructor(private prisma: PrismaService) {}

  async findAll(shopId?: number) {
    return this.prisma.customer.findMany({
      where: shopId ? { creditSales: { some: { shopId } } } : undefined,
      include: {
        creditSales: { include: { shop: true } },
        creditPayments: true,
      },
      orderBy: { createdAt: 'desc' },
    }).then(customers => {
      return customers
        .map((c) => {
          // All credits across all shops — consistent with payments (which have no shopId)
          const totalCredits = c.creditSales.reduce((s, cs) => s + cs.totalAmount, 0);
          const totalPaid = c.creditPayments.reduce((s, cp) => s + cp.amount, 0);
          return {
            id: c.id, name: c.name, phone: c.phone,
            totalCredits, totalPaid, remaining: totalCredits - totalPaid,
          };
        })
        .filter(c => c.totalCredits > 0 || !shopId);
    });
  }

  async findOne(id: number, _shopId?: number) {
    const c = await this.prisma.customer.findUnique({
      where: { id },
      include: {
        creditSales: {
          include: {
            items: { include: { product: true } },
            shop: true,
            sale: {
              select: {
                id: true,
                saleType: true,
                paidAmount: true,
                remainingAmount: true,
              },
            },
          },
          orderBy: { createdAt: 'desc' },
        },
        creditPayments: { orderBy: { paidAt: 'desc' }, include: { paymentMethod: true } },
      },
    });
    if (!c) return null;
    // All credits & payments across all shops — consistent since payments have no shopId
    const totalCredits = c.creditSales.reduce((s, cs) => s + cs.totalAmount, 0);
    const totalPaid = c.creditPayments.reduce((s, cp) => s + cp.amount, 0);
    return { ...c, totalCredits, totalPaid, remaining: totalCredits - totalPaid };
  }

  create(data: { name: string; phone?: string }) {
    return this.prisma.customer.create({ data });
  }

  update(id: number, data: { name?: string; phone?: string }) {
    return this.prisma.customer.update({ where: { id }, data });
  }

  async remove(id: number) {
    return this.prisma.customer.delete({ where: { id } });
  }
}