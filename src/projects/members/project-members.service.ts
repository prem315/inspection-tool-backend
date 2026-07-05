import { Injectable, BadRequestException, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AddMemberDto } from './dto/add-member.dto';
import { UpdateProjectMemberRoleDto } from './dto/update-member-role.dto';
import { ProjectRole } from '@prisma/client';
import { ActivityService } from '../../activity/activity.service';

@Injectable()
export class ProjectMembersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly activityService: ActivityService,
  ) {}

  async findAll(projectId: string) {
    const members = await this.prisma.client.projectMember.findMany({
      where: { projectId, deletedAt: null },
      include: {
        user: { select: { id: true, name: true, email: true, avatarUrl: true } },
      },
    });
    return members.map((m) => ({
      id: m.id,
      role: m.role,
      addedAt: m.addedAt,
      user: m.user,
    }));
  }

  async addMember(orgId: string, projectId: string, dto: AddMemberDto, addedById: string) {
    const orgMember = await this.prisma.client.organizationMember.findFirst({
      where: { organizationId: orgId, userId: dto.userId, deletedAt: null },
    });

    if (!orgMember) {
      throw new BadRequestException('User is not an OrganizationMember of this org');
    }

    const existing = await this.prisma.client.projectMember.findFirst({
      where: { projectId, userId: dto.userId, deletedAt: null },
    });

    if (existing) {
      throw new ConflictException('User is already a member of this project');
    }

    const newMember = await this.prisma.client.projectMember.create({
      data: {
        projectId,
        userId: dto.userId,
        role: dto.projectRole,
        addedById,
      },
    });

    await this.activityService.log({
      actorId: addedById,
      projectId,
      entityType: 'project_member',
      entityId: newMember.id,
      action: 'member_added',
      meta: { userId: dto.userId, role: dto.projectRole },
    });

    return newMember;
  }

  async updateRole(projectId: string, targetUserId: string, dto: UpdateProjectMemberRoleDto, currentUserId: string) {
    const member = await this.prisma.client.projectMember.findFirst({
      where: { projectId, userId: targetUserId, deletedAt: null },
    });

    if (!member) throw new NotFoundException('Project member not found');

    if (member.role === ProjectRole.OWNER && dto.projectRole !== ProjectRole.OWNER) {
      // Prevent removing the last owner
      const ownerCount = await this.prisma.client.projectMember.count({
        where: { projectId, role: ProjectRole.OWNER, deletedAt: null },
      });
      if (ownerCount <= 1) {
        throw new BadRequestException('Cannot change the role of the only OWNER of the project');
      }
    }

    const updated = await this.prisma.client.projectMember.update({
      where: { id: member.id },
      data: { role: dto.projectRole },
    });

    await this.activityService.log({
      actorId: currentUserId,
      projectId,
      entityType: 'project_member',
      entityId: member.id,
      action: 'role_updated',
      meta: { userId: targetUserId, role: dto.projectRole },
    });

    return updated;
  }

  async removeMember(projectId: string, targetUserId: string, currentUserId: string) {
    const member = await this.prisma.client.projectMember.findFirst({
      where: { projectId, userId: targetUserId, deletedAt: null },
    });

    if (!member) throw new NotFoundException('Project member not found');

    if (member.role === ProjectRole.OWNER) {
      const ownerCount = await this.prisma.client.projectMember.count({
        where: { projectId, role: ProjectRole.OWNER, deletedAt: null },
      });
      if (ownerCount <= 1) {
        throw new BadRequestException('Cannot remove yourself if you are the only OWNER');
      }
    }

    await this.prisma.client.projectMember.update({
      where: { id: member.id },
      data: { deletedAt: new Date() },
    });

    await this.activityService.log({
      actorId: currentUserId,
      projectId,
      entityType: 'project_member',
      entityId: member.id,
      action: 'member_removed',
      meta: { userId: targetUserId },
    });

    return { message: 'Member removed successfully' };
  }
}
