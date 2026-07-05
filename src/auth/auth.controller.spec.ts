import { Test, TestingModule } from '@nestjs/testing';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto, Portal } from './dto/login.dto';
import { VerifyEmailDto } from './dto/verify-email.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { FirebasePhoneDto } from './dto/firebase-phone.dto';

describe('AuthController', () => {
  let controller: AuthController;
  let authService: jest.Mocked<AuthService>;

  beforeEach(async () => {
    const mockAuthService = {
      register: jest.fn(),
      verifyEmail: jest.fn(),
      login: jest.fn(),
      firebasePhoneLogin: jest.fn(),
      refreshTokens: jest.fn(),
      forgotPassword: jest.fn(),
      resetPassword: jest.fn(),
      logout: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [{ provide: AuthService, useValue: mockAuthService }],
    }).compile();

    controller = module.get<AuthController>(AuthController);
    authService = module.get(AuthService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('register', () => {
    it('should call authService.register with correct dto', async () => {
      const dto: RegisterDto = { name: 'Test', email: 'test@example.com', password: 'password123' };
      const expectedResult = { message: 'Success' };
      authService.register.mockResolvedValue(expectedResult);

      const result = await controller.register(dto);
      expect(authService.register).toHaveBeenCalledWith(dto);
      expect(result).toEqual(expectedResult);
    });
  });

  describe('verifyEmail', () => {
    it('should call authService.verifyEmail with correct dto', async () => {
      const dto: VerifyEmailDto = { token: 'some-token' };
      const expectedResult = { message: 'Verified' };
      authService.verifyEmail.mockResolvedValue(expectedResult);

      const result = await controller.verifyEmail(dto);
      expect(authService.verifyEmail).toHaveBeenCalledWith(dto);
      expect(result).toEqual(expectedResult);
    });
  });

  describe('login', () => {
    it('should call authService.login with correct dto', async () => {
      const dto: LoginDto = { email: 'test@example.com', password: 'password123', portal: Portal.WEB };
      const expectedResult = { accessToken: 'access', refreshToken: 'refresh', user: {} };
      authService.login.mockResolvedValue(expectedResult);

      const result = await controller.login(dto);
      expect(authService.login).toHaveBeenCalledWith(dto);
      expect(result).toEqual(expectedResult);
    });
  });

  describe('firebasePhoneLogin', () => {
    it('should call authService.firebasePhoneLogin with correct dto', async () => {
      const dto: FirebasePhoneDto = { idToken: 'firebase-token' };
      const expectedResult = { accessToken: 'access', refreshToken: 'refresh', user: {}, isNewUser: true };
      authService.firebasePhoneLogin.mockResolvedValue(expectedResult);

      const result = await controller.firebasePhoneLogin(dto);
      expect(authService.firebasePhoneLogin).toHaveBeenCalledWith(dto);
      expect(result).toEqual(expectedResult);
    });
  });

  describe('refreshTokens', () => {
    it('should call authService.refreshTokens with correct dto', async () => {
      const dto: RefreshTokenDto = { refreshToken: 'old-refresh' };
      const expectedResult = { accessToken: 'new-access', refreshToken: 'new-refresh' };
      authService.refreshTokens.mockResolvedValue(expectedResult);

      const result = await controller.refreshTokens(dto);
      expect(authService.refreshTokens).toHaveBeenCalledWith(dto);
      expect(result).toEqual(expectedResult);
    });
  });

  describe('forgotPassword', () => {
    it('should call authService.forgotPassword with correct dto', async () => {
      const dto: ForgotPasswordDto = { email: 'test@example.com' };
      const expectedResult = { message: 'Reset link sent' };
      authService.forgotPassword.mockResolvedValue(expectedResult);

      const result = await controller.forgotPassword(dto);
      expect(authService.forgotPassword).toHaveBeenCalledWith(dto);
      expect(result).toEqual(expectedResult);
    });
  });

  describe('resetPassword', () => {
    it('should call authService.resetPassword with correct dto', async () => {
      const dto: ResetPasswordDto = { token: 'reset-token', newPassword: 'new-password' };
      const expectedResult = { message: 'Password reset successfully' };
      authService.resetPassword.mockResolvedValue(expectedResult);

      const result = await controller.resetPassword(dto);
      expect(authService.resetPassword).toHaveBeenCalledWith(dto);
      expect(result).toEqual(expectedResult);
    });
  });

  describe('logout', () => {
    it('should call authService.logout with user id', async () => {
      const userId = 'user-123';
      const expectedResult = { message: 'Logged out' };
      authService.logout.mockResolvedValue(expectedResult);

      const result = await controller.logout(userId);
      expect(authService.logout).toHaveBeenCalledWith(userId);
      expect(result).toEqual(expectedResult);
    });
  });
});
