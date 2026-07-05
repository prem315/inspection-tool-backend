import { Injectable, ConflictException, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateOrganizationDto } from './dto/create-organization.dto';
import { UpdateOrganizationDto } from './dto/update-organization.dto';
import { UpdateMemberRoleDto } from './dto/update-member-role.dto';
import { SendOrgInvitationDto } from './dto/send-org-invitation.dto';
import { TransferOwnershipDto } from './dto/transfer-ownership.dto';
import { ListOrganizationsQueryDto } from './dto/list-organizations-query.dto';
import { AdminUpdateOrgDto } from './dto/admin-update-org.dto';
import { OrgRole, PlanTier, InvitationStatus } from '@prisma/client';
import { MailerService } from '../mailer/mailer.service';
import * as crypto from 'crypto';
import {
  OrgSummary,
  OrgDetail,
  MemberDetail,
  InvitationDetail,
  PaginatedResult,
} from './types/org-types';

@Injectable()
export class OrganizationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mailerService: MailerService,
  ) {}

  // --------------------------------------------------------------------------
  // Self-serve org management
  // --------------------------------------------------------------------------

  async createOrganization(userId: string, dto: CreateOrganizationDto) {
    const existingSlug = await this.prisma.client.organization.findUnique({
      where: { slug: dto.slug },
    });

    if (existingSlug) {
      throw new ConflictException('This slug is already taken');
    }

    return this.prisma.client.$transaction(async (tx) => {
      const org = await tx.organization.create({
        data: {
          name: dto.name,
          slug: dto.slug,
          logoUrl: dto.logoUrl,
          plan: PlanTier.FREE,
          isActive: true,
        },
      });

      const member = await tx.organizationMember.create({
        data: {
          organizationId: org.id,
          userId: userId,
          role: OrgRole.OWNER,
        },
      });

      await tx.activityLog.create({
        data: {
          entityType: 'organization',
          entityId: org.id,
          action: 'created',
          actorId: userId,
          organizationId: org.id,
          meta: { name: dto.name, slug: dto.slug, plan: 'FREE' },
        },
      });

      return { organization: org, membership: member };
    });
  }

  async getMyOrganizations(userId: string): Promise<OrgSummary[]> {
    const memberships = await this.prisma.client.organizationMember.findMany({
      where: {
        userId,
        organization: {
          isActive: true,
        },
      },
      include: {
        organization: {
          include: {
            _count: {
              select: { members: true },
            },
          },
        },
      },
      orderBy: {
        joinedAt: 'desc',
      },
    });

    return memberships.map((m) => ({
      id: m.organization.id,
      name: m.organization.name,
      slug: m.organization.slug,
      logoUrl: m.organization.logoUrl,
      plan: m.organization.plan,
      isActive: m.organization.isActive,
      createdAt: m.organization.createdAt,
      callerRole: m.role,
      memberCount: m.organization._count.members,
    }));
  }

  async getOrganization(orgId: string, userId: string): Promise<OrgDetail> {
    const membership = await this.prisma.client.organizationMember.findFirst({
      where: { organizationId: orgId, userId },
    });
    
    // Note: SUPER_ADMIN bypasses this inside the controller route by using adminGetOrganization instead,
    // or the controller can pass in callerRole if needed.

    const org = await this.prisma.client.organization.findUnique({
      where: { id: orgId },
      include: {
        _count: {
          select: { members: true, projects: true },
        },
      },
    });

    if (!org || !org.isActive) {
      throw new NotFoundException('Organization not found');
    }

    return {
      id: org.id,
      name: org.name,
      slug: org.slug,
      logoUrl: org.logoUrl,
      plan: org.plan,
      isActive: org.isActive,
      createdAt: org.createdAt,
      updatedAt: org.updatedAt,
      callerRole: membership ? membership.role : null,
      memberCount: org._count.members,
      projectCount: org._count.projects,
    };
  }

  async updateOrganization(orgId: string, actorId: string, dto: UpdateOrganizationDto): Promise<OrgDetail> {
    const updated = await this.prisma.client.organization.update({
      where: { id: orgId },
      data: dto,
      include: {
        _count: {
          select: { members: true, projects: true },
        },
      },
    });

    await this.prisma.client.activityLog.create({
      data: {
        entityType: 'organization',
        entityId: orgId,
        action: 'updated',
        actorId: actorId,
        organizationId: orgId,
        meta: { changes: dto },
      },
    });

    const membership = await this.prisma.client.organizationMember.findFirst({
      where: { organizationId: orgId, userId: actorId },
    });

    return {
      id: updated.id,
      name: updated.name,
      slug: updated.slug,
      logoUrl: updated.logoUrl,
      plan: updated.plan,
      isActive: updated.isActive,
      createdAt: updated.createdAt,
      updatedAt: updated.updatedAt,
      callerRole: membership?.role || null,
      memberCount: updated._count.members,
      projectCount: updated._count.projects,
    };
  }

  async deleteOrganization(orgId: string, actorId: string): Promise<{ message: string }> {
    const activeProjectsCount = await this.prisma.client.project.count({
      where: {
        organizationId: orgId,
        status: { not: 'ARCHIVED' },
      },
    });

    if (activeProjectsCount > 0) {
      throw new BadRequestException('Archive all projects before deleting the organization');
    }

    await this.prisma.client.organization.delete({
      where: { id: orgId },
    });

    await this.prisma.client.activityLog.create({
      data: {
        entityType: 'organization',
        entityId: orgId,
        action: 'deleted',
        actorId: actorId,
        organizationId: orgId,
      },
    });

    return { message: 'Organization deleted.' };
  }

  // --------------------------------------------------------------------------
  // Member management
  // --------------------------------------------------------------------------

  async getMembers(orgId: string): Promise<MemberDetail[]> {
    const members = await this.prisma.client.organizationMember.findMany({
      where: { organizationId: orgId },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            avatarUrl: true,
            isActive: true,
            lastLoginAt: true,
          },
        },
      },
      orderBy: { joinedAt: 'asc' }, // Will sort by role in code
    });

    const roleOrder = { [OrgRole.OWNER]: 1, [OrgRole.ADMIN]: 2, [OrgRole.MEMBER]: 3 };
    
    return members
      .sort((a, b) => {
        if (roleOrder[a.role] !== roleOrder[b.role]) {
          return roleOrder[a.role] - roleOrder[b.role];
        }
        return a.joinedAt.getTime() - b.joinedAt.getTime();
      })
      .map(m => ({
        id: m.id,
        role: m.role,
        joinedAt: m.joinedAt,
        user: m.user,
      }));
  }

  async updateMemberRole(orgId: string, actorId: string, targetUserId: string, dto: UpdateMemberRoleDto): Promise<MemberDetail> {
    if (actorId === targetUserId) {
      throw new BadRequestException('You cannot change your own role');
    }

    const targetMembership = await this.prisma.client.organizationMember.findFirst({
      where: { organizationId: orgId, userId: targetUserId },
      include: { user: true },
    });

    if (!targetMembership) {
      throw new NotFoundException('Member not found');
    }

    const actor = await this.prisma.client.user.findUnique({ where: { id: actorId }});

    if (targetMembership.role === OrgRole.OWNER && actor?.systemRole !== 'SUPER_ADMIN') {
      throw new BadRequestException('Cannot change role of another OWNER unless actor is SUPER_ADMIN');
    }

    const updated = await this.prisma.client.organizationMember.update({
      where: { id: targetMembership.id },
      data: { role: dto.role },
      include: {
        user: {
          select: { id: true, name: true, email: true, avatarUrl: true, isActive: true, lastLoginAt: true },
        },
      },
    });

    await this.prisma.client.activityLog.create({
      data: {
        entityType: 'organization',
        entityId: orgId,
        action: 'member_role_changed',
        actorId: actorId,
        organizationId: orgId,
        meta: { targetUserId, from: targetMembership.role, to: dto.role },
      },
    });

    return {
      id: updated.id,
      role: updated.role,
      joinedAt: updated.joinedAt,
      user: updated.user,
    };
  }

  async removeMember(orgId: string, actorId: string, targetUserId: string): Promise<{ message: string }> {
    if (actorId === targetUserId) {
      throw new BadRequestException('Use the leave organization endpoint to remove yourself');
    }

    const targetMembership = await this.prisma.client.organizationMember.findFirst({
      where: { organizationId: orgId, userId: targetUserId },
    });

    if (!targetMembership) {
      throw new NotFoundException('Member not found');
    }

    const actor = await this.prisma.client.user.findUnique({ where: { id: actorId }});

    if (targetMembership.role === OrgRole.OWNER && actor?.systemRole !== 'SUPER_ADMIN') {
      throw new BadRequestException('Cannot remove an OWNER unless actor is SUPER_ADMIN');
    }

    const projectMember = await this.prisma.client.projectMember.findFirst({
      where: {
        userId: targetUserId,
        project: { organizationId: orgId, status: { not: 'ARCHIVED' } },
      },
    });

    if (projectMember) {
      throw new BadRequestException('Remove the user from all projects first');
    }

    await this.prisma.client.organizationMember.delete({
      where: { id: targetMembership.id },
    });

    await this.prisma.client.activityLog.create({
      data: {
        entityType: 'organization',
        entityId: orgId,
        action: 'member_removed',
        actorId: actorId,
        organizationId: orgId,
        meta: { targetUserId },
      },
    });

    return { message: 'Member removed.' };
  }

  async leaveOrganization(orgId: string, userId: string): Promise<{ message: string }> {
    const membership = await this.prisma.client.organizationMember.findFirst({
      where: { organizationId: orgId, userId },
    });

    if (!membership) {
      throw new NotFoundException('Membership not found');
    }

    if (membership.role === OrgRole.OWNER) {
      const otherOwners = await this.prisma.client.organizationMember.count({
        where: { organizationId: orgId, role: OrgRole.OWNER, userId: { not: userId } },
      });

      if (otherOwners === 0) {
        throw new BadRequestException('Transfer ownership before leaving. An organization must have at least one owner.');
      }
    }

    await this.prisma.client.organizationMember.delete({
      where: { id: membership.id },
    });

    await this.prisma.client.activityLog.create({
      data: {
        entityType: 'organization',
        entityId: orgId,
        action: 'member_left',
        actorId: userId,
        organizationId: orgId,
      },
    });

    return { message: 'You have left the organization.' };
  }

  async transferOwnership(orgId: string, actorId: string, dto: TransferOwnershipDto): Promise<{ message: string }> {
    const newOwnerMembership = await this.prisma.client.organizationMember.findFirst({
      where: { organizationId: orgId, userId: dto.newOwnerUserId },
    });

    if (!newOwnerMembership) {
      throw new BadRequestException('User is not a member of this organization');
    }

    const currentOwnerMembership = await this.prisma.client.organizationMember.findFirst({
      where: { organizationId: orgId, userId: actorId },
    });

    if (!currentOwnerMembership) {
      throw new BadRequestException('Current owner membership not found');
    }

    await this.prisma.client.$transaction([
      this.prisma.client.organizationMember.update({
        where: { id: currentOwnerMembership.id },
        data: { role: OrgRole.ADMIN },
      }),
      this.prisma.client.organizationMember.update({
        where: { id: newOwnerMembership.id },
        data: { role: OrgRole.OWNER },
      }),
      this.prisma.client.activityLog.create({
        data: {
          entityType: 'organization',
          entityId: orgId,
          action: 'ownership_transferred',
          actorId: actorId,
          organizationId: orgId,
          meta: { from: actorId, to: dto.newOwnerUserId },
        },
      }),
    ]);

    return { message: 'Ownership transferred.' };
  }

  // --------------------------------------------------------------------------
  // Invitation management
  // --------------------------------------------------------------------------

  async sendInvitation(orgId: string, invitedById: string, dto: SendOrgInvitationDto): Promise<{ message: string }> {
    const existingMember = await this.prisma.client.organizationMember.findFirst({
      where: {
        organizationId: orgId,
        user: { email: dto.email },
      },
    });

    if (existingMember) {
      throw new ConflictException('This user is already a member');
    }

    const existingPending = await this.prisma.client.organizationInvitation.findFirst({
      where: {
        organizationId: orgId,
        email: dto.email,
        status: InvitationStatus.PENDING,
      },
    });

    if (existingPending) {
      throw new ConflictException('An invitation is already pending for this email');
    }

    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    const inviter = await this.prisma.client.user.findUnique({ where: { id: invitedById } });
    const org = await this.prisma.client.organization.findUnique({ where: { id: orgId } });

    await this.prisma.client.organizationInvitation.create({
      data: {
        organizationId: orgId,
        email: dto.email,
        role: dto.role,
        token,
        status: InvitationStatus.PENDING,
        invitedById,
        expiresAt,
      },
    });

    await this.mailerService.sendOrgInvitation(dto.email, inviter!.name, org!.name, token, dto.role);

    await this.prisma.client.activityLog.create({
      data: {
        entityType: 'organization',
        entityId: orgId,
        action: 'invitation_sent',
        actorId: invitedById,
        organizationId: orgId,
        meta: { email: dto.email, role: dto.role },
      },
    });

    return { message: 'Invitation sent.' };
  }

  async listInvitations(orgId: string): Promise<InvitationDetail[]> {
    const invitations = await this.prisma.client.organizationInvitation.findMany({
      where: { organizationId: orgId },
      include: {
        invitedBy: {
          select: { id: true, name: true, email: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return invitations.map(inv => ({
      id: inv.id,
      email: inv.email,
      role: inv.role,
      status: inv.status,
      expiresAt: inv.expiresAt,
      createdAt: inv.createdAt,
      invitedBy: inv.invitedBy,
    }));
  }

  async cancelInvitation(orgId: string, invitationId: string, actorId: string): Promise<{ message: string }> {
    const invitation = await this.prisma.client.organizationInvitation.findFirst({
      where: { id: invitationId, organizationId: orgId },
    });

    if (!invitation) {
      throw new NotFoundException('Invitation not found');
    }

    if (invitation.status !== InvitationStatus.PENDING) {
      throw new BadRequestException('Only pending invitations can be cancelled');
    }

    await this.prisma.client.organizationInvitation.update({
      where: { id: invitationId },
      data: { status: InvitationStatus.EXPIRED },
    });

    await this.prisma.client.activityLog.create({
      data: {
        entityType: 'organization',
        entityId: orgId,
        action: 'invitation_cancelled',
        actorId: actorId,
        organizationId: orgId,
        meta: { invitationId, email: invitation.email },
      },
    });

    return { message: 'Invitation cancelled.' };
  }

  // --------------------------------------------------------------------------
  // SUPER_ADMIN methods
  // --------------------------------------------------------------------------

  async adminListOrganizations(query: ListOrganizationsQueryDto): Promise<PaginatedResult<OrgSummary>> {
    const { page = 1, limit = 20, search, plan, isActive } = query;
    const skip = (page - 1) * limit;

    // Build raw queries because Prisma soft-delete middleware might block getting deleted orgs
    // A simpler way if not strictly rewriting raw: pass an extension to bypass, or use findMany if middleware allows bypassing.
    // Assuming we use standard Prisma and middleware filters out deletedAt: null globally,
    // we can use a raw query or if the middleware allows deletedAt: undefined as a bypass.
    // As instructed: "override Prisma middleware for this query using prisma.$queryRaw or passing deletedAt: undefined"

    const whereClause: any = {
      deletedAt: undefined, // Tell middleware to ignore if implemented this way
    };
    
    if (search) {
      whereClause.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { slug: { contains: search, mode: 'insensitive' } },
      ];
    }
    if (plan) {
      whereClause.plan = plan;
    }
    if (isActive !== undefined) {
      whereClause.isActive = isActive;
    }

    const [total, orgs] = await this.prisma.client.$transaction([
      this.prisma.client.organization.count({ where: whereClause }),
      this.prisma.client.organization.findMany({
        where: whereClause,
        skip,
        take: limit,
        include: {
          _count: { select: { members: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    return {
      data: orgs.map(org => ({
        id: org.id,
        name: org.name,
        slug: org.slug,
        logoUrl: org.logoUrl,
        plan: org.plan,
        isActive: org.isActive,
        createdAt: org.createdAt,
        callerRole: null, // SUPER_ADMIN
        memberCount: org._count.members,
      })),
      total,
      page,
      limit,
    };
  }

  async adminGetOrganization(orgId: string): Promise<OrgDetail> {
    const org = await this.prisma.client.organization.findUnique({
      where: { id: orgId, deletedAt: undefined } as any, // bypass soft delete if configured
      include: {
        _count: {
          select: { members: true, projects: true },
        },
      },
    });

    if (!org) {
      throw new NotFoundException('Organization not found');
    }

    return {
      id: org.id,
      name: org.name,
      slug: org.slug,
      logoUrl: org.logoUrl,
      plan: org.plan,
      isActive: org.isActive,
      createdAt: org.createdAt,
      updatedAt: org.updatedAt,
      callerRole: null, // SUPER_ADMIN
      memberCount: org._count.members,
      projectCount: org._count.projects,
    };
  }

  async adminUpdateOrganization(orgId: string, actorId: string, dto: AdminUpdateOrgDto): Promise<OrgDetail> {
    const org = await this.prisma.client.organization.findUnique({ where: { id: orgId, deletedAt: undefined } as any });
    if (!org) throw new NotFoundException('Organization not found');

    const updated = await this.prisma.client.organization.update({
      where: { id: orgId },
      data: {
        plan: dto.plan,
        isActive: dto.isActive,
        name: dto.name,
      },
      include: {
        _count: { select: { members: true, projects: true } },
      },
    });

    if (dto.isActive === false && org.isActive === true) {
      // Clear refresh tokens for all users in this org to force re-login
      const members = await this.prisma.client.organizationMember.findMany({
        where: { organizationId: orgId },
        select: { userId: true },
      });
      const userIds = members.map(m => m.userId);
      await this.prisma.client.user.updateMany({
        where: { id: { in: userIds } },
        data: { refreshToken: null },
      });
    }

    await this.prisma.client.activityLog.create({
      data: {
        entityType: 'organization',
        entityId: orgId,
        action: 'admin_updated_org',
        actorId: actorId,
        organizationId: orgId,
        meta: { changes: dto },
      },
    });

    return {
      id: updated.id,
      name: updated.name,
      slug: updated.slug,
      logoUrl: updated.logoUrl,
      plan: updated.plan,
      isActive: updated.isActive,
      createdAt: updated.createdAt,
      updatedAt: updated.updatedAt,
      callerRole: null,
      memberCount: updated._count.members,
      projectCount: updated._count.projects,
    };
  }

  async adminDeleteOrganization(orgId: string, actorId: string): Promise<{ message: string }> {
    await this.prisma.client.organization.delete({
      where: { id: orgId },
    });

    await this.prisma.client.activityLog.create({
      data: {
        entityType: 'organization',
        entityId: orgId,
        action: 'admin_deleted_org',
        actorId: actorId,
        organizationId: orgId,
      },
    });

    return { message: 'Organization soft-deleted (SUPER_ADMIN).' };
  }
}
