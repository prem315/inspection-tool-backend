import { Controller, Get, Post, Body, Patch, Param, Delete, UseGuards, Req } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { CheckpointsService } from './checkpoints.service';
import { CreateCheckpointDto } from './dto/create-checkpoint.dto';
import { UpdateCheckpointDto } from './dto/update-checkpoint.dto';
import { RecordCheckpointDto } from './dto/record-checkpoint.dto';
import { ProjectMemberGuard } from '../auth/guards/project-member.guard';
import { ProjectRoles } from '../auth/decorators/project-roles.decorator';
import { ProjectRole } from '@prisma/client';

@ApiTags('Checkpoints')
@ApiBearerAuth()
@Controller('organizations/:orgId/projects/:projectId/stages/:stageId/checkpoints')
@UseGuards(ProjectMemberGuard)
export class CheckpointsController {
  constructor(private readonly checkpointsService: CheckpointsService) {}

  @Get()
  @ApiOperation({ summary: 'List checkpoints in stage' })
  findAll(@Param('stageId') stageId: string) {
    return this.checkpointsService.findAll(stageId);
  }

  @Post()
  @ProjectRoles(ProjectRole.OWNER, ProjectRole.EPC_ENGINEER)
  @ApiOperation({ summary: 'Create checkpoint' })
  create(
    @Param('stageId') stageId: string,
    @Body() createCheckpointDto: CreateCheckpointDto,
    @Req() req: any,
  ) {
    return this.checkpointsService.create(stageId, createCheckpointDto, req.user.id, req.projectMember);
  }

  @Patch(':checkpointId')
  @ApiOperation({ summary: 'Update or record result' })
  update(
    @Param('checkpointId') checkpointId: string,
    @Body() dto: UpdateCheckpointDto & RecordCheckpointDto,
    @Req() req: any,
  ) {
    return this.checkpointsService.update(checkpointId, dto, req.user.id, req.projectMember);
  }

  @Delete(':checkpointId')
  @ProjectRoles(ProjectRole.OWNER, ProjectRole.EPC_ENGINEER)
  @ApiOperation({ summary: 'Soft-delete checkpoint' })
  remove(@Param('checkpointId') checkpointId: string, @Req() req: any) {
    return this.checkpointsService.remove(checkpointId, req.user.id);
  }

  @Post(':checkpointId/labels/:labelId')
  @ProjectRoles(ProjectRole.OWNER, ProjectRole.EPC_ENGINEER)
  @ApiOperation({ summary: 'Attach label' })
  attachLabel(
    @Param('checkpointId') checkpointId: string,
    @Param('labelId') labelId: string,
    @Req() req: any,
  ) {
    return this.checkpointsService.attachLabel(checkpointId, labelId, req.user.id);
  }

  @Delete(':checkpointId/labels/:labelId')
  @ProjectRoles(ProjectRole.OWNER, ProjectRole.EPC_ENGINEER)
  @ApiOperation({ summary: 'Remove label' })
  removeLabel(
    @Param('checkpointId') checkpointId: string,
    @Param('labelId') labelId: string,
    @Req() req: any,
  ) {
    return this.checkpointsService.removeLabel(checkpointId, labelId, req.user.id);
  }
}
