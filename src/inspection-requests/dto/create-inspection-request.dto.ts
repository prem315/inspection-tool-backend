import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsEmail, IsUUID, IsDateString, IsArray } from 'class-validator';

export class CreateInspectionRequestDto {
  @ApiProperty()
  @IsUUID()
  stageId: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  inspectorId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEmail()
  inspectorEmail?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  deadlineStart?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  deadlineEnd?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsArray()
  @IsUUID(4, { each: true })
  checkpointIds?: string[];
}
