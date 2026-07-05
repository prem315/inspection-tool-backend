import { IsString, IsOptional, Matches } from 'class-validator';

export class CreateLabelDto {
  @IsString()
  name: string;

  @IsString()
  @Matches(/^#[0-9A-Fa-f]{6}$/, { message: 'color must be a valid hex format like #FF5733' })
  color: string;

  @IsString()
  @IsOptional()
  description?: string;
}
