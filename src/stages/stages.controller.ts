import { Controller, Get, Post, Body, Patch, Param, Delete, UseGuards, Req } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { StagesService } from './stages.service';
import { CreateStageDto } from './dto/create-stage.dto';
import { UpdateStageDto } from './dto/update-stage.dto';
import { ReorderStagesDto } from './dto/reorder-stages.dto';
import { ProjectMemberGuard } from '../auth/guards/project-member.guard';
import { ProjectRoles } from '../auth/decorators/project-roles.decorator';
import { ProjectRole } from '@prisma/client';

@ApiTags('Stages')
@ApiBearerAuth()
@Controller('organizations/:orgId/projects/:projectId/stages')
@UseGuards(ProjectMemberGuard)
export class StagesController {
  constructor(private readonly stagesService: StagesService) {}

  @Get()
  @ApiOperation({ summary: 'List stages' })
  findAll(@Param('projectId') projectId: string) {
    return this.stagesService.findAll(projectId);
  }

  @Post()
  @ProjectRoles(ProjectRole.OWNER, ProjectRole.EPC_ENGINEER)
  @ApiOperation({ summary: 'Create custom stage' })
  create(
    @Param('projectId') projectId: string,
    @Body() createStageDto: CreateStageDto,
    @Req() req: any,
  ) {
    return this.stagesService.create(projectId, createStageDto, req.user.id);
  }

  @Patch(':stageId')
  @ProjectRoles(ProjectRole.OWNER, ProjectRole.EPC_ENGINEER)
  @ApiOperation({ summary: 'Update stage name/description' })
  update(
    @Param('projectId') projectId: string,
    @Param('stageId') stageId: string,
    @Body() updateStageDto: UpdateStageDto,
    @Req() req: any,
  ) {
    return this.stagesService.update(projectId, stageId, updateStageDto, req.user.id);
  }

  @Delete(':stageId')
  @ProjectRoles(ProjectRole.OWNER)
  @ApiOperation({ summary: 'Soft-delete stage' })
  remove(
    @Param('projectId') projectId: string,
    @Param('stageId') stageId: string,
    @Req() req: any,
  ) {
    return this.stagesService.remove(projectId, stageId, req.user.id);
  }

  @Post('reorder')
  @ProjectRoles(ProjectRole.OWNER)
  @ApiOperation({ summary: 'Reorder stages' })
  reorder(
    @Param('projectId') projectId: string,
    @Body() reorderStagesDto: ReorderStagesDto,
    @Req() req: any,
  ) {
    return this.stagesService.reorder(projectId, reorderStagesDto, req.user.id);
  }

  @Post('seed')
  @ProjectRoles(ProjectRole.OWNER)
  @ApiOperation({ summary: 'Clone stages from a ProjectTemplate' })
  seed(
    @Param('projectId') projectId: string,
    @Body('templateId') templateId: string,
    @Req() req: any,
  ) {
    return this.stagesService.seed(projectId, templateId, req.user.id);
  }
}
