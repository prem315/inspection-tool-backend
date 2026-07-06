import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty } from 'class-validator';

export class DeclineInspectionRequestDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  rejectionReason: string;
}
