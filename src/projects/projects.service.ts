import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateProjectDto } from './dto/create-project.dto';
import { UpdateProjectDto } from './dto/update-project.dto';
import { ProjectRole, ProjectStatus, OrgRole } from '@prisma/client';
import { ActivityService } from '../activity/activity.service';

@Injectable()
export class ProjectsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly activityService: ActivityService,
  ) {}

  async create(orgId: string, dto: CreateProjectDto, userId: string) {
    const result = await this.prisma.client.$transaction(async (tx) => {
      const project = await tx.project.create({
        data: {
          organizationId: orgId,
          name: dto.name,
          description: dto.description,
          location: dto.location,
          industryType: dto.industryType,
          startDate: dto.startDate ? new Date(dto.startDate) : undefined,
          endDate: dto.endDate ? new Date(dto.endDate) : undefined,
          templateId: dto.templateId,
          createdById: userId,
        },
      });

      await tx.projectMember.create({
        data: {
          projectId: project.id,
          userId,
          role: ProjectRole.OWNER,
          addedById: userId,
        },
      });

      return project;
    });

    await this.activityService.log({
      actorId: userId,
      organizationId: orgId,
      projectId: result.id,
      entityType: 'project',
      entityId: result.id,
      action: 'created',
      meta: { name: result.name, organizationId: orgId },
    });

    return result;
  }

  async findAll(orgId: string, userId: string, orgMember: any) {
    // List projects: only return projects where caller has a ProjectMember row 
    // (unless caller is Org OWNER/ADMIN — they see all)
    const isAdminOrOwner = [OrgRole.OWNER, OrgRole.ADMIN].includes(orgMember.role);

    const projects = await this.prisma.client.project.findMany({
      where: {
        organizationId: orgId,
        deletedAt: null,
        ...(isAdminOrOwner ? {} : { members: { some: { userId, deletedAt: null } } }),
      },
      include: {
        _count: {
          select: { members: true, stages: true },
        },
      },
    });

    return projects.map((p) => ({
      id: p.id,
      name: p.name,
      status: p.status,
      industryType: p.industryType,
      location: p.location,
      memberCount: p._count.members,
      stageCount: p._count.stages,
      createdAt: p.createdAt,
    }));
  }

  async findOne(id: string) {
    const project = await this.prisma.client.project.findFirst({
      where: { id, deletedAt: null },
    });

    if (!project) {
      throw new NotFoundException('Project not found');
    }

    return project;
  }

  async update(id: string, dto: UpdateProjectDto) {
    const project = await this.prisma.client.project.findFirst({ where: { id, deletedAt: null } });
    if (!project) throw new NotFoundException('Project not found');

    const updated = await this.prisma.client.project.update({
      where: { id },
      data: {
        ...dto,
        startDate: dto.startDate ? new Date(dto.startDate) : undefined,
        endDate: dto.endDate ? new Date(dto.endDate) : undefined,
      },
    });

    await this.activityService.log({
      projectId: id,
      entityType: 'project',
      entityId: id,
      action: 'updated',
      meta: dto,
    });

    return updated;
  }

  async archive(id: string) {
    const project = await this.prisma.client.project.findFirst({ where: { id, deletedAt: null } });
    if (!project) throw new NotFoundException('Project not found');

    const archived = await this.prisma.client.project.update({
      where: { id },
      data: { status: ProjectStatus.ARCHIVED },
    });

    await this.activityService.log({
      projectId: id,
      entityType: 'project',
      entityId: id,
      action: 'archived',
    });

    return archived;
  }

  async getDashboard(id: string) {
    const [stages, checkpoints, members, openInspectionRequests] = await Promise.all([
      this.prisma.client.stage.count({ where: { projectId: id, deletedAt: null } }),
      this.prisma.client.checkpoint.count({ where: { stage: { projectId: id, deletedAt: null }, deletedAt: null } }),
      this.prisma.client.projectMember.count({ where: { projectId: id, deletedAt: null } }),
      this.prisma.client.inspectionRequest.count({
        where: {
          stage: { projectId: id, deletedAt: null },
          status: { notIn: ['COMPLETED', 'FAILED', 'CANCELLED'] },
          deletedAt: null,
        },
      }),
    ]);

    return { stages, checkpoints, members, openInspectionRequests };
  }
}
