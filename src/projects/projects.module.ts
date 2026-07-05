import { Module } from '@nestjs/common';
import { ProjectsController } from './projects.controller';
import { ProjectsService } from './projects.service';
import { ProjectMembersController } from './members/project-members.controller';
import { ProjectMembersService } from './members/project-members.service';

@Module({
  controllers: [ProjectsController, ProjectMembersController],
  providers: [ProjectsService, ProjectMembersService],
})
export class ProjectsModule {}
