import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { MailerService } from '../mailer/mailer.service';
import { ActivityService } from '../activity/activity.service';
import { CreateInspectionRequestDto } from './dto/create-inspection-request.dto';
import { DeclineInspectionRequestDto } from './dto/decline-inspection-request.dto';
import { InspectionRequestStatus, ProjectRole } from '@prisma/client';
import * as crypto from 'crypto';

@Injectable()
export class InspectionRequestsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mailer: MailerService,
    private readonly activity: ActivityService,
  ) {}

  async create(projectId: string, dto: CreateInspectionRequestDto, epcId: string) {
    if (!dto.inspectorId && !dto.inspectorEmail) {
      throw new BadRequestException('Must provide either inspectorId or inspectorEmail');
    }

    const stage = await this.prisma.client.stage.findFirst({
      where: { id: dto.stageId, projectId, deletedAt: null },
      include: { project: { include: { organization: true } } }
    });

    if (!stage) throw new NotFoundException('Stage not found in this project');

    let inspectorId = dto.inspectorId;
    let token = crypto.randomBytes(32).toString('hex');
    let status = InspectionRequestStatus.SENT;

    if (inspectorId) {
      // Check if user is in project
      const member = await this.prisma.client.projectMember.findFirst({
        where: { projectId, userId: inspectorId, deletedAt: null }
      });
      if (!member) {
        throw new BadRequestException('Inspector is not a member of this project');
      }
    }

    let connectCheckpoints: { id: string }[] = [];
    if (dto.checkpointIds && dto.checkpointIds.length > 0) {
      const validCheckpoints = await this.prisma.client.checkpoint.findMany({
        where: { id: { in: dto.checkpointIds }, stageId: dto.stageId, deletedAt: null }
      });
      if (validCheckpoints.length !== dto.checkpointIds.length) {
        throw new BadRequestException('Some checkpoints are invalid or do not belong to this stage');
      }
      connectCheckpoints = validCheckpoints.map(c => ({ id: c.id }));
    } else {
      const allCheckpoints = await this.prisma.client.checkpoint.findMany({
        where: { stageId: dto.stageId, deletedAt: null }
      });
      connectCheckpoints = allCheckpoints.map(c => ({ id: c.id }));
    }

    const request = await this.prisma.client.inspectionRequest.create({
      data: {
        stageId: dto.stageId,
        epcId,
        inspectorId,
        inspectorEmail: dto.inspectorEmail,
        status,
        token,
        deadlineStart: dto.deadlineStart ? new Date(dto.deadlineStart) : null,
        deadlineEnd: dto.deadlineEnd ? new Date(dto.deadlineEnd) : null,
        checkpoints: {
          connect: connectCheckpoints,
        },
      },
    });

    await this.activity.log({
      actorId: epcId,
      projectId,
      entityType: 'inspection_request',
      entityId: request.id,
      action: 'created',
    });

    if (dto.inspectorEmail && !inspectorId) {
      const epc = await this.prisma.client.user.findUnique({ where: { id: epcId } });
      await this.mailer.sendInspectionRequest(
        dto.inspectorEmail,
        epc?.name || 'EPC Engineer',
        stage.project.name,
        stage.name,
        token,
      );
    }

    return request;
  }

  async verifyToken(token: string) {
    const request = await this.prisma.client.inspectionRequest.findUnique({
      where: { token, deletedAt: null },
      include: {
        stage: {
          include: { project: true }
        },
        epc: { select: { name: true, email: true } },
        checkpoints: {
          where: { deletedAt: null },
          select: { id: true, title: true, description: true }
        }
      }
    });

    if (!request) {
      throw new NotFoundException('Invalid or expired token');
    }

    return {
      id: request.id,
      status: request.status,
      stageName: request.stage.name,
      projectName: request.stage.project.name,
      epcName: request.epc.name,
      deadlineStart: request.deadlineStart,
      deadlineEnd: request.deadlineEnd,
      inspectorEmail: request.inspectorEmail,
      checkpoints: request.checkpoints,
    };
  }

  async accept(id: string, userId: string, token?: string) {
    const request = await this.prisma.client.inspectionRequest.findFirst({
      where: { id, deletedAt: null },
      include: { stage: true }
    });

    if (!request) throw new NotFoundException('Request not found');

    if (request.inspectorId && request.inspectorId !== userId) {
      throw new BadRequestException('This request is assigned to someone else');
    }

    if (!request.inspectorId && request.token !== token) {
      throw new BadRequestException('Invalid token to claim this request');
    }

    await this.prisma.client.$transaction(async (tx) => {
      // Update request
      await tx.inspectionRequest.update({
        where: { id },
        data: {
          status: InspectionRequestStatus.ACCEPTED,
          inspectorId: userId,
          inspectorEmail: null, // Clear email once claimed
          respondedAt: new Date(),
        },
      });

      // Ensure user is project member
      const existingMember = await tx.projectMember.findFirst({
        where: { projectId: request.stage.projectId, userId, deletedAt: null }
      });

      if (!existingMember) {
        await tx.projectMember.create({
          data: {
            projectId: request.stage.projectId,
            userId,
            role: ProjectRole.INSPECTOR,
          }
        });
      }
    });

    await this.activity.log({
      actorId: userId,
      projectId: request.stage.projectId,
      entityType: 'inspection_request',
      entityId: request.id,
      action: 'accepted',
    });

    return { message: 'Inspection request accepted' };
  }

  async decline(id: string, userId: string, dto: DeclineInspectionRequestDto, token?: string) {
    const request = await this.prisma.client.inspectionRequest.findFirst({
      where: { id, deletedAt: null },
      include: { stage: true }
    });

    if (!request) throw new NotFoundException('Request not found');

    if (request.inspectorId && request.inspectorId !== userId) {
      throw new BadRequestException('This request is assigned to someone else');
    }

    if (!request.inspectorId && request.token !== token) {
      throw new BadRequestException('Invalid token to decline this request');
    }

    const updated = await this.prisma.client.inspectionRequest.update({
      where: { id },
      data: {
        status: InspectionRequestStatus.DECLINED,
        rejectionReason: dto.rejectionReason,
        respondedAt: new Date(),
        inspectorId: userId, // Log who declined it
        inspectorEmail: null,
      },
    });

    await this.activity.log({
      actorId: userId,
      projectId: request.stage.projectId,
      entityType: 'inspection_request',
      entityId: request.id,
      action: 'declined',
    });

    return updated;
  }
}
