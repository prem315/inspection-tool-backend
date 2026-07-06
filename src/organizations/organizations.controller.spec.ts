import { Test, TestingModule } from '@nestjs/testing';
import { OrganizationsController } from './organizations.controller';
import { OrganizationsService } from './organizations.service';
import { CreateOrganizationDto } from './dto/create-organization.dto';
import { UpdateOrganizationDto } from './dto/update-organization.dto';
import { TransferOwnershipDto } from './dto/transfer-ownership.dto';
import { UpdateMemberRoleDto } from './dto/update-member-role.dto';
import { OrgRole, PlanTier } from '@prisma/client';
import { OrgMemberGuard } from './guards/org-member.guard';
import { OrgRoleGuard } from './guards/org-role.guard';

describe('OrganizationsController (Core Endpoints)', () => {
  let controller: OrganizationsController;
  let service: jest.Mocked<OrganizationsService>;

  beforeEach(async () => {
    const mockOrganizationsService = {
      createOrganization: jest.fn(),
      getMyOrganizations: jest.fn(),
      getOrganization: jest.fn(),
      updateOrganization: jest.fn(),
      deleteOrganization: jest.fn(),
      transferOwnership: jest.fn(),
      leaveOrganization: jest.fn(),
      getMembers: jest.fn(),
      updateMemberRole: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [OrganizationsController],
      providers: [
        {
          provide: OrganizationsService,
          useValue: mockOrganizationsService,
        },
      ],
    })
    .overrideGuard(OrgMemberGuard)
    .useValue({ canActivate: () => true })
    .overrideGuard(OrgRoleGuard)
    .useValue({ canActivate: () => true })
    .compile();

    controller = module.get<OrganizationsController>(OrganizationsController);
    service = module.get(OrganizationsService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('createOrganization', () => {
    it('should call service.createOrganization with correct parameters', async () => {
      const req = { user: { id: 'user-1' } };
      const dto: CreateOrganizationDto = { name: 'Org Name', slug: 'org-slug' };
      const expectedResult = { organization: { id: 'org-1', ...dto }, membership: { id: 'member-1' } };
      service.createOrganization.mockResolvedValue(expectedResult as any);

      const result = await controller.createOrganization(req, dto);

      expect(service.createOrganization).toHaveBeenCalledWith('user-1', dto);
      expect(result).toEqual(expectedResult);
    });
  });

  describe('getMyOrganizations', () => {
    it('should call service.getMyOrganizations with correct parameters', async () => {
      const req = { user: { id: 'user-1' } };
      const expectedResult = [
        {
          id: 'org-1',
          name: 'Org 1',
          slug: 'org-1',
          logoUrl: null,
          plan: PlanTier.FREE,
          isActive: true,
          createdAt: new Date(),
          callerRole: OrgRole.OWNER,
          memberCount: 1,
        },
      ];
      service.getMyOrganizations.mockResolvedValue(expectedResult as any);

      const result = await controller.getMyOrganizations(req);

      expect(service.getMyOrganizations).toHaveBeenCalledWith('user-1');
      expect(result).toEqual(expectedResult);
    });
  });

  describe('getOrganization', () => {
    it('should call service.getOrganization with correct parameters', async () => {
      const req = { user: { id: 'user-1' } };
      const orgId = 'org-1';
      const expectedResult = {
        id: orgId,
        name: 'Org 1',
        slug: 'org-1',
        logoUrl: null,
        plan: PlanTier.FREE,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
        callerRole: OrgRole.OWNER,
        memberCount: 1,
        projectCount: 0,
      };
      service.getOrganization.mockResolvedValue(expectedResult as any);

      const result = await controller.getOrganization(req, orgId);

      expect(service.getOrganization).toHaveBeenCalledWith(orgId, 'user-1');
      expect(result).toEqual(expectedResult);
    });
  });

  describe('updateOrganization', () => {
    it('should call service.updateOrganization with correct parameters', async () => {
      const req = { user: { id: 'user-1' } };
      const orgId = 'org-1';
      const dto: UpdateOrganizationDto = { name: 'New Name' };
      const expectedResult = {
        id: orgId,
        name: 'New Name',
        slug: 'org-1',
        logoUrl: null,
        plan: PlanTier.FREE,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
        callerRole: OrgRole.OWNER,
        memberCount: 1,
        projectCount: 0,
      };
      service.updateOrganization.mockResolvedValue(expectedResult as any);

      const result = await controller.updateOrganization(req, orgId, dto);

      expect(service.updateOrganization).toHaveBeenCalledWith(orgId, 'user-1', dto);
      expect(result).toEqual(expectedResult);
    });
  });

  describe('deleteOrganization', () => {
    it('should call service.deleteOrganization with correct parameters', async () => {
      const req = { user: { id: 'user-1' } };
      const orgId = 'org-1';
      const expectedResult = { message: 'Organization deleted.' };
      service.deleteOrganization.mockResolvedValue(expectedResult);

      const result = await controller.deleteOrganization(req, orgId);

      expect(service.deleteOrganization).toHaveBeenCalledWith(orgId, 'user-1');
      expect(result).toEqual(expectedResult);
    });
  });

  describe('transferOwnership', () => {
    it('should call service.transferOwnership with correct parameters', async () => {
      const req = { user: { id: 'user-1' } };
      const orgId = 'org-1';
      const dto: TransferOwnershipDto = { newOwnerUserId: 'user-2' };
      const expectedResult = { message: 'Ownership transferred.' };
      service.transferOwnership.mockResolvedValue(expectedResult);

      const result = await controller.transferOwnership(req, orgId, dto);

      expect(service.transferOwnership).toHaveBeenCalledWith(orgId, 'user-1', dto);
      expect(result).toEqual(expectedResult);
    });
  });

  describe('leaveOrganization', () => {
    it('should call service.leaveOrganization with correct parameters', async () => {
      const req = { user: { id: 'user-1' } };
      const orgId = 'org-1';
      const expectedResult = { message: 'You have left the organization.' };
      service.leaveOrganization.mockResolvedValue(expectedResult);

      const result = await controller.leaveOrganization(req, orgId);

      expect(service.leaveOrganization).toHaveBeenCalledWith(orgId, 'user-1');
      expect(result).toEqual(expectedResult);
    });
  });

  describe('getMembers', () => {
    it('should call service.getMembers with correct parameters', async () => {
      const orgId = 'org-1';
      const expectedResult = [
        { id: 'member-1', role: OrgRole.OWNER, joinedAt: new Date(), user: { id: 'user-1', name: 'User 1', email: 'user1@example.com' } },
      ];
      service.getMembers.mockResolvedValue(expectedResult as any);

      const result = await controller.getMembers(orgId);

      expect(service.getMembers).toHaveBeenCalledWith(orgId);
      expect(result).toEqual(expectedResult);
    });
  });

  describe('updateMemberRole', () => {
    it('should call service.updateMemberRole with correct parameters', async () => {
      const req = { user: { id: 'user-1' } };
      const orgId = 'org-1';
      const userId = 'user-2';
      const dto: UpdateMemberRoleDto = { role: OrgRole.ADMIN };
      const expectedResult = { id: 'member-2', role: OrgRole.ADMIN, joinedAt: new Date(), user: { id: 'user-2', name: 'User 2', email: 'user2@example.com' } };
      service.updateMemberRole.mockResolvedValue(expectedResult as any);

      const result = await controller.updateMemberRole(req, orgId, userId, dto);

      expect(service.updateMemberRole).toHaveBeenCalledWith(orgId, 'user-1', userId, dto);
      expect(result).toEqual(expectedResult);
    });
  });
});
