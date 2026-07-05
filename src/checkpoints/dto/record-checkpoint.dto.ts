import { IsString, IsOptional, IsEnum } from 'class-validator';
import { CheckpointResult } from '@prisma/client';

export class RecordCheckpointDto {
  @IsEnum(CheckpointResult)
  @IsOptional()
  result?: CheckpointResult;

  @IsString()
  @IsOptional()
  notes?: string;
}
