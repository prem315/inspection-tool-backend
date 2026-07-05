import { IsEnum, IsNotIn } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { OrgRole } from '@prisma/client';

export class UpdateMemberRoleDto {
  @ApiProperty({ enum: OrgRole, description: 'The new role for the member' })
  @IsEnum(OrgRole)
  @IsNotIn([OrgRole.OWNER], { message: 'Cannot assign OWNER role this way. Transfer ownership instead.' })
  role: OrgRole;
}
