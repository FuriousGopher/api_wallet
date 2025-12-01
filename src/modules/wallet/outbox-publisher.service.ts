import {
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { ClientProxy } from '@nestjs/microservices';
import { DataSource } from 'typeorm';
import { lastValueFrom } from 'rxjs';
import { OutboxMessageEntity } from './entities/outbox-message.entity';
import { RMQ_CLIENT } from '../messaging/rmq.module';

const DEFAULT_BATCH_SIZE = 50;
const DEFAULT_INTERVAL_MS = 1000;
const MAX_ATTEMPTS_BEFORE_FAILURE = 10;

@Injectable()
export class OutboxPublisherService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(OutboxPublisherService.name);
  private timer: NodeJS.Timeout | null = null;
  private enabled = true;

  constructor(
    @Inject(RMQ_CLIENT) private readonly client: ClientProxy,
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

  onModuleInit() {
    const envVal = process.env.OUTBOX_ENABLED;
    this.enabled = envVal ? envVal.toLowerCase() !== 'false' : true;

    if (this.enabled) {
      this.timer = setInterval(() => {
        void this.safePublishCycle();
      }, DEFAULT_INTERVAL_MS);
    } else {
      this.logger.warn('Outbox publisher disabled via OUTBOX_ENABLED=false');
    }
  }

  onModuleDestroy() {
    if (this.timer) {
      clearInterval(this.timer);
    }
  }

  async publishPending(batchSize = DEFAULT_BATCH_SIZE): Promise<void> {
    const runner = this.dataSource.createQueryRunner();
    await runner.connect();
    await runner.startTransaction();

    try {
      const messages = await runner.manager
        .getRepository(OutboxMessageEntity)
        .createQueryBuilder('msg')
        .where('msg.status = :status', { status: 'pending' })
        .andWhere('(msg.nextAttemptAt IS NULL OR msg.nextAttemptAt <= now())')
        .orderBy('msg.createdAt', 'ASC')
        .limit(batchSize)
        .setLock('pessimistic_write')
        .setOnLocked('skip_locked')
        .getMany();

      if (messages.length === 0) {
        await runner.commitTransaction();
        return;
      }

      for (const msg of messages) {
        msg.attempts += 1;
      }

      await runner.manager.save(OutboxMessageEntity, messages);
      await runner.commitTransaction();

      for (const message of messages) {
        await this.publishMessage(message);
      }
    } catch (error) {
      await runner.rollbackTransaction();
      this.logger.error(
        `Failed to load outbox batch: ${
          error instanceof Error ? error.message : 'unknown error'
        }`,
      );
    } finally {
      await runner.release();
    }
  }

  private async publishMessage(message: OutboxMessageEntity): Promise<void> {
    try {
      await lastValueFrom(this.client.emit(message.eventType, message.payload));

      await this.dataSource.manager.update(
        OutboxMessageEntity,
        { id: message.id },
        {
          status: 'published',
          publishedAt: new Date(),
          nextAttemptAt: null,
          lastError: null,
        },
      );
    } catch (error) {
      const messageError =
        error instanceof Error ? error.message : 'unknown error';
      const attempts = message.attempts ?? 0;
      const nextDelayMs = this.calculateBackoff(attempts);
      const nextAttemptAt = new Date(Date.now() + nextDelayMs);
      const status =
        attempts >= MAX_ATTEMPTS_BEFORE_FAILURE ? 'failed' : 'pending';

      await this.dataSource.manager.update(
        OutboxMessageEntity,
        { id: message.id },
        {
          status,
          nextAttemptAt,
          lastError: messageError,
        },
      );

      this.logger.warn(
        `Publish failed for outbox message ${message.id} (attempt ${attempts}): ${messageError}`,
      );
    }
  }

  private calculateBackoff(attempts: number): number {
    const baseDelay = 1000;
    const maxDelay = 30000;
    const delay = baseDelay * Math.pow(2, Math.max(0, attempts - 1));
    return Math.min(delay, maxDelay);
  }

  private async safePublishCycle(): Promise<void> {
    try {
      await this.publishPending();
    } catch (error) {
      this.logger.error(
        `Outbox publish cycle failed: ${
          error instanceof Error ? error.message : 'unknown error'
        }`,
      );
    }
  }
}
