import { IsString, IsOptional, IsInt } from 'class-validator';

export class CreateCheckpointDto {
  @IsString()
  title: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsString()
  @IsOptional()
  standardReference?: string;

  @IsInt()
  displayOrder: number;
}
