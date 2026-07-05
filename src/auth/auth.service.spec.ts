import { Test, TestingModule } from '@nestjs/testing';
import { AuthService } from './auth.service';
import { PrismaService } from '../prisma/prisma.service';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { MailerService } from '../mailer/mailer.service';
import { FirebaseService } from './firebase/firebase.service';
import { ConflictException, UnauthorizedException, BadRequestException, ForbiddenException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { Portal } from './dto/login.dto';

jest.mock('bcrypt');
jest.mock('crypto', () => ({
  randomBytes: jest.fn().mockReturnValue({ toString: jest.fn().mockReturnValue('mocked-crypto-token') }),
}));

describe('AuthService', () => {
  let service: AuthService;
  let prisma: jest.Mocked<any>;
  let jwt: jest.Mocked<JwtService>;
  let config: jest.Mocked<ConfigService>;
  let mailer: jest.Mocked<MailerService>;
  let firebase: jest.Mocked<FirebaseService>;

  beforeEach(async () => {
    const mockPrisma = {
      client: {
        user: {
          findFirst: jest.fn(),
          findUnique: jest.fn(),
          create: jest.fn(),
          update: jest.fn(),
        },
        activityLog: {
          create: jest.fn(),
        },
      },
    };

    const mockJwt = {
      sign: jest.fn(),
      verify: jest.fn(),
    };

    const mockConfig = {
      get: jest.fn().mockImplementation((key: string, defaultValue?: any) => defaultValue || 'mocked-secret'),
    };

    const mockMailer = {
      sendEmailVerification: jest.fn(),
      sendPasswordReset: jest.fn(),
    };

    const mockFirebase = {
      verifyIdToken: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: JwtService, useValue: mockJwt },
        { provide: ConfigService, useValue: mockConfig },
        { provide: MailerService, useValue: mockMailer },
        { provide: FirebaseService, useValue: mockFirebase },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    prisma = module.get(PrismaService);
    jwt = module.get(JwtService);
    config = module.get(ConfigService);
    mailer = module.get(MailerService);
    firebase = module.get(FirebaseService);

    jest.clearAllMocks();
  });

  describe('register', () => {
    const dto = { name: 'Test User', email: 'test@example.com', password: 'password123' };

    it('should successfully register a user and send verification email', async () => {
      prisma.client.user.findFirst.mockResolvedValue(null);
      (bcrypt.hash as jest.Mock).mockResolvedValue('hashed-password');
      prisma.client.user.create.mockResolvedValue({ id: 'user-1', ...dto, passwordHash: 'hashed-password' });

      const result = await service.register(dto);

      expect(prisma.client.user.findFirst).toHaveBeenCalledTimes(2); // One for existing, one for soft-deleted
      expect(bcrypt.hash).toHaveBeenCalledWith('password123', 12);
      expect(prisma.client.user.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          email: 'test@example.com',
          passwordHash: 'hashed-password',
          systemRole: 'USER',
          isEmailVerified: false,
          emailVerificationToken: 'mocked-crypto-token',
        }),
      });
      expect(mailer.sendEmailVerification).toHaveBeenCalledWith('test@example.com', 'Test User', 'mocked-crypto-token');
      expect(prisma.client.activityLog.create).toHaveBeenCalled();
      expect(result.message).toContain('Registration successful');
    });

    it('should throw ConflictException if email already registered', async () => {
      prisma.client.user.findFirst.mockResolvedValueOnce({ id: 'user-1', email: 'test@example.com' });

      await expect(service.register(dto)).rejects.toThrow(ConflictException);
      expect(prisma.client.user.create).not.toHaveBeenCalled();
    });
  });

  describe('verifyEmail', () => {
    it('should successfully verify email', async () => {
      const dto = { token: 'valid-token' };
      prisma.client.user.findFirst.mockResolvedValue({ id: 'user-1', isEmailVerified: false });

      const result = await service.verifyEmail(dto);

      expect(prisma.client.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: { isEmailVerified: true, emailVerificationToken: null },
      });
      expect(prisma.client.activityLog.create).toHaveBeenCalled();
      expect(result.message).toContain('Email verified');
    });

    it('should throw BadRequestException for invalid token', async () => {
      prisma.client.user.findFirst.mockResolvedValue(null);

      await expect(service.verifyEmail({ token: 'invalid' })).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException if already verified', async () => {
      prisma.client.user.findFirst.mockResolvedValue({ id: 'user-1', isEmailVerified: true });

      await expect(service.verifyEmail({ token: 'valid-token' })).rejects.toThrow(BadRequestException);
    });
  });

  describe('login', () => {
    const dto = { email: 'test@example.com', password: 'password123', portal: Portal.WEB };

    it('should successfully login and return tokens', async () => {
      const user = {
        id: 'user-1',
        email: 'test@example.com',
        passwordHash: 'hashed-password',
        isActive: true,
        isEmailVerified: true,
        systemRole: 'USER',
      };
      prisma.client.user.findUnique.mockResolvedValue(user);
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);
      jwt.sign.mockReturnValueOnce('access-token').mockReturnValueOnce('refresh-token');
      (bcrypt.hash as jest.Mock).mockResolvedValue('hashed-refresh');

      const result = await service.login(dto);

      expect(prisma.client.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: { refreshToken: 'hashed-refresh', lastLoginAt: expect.any(Date) },
      });
      expect(result).toEqual({
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
        user: expect.not.objectContaining({ passwordHash: 'hashed-password' }),
      });
    });

    it('should throw UnauthorizedException on invalid credentials', async () => {
      prisma.client.user.findUnique.mockResolvedValue(null);

      await expect(service.login(dto)).rejects.toThrow(UnauthorizedException);
    });

    it('should throw UnauthorizedException on wrong password', async () => {
      prisma.client.user.findUnique.mockResolvedValue({ isActive: true, isEmailVerified: true });
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);

      await expect(service.login(dto)).rejects.toThrow(UnauthorizedException);
    });

    it('should throw ForbiddenException for wrong portal (ADMIN trying to login as USER)', async () => {
      prisma.client.user.findUnique.mockResolvedValue({
        isActive: true,
        isEmailVerified: true,
        systemRole: 'USER',
      });
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);

      await expect(service.login({ ...dto, portal: Portal.ADMIN })).rejects.toThrow(ForbiddenException);
    });
  });

  describe('firebasePhoneLogin', () => {
    const dto = { idToken: 'valid-firebase-token' };

    it('should login existing user with phone', async () => {
      firebase.verifyIdToken.mockResolvedValue({ phone_number: '+1234567890' });
      prisma.client.user.findFirst.mockResolvedValue({ id: 'user-1', phone: '+1234567890' });
      jwt.sign.mockReturnValueOnce('access-token').mockReturnValueOnce('refresh-token');
      (bcrypt.hash as jest.Mock).mockResolvedValue('hashed-refresh');

      const result = await service.firebasePhoneLogin(dto);

      expect(firebase.verifyIdToken).toHaveBeenCalledWith('valid-firebase-token');
      expect(prisma.client.user.findFirst).toHaveBeenCalledWith({ where: { phone: '+1234567890' } });
      expect(result.isNewUser).toBe(false);
      expect(result.accessToken).toBe('access-token');
    });

    it('should create and login new user if phone not found', async () => {
      firebase.verifyIdToken.mockResolvedValue({ phone_number: '+1234567890' });
      prisma.client.user.findFirst.mockResolvedValue(null);
      prisma.client.user.create.mockResolvedValue({ id: 'user-new', phone: '+1234567890' });
      jwt.sign.mockReturnValueOnce('access-token').mockReturnValueOnce('refresh-token');

      const result = await service.firebasePhoneLogin(dto);

      expect(prisma.client.user.create).toHaveBeenCalled();
      expect(result.isNewUser).toBe(true);
      expect(result.accessToken).toBe('access-token');
    });
    
    it('should throw error on Firebase Admin SDK failure', async () => {
      firebase.verifyIdToken.mockRejectedValue(new Error('Firebase error'));
      await expect(service.firebasePhoneLogin(dto)).rejects.toThrow('Firebase error');
    });
  });

  describe('refreshTokens', () => {
    it('should successfully refresh tokens', async () => {
      jwt.verify.mockReturnValue({ sub: 'user-1' });
      prisma.client.user.findUnique.mockResolvedValue({ id: 'user-1', refreshToken: 'hashed-old' });
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);
      jwt.sign.mockReturnValueOnce('new-access').mockReturnValueOnce('new-refresh');

      const result = await service.refreshTokens({ refreshToken: 'old-refresh' });

      expect(result).toEqual({ accessToken: 'new-access', refreshToken: 'new-refresh' });
      expect(prisma.client.user.update).toHaveBeenCalled();
    });

    it('should throw UnauthorizedException on invalid token', async () => {
      jwt.verify.mockImplementation(() => { throw new Error(); });

      await expect(service.refreshTokens({ refreshToken: 'invalid' })).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('forgotPassword', () => {
    it('should send reset link if user exists', async () => {
      prisma.client.user.findUnique.mockResolvedValue({ id: 'user-1', email: 'test@example.com', name: 'Test' });

      const result = await service.forgotPassword({ email: 'test@example.com' });

      expect(prisma.client.user.update).toHaveBeenCalled();
      expect(mailer.sendPasswordReset).toHaveBeenCalledWith('test@example.com', 'Test', 'mocked-crypto-token', 60);
      expect(result.message).toContain('reset link has been sent');
    });

    it('should silently succeed if user does not exist', async () => {
      prisma.client.user.findUnique.mockResolvedValue(null);

      const result = await service.forgotPassword({ email: 'nonexistent@example.com' });

      expect(mailer.sendPasswordReset).not.toHaveBeenCalled();
      expect(result.message).toContain('reset link has been sent');
    });
  });

  describe('resetPassword', () => {
    const dto = { token: 'valid-reset', newPassword: 'new-password123' };

    it('should reset password successfully', async () => {
      prisma.client.user.findFirst.mockResolvedValue({
        id: 'user-1',
        passwordResetExpiry: new Date(Date.now() + 10000), // future
      });
      (bcrypt.hash as jest.Mock).mockResolvedValue('new-hashed');

      const result = await service.resetPassword(dto);

      expect(prisma.client.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: expect.objectContaining({
          passwordHash: 'new-hashed',
          passwordResetToken: null,
          passwordResetExpiry: null,
          refreshToken: null,
        }),
      });
      expect(result.message).toContain('successfully');
    });

    it('should throw BadRequestException on expired token', async () => {
      prisma.client.user.findFirst.mockResolvedValue({
        id: 'user-1',
        passwordResetExpiry: new Date(Date.now() - 10000), // past
      });

      await expect(service.resetPassword(dto)).rejects.toThrow(BadRequestException);
    });
  });

  describe('logout', () => {
    it('should clear refresh token', async () => {
      const result = await service.logout('user-1');

      expect(prisma.client.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: { refreshToken: null },
      });
      expect(result.message).toContain('Logged out');
    });
  });
});
