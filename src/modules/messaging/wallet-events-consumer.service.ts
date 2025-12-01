import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import Decimal from 'decimal.js';
import { ConsumedEventEntity } from './entities/consumed-event.entity';
import { WalletAnalyticsEntity } from './entities/wallet-analytics.entity';

type WalletEventPayload = {
  eventId?: string;
  eventType?: string;
  walletId?: string;
  toWalletId?: string;
  transferId?: string;
  amount?: string | number;
  requestId?: string;
  metadata?: Record<string, unknown>;
};

const NUMERIC_TO_DECIMAL = (value?: string | number | null): Decimal =>
  new Decimal(value ?? 0);

@Injectable()
export class WalletEventsConsumerService {
  private readonly logger = new Logger(WalletEventsConsumerService.name);
  private readonly highAmountThreshold = new Decimal(10000); // flag very large single operations
  private readonly rapidWithdrawalThreshold = new Decimal(5000); // flag high-volume withdrawals in a session

  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async handleEvent(payload: WalletEventPayload): Promise<void> {
    const eventId = payload.eventId;
    const eventType = payload.eventType;
    if (!eventId || !eventType) {
      this.logger.warn('Skipping event without id or type');
      return;
    }

    const isDuplicate = await this.isAlreadyProcessed(eventId);
    if (isDuplicate) {
      return;
    }

    try {
      switch (eventType) {
        case 'FundsDeposited':
          await this.applyDeposit(payload);
          break;
        case 'FundsWithdrawn':
          await this.applyWithdrawal(payload);
          break;
        default:
          break; // ignore other events for analytics
      }
      await this.markProcessed(eventId, eventType);
    } catch (error) {
      this.logger.error(
        `Failed processing event ${eventId}: ${
          error instanceof Error ? error.message : 'unknown'
        }`,
      );
      throw error;
    }
  }

  private async applyDeposit(payload: WalletEventPayload): Promise<void> {
    const walletId = payload.walletId;
    if (!walletId) return;

    const amount = NUMERIC_TO_DECIMAL(payload.amount);
    await this.dataSource.manager.transaction(async (manager) => {
      const analytics =
        (await manager.findOne(WalletAnalyticsEntity, {
          where: { walletId },
          lock: { mode: 'pessimistic_write' },
        })) || manager.create(WalletAnalyticsEntity, { walletId });

      analytics.totalDeposited = analytics.totalDeposited ?? '0';
      analytics.depositsCount = analytics.depositsCount ?? 0;

      analytics.totalDeposited = NUMERIC_TO_DECIMAL(analytics.totalDeposited)
        .plus(amount)
        .toFixed(4);
      analytics.depositsCount = (analytics.depositsCount ?? 0) + 1;
      await manager.save(WalletAnalyticsEntity, analytics);
    });
  }

  private async applyWithdrawal(payload: WalletEventPayload): Promise<void> {
    const walletId = payload.walletId;
    if (!walletId) return;

    const amount = NUMERIC_TO_DECIMAL(payload.amount);
    await this.dataSource.manager.transaction(async (manager) => {
      const analytics =
        (await manager.findOne(WalletAnalyticsEntity, {
          where: { walletId },
          lock: { mode: 'pessimistic_write' },
        })) || manager.create(WalletAnalyticsEntity, { walletId });

      analytics.totalWithdrawn = analytics.totalWithdrawn ?? '0';
      analytics.withdrawalsCount = analytics.withdrawalsCount ?? 0;

      analytics.totalWithdrawn = NUMERIC_TO_DECIMAL(analytics.totalWithdrawn)
        .plus(amount)
        .toFixed(4);
      analytics.withdrawalsCount = (analytics.withdrawalsCount ?? 0) + 1;

      if (amount.greaterThanOrEqualTo(this.highAmountThreshold)) {
        analytics.flaggedForReview = true;
      }

      // Simple heuristic: flag if withdrawals exceed threshold within rolling count
      if (
        NUMERIC_TO_DECIMAL(analytics.totalWithdrawn).greaterThanOrEqualTo(
          this.rapidWithdrawalThreshold,
        )
      ) {
        analytics.flaggedForReview = true;
      }

      await manager.save(WalletAnalyticsEntity, analytics);
    });
  }

  private async isAlreadyProcessed(eventId: string): Promise<boolean> {
    const existing = await this.dataSource.manager.findOne(
      ConsumedEventEntity,
      {
        where: { eventId },
      },
    );

    return Boolean(existing);
  }

  private async markProcessed(
    eventId: string,
    eventType: string,
  ): Promise<void> {
    await this.dataSource.manager.save(ConsumedEventEntity, {
      eventId,
      eventType,
    });
  }
}
