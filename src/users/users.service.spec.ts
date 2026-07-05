import { Test, TestingModule } from '@nestjs/testing';
import { UsersService } from './users.service';
import { PrismaService } from '../prisma/prisma.service';
import { MailerService } from '../mailer/mailer.service';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { ChangePasswordDto } from './dto/change-password.dto';

jest.mock('bcrypt');

describe('UsersService (Self endpoints)', () => {
  let service: UsersService;
  let prisma: jest.Mocked<any>;

  beforeEach(async () => {
    const mockPrisma = {
      client: {
        user: {
          findUnique: jest.fn(),
          update: jest.fn(),
          delete: jest.fn(),
        },
        activityLog: {
          create: jest.fn(),
        },
      },
    };

    const mockMailer = {
      sendEmailVerification: jest.fn(),
      sendPasswordReset: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: MailerService, useValue: mockMailer },
      ],
    }).compile();

    service = module.get<UsersService>(UsersService);
    prisma = module.get(PrismaService);

    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getMe', () => {
    it('should return safe user when found', async () => {
      const user = { id: 'user-1', email: 'test@example.com', passwordHash: 'hash', refreshToken: 'token' };
      prisma.client.user.findUnique.mockResolvedValue(user);

      const result = await service.getMe('user-1');
      expect(prisma.client.user.findUnique).toHaveBeenCalledWith({ where: { id: 'user-1' } });
      expect(result).toEqual({ id: 'user-1', email: 'test@example.com' });
      expect((result as any).passwordHash).toBeUndefined();
    });

    it('should throw NotFoundException if user not found', async () => {
      prisma.client.user.findUnique.mockResolvedValue(null);
      await expect(service.getMe('user-1')).rejects.toThrow(NotFoundException);
    });
  });

  describe('updateMe', () => {
    it('should update profile and log activity', async () => {
      const dto: UpdateProfileDto = { name: 'Updated Name' };
      const updatedUser = { id: 'user-1', name: 'Updated Name', passwordHash: 'hash' };
      prisma.client.user.update.mockResolvedValue(updatedUser);

      const result = await service.updateMe('user-1', dto);

      expect(prisma.client.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: dto,
      });
      expect(prisma.client.activityLog.create).toHaveBeenCalledWith({
        data: {
          actorId: 'user-1',
          entityType: 'user',
          entityId: 'user-1',
          action: 'profile_updated',
        },
      });
      expect(result).toEqual({ id: 'user-1', name: 'Updated Name' });
    });
  });

  describe('changePassword', () => {
    const dto: ChangePasswordDto = { currentPassword: 'old', newPassword: 'new' };

    it('should update password and invalidate refresh token on correct current password', async () => {
      prisma.client.user.findUnique.mockResolvedValue({ id: 'user-1', passwordHash: 'old-hash' });
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);
      (bcrypt.hash as jest.Mock).mockResolvedValue('new-hash');

      const result = await service.changePassword('user-1', dto);

      expect(bcrypt.compare).toHaveBeenCalledWith('old', 'old-hash');
      expect(bcrypt.hash).toHaveBeenCalledWith('new', 12);
      expect(prisma.client.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: { passwordHash: 'new-hash', refreshToken: null },
      });
      expect(prisma.client.activityLog.create).toHaveBeenCalled();
      expect(result.message).toContain('Password changed successfully');
    });

    it('should throw NotFoundException if user not found', async () => {
      prisma.client.user.findUnique.mockResolvedValue(null);
      await expect(service.changePassword('user-1', dto)).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException on wrong current password', async () => {
      prisma.client.user.findUnique.mockResolvedValue({ id: 'user-1', passwordHash: 'old-hash' });
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);

      await expect(service.changePassword('user-1', dto)).rejects.toThrow(BadRequestException);
    });
  });

  describe('deleteMe', () => {
    it('should soft-delete user account and log activity', async () => {
      const result = await service.deleteMe('user-1');

      expect(prisma.client.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: { isActive: false, refreshToken: null },
      });
      expect(prisma.client.user.delete).toHaveBeenCalledWith({
        where: { id: 'user-1' },
      });
      expect(prisma.client.activityLog.create).toHaveBeenCalledWith({
        data: {
          actorId: 'user-1',
          entityType: 'user',
          entityId: 'user-1',
          action: 'account_deleted',
        },
      });
      expect(result.message).toContain('Account deleted');
    });
  });
});
