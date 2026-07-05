import { IsOptional, IsEnum, IsBoolean, IsString, MinLength } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { PlanTier } from '@prisma/client';

export class AdminUpdateOrgDto {
  @ApiPropertyOptional({ enum: PlanTier, description: 'Update plan tier' })
  @IsOptional()
  @IsEnum(PlanTier)
  plan?: PlanTier;

  @ApiPropertyOptional({ description: 'Update active status' })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({ description: 'Update organization name', minLength: 2 })
  @IsOptional()
  @IsString()
  @MinLength(2)
  name?: string;
}
