import { Controller, Get, Post, Body, Param, UseGuards, Req, Query } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { InspectionRequestsService } from './inspection-requests.service';
import { CreateInspectionRequestDto } from './dto/create-inspection-request.dto';
import { AcceptInspectionRequestDto } from './dto/accept-inspection-request.dto';
import { DeclineInspectionRequestDto } from './dto/decline-inspection-request.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ProjectMemberGuard } from '../auth/guards/project-member.guard';
import { ProjectRoles } from '../auth/decorators/project-roles.decorator';
import { ProjectRole } from '@prisma/client';
import { Public } from '../common/decorators/public.decorator';

@ApiTags('Inspection Requests')
@Controller()
export class InspectionRequestsController {
  constructor(private readonly inspectionRequestsService: InspectionRequestsService) {}

  @Public()
  @Get('inspection-requests/verify-token')
  @ApiOperation({ summary: 'Verify a magic link token' })
  verifyToken(@Query('token') token: string) {
    return this.inspectionRequestsService.verifyToken(token);
  }

  @Post('organizations/:orgId/projects/:projectId/inspection-requests')
  @UseGuards(JwtAuthGuard, ProjectMemberGuard)
  @ProjectRoles(ProjectRole.OWNER, ProjectRole.EPC_ENGINEER)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create an inspection request' })
  create(
    @Param('projectId') projectId: string,
    @Body() dto: CreateInspectionRequestDto,
    @Req() req: any,
  ) {
    return this.inspectionRequestsService.create(projectId, dto, req.user.id);
  }

  @Post('inspection-requests/:id/accept')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Accept an inspection request' })
  accept(
    @Param('id') id: string,
    @Body() dto: AcceptInspectionRequestDto,
    @Req() req: any,
  ) {
    return this.inspectionRequestsService.accept(id, req.user.id, dto.token);
  }

  @Post('inspection-requests/:id/decline')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Decline an inspection request' })
  decline(
    @Param('id') id: string,
    @Body() dto: DeclineInspectionRequestDto & AcceptInspectionRequestDto,
    @Req() req: any,
  ) {
    return this.inspectionRequestsService.decline(id, req.user.id, dto, dto.token);
  }
}
