import { Injectable, ConflictException, BadRequestException, UnauthorizedException, ForbiddenException, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { PrismaService } from '../prisma/prisma.service.js';
import { MailerService } from '../mailer/mailer.service.js';
import { FirebaseService } from './firebase/firebase.service.js';
import { RegisterDto } from './dto/register.dto.js';
import { LoginDto, Portal } from './dto/login.dto.js';
import { VerifyEmailDto } from './dto/verify-email.dto.js';
import { ForgotPasswordDto } from './dto/forgot-password.dto.js';
import { ResetPasswordDto } from './dto/reset-password.dto.js';
import { RefreshTokenDto } from './dto/refresh-token.dto.js';
import { FirebasePhoneDto } from './dto/firebase-phone.dto.js';
import type { User } from '@prisma/client';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prismaService: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly mailerService: MailerService,
    private readonly firebaseService: FirebaseService,
  ) {}

  private toSafeUser(user: any) {
    const { passwordHash, refreshToken, emailVerificationToken, passwordResetToken, passwordResetExpiry, ...safeUser } = user;
    return safeUser;
  }

  private generateTokenPair(user: any) {
    const accessToken = this.jwtService.sign(
      { sub: user.id, email: user.email, systemRole: user.systemRole },
      { secret: this.configService.get('JWT_ACCESS_SECRET'), expiresIn: this.configService.get('JWT_ACCESS_EXPIRY', '15m') },
    );
    const refreshToken = this.jwtService.sign(
      { sub: user.id, email: user.email, systemRole: user.systemRole },
      { secret: this.configService.get('JWT_REFRESH_SECRET'), expiresIn: this.configService.get('JWT_REFRESH_EXPIRY', '7d') },
    );
    return { accessToken, refreshToken };
  }

  async register(dto: RegisterDto): Promise<{ message: string }> {
    const existingUser = await this.prismaService.client.user.findFirst({
      where: { email: dto.email, deletedAt: null },
    });
    const softDeletedUser = await this.prismaService.client.user.findFirst({
      where: { email: dto.email, deletedAt: { not: null } },
    });
    if (existingUser || softDeletedUser) {
      throw new ConflictException('Email already registered');
    }

    const passwordHash = await bcrypt.hash(dto.password, 12);
    const emailVerificationToken = crypto.randomBytes(32).toString('hex');

    const user = await this.prismaService.client.user.create({
      data: {
        name: dto.name,
        email: dto.email,
        passwordHash,
        systemRole: 'USER',
        isEmailVerified: false,
        emailVerificationToken,
      },
    });

    await this.mailerService.sendEmailVerification(dto.email, dto.name, emailVerificationToken);

    await this.prismaService.client.activityLog.create({
      data: {
        actorId: user.id,
        entityType: 'user',
        entityId: user.id,
        action: 'registered',
      },
    });

    return { message: 'Registration successful. Please verify your email.' };
  }

  async verifyEmail(dto: VerifyEmailDto): Promise<{ message: string }> {
    const user = await this.prismaService.client.user.findFirst({
      where: { emailVerificationToken: dto.token },
    });

    if (!user) {
      throw new BadRequestException('Invalid or expired verification token');
    }
    if (user.isEmailVerified) {
      throw new BadRequestException('Email already verified');
    }

    await this.prismaService.client.user.update({
      where: { id: user.id },
      data: { isEmailVerified: true, emailVerificationToken: null },
    });

    await this.prismaService.client.activityLog.create({
      data: {
        actorId: user.id,
        entityType: 'user',
        entityId: user.id,
        action: 'email_verified',
      },
    });

    return { message: 'Email verified successfully.' };
  }

  async validateUser(email: string, password: string): Promise<any> {
    const user = await this.prismaService.client.user.findUnique({
      where: { email },
    });

    if (!user || !user.isActive) return null;

    const isValid = await bcrypt.compare(password, user.passwordHash);
    if (!isValid) return null;

    return this.toSafeUser(user);
  }

  async login(dto: LoginDto): Promise<{ accessToken: string, refreshToken: string, user: any }> {
    const user = await this.prismaService.client.user.findUnique({
      where: { email: dto.email },
    });

    if (!user) throw new UnauthorizedException('Invalid credentials');
    if (!user.isActive) throw new UnauthorizedException('Account is deactivated');
    if (!user.isEmailVerified) throw new UnauthorizedException('Please verify your email before logging in');

    const isValid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!isValid) throw new UnauthorizedException('Invalid credentials');

    if (dto.portal === Portal.ADMIN && user.systemRole !== 'SUPER_ADMIN') {
      throw new ForbiddenException('Access denied to admin portal');
    }
    if ((dto.portal === Portal.WEB || dto.portal === Portal.MOBILE) && user.systemRole !== 'USER') {
      throw new ForbiddenException('Access denied to this portal');
    }

    const tokens = this.generateTokenPair(user);
    const hashedRefresh = await bcrypt.hash(tokens.refreshToken, 12);

    await this.prismaService.client.user.update({
      where: { id: user.id },
      data: { refreshToken: hashedRefresh, lastLoginAt: new Date() },
    });

    await this.prismaService.client.activityLog.create({
      data: {
        actorId: user.id,
        entityType: 'user',
        entityId: user.id,
        action: 'login',
        meta: { portal: dto.portal },
      },
    });

    return { ...tokens, user: this.toSafeUser(user) };
  }

  async refreshTokens(dto: RefreshTokenDto): Promise<{ accessToken: string, refreshToken: string }> {
    try {
      const payload = this.jwtService.verify(dto.refreshToken, {
        secret: this.configService.get('JWT_REFRESH_SECRET'),
      });

      const user = await this.prismaService.client.user.findUnique({
        where: { id: payload.sub },
      });

      if (!user || !user.refreshToken) throw new UnauthorizedException('Invalid refresh token');

      const isMatch = await bcrypt.compare(dto.refreshToken, user.refreshToken);
      if (!isMatch) throw new UnauthorizedException('Invalid refresh token');

      const tokens = this.generateTokenPair(user);
      const hashedRefresh = await bcrypt.hash(tokens.refreshToken, 12);

      await this.prismaService.client.user.update({
        where: { id: user.id },
        data: { refreshToken: hashedRefresh },
      });

      return tokens;
    } catch (e) {
      throw new UnauthorizedException('Invalid refresh token');
    }
  }

  async logout(userId: string): Promise<{ message: string }> {
    await this.prismaService.client.user.update({
      where: { id: userId },
      data: { refreshToken: null },
    });

    await this.prismaService.client.activityLog.create({
      data: {
        actorId: userId,
        entityType: 'user',
        entityId: userId,
        action: 'logout',
      },
    });

    return { message: 'Logged out successfully.' };
  }

  async forgotPassword(dto: ForgotPasswordDto): Promise<{ message: string }> {
    const user = await this.prismaService.client.user.findUnique({
      where: { email: dto.email },
    });

    if (user) {
      const resetToken = crypto.randomBytes(32).toString('hex');
      const passwordResetExpiry = new Date(Date.now() + 60 * 60 * 1000);

      await this.prismaService.client.user.update({
        where: { id: user.id },
        data: { passwordResetToken: resetToken, passwordResetExpiry },
      });

      await this.mailerService.sendPasswordReset(user.email, user.name, resetToken, 60);

      await this.prismaService.client.activityLog.create({
        data: {
          actorId: user.id,
          entityType: 'user',
          entityId: user.id,
          action: 'password_reset_requested',
        },
      });
    }

    return { message: 'If an account exists with that email, a reset link has been sent.' };
  }

  async resetPassword(dto: ResetPasswordDto): Promise<{ message: string }> {
    const user = await this.prismaService.client.user.findFirst({
      where: { passwordResetToken: dto.token },
    });

    if (!user) throw new BadRequestException('Invalid or expired reset token');
    if (!user.passwordResetExpiry || user.passwordResetExpiry < new Date()) {
      throw new BadRequestException('Reset token has expired');
    }

    const passwordHash = await bcrypt.hash(dto.newPassword, 12);

    await this.prismaService.client.user.update({
      where: { id: user.id },
      data: {
        passwordHash,
        passwordResetToken: null,
        passwordResetExpiry: null,
        refreshToken: null,
      },
    });

    await this.prismaService.client.activityLog.create({
      data: {
        actorId: user.id,
        entityType: 'user',
        entityId: user.id,
        action: 'password_reset_completed',
      },
    });

    return { message: 'Password reset successfully.' };
  }

  async firebasePhoneLogin(dto: FirebasePhoneDto): Promise<{ accessToken: string, refreshToken: string, user: any, isNewUser: boolean }> {
    const decoded = await this.firebaseService.verifyIdToken(dto.idToken);
    const phone = decoded.phone_number;
    if (!phone) throw new BadRequestException('No phone number in token');

    let user = await this.prismaService.client.user.findFirst({
      where: { phone },
    });

    let isNewUser = false;
    if (!user) {
      user = await this.prismaService.client.user.create({
        data: {
          name: phone,
          email: `${phone.replace('+', '')}@phone.local`,
          phone,
          passwordHash: '',
          systemRole: 'USER',
          isEmailVerified: true,
          isActive: true,
        },
      });
      isNewUser = true;
    }

    const tokens = this.generateTokenPair(user);
    const hashedRefresh = await bcrypt.hash(tokens.refreshToken, 12);

    await this.prismaService.client.user.update({
      where: { id: user.id },
      data: { refreshToken: hashedRefresh, lastLoginAt: new Date() },
    });

    await this.prismaService.client.activityLog.create({
      data: {
        actorId: user.id,
        entityType: 'user',
        entityId: user.id,
        action: isNewUser ? 'registered_phone' : 'login_phone',
      },
    });

    return { ...tokens, user: this.toSafeUser(user), isNewUser };
  }
}
