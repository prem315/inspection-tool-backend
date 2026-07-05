import { Controller, Get, Post, Body, Patch, Param, Delete, UseGuards, Req } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { ProjectMembersService } from './project-members.service';
import { AddMemberDto } from './dto/add-member.dto';
import { UpdateProjectMemberRoleDto } from './dto/update-member-role.dto';
import { ProjectMemberGuard } from '../../auth/guards/project-member.guard';
import { ProjectRoles } from '../../auth/decorators/project-roles.decorator';
import { ProjectRole } from '@prisma/client';

@ApiTags('Project Members')
@ApiBearerAuth()
@Controller('organizations/:orgId/projects/:projectId/members')
@UseGuards(ProjectMemberGuard)
export class ProjectMembersController {
  constructor(private readonly projectMembersService: ProjectMembersService) {}

  @Get()
  @ApiOperation({ summary: 'List all project members' })
  findAll(@Param('projectId') projectId: string) {
    return this.projectMembersService.findAll(projectId);
  }

  @Post()
  @ProjectRoles(ProjectRole.OWNER)
  @ApiOperation({ summary: 'Add existing org member to project' })
  addMember(
    @Param('orgId') orgId: string,
    @Param('projectId') projectId: string,
    @Body() addMemberDto: AddMemberDto,
    @Req() req: any,
  ) {
    return this.projectMembersService.addMember(orgId, projectId, addMemberDto, req.user.id);
  }

  @Patch(':userId')
  @ProjectRoles(ProjectRole.OWNER)
  @ApiOperation({ summary: 'Change a member\'s project role' })
  updateRole(
    @Param('projectId') projectId: string,
    @Param('userId') targetUserId: string,
    @Body() updateMemberRoleDto: UpdateProjectMemberRoleDto,
    @Req() req: any,
  ) {
    return this.projectMembersService.updateRole(projectId, targetUserId, updateMemberRoleDto, req.user.id);
  }

  @Delete(':userId')
  @ProjectRoles(ProjectRole.OWNER)
  @ApiOperation({ summary: 'Remove member from project' })
  removeMember(
    @Param('projectId') projectId: string,
    @Param('userId') targetUserId: string,
    @Req() req: any,
  ) {
    return this.projectMembersService.removeMember(projectId, targetUserId, req.user.id);
  }
}
