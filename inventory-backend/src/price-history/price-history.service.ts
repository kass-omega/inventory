import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class PriceHistoryService {
  constructor(private prisma: PrismaService) {}

  findAll() {
    return this.prisma.priceHistory.findMany({
      include: { product: true },
      orderBy: { updatedAt: 'desc' },
    });
  }

  async findOne(id: number) {
    const record = await this.prisma.priceHistory.findUnique({ where: { id } });
    if (!record) throw new NotFoundException('Record not found');
    return record;
  }

  update(id: number, dto: any) {
    return this.prisma.priceHistory.update({ where: { id }, data: dto });
  }

  remove(id: number) {
    return this.prisma.priceHistory.delete({ where: { id } });
  }
}
