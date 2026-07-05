import { Injectable, NotFoundException, BadRequestException, ConflictException, Logger } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { PrismaService } from '../prisma/prisma.service.js';
import { MailerService } from '../mailer/mailer.service.js';
import { UpdateProfileDto } from './dto/update-profile.dto.js';
import { ChangePasswordDto } from './dto/change-password.dto.js';
import { AdminCreateUserDto } from './dto/admin-create-user.dto.js';
import { AdminUpdateUserDto } from './dto/admin-update-user.dto.js';
import { ListUsersQueryDto } from './dto/list-users-query.dto.js';

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    private readonly prismaService: PrismaService,
    private readonly mailerService: MailerService,
  ) {}

  private toSafeUser(user: any) {
    const { passwordHash, refreshToken, emailVerificationToken, passwordResetToken, passwordResetExpiry, ...safeUser } = user;
    return safeUser;
  }

  async getMe(userId: string) {
    const user = await this.prismaService.client.user.findUnique({
      where: { id: userId },
    });
    if (!user) throw new NotFoundException('User not found');
    return this.toSafeUser(user);
  }

  async updateMe(userId: string, dto: UpdateProfileDto) {
    const updated = await this.prismaService.client.user.update({
      where: { id: userId },
      data: dto,
    });

    await this.prismaService.client.activityLog.create({
      data: {
        actorId: userId,
        entityType: 'user',
        entityId: userId,
        action: 'profile_updated',
      },
    });

    return this.toSafeUser(updated);
  }

  async changePassword(userId: string, dto: ChangePasswordDto) {
    const user = await this.prismaService.client.user.findUnique({
      where: { id: userId },
    });
    if (!user) throw new NotFoundException('User not found');

    const isValid = await bcrypt.compare(dto.currentPassword, user.passwordHash);
    if (!isValid) throw new BadRequestException('Current password is incorrect');

    const passwordHash = await bcrypt.hash(dto.newPassword, 12);

    await this.prismaService.client.user.update({
      where: { id: userId },
      data: { passwordHash, refreshToken: null },
    });

    await this.prismaService.client.activityLog.create({
      data: {
        actorId: userId,
        entityType: 'user',
        entityId: userId,
        action: 'password_changed',
      },
    });

    return { message: 'Password changed successfully. Please log in again.' };
  }

  async deleteMe(userId: string) {
    // Due to soft delete middleware, delete is rewritten to update
    await this.prismaService.client.user.update({
      where: { id: userId },
      data: { isActive: false, refreshToken: null },
    });
    
    await this.prismaService.client.user.delete({
      where: { id: userId },
    });

    await this.prismaService.client.activityLog.create({
      data: {
        actorId: userId,
        entityType: 'user',
        entityId: userId,
        action: 'account_deleted',
      },
    });

    return { message: 'Account deleted successfully.' };
  }

  async adminListUsers(query: ListUsersQueryDto) {
    const { page = 1, limit = 20, search, systemRole, isActive } = query;
    const skip = (page - 1) * limit;

    const where: any = {};
    if (systemRole) where.systemRole = systemRole;
    if (isActive !== undefined) where.isActive = isActive;
    
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [users, total] = await Promise.all([
      this.prismaService.client.user.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prismaService.client.user.count({ where }),
    ]);

    return {
      data: users.map(user => this.toSafeUser(user)),
      total,
      page,
      limit,
    };
  }

  async adminGetUser(targetId: string) {
    const user = await this.prismaService.client.user.findUnique({
      where: { id: targetId },
    });
    if (!user) throw new NotFoundException('User not found');
    return this.toSafeUser(user);
  }

  async adminCreateUser(dto: AdminCreateUserDto) {
    const existingUser = await this.prismaService.client.user.findFirst({
      where: { email: dto.email, deletedAt: null },
    });
    const softDeletedUser = await this.prismaService.client.user.findFirst({
      where: { email: dto.email, deletedAt: { not: null } },
    });

    if (existingUser || softDeletedUser) {
      throw new ConflictException('Email already registered');
    }

    const tempPassword = crypto.randomBytes(8).toString('hex');
    const passwordHash = await bcrypt.hash(tempPassword, 12);
    const emailVerificationToken = crypto.randomBytes(32).toString('hex');

    const user = await this.prismaService.client.user.create({
      data: {
        name: dto.name,
        email: dto.email,
        passwordHash,
        systemRole: dto.systemRole || 'USER',
        isEmailVerified: false,
        emailVerificationToken,
      },
    });

    await this.mailerService.sendEmailVerification(dto.email, dto.name, emailVerificationToken);

    await this.prismaService.client.activityLog.create({
      data: {
        entityType: 'user',
        entityId: user.id,
        action: 'admin_created_user',
        meta: { targetUserId: user.id },
      },
    });

    return { user: this.toSafeUser(user), message: 'User created. Verification email sent.' };
  }

  async adminUpdateUser(actorId: string, targetId: string, dto: AdminUpdateUserDto) {
    const user = await this.prismaService.client.user.findUnique({
      where: { id: targetId },
    });
    if (!user) throw new NotFoundException('User not found');

    const updated = await this.prismaService.client.user.update({
      where: { id: targetId },
      data: dto,
    });

    await this.prismaService.client.activityLog.create({
      data: {
        actorId,
        entityType: 'user',
        entityId: targetId,
        action: 'admin_updated_user',
        meta: { changes: dto },
      },
    });

    return this.toSafeUser(updated);
  }

  async adminDeactivateUser(actorId: string, targetId: string) {
    const user = await this.prismaService.client.user.findUnique({
      where: { id: targetId },
    });
    if (!user) throw new NotFoundException('User not found');

    await this.prismaService.client.user.update({
      where: { id: targetId },
      data: { isActive: false, refreshToken: null },
    });

    await this.prismaService.client.activityLog.create({
      data: {
        actorId,
        entityType: 'user',
        entityId: targetId,
        action: 'admin_deactivated_user',
      },
    });

    return { message: 'User deactivated successfully.' };
  }

  async adminReactivateUser(actorId: string, targetId: string) {
    const user = await this.prismaService.client.user.findUnique({
      where: { id: targetId },
    });
    if (!user) throw new NotFoundException('User not found');

    await this.prismaService.client.user.update({
      where: { id: targetId },
      data: { isActive: true },
    });

    await this.prismaService.client.activityLog.create({
      data: {
        actorId,
        entityType: 'user',
        entityId: targetId,
        action: 'admin_reactivated_user',
      },
    });

    return { message: 'User reactivated successfully.' };
  }

  async adminDeleteUser(actorId: string, targetId: string) {
    const user = await this.prismaService.client.user.findUnique({
      where: { id: targetId },
    });
    if (!user) throw new NotFoundException('User not found');

    await this.prismaService.client.user.update({
      where: { id: targetId },
      data: { isActive: false, refreshToken: null },
    });

    await this.prismaService.client.user.delete({
      where: { id: targetId },
    });

    await this.prismaService.client.activityLog.create({
      data: {
        actorId,
        entityType: 'user',
        entityId: targetId,
        action: 'admin_deleted_user',
      },
    });

    return { message: 'User deleted successfully.' };
  }
}
