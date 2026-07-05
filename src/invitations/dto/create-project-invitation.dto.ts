import { IsEmail, IsEnum } from 'class-validator';
import { ProjectRole } from '@prisma/client';

export class CreateProjectInvitationDto {
  @IsEmail()
  email: string;

  @IsEnum(ProjectRole)
  projectRole: ProjectRole;
}
