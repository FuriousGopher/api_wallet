import { ApiProperty } from '@nestjs/swagger';
import {
  IsNotEmpty,
  IsNumberString,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class WithdrawDto {
  @ApiProperty({
    description: 'Idempotency key to deduplicate requests',
    required: false,
  })
  @IsOptional()
  @IsString()
  @MaxLength(128)
  idempotencyKey?: string;

  @ApiProperty({
    example: '50.00',
    description: 'Amount to withdraw, up to 4 decimals',
  })
  @IsNotEmpty()
  @IsNumberString()
  amount!: string;

  @ApiProperty({ required: false })
  @IsOptional()
  metadata?: Record<string, unknown>;
}
