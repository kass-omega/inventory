import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class PaymentMethodsService {
  constructor(private prisma: PrismaService) {}

  findAll() {
    return this.prisma.paymentMethod.findMany({ orderBy: { name: 'asc' } });
  }

  create(name: string) {
    return this.prisma.paymentMethod.create({ data: { name } });
  }

  remove(id: number) {
    return this.prisma.paymentMethod.delete({ where: { id } });
  }
}