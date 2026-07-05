import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ActivityService {
  constructor(private prisma: PrismaService) {}

  async log(data: {
    actorId?: string;
    organizationId?: string;
    projectId?: string;
    entityType: string;
    entityId: string;
    action: string;
    meta?: Record<string, any>;
  }): Promise<void> {
    await this.prisma.client.activityLog.create({
      data: {
        actorId: data.actorId,
        organizationId: data.organizationId,
        projectId: data.projectId,
        entityType: data.entityType,
        entityId: data.entityId,
        action: data.action,
        meta: data.meta ? JSON.parse(JSON.stringify(data.meta)) : undefined,
      },
    });
  }
}
