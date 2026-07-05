import { Controller, Get, Post, Body, Patch, Param, Delete, UseGuards, Req } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { LabelsService } from './labels.service';
import { CreateLabelDto } from './dto/create-label.dto';
import { UpdateLabelDto } from './dto/update-label.dto';
import { ProjectMemberGuard } from '../auth/guards/project-member.guard';
import { ProjectRoles } from '../auth/decorators/project-roles.decorator';
import { ProjectRole } from '@prisma/client';

@ApiTags('Labels')
@ApiBearerAuth()
@Controller('organizations/:orgId/projects/:projectId/labels')
@UseGuards(ProjectMemberGuard)
export class LabelsController {
  constructor(private readonly labelsService: LabelsService) {}

  @Post()
  @ProjectRoles(ProjectRole.OWNER, ProjectRole.EPC_ENGINEER)
  @ApiOperation({ summary: 'Create label' })
  create(
    @Param('projectId') projectId: string,
    @Body() createLabelDto: CreateLabelDto,
    @Req() req: any,
  ) {
    return this.labelsService.create(projectId, createLabelDto, req.user.id);
  }

  @Get()
  @ApiOperation({ summary: 'List labels' })
  findAll(@Param('projectId') projectId: string) {
    return this.labelsService.findAll(projectId);
  }

  @Patch(':labelId')
  @ProjectRoles(ProjectRole.OWNER, ProjectRole.EPC_ENGINEER)
  @ApiOperation({ summary: 'Update label' })
  update(
    @Param('projectId') projectId: string,
    @Param('labelId') labelId: string,
    @Body() updateLabelDto: UpdateLabelDto,
    @Req() req: any,
  ) {
    return this.labelsService.update(projectId, labelId, updateLabelDto, req.user.id);
  }

  @Delete(':labelId')
  @ProjectRoles(ProjectRole.OWNER)
  @ApiOperation({ summary: 'Delete label' })
  remove(
    @Param('projectId') projectId: string,
    @Param('labelId') labelId: string,
    @Req() req: any,
  ) {
    return this.labelsService.remove(projectId, labelId, req.user.id);
  }
}
