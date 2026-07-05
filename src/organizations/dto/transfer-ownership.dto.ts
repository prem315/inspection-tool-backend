import { IsUUID } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class TransferOwnershipDto {
  @ApiProperty({ description: 'User ID of the new owner' })
  @IsUUID()
  newOwnerUserId: string;
}
