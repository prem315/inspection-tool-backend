import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { OrgRole } from '@prisma/client';

@Injectable()
export class OrgRoleGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<OrgRole[]>('orgRoles', [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user;
    const orgMember = request.orgMember;

    if (user?.systemRole === 'SUPER_ADMIN') {
      return true;
    }

    if (!orgMember) {
      throw new ForbiddenException('Organization membership required');
    }

    if (!requiredRoles.includes(orgMember.role)) {
      throw new ForbiddenException('You do not have the required role in this organization');
    }

    return true;
  }
}
