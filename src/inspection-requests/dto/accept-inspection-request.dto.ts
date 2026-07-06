import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class AcceptInspectionRequestDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  token?: string;
}
