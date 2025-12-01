import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, QueryRunner } from 'typeorm';
import Decimal from 'decimal.js';
import { RedisCacheService } from '../cache/redis-cache.service';
import { WalletEntity } from './entities/wallet.entity';
import { WalletEventEntity } from './entities/wallet-event.entity';
import { OutboxMessageEntity } from './entities/outbox-message.entity';
import { TransferEntity, TransferStatus } from './entities/transfer.entity';

export interface WalletCommandResult {
  walletId: string;
  balance: string;
  events: WalletEventEntity[];
}

export interface TransferCommandResult extends WalletCommandResult {
  toWalletId: string;
  transferId: string;
  transferStatus: TransferStatus;
}

const normalizeAmount = (amount: string | number): Decimal => {
  try {
    const dec = new Decimal(amount);
    if (dec.lte(0)) {
      throw new Error('Amount must be greater than zero');
    }
    return dec.toDecimalPlaces(4, Decimal.ROUND_HALF_UP);
  } catch (error) {
    throw new BadRequestException(
      `Invalid amount: ${error instanceof Error ? error.message : 'unknown'}`,
    );
  }
};

const orderWalletIds = (a: string, b: string): [string, string] =>
  a <= b ? [a, b] : [b, a];

@Injectable()
export class WalletService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly cache: RedisCacheService,
  ) {}

  async deposit(
    walletId: string,
    amount: string | number,
    requestId?: string,
    metadata?: Record<string, unknown>,
  ): Promise<WalletCommandResult> {
    const normalizedAmount = normalizeAmount(amount);
    const runner = this.dataSource.createQueryRunner();
    await runner.connect();
    await runner.startTransaction();

    try {
      const wallet = await this.lockWallet(runner, walletId);
      wallet.balance = new Decimal(wallet.balance || 0)
        .plus(normalizedAmount)
        .toFixed(4);

      const event = this.createEvent(
        walletId,
        'FundsDeposited',
        normalizedAmount,
        requestId,
        metadata,
      );

      await runner.manager.save(WalletEntity, wallet);
      await runner.manager.save(WalletEventEntity, event);
      await this.enqueueOutbox(runner, event.eventType, {
        walletId,
        amount: normalizedAmount.toString(),
        requestId,
        metadata,
        eventId: event.id,
      });

      await runner.commitTransaction();
      return { walletId, balance: wallet.balance, events: [event] };
    } catch (error) {
      await runner.rollbackTransaction();
      throw error;
    } finally {
      await runner.release();
    }
  }

  async withdraw(
    walletId: string,
    amount: string | number,
    requestId?: string,
    metadata?: Record<string, unknown>,
  ): Promise<WalletCommandResult> {
    const normalizedAmount = normalizeAmount(amount);
    const runner = this.dataSource.createQueryRunner();
    await runner.connect();
    await runner.startTransaction();

    try {
      const wallet = await this.lockWallet(runner, walletId);
      const balance = new Decimal(wallet.balance || 0);

      if (balance.lt(normalizedAmount)) {
        throw new BadRequestException('Insufficient funds');
      }

      wallet.balance = balance.minus(normalizedAmount).toFixed(4);

      const event = this.createEvent(
        walletId,
        'FundsWithdrawn',
        normalizedAmount,
        requestId,
        metadata,
      );

      await runner.manager.save(WalletEntity, wallet);
      await runner.manager.save(WalletEventEntity, event);
      await this.enqueueOutbox(runner, event.eventType, {
        walletId,
        amount: normalizedAmount.toString(),
        requestId,
        metadata,
        eventId: event.id,
      });

      await runner.commitTransaction();
      return { walletId, balance: wallet.balance, events: [event] };
    } catch (error) {
      await runner.rollbackTransaction();
      throw error;
    } finally {
      await runner.release();
    }
  }

  async transfer(
    fromWalletId: string,
    toWalletId: string,
    amount: string | number,
    requestId?: string,
    metadata?: Record<string, unknown>,
  ): Promise<TransferCommandResult> {
    if (fromWalletId === toWalletId) {
      throw new BadRequestException('Cannot transfer to the same wallet');
    }

    const normalizedAmount = normalizeAmount(amount);
    const runner = this.dataSource.createQueryRunner();
    await runner.connect();
    await runner.startTransaction();

    try {
      const [firstId, secondId] = orderWalletIds(fromWalletId, toWalletId);
      const firstWallet = await this.lockWallet(runner, firstId);
      const secondWallet = await this.lockWallet(runner, secondId);

      const fromWallet =
        firstWallet.id === fromWalletId ? firstWallet : secondWallet;
      const toWallet =
        firstWallet.id === fromWalletId ? secondWallet : firstWallet;

      const fromBalance = new Decimal(fromWallet.balance || 0);
      if (fromBalance.lt(normalizedAmount)) {
        throw new BadRequestException('Insufficient funds for transfer');
      }

      const transfer = runner.manager.create(TransferEntity, {
        fromWalletId,
        toWalletId,
        amount: normalizedAmount.toString(),
        status: 'initiated',
        requestId,
      });

      const events: WalletEventEntity[] = [
        this.createEvent(
          fromWalletId,
          'TransferInitiated',
          normalizedAmount,
          requestId,
          metadata,
        ),
      ];

      await runner.manager.save(TransferEntity, transfer);
      await runner.manager.save(WalletEventEntity, events);
      await this.enqueueOutbox(runner, 'TransferInitiated', {
        transferId: transfer.id,
        walletId: fromWalletId,
        toWalletId,
        amount: normalizedAmount.toString(),
        requestId,
        metadata,
        eventId: events[0]?.id,
      });

      // Debit step
      fromWallet.balance = fromBalance.minus(normalizedAmount).toFixed(4);
      transfer.status = 'debited';

      const debitEvent = this.createEvent(
        fromWalletId,
        'FundsWithdrawn',
        normalizedAmount,
        requestId,
        metadata,
      );

      // Credit step
      toWallet.balance = new Decimal(toWallet.balance || 0)
        .plus(normalizedAmount)
        .toFixed(4);
      transfer.status = 'credited';

      const creditEvent = this.createEvent(
        toWalletId,
        'FundsDeposited',
        normalizedAmount,
        requestId,
        metadata,
      );
      const completedEvent = this.createEvent(
        fromWalletId,
        'TransferCompleted',
        normalizedAmount,
        requestId,
        { ...metadata, toWalletId },
      );

      events.push(debitEvent, creditEvent, completedEvent);

      await runner.manager.save(WalletEntity, [fromWallet, toWallet]);
      await runner.manager.save(TransferEntity, transfer);
      await runner.manager.save(WalletEventEntity, [
        debitEvent,
        creditEvent,
        completedEvent,
      ]);

      for (const event of [debitEvent, creditEvent, completedEvent]) {
        await this.enqueueOutbox(runner, event.eventType, {
          walletId: event.walletId,
          amount: event.amount,
          requestId,
          metadata,
          eventId: event.id,
          transferId: transfer.id,
          toWalletId,
        });
      }

      await runner.commitTransaction();
      return {
        walletId: fromWalletId,
        toWalletId,
        balance: fromWallet.balance,
        events,
        transferId: transfer.id,
        transferStatus: transfer.status,
      };
    } catch (error) {
      await runner.rollbackTransaction();
      // Compensation path for partial transfer (if debit succeeded but credit failed)
      return this.compensateTransfer(
        fromWalletId,
        toWalletId,
        normalizedAmount,
        requestId,
        metadata,
      );
    } finally {
      await runner.release();
    }
  }

  private createEvent(
    walletId: string,
    eventType: string,
    amount: Decimal,
    requestId?: string,
    metadata?: Record<string, unknown>,
  ): WalletEventEntity {
    return {
      walletId,
      eventType,
      amount: amount.toFixed(4),
      requestId: requestId ?? null,
      metadata: metadata ?? null,
    } as WalletEventEntity;
  }

  private supportsPessimisticLock(): boolean {
    const type = (this.dataSource.options as any)?.type;
    return type !== 'sqlite' && type !== 'sqljs';
  }

  private async lockWallet(
    runner: QueryRunner,
    walletId: string,
  ): Promise<WalletEntity> {
    const repo = runner.manager.getRepository(WalletEntity);
    const lockOptions = this.supportsPessimisticLock()
      ? { lock: { mode: 'pessimistic_write' as const } }
      : {};

    // Try to fetch with lock first
    let wallet = await repo.findOne({
      where: { id: walletId },
      ...lockOptions,
    });

    if (!wallet) {
      // Insert if missing; ignore conflict if another request created it concurrently
      await repo
        .createQueryBuilder()
        .insert()
        .into(WalletEntity)
        .values({ id: walletId, balance: '0' })
        .orIgnore()
        .execute();

      wallet = await repo.findOne({
        where: { id: walletId },
        ...lockOptions,
      });
    }

    if (!wallet) {
      throw new Error(`Failed to load or create wallet ${walletId}`);
    }

    return wallet;
  }

  private async enqueueOutbox(
    runner: QueryRunner,
    eventType: string,
    payload: Record<string, unknown>,
  ): Promise<void> {
    const message = runner.manager.create(OutboxMessageEntity, {
      eventType,
      payload,
      status: 'pending',
      attempts: 0,
    });

    await runner.manager.save(OutboxMessageEntity, message);
  }

  private async compensateTransfer(
    fromWalletId: string,
    toWalletId: string,
    amount: Decimal,
    requestId?: string,
    metadata?: Record<string, unknown>,
  ): Promise<TransferCommandResult> {
    const runner = this.dataSource.createQueryRunner();
    await runner.connect();
    await runner.startTransaction();

    try {
      const [firstId, secondId] = orderWalletIds(fromWalletId, toWalletId);
      const firstWallet = await this.lockWallet(runner, firstId);
      const secondWallet = await this.lockWallet(runner, secondId);

      const fromWallet =
        firstWallet.id === fromWalletId ? firstWallet : secondWallet;

      const transferRepo = runner.manager.getRepository(TransferEntity);
      const transfer = await transferRepo.findOne({
        where: {
          fromWalletId,
          toWalletId,
          amount: amount.toString(),
          status: 'debited',
        },
        ...(this.supportsPessimisticLock()
          ? { lock: { mode: 'pessimistic_write' as const } }
          : {}),
      });

      if (!transfer) {
        // No debited transfer found; return current balance
        await runner.commitTransaction();
        return {
          walletId: fromWalletId,
          toWalletId,
          balance: fromWallet.balance,
          events: [],
          transferId: '',
          transferStatus: 'failed',
        };
      }

      // Idempotent compensation: only add back if not yet compensated
      if (transfer.status !== 'compensated') {
        fromWallet.balance = new Decimal(fromWallet.balance || 0)
          .plus(amount)
          .toFixed(4);
        transfer.status = 'compensated';
        transfer.failureReason = 'credit_failed';

        const failedEvent = this.createEvent(
          fromWalletId,
          'TransferFailed',
          amount,
          requestId,
          { ...metadata, toWalletId },
        );
        const compensatedEvent = this.createEvent(
          fromWalletId,
          'TransferCompensated',
          amount,
          requestId,
          { ...metadata, toWalletId },
        );

        await runner.manager.save(WalletEntity, fromWallet);
        await runner.manager.save(TransferEntity, transfer);
        await runner.manager.save(WalletEventEntity, [
          failedEvent,
          compensatedEvent,
        ]);
        await this.enqueueOutbox(runner, failedEvent.eventType, {
          walletId: fromWalletId,
          amount: amount.toString(),
          requestId,
          metadata,
          transferId: transfer.id,
          toWalletId,
          eventId: failedEvent.id,
        });
        await this.enqueueOutbox(runner, compensatedEvent.eventType, {
          walletId: fromWalletId,
          amount: amount.toString(),
          requestId,
          metadata,
          transferId: transfer.id,
          toWalletId,
          eventId: compensatedEvent.id,
        });
      }

      await runner.commitTransaction();

      return {
        walletId: fromWalletId,
        toWalletId,
        balance: fromWallet.balance,
        events: [],
        transferId: transfer.id,
        transferStatus: transfer.status,
      };
    } catch (compError) {
      await runner.rollbackTransaction();
      throw compError;
    } finally {
      await runner.release();
    }
  }

  async getBalance(
    walletId: string,
  ): Promise<{ walletId: string; balance: string }> {
    const cacheKey = `wallet:balance:${walletId}`;
    return this.cache.wrap(cacheKey, async () => {
      const wallet = await this.dataSource.manager.findOne(WalletEntity, {
        where: { id: walletId },
      });

      return {
        walletId,
        balance: wallet?.balance ?? '0.0000',
      };
    });
  }

  async getHistory(
    walletId: string,
    options?: { offset?: number; limit?: number },
  ): Promise<WalletEventEntity[]> {
    const offset = options?.offset ?? 0;
    const limit = Math.min(options?.limit ?? 50, 200);

    return this.dataSource.manager
      .getRepository(WalletEventEntity)
      .createQueryBuilder('evt')
      .where('evt.walletId = :walletId', { walletId })
      .orderBy('evt.createdAt', 'DESC')
      .offset(offset)
      .limit(limit)
      .getMany();
  }
}
