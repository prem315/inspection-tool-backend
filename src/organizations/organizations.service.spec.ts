import { Test, TestingModule } from '@nestjs/testing';
import { OrganizationsService } from './organizations.service';
import { PrismaService } from '../prisma/prisma.service';
import { MailerService } from '../mailer/mailer.service';
import { ConflictException, NotFoundException, BadRequestException } from '@nestjs/common';
import { PlanTier, OrgRole } from '@prisma/client';
import { CreateOrganizationDto } from './dto/create-organization.dto';
import { UpdateOrganizationDto } from './dto/update-organization.dto';
import { TransferOwnershipDto } from './dto/transfer-ownership.dto';
import { UpdateMemberRoleDto } from './dto/update-member-role.dto';

describe('OrganizationsService (Core Endpoints)', () => {
  let service: OrganizationsService;
  let prisma: jest.Mocked<any>;

  beforeEach(async () => {
    const mockPrisma = {
      client: {
        organization: {
          findFirst: jest.fn(),
          findUnique: jest.fn(),
          create: jest.fn(),
          update: jest.fn(),
          delete: jest.fn(),
        },
        organizationMember: {
          create: jest.fn(),
          findMany: jest.fn(),
          findFirst: jest.fn(),
          update: jest.fn(),
          delete: jest.fn(),
          count: jest.fn(),
        },
        user: {
          findUnique: jest.fn(),
        },
        activityLog: {
          create: jest.fn(),
        },
        project: {
          count: jest.fn(),
        },
        $transaction: jest.fn(),
      },
    };

    const mockMailer = {
      sendOrgInvitation: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrganizationsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: MailerService, useValue: mockMailer },
      ],
    }).compile();

    service = module.get<OrganizationsService>(OrganizationsService);
    prisma = module.get(PrismaService);

    jest.clearAllMocks();
  });

  describe('createOrganization', () => {
    const dto: CreateOrganizationDto = { name: 'My Org', slug: 'my-org' };

    it('should successfully create an organization and membership in transaction', async () => {
      prisma.client.organization.findFirst.mockResolvedValue(null);
      
      const createdOrg = { id: 'org-1', name: 'My Org', slug: 'my-org', plan: PlanTier.FREE, isActive: true };
      const createdMember = { id: 'member-1', organizationId: 'org-1', userId: 'user-1', role: OrgRole.OWNER };
      
      // Mock transaction executor
      prisma.client.$transaction.mockImplementation(async (callback) => {
        const tx = {
          organization: {
            create: jest.fn().mockResolvedValue(createdOrg),
          },
          organizationMember: {
            create: jest.fn().mockResolvedValue(createdMember),
          },
          activityLog: {
            create: jest.fn().mockResolvedValue({}),
          },
        };
        return callback(tx);
      });

      const result = await service.createOrganization('user-1', dto);

      expect(prisma.client.organization.findFirst).toHaveBeenCalledWith({ where: { slug: 'my-org' } });
      expect(result).toEqual({ organization: createdOrg, membership: createdMember });
    });

    it('should throw ConflictException if slug is already taken', async () => {
      prisma.client.organization.findFirst.mockResolvedValue({ id: 'existing-org' });

      await expect(service.createOrganization('user-1', dto)).rejects.toThrow(ConflictException);
    });
  });

  describe('getMyOrganizations', () => {
    it('should return mapped organization summaries', async () => {
      const memberships = [
        {
          role: OrgRole.OWNER,
          organization: {
            id: 'org-1',
            name: 'Org 1',
            slug: 'org-1',
            logoUrl: 'logo.png',
            plan: PlanTier.FREE,
            isActive: true,
            createdAt: new Date(),
            _count: { members: 3 },
          },
        },
      ];
      prisma.client.organizationMember.findMany.mockResolvedValue(memberships);

      const result = await service.getMyOrganizations('user-1');

      expect(prisma.client.organizationMember.findMany).toHaveBeenCalledWith({
        where: {
          userId: 'user-1',
          organization: { isActive: true, deletedAt: null },
        },
        include: {
          organization: {
            include: {
              _count: { select: { members: true } },
            },
          },
        },
        orderBy: { joinedAt: 'desc' },
      });

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        id: 'org-1',
        name: 'Org 1',
        slug: 'org-1',
        logoUrl: 'logo.png',
        plan: PlanTier.FREE,
        isActive: true,
        createdAt: memberships[0].organization.createdAt,
        callerRole: OrgRole.OWNER,
        memberCount: 3,
      });
    });
  });

  describe('getOrganization', () => {
    it('should return org details if found and active', async () => {
      const orgId = 'org-1';
      const userId = 'user-1';
      prisma.client.organizationMember.findFirst.mockResolvedValue({ role: OrgRole.MEMBER });
      prisma.client.organization.findUnique.mockResolvedValue({
        id: orgId,
        name: 'Org 1',
        slug: 'org-1',
        logoUrl: null,
        plan: PlanTier.FREE,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
        _count: { members: 2, projects: 5 },
      });

      const result = await service.getOrganization(orgId, userId);

      expect(prisma.client.organizationMember.findFirst).toHaveBeenCalledWith({
        where: { organizationId: orgId, userId },
      });
      expect(prisma.client.organization.findUnique).toHaveBeenCalledWith({
        where: { id: orgId },
        include: {
          _count: { select: { members: true, projects: true } },
        },
      });

      expect(result.id).toBe(orgId);
      expect(result.callerRole).toBe(OrgRole.MEMBER);
      expect(result.memberCount).toBe(2);
      expect(result.projectCount).toBe(5);
    });

    it('should throw NotFoundException if organization not found or inactive', async () => {
      prisma.client.organization.findUnique.mockResolvedValue(null);
      await expect(service.getOrganization('org-1', 'user-1')).rejects.toThrow(NotFoundException);
    });
  });

  describe('updateOrganization', () => {
    it('should update organization and create log', async () => {
      const orgId = 'org-1';
      const actorId = 'user-1';
      const dto: UpdateOrganizationDto = { name: 'New Name' };
      const updatedOrg = {
        id: orgId,
        name: 'New Name',
        slug: 'org-1',
        logoUrl: null,
        plan: PlanTier.FREE,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
        _count: { members: 2, projects: 3 },
      };

      prisma.client.organization.update.mockResolvedValue(updatedOrg);
      prisma.client.organizationMember.findFirst.mockResolvedValue({ role: OrgRole.ADMIN });

      const result = await service.updateOrganization(orgId, actorId, dto);

      expect(prisma.client.organization.update).toHaveBeenCalledWith({
        where: { id: orgId },
        data: dto,
        include: {
          _count: { select: { members: true, projects: true } },
        },
      });
      expect(prisma.client.activityLog.create).toHaveBeenCalled();
      expect(result.name).toBe('New Name');
      expect(result.callerRole).toBe(OrgRole.ADMIN);
    });
  });

  describe('deleteOrganization', () => {
    it('should successfully delete if there are no active projects', async () => {
      const orgId = 'org-1';
      const actorId = 'user-1';
      prisma.client.project.count.mockResolvedValue(0);

      const result = await service.deleteOrganization(orgId, actorId);

      expect(prisma.client.project.count).toHaveBeenCalledWith({
        where: { organizationId: orgId, status: { not: 'ARCHIVED' } },
      });
      expect(prisma.client.organization.delete).toHaveBeenCalledWith({ where: { id: orgId } });
      expect(prisma.client.activityLog.create).toHaveBeenCalled();
      expect(result.message).toContain('deleted');
    });

    it('should throw BadRequestException if active projects exist', async () => {
      prisma.client.project.count.mockResolvedValue(3);

      await expect(service.deleteOrganization('org-1', 'user-1')).rejects.toThrow(BadRequestException);
      expect(prisma.client.organization.delete).not.toHaveBeenCalled();
    });
  });

  describe('transferOwnership', () => {
    it('should transfer ownership successfully in a transaction', async () => {
      const orgId = 'org-1';
      const actorId = 'user-1';
      const dto: TransferOwnershipDto = { newOwnerUserId: 'user-2' };

      prisma.client.organizationMember.findFirst
        .mockResolvedValueOnce({ id: 'member-2', role: OrgRole.MEMBER }) // target
        .mockResolvedValueOnce({ id: 'member-1', role: OrgRole.OWNER }); // actor

      prisma.client.$transaction.mockResolvedValue([]);

      const result = await service.transferOwnership(orgId, actorId, dto);

      expect(prisma.client.organizationMember.findFirst).toHaveBeenCalledTimes(2);
      expect(prisma.client.$transaction).toHaveBeenCalled();
      expect(result.message).toContain('transferred');
    });

    it('should throw BadRequestException if target user is not a member', async () => {
      prisma.client.organizationMember.findFirst.mockResolvedValueOnce(null);

      await expect(service.transferOwnership('org-1', 'user-1', { newOwnerUserId: 'user-2' })).rejects.toThrow(BadRequestException);
    });
  });

  describe('leaveOrganization', () => {
    it('should allow member to leave', async () => {
      const orgId = 'org-1';
      const userId = 'user-1';

      prisma.client.organizationMember.findFirst.mockResolvedValue({ id: 'member-1', role: OrgRole.MEMBER });

      const result = await service.leaveOrganization(orgId, userId);

      expect(prisma.client.organizationMember.delete).toHaveBeenCalledWith({ where: { id: 'member-1' } });
      expect(prisma.client.activityLog.create).toHaveBeenCalled();
      expect(result.message).toContain('left');
    });

    it('should throw BadRequestException if owner tries to leave with no other owners', async () => {
      prisma.client.organizationMember.findFirst.mockResolvedValue({ id: 'member-1', role: OrgRole.OWNER });
      prisma.client.organizationMember.count.mockResolvedValue(0);

      await expect(service.leaveOrganization('org-1', 'user-1')).rejects.toThrow(BadRequestException);
    });
  });

  describe('getMembers', () => {
    it('should return sorted list of members', async () => {
      const members = [
        { id: 'm1', role: OrgRole.MEMBER, joinedAt: new Date(2026, 1, 2), user: { name: 'User 1' } },
        { id: 'm2', role: OrgRole.OWNER, joinedAt: new Date(2026, 1, 1), user: { name: 'User 2' } },
      ];
      prisma.client.organizationMember.findMany.mockResolvedValue(members);

      const result = await service.getMembers('org-1');

      expect(prisma.client.organizationMember.findMany).toHaveBeenCalled();
      // Should sort OWNER (m2) before MEMBER (m1)
      expect(result[0].id).toBe('m2');
      expect(result[1].id).toBe('m1');
    });
  });

  describe('updateMemberRole', () => {
    it('should update role successfully', async () => {
      const orgId = 'org-1';
      const actorId = 'user-1';
      const targetUserId = 'user-2';
      const dto: UpdateMemberRoleDto = { role: OrgRole.ADMIN };

      prisma.client.organizationMember.findFirst.mockResolvedValue({ id: 'member-2', role: OrgRole.MEMBER });
      prisma.client.user.findUnique.mockResolvedValue({ id: actorId });
      prisma.client.organizationMember.update.mockResolvedValue({
        id: 'member-2',
        role: OrgRole.ADMIN,
        joinedAt: new Date(),
        user: { name: 'User 2' },
      });

      const result = await service.updateMemberRole(orgId, actorId, targetUserId, dto);

      expect(prisma.client.organizationMember.update).toHaveBeenCalledWith({
        where: { id: 'member-2' },
        data: { role: OrgRole.ADMIN },
        include: expect.any(Object),
      });
      expect(result.role).toBe(OrgRole.ADMIN);
    });

    it('should throw BadRequestException when changing own role', async () => {
      await expect(service.updateMemberRole('org-1', 'user-1', 'user-1', { role: OrgRole.ADMIN })).rejects.toThrow(BadRequestException);
    });
  });
});
