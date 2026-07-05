import { IsString, IsOptional, IsEnum, IsDateString, IsUUID } from 'class-validator';
import { IndustryType } from '@prisma/client';

export class CreateProjectDto {
  @IsString()
  name: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsString()
  @IsOptional()
  location?: string;

  @IsEnum(IndustryType)
  industryType: IndustryType;

  @IsDateString()
  @IsOptional()
  startDate?: string;

  @IsDateString()
  @IsOptional()
  endDate?: string;

  @IsUUID()
  @IsOptional()
  templateId?: string;
}
