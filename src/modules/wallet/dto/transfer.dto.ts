import { ApiProperty } from '@nestjs/swagger';
import {
  IsNotEmpty,
  IsNumberString,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class TransferDto {
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
    description: 'Amount to transfer, up to 4 decimals',
  })
  @IsNotEmpty()
  @IsNumberString()
  amount!: string;

  @ApiProperty({ example: 'user-456', description: 'Destination wallet ID' })
  @IsNotEmpty()
  @IsString()
  @MaxLength(128)
  toWalletId!: string;

  @ApiProperty({ required: false })
  @IsOptional()
  metadata?: Record<string, unknown>;
}
