import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCheckpointDto } from './dto/create-checkpoint.dto';
import { UpdateCheckpointDto } from './dto/update-checkpoint.dto';
import { RecordCheckpointDto } from './dto/record-checkpoint.dto';
import { ActivityService } from '../activity/activity.service';
import { RecorderRole, ProjectRole } from '@prisma/client';

@Injectable()
export class CheckpointsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly activityService: ActivityService,
  ) {}

  async findAll(stageId: string) {
    const checkpoints = await this.prisma.client.checkpoint.findMany({
      where: { stageId, deletedAt: null },
      orderBy: { displayOrder: 'asc' },
      include: {
        recordedBy: { select: { id: true, name: true, email: true } },
        labels: { include: { label: true } },
      },
    });

    return checkpoints.map(c => ({
      id: c.id,
      title: c.title,
      description: c.description,
      standardReference: c.standardReference,
      displayOrder: c.displayOrder,
      result: c.result,
      recordedBy: c.recordedBy,
      notes: c.notes,
      recordedAt: c.recordedAt,
      labels: c.labels.map(cl => cl.label),
    }));
  }

  async create(stageId: string, dto: CreateCheckpointDto, userId: string, projectMember: any) {
    const stage = await this.prisma.client.stage.findFirst({ where: { id: stageId, deletedAt: null } });
    if (!stage) throw new NotFoundException('Stage not found');

    const checkpoint = await this.prisma.client.checkpoint.create({
      data: {
        stageId,
        title: dto.title,
        description: dto.description,
        standardReference: dto.standardReference,
        displayOrder: dto.displayOrder,
      },
    });

    await this.activityService.log({
      actorId: userId,
      projectId: stage.projectId,
      entityType: 'checkpoint',
      entityId: checkpoint.id,
      action: 'created',
    });

    return checkpoint;
  }

  async update(id: string, dto: UpdateCheckpointDto & RecordCheckpointDto, userId: string, projectMember: any) {
    const checkpoint = await this.prisma.client.checkpoint.findFirst({
      where: { id, deletedAt: null },
      include: { stage: true },
    });

    if (!checkpoint) throw new NotFoundException('Checkpoint not found');

    const data: any = { ...dto };

    if (dto.result) {
      data.recordedById = userId;
      data.recordedAt = new Date();
      data.recorderRole = projectMember.role === ProjectRole.INSPECTOR ? RecorderRole.INSPECTOR : RecorderRole.EPC_ENGINEER;
    }

    const updated = await this.prisma.client.checkpoint.update({
      where: { id },
      data,
    });

    if (dto.result) {
      await this.activityService.log({
        actorId: userId,
        projectId: checkpoint.stage.projectId,
        entityType: 'checkpoint',
        entityId: id,
        action: 'recorded',
        meta: { result: dto.result, recorderRole: data.recorderRole },
      });
    } else {
      await this.activityService.log({
        actorId: userId,
        projectId: checkpoint.stage.projectId,
        entityType: 'checkpoint',
        entityId: id,
        action: 'updated',
      });
    }

    return updated;
  }

  async remove(id: string, userId: string) {
    const checkpoint = await this.prisma.client.checkpoint.findFirst({
      where: { id, deletedAt: null },
      include: { stage: true },
    });

    if (!checkpoint) throw new NotFoundException('Checkpoint not found');

    await this.prisma.client.checkpoint.update({
      where: { id },
      data: { deletedAt: new Date() },
    });

    await this.activityService.log({
      actorId: userId,
      projectId: checkpoint.stage.projectId,
      entityType: 'checkpoint',
      entityId: id,
      action: 'deleted',
    });

    return { message: 'Checkpoint deleted' };
  }

  async attachLabel(checkpointId: string, labelId: string, userId: string) {
    const checkpoint = await this.prisma.client.checkpoint.findFirst({ where: { id: checkpointId, deletedAt: null }, include: { stage: true }});
    if (!checkpoint) throw new NotFoundException('Checkpoint not found');

    await this.prisma.client.checkpointLabel.create({
      data: { checkpointId, labelId },
    });

    await this.activityService.log({
      actorId: userId,
      projectId: checkpoint.stage.projectId,
      entityType: 'checkpoint',
      entityId: checkpointId,
      action: 'label_attached',
      meta: { labelId },
    });

    return { message: 'Label attached' };
  }

  async removeLabel(checkpointId: string, labelId: string, userId: string) {
    const checkpoint = await this.prisma.client.checkpoint.findFirst({ where: { id: checkpointId, deletedAt: null }, include: { stage: true }});
    if (!checkpoint) throw new NotFoundException('Checkpoint not found');

    await this.prisma.client.checkpointLabel.delete({
      where: { checkpointId_labelId: { checkpointId, labelId } },
    });

    await this.activityService.log({
      actorId: userId,
      projectId: checkpoint.stage.projectId,
      entityType: 'checkpoint',
      entityId: checkpointId,
      action: 'label_removed',
      meta: { labelId },
    });

    return { message: 'Label removed' };
  }
}
