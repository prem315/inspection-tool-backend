import { Injectable, ConflictException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateLabelDto } from './dto/create-label.dto';
import { UpdateLabelDto } from './dto/update-label.dto';
import { ActivityService } from '../activity/activity.service';

@Injectable()
export class LabelsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly activityService: ActivityService,
  ) {}

  async create(projectId: string, dto: CreateLabelDto, userId: string) {
    const existing = await this.prisma.client.label.findFirst({
      where: { projectId, name: dto.name, deletedAt: null },
    });

    if (existing) {
      throw new ConflictException('Label with this name already exists in the project');
    }

    const label = await this.prisma.client.label.create({
      data: {
        projectId,
        name: dto.name,
        color: dto.color,
        description: dto.description,
      },
    });

    await this.activityService.log({
      actorId: userId,
      projectId,
      entityType: 'label',
      entityId: label.id,
      action: 'created',
    });

    return label;
  }

  async findAll(projectId: string) {
    return this.prisma.client.label.findMany({
      where: { projectId, deletedAt: null },
    });
  }

  async update(projectId: string, labelId: string, dto: UpdateLabelDto, userId: string) {
    const label = await this.prisma.client.label.findFirst({
      where: { id: labelId, projectId, deletedAt: null },
    });

    if (!label) throw new NotFoundException('Label not found');

    if (dto.name && dto.name !== label.name) {
      const existing = await this.prisma.client.label.findFirst({
        where: { projectId, name: dto.name, deletedAt: null },
      });
      if (existing) {
        throw new ConflictException('Label with this name already exists in the project');
      }
    }

    const updated = await this.prisma.client.label.update({
      where: { id: labelId },
      data: dto,
    });

    await this.activityService.log({
      actorId: userId,
      projectId,
      entityType: 'label',
      entityId: labelId,
      action: 'updated',
    });

    return updated;
  }

  async remove(projectId: string, labelId: string, userId: string) {
    const label = await this.prisma.client.label.findFirst({
      where: { id: labelId, projectId, deletedAt: null },
    });

    if (!label) throw new NotFoundException('Label not found');

    await this.prisma.client.$transaction(async (tx) => {
      // First, delete all CheckpointLabel associations
      await tx.checkpointLabel.deleteMany({
        where: { labelId },
      });

      // Then, soft-delete the label itself
      await tx.label.update({
        where: { id: labelId },
        data: { deletedAt: new Date() },
      });
    });

    await this.activityService.log({
      actorId: userId,
      projectId,
      entityType: 'label',
      entityId: labelId,
      action: 'deleted',
    });

    return { message: 'Label deleted' };
  }
}
