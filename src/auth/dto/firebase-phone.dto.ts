import { IsString, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class FirebasePhoneDto {
  @ApiProperty({ description: 'Firebase ID token from mobile client' })
  @IsString()
  @IsNotEmpty()
  idToken: string;
}
