import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { UserStatus } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { JwtPayload } from '../common/interfaces/jwt-payload.interface';
import { PrismaService } from '../prisma/prisma.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';

const MAX_FAILED_ATTEMPTS = 5;
const BLOCK_MS = 15 * 60 * 1000;

interface FailedAttempt {
  count: number;
  blockedUntil: number;
}

@Injectable()
export class AuthService {
  private readonly failedLogins = new Map<string, FailedAttempt>();

  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
  ) {}

  private lockoutKey(email: string, ip?: string): string {
    return `${email.trim().toLowerCase()}|${ip ?? 'unknown'}`;
  }

  private isBlocked(key: string): boolean {
    const entry = this.failedLogins.get(key);
    if (!entry) return false;
    if (entry.blockedUntil > Date.now()) return true;
    this.failedLogins.delete(key);
    return false;
  }

  private recordFailure(key: string) {
    const entry = this.failedLogins.get(key) ?? { count: 0, blockedUntil: 0 };
    entry.count += 1;
    if (entry.count >= MAX_FAILED_ATTEMPTS) {
      entry.blockedUntil = Date.now() + BLOCK_MS;
      entry.count = 0;
    }
    this.failedLogins.set(key, entry);
  }

  private clearFailures(key: string) {
    this.failedLogins.delete(key);
  }

  private async audit(userId: number, action: string, details: string) {
    try {
      await this.prisma.auditLog.create({
        data: { userId, action, details },
      });
    } catch {
      // Audit logging must never break the primary flow.
    }
  }

  async register(dto: RegisterDto, caller: JwtPayload) {
    const existingUser = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    if (existingUser) {
      throw new ConflictException('Email already exists');
    }

    const role = await this.prisma.role.findUnique({
      where: { id: dto.roleId },
    });
    if (!role) throw new BadRequestException('Role not found');
    if (role.isSystem && !caller.isSuperuser) {
      throw new ForbiddenException(
        'Only the system owner can assign system roles',
      );
    }

    if (dto.locationId != null) {
      const location = await this.prisma.location.findUnique({
        where: { id: dto.locationId },
      });
      if (!location) throw new BadRequestException('Location not found');
    }

    const hashedPassword = await bcrypt.hash(dto.password, 10);

    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        password: hashedPassword,
        name: dto.name,
        roleId: dto.roleId,
        locationId: dto.locationId,
      },
    });

    await this.audit(
      caller.sub,
      'USER_CREATED',
      `Created user ${user.email} with role ${role.name}`,
    );

    return { message: 'User registered successfully', userId: user.id };
  }

  async login(dto: LoginDto, ip?: string) {
    const key = this.lockoutKey(dto.email, ip);
    if (this.isBlocked(key)) {
      throw new HttpException(
        'Too many failed attempts. Try again later.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
      include: {
        role: {
          include: {
            permissions: { include: { permission: true } },
          },
        },
        location: true,
      },
    });

    if (!user) {
      this.recordFailure(key);
      throw new UnauthorizedException('Invalid credentials');
    }

    const isPasswordValid = await bcrypt.compare(
      dto.password,
      user.password,
    );
    if (!isPasswordValid) {
      this.recordFailure(key);
      await this.audit(
        user.id,
        'LOGIN_FAILED',
        `Failed login attempt for ${user.email}`,
      );
      throw new UnauthorizedException('Invalid credentials');
    }

    if (user.status === UserStatus.INACTIVE) {
      throw new ForbiddenException('Account is inactive');
    }

    this.clearFailures(key);

    const isSuperuser = user.role?.isSystem ?? false;
    const permissions =
      user.role?.permissions.map((rp) => rp.permission.key) ?? [];

    const payload = {
      sub: user.id,
      email: user.email,
      phone: user.phone,
      roleId: user.roleId,
      roleName: user.role?.name ?? null,
      isSuperuser,
      permissions,
      locationId: user.locationId,
      locationType: user.location?.type ?? null,
    };

    const token = this.jwtService.sign(payload);

    return {
      access_token: token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        roleId: user.roleId,
        roleName: user.role?.name ?? null,
        isSuperuser,
        permissions,
        locationId: user.locationId,
        locationType: user.location?.type ?? null,
      },
    };
  }

  async getProfile(userId: number) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        roleId: true,
        role: { select: { id: true, name: true, isSystem: true } },
        locationId: true,
        location: true,
      },
    });
    if (!user) throw new UnauthorizedException('User not found');
    return user;
  }

  async getMe(userId: number) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        role: { include: { permissions: { include: { permission: true } } } },
        location: true,
      },
    });
    if (!user) throw new UnauthorizedException('User not found');
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      roleId: user.roleId,
      roleName: user.role?.name ?? null,
      isSuperuser: user.role?.isSystem ?? false,
      permissions: user.role?.permissions.map((rp) => rp.permission.key) ?? [],
      locationId: user.locationId,
      locationType: user.location?.type ?? null,
    };
  }

  async updateProfile(userId: number, data: { name?: string; email?: string; phone?: string }) {
    if (data.email) {
      const existing = await this.prisma.user.findUnique({
        where: { email: data.email },
      });
      if (existing && existing.id !== userId) {
        throw new ConflictException('Email already exists');
      }
    }

    return this.prisma.user.update({
      where: { id: userId },
      data,
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        roleId: true,
        locationId: true,
      },
    });
  }

  async changePassword(
    caller: JwtPayload,
    currentPassword: string,
    newPassword: string,
  ) {
    if (!caller.isSuperuser) {
      throw new ForbiddenException(
        'Only the system owner can change passwords',
      );
    }

    const user = await this.prisma.user.findUnique({
      where: { id: caller.sub },
    });
    if (!user) throw new UnauthorizedException('User not found');

    const valid = await bcrypt.compare(currentPassword, user.password);
    if (!valid) {
      throw new UnauthorizedException('Current password is incorrect');
    }

    const hashed = await bcrypt.hash(newPassword, 10);
    await this.prisma.user.update({
      where: { id: caller.sub },
      data: { password: hashed },
    });
    await this.audit(
      caller.sub,
      'PASSWORD_CHANGED',
      'User changed their own password',
    );
    return { message: 'Password changed' };
  }
}
