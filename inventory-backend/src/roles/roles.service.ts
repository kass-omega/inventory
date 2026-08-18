// src/roles/roles.service.ts
import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateRoleDto, UpdateRoleDto } from './dto/role.dto';

@Injectable()
export class RolesService {
  constructor(private prisma: PrismaService) {}

  findAll() {
    return this.prisma.role.findMany({
      include: {
        permissions: { include: { permission: true } },
        _count: { select: { users: true } },
      },
      orderBy: { id: 'asc' },
    });
  }

  findPermissions() {
    return this.prisma.permission.findMany({
      orderBy: [{ group: 'asc' }, { key: 'asc' }],
    });
  }

  async create(dto: CreateRoleDto) {
    const permissionIds = await this.resolvePermissionIds(dto.permissions);

    return this.prisma.role.create({
      data: {
        name: dto.name,
        description: dto.description,
        permissions: {
          create: permissionIds.map((permissionId) => ({ permissionId })),
        },
      },
      include: { permissions: { include: { permission: true } } },
    });
  }

  async update(id: number, dto: UpdateRoleDto) {
    const role = await this.prisma.role.findUnique({ where: { id } });
    if (!role) throw new BadRequestException('Role not found');
    if (role.isSystem) throw new BadRequestException('System role cannot be edited');

    const data: { name?: string; description?: string } = {};
    if (dto.name) data.name = dto.name;
    if (dto.description !== undefined) data.description = dto.description;

    if (Object.keys(data).length > 0) {
      await this.prisma.role.update({ where: { id }, data });
    }

    if (dto.permissions) {
      const permissionIds = await this.resolvePermissionIds(dto.permissions);
      await this.prisma.rolePermission.deleteMany({ where: { roleId: id } });
      if (permissionIds.length > 0) {
        await this.prisma.rolePermission.createMany({
          data: permissionIds.map((permissionId) => ({ roleId: id, permissionId })),
        });
      }
    }

    return this.prisma.role.findUnique({
      where: { id },
      include: { permissions: { include: { permission: true } } },
    });
  }

  async remove(id: number) {
    const role = await this.prisma.role.findUnique({
      where: { id },
      include: { _count: { select: { users: true } } },
    });
    if (!role) throw new BadRequestException('Role not found');
    if (role.isSystem) throw new BadRequestException('System role cannot be deleted');
    if (role._count.users > 0) {
      throw new BadRequestException('Cannot delete a role that is assigned to users');
    }
    return this.prisma.role.delete({ where: { id } });
  }

  private async resolvePermissionIds(keys: string[]) {
    const permissions = await this.prisma.permission.findMany({
      where: { key: { in: keys } },
    });
    return permissions.map((p) => p.id);
  }
}
