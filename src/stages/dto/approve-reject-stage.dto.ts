import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsOptional } from 'class-validator';

export class RejectStageDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  comments: string;
}

export class ApproveStageDto {
  @ApiProperty()
  @IsOptional()
  @IsString()
  comments?: string;
}
