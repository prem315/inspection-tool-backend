import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty } from 'class-validator';

export class RejectCheckpointDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  comments: string;
}
