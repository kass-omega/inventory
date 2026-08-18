import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateLocationDto } from './dto/create-location.dto';
import { UpdateLocationDto } from './dto/update-location.dto';

@Injectable()
export class LocationsService {
  constructor(private prisma: PrismaService) {}

  create(dto: CreateLocationDto) {
    return this.prisma.location.create({ data: dto });
  }

  findAll() {
    return this.prisma.location.findMany({
      include: { users: true, category: true },
    });
  }

  findCategories() {
    return this.prisma.locationCategory.findMany({ orderBy: { name: 'asc' } });
  }

  createCategory(name: string) {
    return this.prisma.locationCategory.create({ data: { name } });
  }

  async findOne(id: number) {
    const location = await this.prisma.location.findUnique({ where: { id } });
    if (!location) throw new NotFoundException('Location not found');
    return location;
  }

  update(id: number, dto: UpdateLocationDto) {
    return this.prisma.location.update({ where: { id }, data: dto });
  }

  remove(id: number) {
    return this.prisma.location.delete({ where: { id } });
  }
}
