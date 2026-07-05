import { IsUUID, IsEnum } from 'class-validator';
import { ProjectRole } from '@prisma/client';

export class AddMemberDto {
  @IsUUID()
  userId: string;

  @IsEnum(ProjectRole)
  projectRole: ProjectRole;
}
