import { Injectable, CanActivate, ExecutionContext, ForbiddenException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class OrgMemberGuard implements CanActivate {
  constructor(private prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const user = request.user;
    const orgId = request.params.orgId;

    if (!user) {
      return false;
    }

    if (!orgId) {
      return true; // If no orgId in params, skip check (could be a different route)
    }

    if (user.systemRole === 'SUPER_ADMIN') {
      request.orgMember = null;
      return true;
    }

    const membership = await this.prisma.client.organizationMember.findFirst({
      where: {
        organizationId: orgId,
        userId: user.id,
      },
    });

    if (!membership) {
      throw new ForbiddenException('You are not a member of this organization');
    }

    const org = await this.prisma.client.organization.findUnique({
      where: { id: orgId },
    });

    if (!org || !org.isActive) {
      throw new NotFoundException('Organization not found');
    }
    // Note: deletedAt is handled by Prisma middleware globally

    request.orgMember = membership;
    return true;
  }
}
