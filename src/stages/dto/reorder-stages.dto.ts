import { IsArray, IsUUID } from 'class-validator';

export class ReorderStagesDto {
  @IsArray()
  @IsUUID('4', { each: true })
  stageIds: string[];
}
