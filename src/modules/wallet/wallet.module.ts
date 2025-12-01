import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WalletEntity } from './entities/wallet.entity';
import { WalletEventEntity } from './entities/wallet-event.entity';
import { OutboxMessageEntity } from './entities/outbox-message.entity';
import { TransferEntity } from './entities/transfer.entity';
import { IdempotencyKeyEntity } from './entities/idempotency-key.entity';
import { WalletService } from './wallet.service';
import { OutboxPublisherService } from './outbox-publisher.service';
import { WalletController } from './wallet.controller';
import { IdempotencyService } from './idempotency.service';
import { IdempotencyCleanupService } from './idempotency-cleanup.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      WalletEntity,
      WalletEventEntity,
      OutboxMessageEntity,
      TransferEntity,
      IdempotencyKeyEntity,
    ]),
  ],
  controllers: [WalletController],
  providers: [
    WalletService,
    OutboxPublisherService,
    IdempotencyService,
    IdempotencyCleanupService,
  ],
  exports: [WalletService, OutboxPublisherService, IdempotencyService],
})
export class WalletModule {}
