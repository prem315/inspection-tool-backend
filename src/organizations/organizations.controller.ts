import { Controller, Post, Body, Get, Patch, Delete, Param, Query, UseGuards, Req } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiParam } from '@nestjs/swagger';
import { OrganizationsService } from './organizations.service';
import { CreateOrganizationDto } from './dto/create-organization.dto';
import { UpdateOrganizationDto } from './dto/update-organization.dto';
import { UpdateMemberRoleDto } from './dto/update-member-role.dto';
import { SendOrgInvitationDto } from './dto/send-org-invitation.dto';
import { TransferOwnershipDto } from './dto/transfer-ownership.dto';
import { ListOrganizationsQueryDto } from './dto/list-organizations-query.dto';
import { AdminUpdateOrgDto } from './dto/admin-update-org.dto';
import { OrgMemberGuard } from './guards/org-member.guard';
import { OrgRoleGuard } from './guards/org-role.guard';
import { OrgRoles } from './decorators/org-roles.decorator';
import { OrgRole, SystemRole } from '@prisma/client';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../auth/guards/roles.guard';

@ApiTags('Organizations')
@ApiBearerAuth()
@Controller()
export class OrganizationsController {
  constructor(private readonly organizationsService: OrganizationsService) {}

  // --------------------------------------------------------------------------
  // Self-serve routes
  // --------------------------------------------------------------------------

  @Post('organizations')
  @ApiOperation({ summary: 'Create a new organization' })
  @ApiResponse({ status: 201, description: 'Organization created successfully' })
  @ApiResponse({ status: 409, description: 'Slug is already taken' })
  createOrganization(@Req() req, @Body() dto: CreateOrganizationDto) {
    return this.organizationsService.createOrganization(req.user.id, dto);
  }

  @Get('organizations')
  @ApiOperation({ summary: 'List organizations the caller belongs to' })
  @ApiResponse({ status: 200, description: 'List of organizations' })
  getMyOrganizations(@Req() req) {
    return this.organizationsService.getMyOrganizations(req.user.id);
  }

  @Get('organizations/:orgId')
  @UseGuards(OrgMemberGuard)
  @ApiOperation({ summary: 'Get organization details' })
  @ApiParam({ name: 'orgId', type: String })
  @ApiResponse({ status: 200, description: 'Organization details' })
  getOrganization(@Req() req, @Param('orgId') orgId: string) {
    return this.organizationsService.getOrganization(orgId, req.user.id);
  }

  @Patch('organizations/:orgId')
  @UseGuards(OrgMemberGuard, OrgRoleGuard)
  @OrgRoles(OrgRole.OWNER, OrgRole.ADMIN)
  @ApiOperation({ summary: 'Update organization details' })
  @ApiParam({ name: 'orgId', type: String })
  @ApiResponse({ status: 200, description: 'Organization updated' })
  updateOrganization(@Req() req, @Param('orgId') orgId: string, @Body() dto: UpdateOrganizationDto) {
    return this.organizationsService.updateOrganization(orgId, req.user.id, dto);
  }

  @Delete('organizations/:orgId')
  @UseGuards(OrgMemberGuard, OrgRoleGuard)
  @OrgRoles(OrgRole.OWNER)
  @ApiOperation({ summary: 'Delete organization' })
  @ApiParam({ name: 'orgId', type: String })
  @ApiResponse({ status: 200, description: 'Organization deleted' })
  @ApiResponse({ status: 400, description: 'Archive all projects first' })
  deleteOrganization(@Req() req, @Param('orgId') orgId: string) {
    return this.organizationsService.deleteOrganization(orgId, req.user.id);
  }

  @Post('organizations/:orgId/transfer-ownership')
  @UseGuards(OrgMemberGuard, OrgRoleGuard)
  @OrgRoles(OrgRole.OWNER)
  @ApiOperation({ summary: 'Transfer ownership of organization' })
  @ApiParam({ name: 'orgId', type: String })
  @ApiResponse({ status: 200, description: 'Ownership transferred' })
  transferOwnership(@Req() req, @Param('orgId') orgId: string, @Body() dto: TransferOwnershipDto) {
    return this.organizationsService.transferOwnership(orgId, req.user.id, dto);
  }

  @Post('organizations/:orgId/leave')
  @UseGuards(OrgMemberGuard)
  @ApiOperation({ summary: 'Leave organization' })
  @ApiParam({ name: 'orgId', type: String })
  @ApiResponse({ status: 200, description: 'Left organization' })
  leaveOrganization(@Req() req, @Param('orgId') orgId: string) {
    return this.organizationsService.leaveOrganization(orgId, req.user.id);
  }

  // --------------------------------------------------------------------------
  // Member routes
  // --------------------------------------------------------------------------

  @Get('organizations/:orgId/members')
  @UseGuards(OrgMemberGuard)
  @ApiOperation({ summary: 'List organization members' })
  @ApiParam({ name: 'orgId', type: String })
  @ApiResponse({ status: 200, description: 'List of members' })
  getMembers(@Param('orgId') orgId: string) {
    return this.organizationsService.getMembers(orgId);
  }

