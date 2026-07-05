import { IsEmail, IsEnum, IsNotIn } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { OrgRole } from '@prisma/client';

export class SendOrgInvitationDto {
  @ApiProperty({ example: 'user@example.com', description: 'Email address of the invitee' })
  @IsEmail()
  email: string;

  @ApiProperty({ enum: OrgRole, description: 'Role to assign to the invitee' })
  @IsEnum(OrgRole)
  @IsNotIn([OrgRole.OWNER], { message: 'Cannot invite directly as OWNER' })
  role: OrgRole;
}
