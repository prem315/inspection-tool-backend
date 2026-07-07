import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { EmailVerifiedGuard } from './email-verified.guard';

describe('EmailVerifiedGuard', () => {
  let guard: EmailVerifiedGuard;

  beforeEach(() => {
    guard = new EmailVerifiedGuard();
  });

  it('should be defined', () => {
    expect(guard).toBeDefined();
  });

  it('should throw ForbiddenException if user is not present in request', () => {
    const mockContext = {
      switchToHttp: () => ({
        getRequest: () => ({}),
      }),
    } as ExecutionContext;

    expect(() => guard.canActivate(mockContext)).toThrow(ForbiddenException);
    expect(() => guard.canActivate(mockContext)).toThrow('Please verify your email to perform this action');
  });

  it('should throw ForbiddenException if user.isEmailVerified is false', () => {
    const mockContext = {
      switchToHttp: () => ({
        getRequest: () => ({
          user: { isEmailVerified: false },
        }),
      }),
    } as ExecutionContext;

    expect(() => guard.canActivate(mockContext)).toThrow(ForbiddenException);
  });

  it('should return true if user.isEmailVerified is true', () => {
    const mockContext = {
      switchToHttp: () => ({
        getRequest: () => ({
          user: { isEmailVerified: true },
        }),
      }),
    } as ExecutionContext;

    expect(guard.canActivate(mockContext)).toBe(true);
  });
});
