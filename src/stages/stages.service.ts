import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateStageDto } from './dto/create-stage.dto';
import { UpdateStageDto } from './dto/update-stage.dto';
import { ReorderStagesDto } from './dto/reorder-stages.dto';
import { StageSource, StageStatus } from '@prisma/client';
import { ActivityService } from '../activity/activity.service';

@Injectable()
export class StagesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly activityService: ActivityService,
  ) {}

  async findAll(projectId: string) {
    const stages = await this.prisma.client.stage.findMany({
      where: { projectId, deletedAt: null },
      orderBy: { displayOrder: 'asc' },
      include: {
        _count: {
          select: { checkpoints: { where: { deletedAt: null } } },
        },
      },
    });

    return stages.map(s => ({
      id: s.id,
      name: s.name,
      displayOrder: s.displayOrder,
      status: s.status,
      source: s.source,
      checkpointCount: s._count.checkpoints,
    }));
  }

  async create(projectId: string, dto: CreateStageDto, userId: string) {
    const stage = await this.prisma.client.stage.create({
      data: {
        projectId,
        name: dto.name,
        description: dto.description,
        displayOrder: dto.displayOrder,
        source: StageSource.CUSTOM,
      },
    });

    await this.activityService.log({
      actorId: userId,
      projectId,
      entityType: 'stage',
      entityId: stage.id,
      action: 'created',
    });

    return stage;
  }

  async update(projectId: string, stageId: string, dto: UpdateStageDto, userId: string) {
    const stage = await this.prisma.client.stage.findFirst({
      where: { id: stageId, projectId, deletedAt: null },
    });

    if (!stage) throw new NotFoundException('Stage not found');

    const updated = await this.prisma.client.stage.update({
      where: { id: stageId },
      data: dto,
    });

    await this.activityService.log({
      actorId: userId,
      projectId,
      entityType: 'stage',
      entityId: stageId,
      action: 'updated',
    });

    return updated;
  }

  async remove(projectId: string, stageId: string, userId: string) {
    const stage = await this.prisma.client.stage.findFirst({
      where: { id: stageId, projectId, deletedAt: null },
    });

    if (!stage) throw new NotFoundException('Stage not found');

    await this.prisma.client.$transaction(async (tx) => {
      // Soft delete checkpoints first
      await tx.checkpoint.updateMany({
        where: { stageId },
        data: { deletedAt: new Date() },
      });

      // Soft delete stage
      await tx.stage.update({
        where: { id: stageId },
        data: { deletedAt: new Date() },
      });
    });

    await this.activityService.log({
      actorId: userId,
      projectId,
      entityType: 'stage',
      entityId: stageId,
      action: 'deleted',
    });

    return { message: 'Stage deleted' };
  }

  async reorder(projectId: string, dto: ReorderStagesDto, userId: string) {
    await this.prisma.client.$transaction(
      dto.stageIds.map((id, index) =>
        this.prisma.client.stage.updateMany({
          where: { id, projectId, deletedAt: null },
          data: { displayOrder: index },
        })
      )
    );

    await this.activityService.log({
      actorId: userId,
      projectId,
      entityType: 'stage',
      entityId: 'multiple',
      action: 'reordered',
    });

    return { message: 'Stages reordered' };
  }

  async seed(projectId: string, templateId: string, userId: string) {
    const template = await this.prisma.client.projectTemplate.findUnique({
      where: { id: templateId },
      include: {
        defaultStages: {
          where: { deletedAt: null },
          include: {
            defaultCheckpoints: { where: { deletedAt: null } },
          },
        },
      },
    });

    if (!template) throw new NotFoundException('Template not found');

    let stageCount = 0;

    await this.prisma.client.$transaction(async (tx) => {
      for (const ds of template.defaultStages) {
        const newStage = await tx.stage.create({
          data: {
            projectId,
            name: ds.name,
            description: ds.description,
            displayOrder: ds.displayOrder,
            source: StageSource.DEFAULT,
            defaultStageId: ds.id,
            status: StageStatus.PENDING,
          },
        });
        stageCount++;

        for (const dc of ds.defaultCheckpoints) {
          await tx.checkpoint.create({
            data: {
              stageId: newStage.id,
              title: dc.title,
              description: dc.description,
              standardReference: dc.standardReference,
              displayOrder: dc.displayOrder,
            },
          });
        }
      }
    });

    await this.activityService.log({
      actorId: userId,
      projectId,
      entityType: 'project',
      entityId: projectId,
      action: 'stages_seeded',
      meta: { templateId, stageCount },
    });

    return { message: 'Seeded successfully', stageCount };
  }
}
