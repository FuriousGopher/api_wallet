import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { DataSource, LessThan } from 'typeorm';
import { IdempotencyKeyEntity } from './entities/idempotency-key.entity';

const DEFAULT_TTL_HOURS = 48;
const CLEANUP_INTERVAL_MS = 60 * 60 * 1000; // hourly

@Injectable()
export class IdempotencyCleanupService
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(IdempotencyCleanupService.name);
  private timer: NodeJS.Timeout | null = null;
  private readonly ttlMs: number;

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly configService: ConfigService,
  ) {
    const ttlHours = Number(
      this.configService.get<string>('IDEMPOTENCY_TTL_HOURS') ??
        DEFAULT_TTL_HOURS,
    );
    this.ttlMs =
      Number.isFinite(ttlHours) && ttlHours > 0
        ? ttlHours * 60 * 60 * 1000
        : DEFAULT_TTL_HOURS * 60 * 60 * 1000;
  }

  onModuleInit() {
    this.timer = setInterval(() => {
      void this.cleanupExpired();
    }, CLEANUP_INTERVAL_MS);
  }

  onModuleDestroy() {
    if (this.timer) {
      clearInterval(this.timer);
    }
  }

  async cleanupExpired(): Promise<void> {
    const cutoff = new Date(Date.now() - this.ttlMs);
    try {
      const result = await this.dataSource.manager.delete(
        IdempotencyKeyEntity,
        {
          updatedAt: LessThan(cutoff),
        },
      );
      if (result.affected && result.affected > 0) {
        this.logger.log(`Cleaned ${result.affected} expired idempotency keys`);
      }
    } catch (error) {
      this.logger.error(
        `Failed to cleanup idempotency keys: ${
          error instanceof Error ? error.message : 'unknown'
        }`,
      );
    }
  }
}
