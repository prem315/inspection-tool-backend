import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';

// Models that have a deletedAt field (all entity tables per architecture guide)
const SOFT_DELETE_MODELS = new Set([
  'User',
  'Organization',
  'OrganizationMember',
  'OrganizationInvitation',
  'Project',
  'ProjectMember',
  'ProjectInvitation',
  'ProjectTemplate',
  'DefaultStage',
  'DefaultCheckpoint',
  'Stage',
  'Checkpoint',
  'InspectionRequest',
  'StageApproval',
  'Attachment',
  'Measurement',
  'Comment',
  'Label',
  'Notification',
  'NotificationPreference',
  'ApiToken',
]);

/**
 * Factory function that creates a PrismaClient with all middleware via $extends:
 *  1. Soft Delete — rewrites delete→update, injects deletedAt:null on reads
 *  2. ActivityLog Append-Only — throws on update/delete of ActivityLog
 */
function createExtendedPrismaClient(pool: pg.Pool) {
  const adapter = new PrismaPg(pool);
  const basePrisma = new PrismaClient({ adapter });

  return basePrisma.$extends({
    query: {
      $allModels: {
        // ── Soft Delete: intercept delete → set deletedAt ──
        async delete({ model, args, query }) {
          if (model === 'ActivityLog') {
            throw new Error('ActivityLog is append-only. Mutations are forbidden.');
          }
          if (SOFT_DELETE_MODELS.has(model)) {
            // Rewrite delete to update with deletedAt
            return (basePrisma as any)[lowerFirst(model)].update({
              ...args,
              data: { deletedAt: new Date() },
            });
          }
          return query(args);
        },

        async deleteMany({ model, args, query }) {
          if (model === 'ActivityLog') {
            throw new Error('ActivityLog is append-only. Mutations are forbidden.');
          }
          if (SOFT_DELETE_MODELS.has(model)) {
            return (basePrisma as any)[lowerFirst(model)].updateMany({
              ...args,
              data: { ...((args as any).data || {}), deletedAt: new Date() },
            });
          }
          return query(args);
        },

        // ── Soft Delete: filter out soft-deleted on reads ──
        async findMany({ model, args, query }) {
          if (SOFT_DELETE_MODELS.has(model)) {
            args.where = addSoftDeleteFilter(args.where);
          }
          return query(args);
        },

        async findFirst({ model, args, query }) {
          if (SOFT_DELETE_MODELS.has(model)) {
            args.where = addSoftDeleteFilter(args.where);
          }
          return query(args);
        },

        async findUnique({ model, args, query }) {
          if (SOFT_DELETE_MODELS.has(model)) {
            args.where = addSoftDeleteFilter(args.where);
          }
          return query(args);
        },

        // ── ActivityLog: block updates ──
        async update({ model, args, query }) {
          if (model === 'ActivityLog') {
            throw new Error('ActivityLog is append-only. Mutations are forbidden.');
          }
          return query(args);
        },

        async updateMany({ model, args, query }) {
          if (model === 'ActivityLog') {
            throw new Error('ActivityLog is append-only. Mutations are forbidden.');
          }
          return query(args);
        },
      },
    },
  });
}

/** Lowercase the first character of a string (Model → model accessor) */
function lowerFirst(s: string): string {
  return s.charAt(0).toLowerCase() + s.slice(1);
}

/** Add deletedAt: null filter if caller hasn't explicitly set it */
function addSoftDeleteFilter(where: any): any {
  if (!where) return { deletedAt: null };
  if (where.deletedAt === undefined) {
    return { ...where, deletedAt: null };
  }
  return where;
}

/** The type of the extended client */
type ExtendedPrismaClient = ReturnType<typeof createExtendedPrismaClient>;

@Injectable()
export class PrismaService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);
  private readonly pool: pg.Pool;
  public readonly client: ExtendedPrismaClient;

  constructor() {
    const connectionString = process.env.DATABASE_URL;
    this.pool = new pg.Pool({ connectionString });
    this.client = createExtendedPrismaClient(this.pool);
  }

  async onModuleInit() {
    await this.client.$connect();
    this.logger.log('Prisma connected to database');
  }

  async onModuleDestroy() {
    await this.client.$disconnect();
    await this.pool.end();
    this.logger.log('Prisma disconnected from database');
  }
}
