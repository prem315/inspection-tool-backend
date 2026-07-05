import { Controller, Get, Post, Delete, Body, Param, UseGuards, Req } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { InvitationsService } from './invitations.service';
import { Public } from '../common/decorators/public.decorator';
import { OrgMemberGuard } from '../auth/guards/org-member.guard';
import { OrgRoles } from '../auth/decorators/org-roles.decorator';
import { ProjectMemberGuard } from '../auth/guards/project-member.guard';
import { ProjectRoles } from '../auth/decorators/project-roles.decorator';
import { OrgRole, ProjectRole } from '@prisma/client';
import { CreateOrgInvitationDto } from './dto/create-org-invitation.dto';
import { CreateProjectInvitationDto } from './dto/create-project-invitation.dto';

@ApiTags('Invitations')
@ApiBearerAuth()
@Controller()
export class InvitationsController {
  constructor(private readonly invitationsService: InvitationsService) {}

  // ==========================================
  // Organization Invitations (Scoped to Org)
  // ==========================================
  
  @Post('organizations/:orgId/invitations')
  @UseGuards(OrgMemberGuard)
  @OrgRoles(OrgRole.OWNER, OrgRole.ADMIN)
  @ApiOperation({ summary: 'Send org invitation' })
  createOrgInvitation(
    @Param('orgId') orgId: string,
    @Body() dto: CreateOrgInvitationDto,
    @Req() req: any,
  ) {
    return this.invitationsService.createOrgInvitation(orgId, dto, req.user.id);
  }

  @Get('organizations/:orgId/invitations')
  @UseGuards(OrgMemberGuard)
  @OrgRoles(OrgRole.OWNER, OrgRole.ADMIN)
  @ApiOperation({ summary: 'List org invitations' })
  listOrgInvitations(@Param('orgId') orgId: string) {
    return this.invitationsService.listOrgInvitations(orgId);
  }

  @Delete('organizations/:orgId/invitations/:invitationId')
  @UseGuards(OrgMemberGuard)
  @OrgRoles(OrgRole.OWNER, OrgRole.ADMIN)
  @ApiOperation({ summary: 'Cancel org invitation' })
  cancelOrgInvitation(
    @Param('orgId') orgId: string,
    @Param('invitationId') invitationId: string,
  ) {
    return this.invitationsService.cancelOrgInvitation(orgId, invitationId);
  }

  // ==========================================
  // Project Invitations (Scoped to Project)
  // ==========================================

  @Post('organizations/:orgId/projects/:projectId/invitations')
  @UseGuards(ProjectMemberGuard)
  @ProjectRoles(ProjectRole.OWNER)
  @ApiOperation({ summary: 'Send project invitation' })
  createProjectInvitation(
    @Param('projectId') projectId: string,
    @Body() dto: CreateProjectInvitationDto,
    @Req() req: any,
  ) {
    return this.invitationsService.createProjectInvitation(projectId, dto, req.user.id);
  }

  @Get('organizations/:orgId/projects/:projectId/invitations')
  @UseGuards(ProjectMemberGuard)
  @ProjectRoles(ProjectRole.OWNER)
  @ApiOperation({ summary: 'List project invitations' })
  listProjectInvitations(@Param('projectId') projectId: string) {
    return this.invitationsService.listProjectInvitations(projectId);
  }

  // ==========================================
  // Public/Accept endpoints (Org)
  // ==========================================

  @Public()
  @Get('invitations/org/token/:token')
  @ApiOperation({ summary: 'Preview org invitation' })
  getOrgInvitationPreview(@Param('token') token: string) {
    return this.invitationsService.getOrgInvitationPreview(token);
  }

  @Post('invitations/org/accept')
  @ApiOperation({ summary: 'Accept org invitation (existing user)' })
  acceptOrgInvitation(@Body('token') token: string, @Req() req: any) {
    return this.invitationsService.acceptOrgInvitation(token, req.user.id);
  }

  @Public()
  @Post('invitations/org/complete')
  @ApiOperation({ summary: 'Complete org invitation (new user)' })
  completeOrgInvitation(@Body('token') token: string, @Body() dto: any) {
    return this.invitationsService.completeOrgInvitation(token, dto);
  }

  // ==========================================
  // Public/Accept endpoints (Project)
  // ==========================================

  @Public()
  @Get('invitations/project/token/:token')
  @ApiOperation({ summary: 'Preview project invitation' })
  getProjectInvitationPreview(@Param('token') token: string) {
    return this.invitationsService.getProjectInvitationPreview(token);
  }

  @Post('invitations/project/accept')
  @ApiOperation({ summary: 'Accept project invitation (existing user)' })
  acceptProjectInvitation(@Body('token') token: string, @Req() req: any) {
    return this.invitationsService.acceptProjectInvitation(token, req.user.id);
  }

  @Public()
  @Post('invitations/project/complete')
  @ApiOperation({ summary: 'Complete project invitation (new user)' })
  completeProjectInvitation(@Body('token') token: string, @Body() dto: any) {
    return this.invitationsService.completeProjectInvitation(token, dto);
  }
}
