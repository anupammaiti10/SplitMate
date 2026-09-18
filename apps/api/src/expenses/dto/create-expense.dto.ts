import { Type } from 'class-transformer';
import {
  IsArray,
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

export enum SplitType {
  EQUAL = 'EQUAL',
  EXACT = 'EXACT',
}

export class ShareDto {
  @IsString()
  userId: string;

  @IsInt()
  @Min(1)
  amount: number;
}

export class CreateExpenseDto {
  @IsString()
  @MinLength(1)
  description: string;

  @IsInt()
  @Min(1)
  amount: number;

  @IsString()
  paidById: string;

  @IsDateString()
  expenseDate: string;

  @IsEnum(SplitType)
  splitType: SplitType;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  participantIds?: string[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ShareDto)
  shares?: ShareDto[];
}
