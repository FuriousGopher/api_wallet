import { ApiProperty } from '@nestjs/swagger';
import {
  IsNotEmpty,
  IsNumberString,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class DepositDto {
  @ApiProperty({
    description: 'Idempotency key to deduplicate requests',
    required: false,
  })
  @IsOptional()
  @IsString()
  @MaxLength(128)
  idempotencyKey?: string;

  @ApiProperty({
    example: '100.00',
    description: 'Amount to deposit, up to 4 decimals',
  })
  @IsNotEmpty()
  @IsNumberString()
  amount!: string;

  @ApiProperty({ required: false })
  @IsOptional()
  metadata?: Record<string, unknown>;
}
