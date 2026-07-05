import { IsString, IsEmail, IsEnum } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export enum Portal {
  WEB = 'WEB',
  MOBILE = 'MOBILE',
  ADMIN = 'ADMIN',
}

export class LoginDto {
  @ApiProperty({ example: 'john@example.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'StrongP@ss1' })
  @IsString()
  password: string;

  @ApiProperty({ enum: Portal, example: Portal.WEB })
  @IsEnum(Portal)
  portal: Portal;
}
