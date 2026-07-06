import { Injectable, NotFoundException, BadRequestException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { InvitationStatus, SystemRole, OrgRole } from '@prisma/client';
import { MailerService } from '../mailer/mailer.service';
import { CreateOrgInvitationDto } from './dto/create-org-invitation.dto';
import { CreateProjectInvitationDto } from './dto/create-project-invitation.dto';

@Injectable()
export class InvitationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly mailerService: MailerService,
  ) {}

  // ==========================================
  // Organization Invitations
  // ==========================================

  async createOrgInvitation(orgId: string, dto: CreateOrgInvitationDto, inviterId: string) {
    const existing = await this.prisma.client.organizationInvitation.findUnique({
      where: { organizationId_email: { organizationId: orgId, email: dto.email } },
    });

    if (existing && existing.status === InvitationStatus.PENDING) {
      return existing; // Don't duplicate if pending
    }

    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    let invitation;
    if (existing) {
      invitation = await this.prisma.client.organizationInvitation.update({
        where: { id: existing.id },
        data: { token, expiresAt, status: InvitationStatus.PENDING, role: dto.role, invitedById: inviterId },
        include: { organization: true, invitedBy: true },
      });
    } else {
      invitation = await this.prisma.client.organizationInvitation.create({
        data: { organizationId: orgId, email: dto.email, role: dto.role, token, expiresAt, invitedById: inviterId },
        include: { organization: true, invitedBy: true },
      });
    }

    await this.mailerService.sendOrgInvitation(
      invitation.email,
      invitation.invitedBy.name,
      invitation.organization.name,
      token,
      invitation.role
    );

    return invitation;
  }

  async listOrgInvitations(orgId: string) {
    return this.prisma.client.organizationInvitation.findMany({
      where: { organizationId: orgId, deletedAt: null },
      orderBy: { createdAt: 'desc' },
    });
  }

  async cancelOrgInvitation(orgId: string, invitationId: string) {
    return this.prisma.client.organizationInvitation.update({
      where: { id: invitationId, organizationId: orgId },
      data: { status: InvitationStatus.EXPIRED },
    });
  }

  async getOrgInvitationPreview(token: string) {
    const invitation = await this.prisma.client.organizationInvitation.findUnique({
      where: { token },
      include: { organization: { select: { name: true, logoUrl: true } }, invitedBy: { select: { name: true } } },
    });
    if (!invitation) throw new NotFoundException('Invalid invitation link');

    return {
      organizationName: invitation.organization.name,
      organizationLogoUrl: invitation.organization.logoUrl,
      inviterName: invitation.invitedBy.name,
      role: invitation.role,
      expiresAt: invitation.expiresAt,
      isExpired: invitation.expiresAt < new Date() || invitation.status !== InvitationStatus.PENDING,
    };
  }

  async acceptOrgInvitation(token: string, userId: string) {
    const invitation = await this.prisma.client.organizationInvitation.findUnique({ where: { token } });
    if (!invitation) throw new NotFoundException('Invalid invitation');
    if (invitation.status !== InvitationStatus.PENDING || invitation.expiresAt < new Date()) {
      throw new BadRequestException('Invitation is expired or already used');
    }

    const existingMember = await this.prisma.client.organizationMember.findFirst({
      where: { organizationId: invitation.organizationId, userId },
    });
    if (existingMember) throw new ConflictException('Already a member');

    return this.prisma.client.$transaction(async (tx) => {
      await tx.organizationMember.create({
        data: { organizationId: invitation.organizationId, userId, role: invitation.role },
      });
      await tx.organizationInvitation.update({
        where: { id: invitation.id },
        data: { status: InvitationStatus.ACCEPTED },
      });
      return { message: 'Accepted' };
    });
  }

  async completeOrgInvitation(token: string, dto: any) {
    const invitation = await this.prisma.client.organizationInvitation.findUnique({ where: { token } });
    if (!invitation || invitation.status !== InvitationStatus.PENDING || invitation.expiresAt < new Date()) {
      throw new BadRequestException('Invalid or expired invitation');
    }

    const existingUser = await this.prisma.client.user.findUnique({ where: { email: invitation.email } });
    if (existingUser) throw new ConflictException('User already exists');

    const passwordHash = await bcrypt.hash(dto.password, 12);
    
    return this.prisma.client.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: { name: dto.name, email: invitation.email, passwordHash, isEmailVerified: true },
      });
      await tx.organizationMember.create({
        data: { organizationId: invitation.organizationId, userId: user.id, role: invitation.role },
      });
      await tx.organizationInvitation.update({
        where: { id: invitation.id },
        data: { status: InvitationStatus.ACCEPTED },
      });

      const payload = { sub: user.id, email: user.email, systemRole: user.systemRole };
      const accessToken = this.jwtService.sign(payload, { secret: this.configService.get('JWT_ACCESS_SECRET'), expiresIn: '15m' });
      return { accessToken, user: { id: user.id, email: user.email } };
    });
  }

  async getMyPendingInvitations(userId: string) {
    const user = await this.prisma.client.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    const orgInvitations = await this.prisma.client.organizationInvitation.findMany({
      where: { email: user.email, status: InvitationStatus.PENDING },
      include: {
        organization: { select: { id: true, name: true, logoUrl: true } },
        invitedBy: { select: { name: true } }
      }
    });

    const projectInvitations = await this.prisma.client.projectInvitation.findMany({
      where: { email: user.email, status: InvitationStatus.PENDING },
      include: {
        project: { 
          select: { 
            id: true, 
            name: true, 
            organization: { select: { id: true, name: true, logoUrl: true } } 
          } 
        },
        invitedBy: { select: { name: true } }
      }
    });
    
    const unified = [
      ...orgInvitations.map(inv => ({
        id: inv.id,
        type: 'organization',
        token: inv.token,
        organization: inv.organization,
        invitedBy: inv.invitedBy,
        role: inv.role,
        createdAt: inv.createdAt
      })),
      ...projectInvitations.map(inv => ({
        id: inv.id,
        type: 'project',
        token: inv.token,
        organization: inv.project.organization,
        project: { id: inv.project.id, name: inv.project.name },
        invitedBy: inv.invitedBy,
        role: inv.projectRole,
        createdAt: inv.createdAt
      }))
    ];
    
    return unified.sort((a: any, b: any) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  // ==========================================
  // Project Invitations
  // ==========================================

  async createProjectInvitation(projectId: string, dto: CreateProjectInvitationDto, inviterId: string) {
    const existing = await this.prisma.client.projectInvitation.findUnique({
      where: { projectId_email: { projectId, email: dto.email } },
    });

    if (existing && existing.status === InvitationStatus.PENDING) return existing;

    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    let invitation;
    if (existing) {
      invitation = await this.prisma.client.projectInvitation.update({
        where: { id: existing.id },
        data: { token, expiresAt, status: InvitationStatus.PENDING, projectRole: dto.projectRole, invitedById: inviterId },
        include: { project: true, invitedBy: true },
      });
    } else {
      invitation = await this.prisma.client.projectInvitation.create({
        data: { projectId, email: dto.email, projectRole: dto.projectRole, token, expiresAt, invitedById: inviterId },
        include: { project: true, invitedBy: true },
      });
    }

    await this.mailerService.sendProjectInvitation(
      invitation.email,
      invitation.project.name,
      invitation.invitedBy.name,
      token
    );

    return invitation;
  }

  async listProjectInvitations(projectId: string) {
    return this.prisma.client.projectInvitation.findMany({
      where: { projectId, deletedAt: null },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getProjectInvitationPreview(token: string) {
    const invitation = await this.prisma.client.projectInvitation.findUnique({
      where: { token },
      include: { project: { select: { name: true } }, invitedBy: { select: { name: true } } },
    });
    if (!invitation) throw new NotFoundException('Invalid invitation link');

    return {
      projectName: invitation.project.name,
      inviterName: invitation.invitedBy.name,
      role: invitation.projectRole,
      expiresAt: invitation.expiresAt,
      isExpired: invitation.expiresAt < new Date() || invitation.status !== InvitationStatus.PENDING,
    };
  }

  async acceptProjectInvitation(token: string, userId: string) {
    const invitation = await this.prisma.client.projectInvitation.findUnique({
      where: { token },
      include: { project: true },
    });
    if (!invitation || invitation.status !== InvitationStatus.PENDING || invitation.expiresAt < new Date()) {
      throw new BadRequestException('Invalid or expired invitation');
    }

    return this.prisma.client.$transaction(async (tx) => {
      // Ensure they are an org member
      const orgMember = await tx.organizationMember.findFirst({
        where: { organizationId: invitation.project.organizationId, userId, deletedAt: null },
      });
      if (!orgMember) {
        await tx.organizationMember.create({
          data: { organizationId: invitation.project.organizationId, userId, role: OrgRole.MEMBER },
        });
      }

      const projMember = await tx.projectMember.findFirst({
        where: { projectId: invitation.projectId, userId, deletedAt: null },
      });
      if (!projMember) {
        await tx.projectMember.create({
          data: { projectId: invitation.projectId, userId, role: invitation.projectRole },
        });
      }

      await tx.projectInvitation.update({
        where: { id: invitation.id },
        data: { status: InvitationStatus.ACCEPTED },
      });

      return { message: 'Accepted' };
    });
  }

  async completeProjectInvitation(token: string, dto: any) {
    const invitation = await this.prisma.client.projectInvitation.findUnique({
      where: { token },
      include: { project: true },
    });
    if (!invitation || invitation.status !== InvitationStatus.PENDING || invitation.expiresAt < new Date()) {
      throw new BadRequestException('Invalid or expired invitation');
    }

    const existingUser = await this.prisma.client.user.findUnique({ where: { email: invitation.email } });
    if (existingUser) throw new ConflictException('User already exists');

    const passwordHash = await bcrypt.hash(dto.password, 12);

    return this.prisma.client.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: { name: dto.name, email: invitation.email, passwordHash, isEmailVerified: true },
      });

      await tx.organizationMember.create({
        data: { organizationId: invitation.project.organizationId, userId: user.id, role: OrgRole.MEMBER },
      });

      await tx.projectMember.create({
        data: { projectId: invitation.projectId, userId: user.id, role: invitation.projectRole },
      });

      await tx.projectInvitation.update({
        where: { id: invitation.id },
        data: { status: InvitationStatus.ACCEPTED },
      });

      const payload = { sub: user.id, email: user.email, systemRole: user.systemRole };
      const accessToken = this.jwtService.sign(payload, { secret: this.configService.get('JWT_ACCESS_SECRET'), expiresIn: '15m' });
      return { accessToken, user: { id: user.id, email: user.email } };
    });
  }
}
