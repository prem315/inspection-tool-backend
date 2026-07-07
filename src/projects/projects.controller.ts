import { Controller, Get, Post, Body, Patch, Param, UseGuards, Req } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { ProjectsService } from './projects.service';
import { CreateProjectDto } from './dto/create-project.dto';
import { UpdateProjectDto } from './dto/update-project.dto';
import { OrgMemberGuard } from '../auth/guards/org-member.guard';
import { ProjectMemberGuard } from '../auth/guards/project-member.guard';
import { EmailVerifiedGuard } from '../auth/guards/email-verified.guard';
import { OrgRoles } from '../auth/decorators/org-roles.decorator';
import { ProjectRoles } from '../auth/decorators/project-roles.decorator';
import { OrgRole, ProjectRole } from '@prisma/client';

@ApiTags('Projects')
@ApiBearerAuth()
@Controller('organizations/:orgId/projects')
export class ProjectsController {
  constructor(private readonly projectsService: ProjectsService) {}

  @Post()
  @UseGuards(EmailVerifiedGuard, OrgMemberGuard)
  @OrgRoles(OrgRole.OWNER, OrgRole.ADMIN)
  @ApiOperation({ summary: 'Create project' })
  create(
    @Param('orgId') orgId: string,
    @Body() createProjectDto: CreateProjectDto,
    @Req() req: any,
  ) {
    return this.projectsService.create(orgId, createProjectDto, req.user.id);
  }

  @Get()
  @UseGuards(OrgMemberGuard)
  @ApiOperation({ summary: 'List all projects in org' })
  findAll(@Param('orgId') orgId: string, @Req() req: any) {
    return this.projectsService.findAll(orgId, req.user.id, req.orgMember);
  }

  @Get(':projectId')
  @UseGuards(ProjectMemberGuard)
  @ApiOperation({ summary: 'Get project detail' })
  findOne(@Param('projectId') projectId: string) {
    return this.projectsService.findOne(projectId);
  }

  @Patch(':projectId')
  @UseGuards(ProjectMemberGuard)
  @ProjectRoles(ProjectRole.OWNER)
  @ApiOperation({ summary: 'Update project' })
  update(
    @Param('projectId') projectId: string,
    @Body() updateProjectDto: UpdateProjectDto,
  ) {
    return this.projectsService.update(projectId, updateProjectDto);
  }

  @Post(':projectId/archive')
  @UseGuards(ProjectMemberGuard)
  @ProjectRoles(ProjectRole.OWNER)
  @ApiOperation({ summary: 'Archive project' })
  archive(@Param('projectId') projectId: string) {
    return this.projectsService.archive(projectId);
  }

  @Get(':projectId/dashboard')
  @UseGuards(ProjectMemberGuard)
  @ApiOperation({ summary: 'Get project dashboard counts' })
  getDashboard(@Param('projectId') projectId: string) {
    return this.projectsService.getDashboard(projectId);
  }
}
