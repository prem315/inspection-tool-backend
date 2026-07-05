import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PrismaService } from '../../prisma/prisma.service';
import { PROJECT_ROLES_KEY } from '../decorators/project-roles.decorator';
import { ProjectRole } from '@prisma/client';

@Injectable()
export class ProjectMemberGuard implements CanActivate {
  constructor(
    private prisma: PrismaService,
    private reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const projectId = request.params.projectId;
    const user = request.user;

    if (!projectId || !user?.id) {
      return false;
    }

    const projectMember = await this.prisma.client.projectMember.findFirst({
      where: {
        projectId,
        userId: user.id,
        deletedAt: null, // As specified in rules, filter deletedAt: null
      },
    });

    if (!projectMember) {
      throw new ForbiddenException('You are not a member of this project');
    }

    request.projectMember = projectMember;

    const requiredRoles = this.reflector.getAllAndOverride<ProjectRole[]>(PROJECT_ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredRoles) {
      return true;
    }

    if (!requiredRoles.includes(projectMember.role)) {
      throw new ForbiddenException(`Requires one of these project roles: ${requiredRoles.join(', ')}`);
    }

    return true;
  }
}
