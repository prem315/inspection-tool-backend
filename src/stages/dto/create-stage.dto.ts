import { IsString, IsOptional, IsInt } from 'class-validator';

export class CreateStageDto {
  @IsString()
  name: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsInt()
  displayOrder: number;
}
