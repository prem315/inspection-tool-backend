import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PrismaService } from '../../prisma/prisma.service';
import { ORG_ROLES_KEY } from '../decorators/org-roles.decorator';
import { OrgRole } from '@prisma/client';

@Injectable()
export class OrgMemberGuard implements CanActivate {
  constructor(
    private prisma: PrismaService,
    private reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const orgId = request.params.orgId;
    const user = request.user; // Added by JwtAuthGuard

    if (!orgId || !user?.id) {
      return false;
    }

    const orgMember = await this.prisma.client.organizationMember.findFirst({
      where: {
        organizationId: orgId,
        userId: user.id,
        deletedAt: null,
      },
    });

    if (!orgMember) {
      throw new ForbiddenException('You are not a member of this organization');
    }

    // Attach to request
    request.orgMember = orgMember;

    const requiredRoles = this.reflector.getAllAndOverride<OrgRole[]>(ORG_ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredRoles) {
      return true; // No specific role required, just being a member is enough
    }

    if (!requiredRoles.includes(orgMember.role)) {
      throw new ForbiddenException(`Requires one of these roles: ${requiredRoles.join(', ')}`);
    }

    return true;
  }
}
