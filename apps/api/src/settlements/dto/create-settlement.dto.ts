import { IsInt, IsNotEmpty, IsString, Min } from 'class-validator';

export class CreateSettlementDto {
  @IsString()
  @IsNotEmpty()
  toUserId: string;

  @IsInt()
  @Min(1)
  amount: number;
}
