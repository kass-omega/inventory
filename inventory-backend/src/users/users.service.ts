// src/users/users.service.ts
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, UserStatus } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { JwtPayload } from '../common/interfaces/jwt-payload.interface';
import { PrismaService } from '../prisma/prisma.service';
import { UserDto } from './dto/user.dto';

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  findAll() {
    return this.prisma.user.findMany({
      select: {
        id: true,
        email: true,
        name: true,
        roleId: true,
        role: { select: { id: true, name: true, isSystem: true } },
        status: true,
        locationId: true,
      },
      orderBy: { id: 'asc' },
    });
  }

  private async countSystemUsers(): Promise<number> {
    return this.prisma.user.count({ where: { role: { isSystem: true } } });
  }

  private async getTargetOrThrow(id: number) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      include: { role: true },
    });
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  private assertCanModify(
    target: { role: { isSystem: boolean } | null },
    caller: JwtPayload,
  ) {
    if (target.role?.isSystem && !caller.isSuperuser) {
      throw new ForbiddenException(
        'Only the system owner can modify the system owner account',
      );
    }
  }

  async update(id: number, dto: UserDto, caller: JwtPayload) {
    const target = await this.getTargetOrThrow(id);
    this.assertCanModify(target, caller);

    if (dto.password && !caller.isSuperuser) {
      throw new ForbiddenException(
        'Only the system owner can change passwords',
      );
    }

    if (dto.roleId !== undefined) {
      const role = await this.prisma.role.findUnique({
        where: { id: dto.roleId },
      });
      if (!role) throw new BadRequestException('Role not found');
      if (role.isSystem && !caller.isSuperuser) {
        throw new ForbiddenException(
          'Only the system owner can assign system roles',
        );
      }
      if (
        target.role?.isSystem &&
        !role.isSystem &&
        caller.sub === id &&
        (await this.countSystemUsers()) <= 1
      ) {
        throw new BadRequestException('Cannot demote the last system owner');
      }
    }

    if (dto.locationId !== undefined && dto.locationId !== null) {
      const location = await this.prisma.location.findUnique({
        where: { id: dto.locationId },
      });
      if (!location) throw new BadRequestException('Location not found');
    }

    const { password, locationId, ...rest } = dto;
    const updateData: Prisma.UserUncheckedUpdateInput = { ...rest };

    if (password) {
      updateData.password = await bcrypt.hash(password, 10);
    }

    if (locationId !== undefined) {
      updateData.locationId = locationId;
    }

    const updated = await this.prisma.user.update({
      where: { id },
      data: updateData,
    });
    await this.audit(
      caller.sub,
      'USER_UPDATED',
      `Updated user ${updated.email}`,
    );
    return updated;
  }

  async resetPassword(id: number, newPassword: string, caller: JwtPayload) {
    if (!caller.isSuperuser) {
      throw new ForbiddenException(
        'Only the system owner can change passwords',
      );
    }

    const target = await this.getTargetOrThrow(id);

    const hashed = await bcrypt.hash(newPassword, 10);
    await this.prisma.user.update({
      where: { id },
      data: { password: hashed },
    });
    await this.audit(
      caller.sub,
      'PASSWORD_RESET',
      `Reset password for user ${target.email}`,
    );
    return { message: 'Password updated' };
  }

  async updateStatus(id: number, status: UserStatus, caller: JwtPayload) {
    if (id === caller.sub) {
      throw new BadRequestException('You cannot change your own status');
    }

    const target = await this.getTargetOrThrow(id);
    this.assertCanModify(target, caller);

    if (target.role?.isSystem && status === UserStatus.INACTIVE) {
      throw new BadRequestException('Cannot deactivate the system role');
    }

    const updated = await this.prisma.user.update({
      where: { id },
      data: { status },
      select: { id: true, status: true },
    });
    await this.audit(
      caller.sub,
      'USER_STATUS_CHANGED',
      `Set status of ${target.email} to ${status}`,
    );
    return updated;
  }

  async remove(id: number, caller: JwtPayload) {
    if (id === caller.sub) {
      throw new BadRequestException('You cannot delete your own account');
    }

    const target = await this.getTargetOrThrow(id);
    this.assertCanModify(target, caller);

    if (target.role?.isSystem && (await this.countSystemUsers()) <= 1) {
      throw new BadRequestException('Cannot delete the last system owner');
    }

    // The user can be referenced by audit logs (ON DELETE RESTRICT) and sales
    // (Sale.soldById FK, ON DELETE RESTRICT), so a plain delete fails. Run the
    // deletion in a transaction: drop the user's audit trail + push
    // subscriptions, re-attribute their sales to the acting user to preserve
    // sales history, then delete the account.
    await this.prisma.$transaction(async (tx) => {
      await tx.auditLog.deleteMany({ where: { userId: id } });
      await tx.pushSubscription.deleteMany({ where: { userId: id } });
      await tx.sale.updateMany({
        where: { soldById: id },
        data: { soldById: caller.sub },
      });
      await tx.user.delete({ where: { id } });
    });
    await this.audit(
      caller.sub,
      'USER_DELETED',
      `Deleted user ${target.email}`,
    );
    return { message: 'User deleted' };
  }

  private async audit(userId: number, action: string, details: string) {
    try {
      await this.prisma.auditLog.create({
        data: { userId, action, details },
      });
    } catch {
      // never break the primary flow
    }
  }
}
