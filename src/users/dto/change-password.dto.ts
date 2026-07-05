import { IsString, MinLength, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ChangePasswordDto {
  @ApiProperty()
  @IsString()
  currentPassword: string;

  @ApiProperty({ example: 'NewStr0ngP@ss' })
  @IsString()
  @MinLength(8)
  @MaxLength(72)
  newPassword: string;
}