  @Patch('organizations/:orgId/members/:userId')
  @UseGuards(OrgMemberGuard, OrgRoleGuard)
  @OrgRoles(OrgRole.OWNER)
  @ApiOperation({ summary: 'Change member role' })
  @ApiParam({ name: 'orgId', type: String })
  @ApiParam({ name: 'userId', type: String })
  @ApiResponse({ status: 200, description: 'Member role updated' })
  updateMemberRole(@Req() req, @Param('orgId') orgId: string, @Param('userId') userId: string, @Body() dto: UpdateMemberRoleDto) {
    return this.organizationsService.updateMemberRole(orgId, req.user.id, userId, dto);
  }

  @Delete('organizations/:orgId/members/:userId')
  @UseGuards(OrgMemberGuard, OrgRoleGuard)
  @OrgRoles(OrgRole.OWNER, OrgRole.ADMIN)
  @ApiOperation({ summary: 'Remove a member' })
  @ApiParam({ name: 'orgId', type: String })
  @ApiParam({ name: 'userId', type: String })
  @ApiResponse({ status: 200, description: 'Member removed' })
  removeMember(@Req() req, @Param('orgId') orgId: string, @Param('userId') userId: string) {
    return this.organizationsService.removeMember(orgId, req.user.id, userId);
  }

  // --------------------------------------------------------------------------
  // Invitation routes
  // --------------------------------------------------------------------------

  @Post('organizations/:orgId/invitations')
  @UseGuards(OrgMemberGuard, OrgRoleGuard)
  @OrgRoles(OrgRole.OWNER, OrgRole.ADMIN)
  @ApiOperation({ summary: 'Send organization invitation' })
  @ApiParam({ name: 'orgId', type: String })
  @ApiResponse({ status: 201, description: 'Invitation sent' })
  sendInvitation(@Req() req, @Param('orgId') orgId: string, @Body() dto: SendOrgInvitationDto) {
    return this.organizationsService.sendInvitation(orgId, req.user.id, dto);
  }

  @Get('organizations/:orgId/invitations')
  @UseGuards(OrgMemberGuard, OrgRoleGuard)
  @OrgRoles(OrgRole.OWNER, OrgRole.ADMIN)
  @ApiOperation({ summary: 'List organization invitations' })
  @ApiParam({ name: 'orgId', type: String })
  @ApiResponse({ status: 200, description: 'List of invitations' })
  listInvitations(@Param('orgId') orgId: string) {
    return this.organizationsService.listInvitations(orgId);
  }

  @Delete('organizations/:orgId/invitations/:id')
  @UseGuards(OrgMemberGuard, OrgRoleGuard)
  @OrgRoles(OrgRole.OWNER, OrgRole.ADMIN)
  @ApiOperation({ summary: 'Cancel an invitation' })
  @ApiParam({ name: 'orgId', type: String })
  @ApiParam({ name: 'id', type: String })
  @ApiResponse({ status: 200, description: 'Invitation cancelled' })
  cancelInvitation(@Req() req, @Param('orgId') orgId: string, @Param('id') invitationId: string) {
    return this.organizationsService.cancelInvitation(orgId, invitationId, req.user.id);
  }

  // --------------------------------------------------------------------------
  // SUPER_ADMIN routes
  // --------------------------------------------------------------------------

  @Get('admin/organizations')
  @UseGuards(RolesGuard)
  @Roles(SystemRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'List organizations (Admin)' })
  @ApiResponse({ status: 200, description: 'Paginated list of organizations' })
  adminListOrganizations(@Query() query: ListOrganizationsQueryDto) {
    return this.organizationsService.adminListOrganizations(query);
  }

  @Get('admin/organizations/:orgId')
  @UseGuards(RolesGuard)
  @Roles(SystemRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Get organization detail (Admin)' })
  @ApiParam({ name: 'orgId', type: String })
  @ApiResponse({ status: 200, description: 'Organization detail' })
  adminGetOrganization(@Param('orgId') orgId: string) {
    return this.organizationsService.adminGetOrganization(orgId);
  }

  @Patch('admin/organizations/:orgId')
  @UseGuards(RolesGuard)
  @Roles(SystemRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Update organization (Admin)' })
  @ApiParam({ name: 'orgId', type: String })
  @ApiResponse({ status: 200, description: 'Organization updated' })
  adminUpdateOrganization(@Req() req, @Param('orgId') orgId: string, @Body() dto: AdminUpdateOrgDto) {
    return this.organizationsService.adminUpdateOrganization(orgId, req.user.id, dto);
  }

  @Delete('admin/organizations/:orgId')
  @UseGuards(RolesGuard)
  @Roles(SystemRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Force delete organization (Admin)' })
  @ApiParam({ name: 'orgId', type: String })
  @ApiResponse({ status: 200, description: 'Organization deleted' })
  adminDeleteOrganization(@Req() req, @Param('orgId') orgId: string) {
    return this.organizationsService.adminDeleteOrganization(orgId, req.user.id);
  }
}
