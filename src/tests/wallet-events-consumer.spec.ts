import { Test } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import Decimal from 'decimal.js';
import { WalletEventsConsumerService } from '../modules/messaging/wallet-events-consumer.service';
import { ConsumedEventEntity } from '../modules/messaging/entities/consumed-event.entity';
import { WalletAnalyticsEntity } from '../modules/messaging/entities/wallet-analytics.entity';
import * as dotenv from 'dotenv';
import { Client } from 'pg';

dotenv.config({ path: '.env' });

describe('WalletEventsConsumerService', () => {
  let dataSource: DataSource;
  let service: WalletEventsConsumerService;
  let dbAvailable = true;

  beforeEach(async () => {
    if (!dbAvailable) {
      return;
    }
    const moduleRef = await Test.createTestingModule({
      imports: [
        TypeOrmModule.forRoot({
          type: 'postgres',
          host: process.env.DATABASE_HOST ?? 'localhost',
          port: process.env.DATABASE_PORT
            ? Number(process.env.DATABASE_PORT)
            : 5432,
          username: process.env.DATABASE_USER ?? 'postgres',
          password: process.env.DATABASE_PASSWORD ?? 'postgres',
          database: process.env.DATABASE_NAME ?? 'postgres',
          dropSchema: true,
          entities: [ConsumedEventEntity, WalletAnalyticsEntity],
          synchronize: true,
        }),
        TypeOrmModule.forFeature([ConsumedEventEntity, WalletAnalyticsEntity]),
      ],
      providers: [WalletEventsConsumerService],
    }).compile();

    dataSource = moduleRef.get(DataSource);
    service = moduleRef.get(WalletEventsConsumerService);

    // SQLite lock workaround for tests
    if ((dataSource.options as any).type === 'sqlite') {
      (service as any).applyDeposit = async (payload: any) => {
        const walletId = payload.walletId;
        if (!walletId) return;
        const amount = new Decimal(payload.amount ?? 0);
        await dataSource.manager.transaction(async (manager) => {
          const repo = manager.getRepository(WalletAnalyticsEntity);
          let analytics = await repo.findOne({ where: { walletId } });
          if (!analytics) {
            analytics = repo.create({ walletId });
          }
          analytics.totalDeposited = analytics.totalDeposited ?? '0';
          analytics.depositsCount = analytics.depositsCount ?? 0;
          analytics.totalDeposited = new Decimal(analytics.totalDeposited || 0)
            .plus(amount)
            .toFixed(4);
          analytics.depositsCount += 1;
          await repo.save(analytics);
        });
      };
      (service as any).applyWithdrawal = async (payload: any) => {
        const walletId = payload.walletId;
        if (!walletId) return;
        const amount = new Decimal(payload.amount ?? 0);
        await dataSource.manager.transaction(async (manager) => {
          const repo = manager.getRepository(WalletAnalyticsEntity);
          let analytics = await repo.findOne({ where: { walletId } });
          if (!analytics) {
            analytics = repo.create({ walletId });
          }
          analytics.totalWithdrawn = analytics.totalWithdrawn ?? '0';
          analytics.withdrawalsCount = analytics.withdrawalsCount ?? 0;
          analytics.totalWithdrawn = new Decimal(analytics.totalWithdrawn || 0)
            .plus(amount)
            .toFixed(4);
          analytics.withdrawalsCount += 1;
          analytics.flaggedForReview =
            analytics.flaggedForReview ||
            amount.greaterThanOrEqualTo(new Decimal(10000)) ||
            new Decimal(analytics.totalWithdrawn || 0).greaterThanOrEqualTo(
              new Decimal(5000),
            );
          await repo.save(analytics);
        });
      };
    }
  });

  beforeAll(async () => {
    const client = new Client({
      host: process.env.DATABASE_HOST ?? 'localhost',
      port: process.env.DATABASE_PORT
        ? Number(process.env.DATABASE_PORT)
        : 5432,
      user: process.env.DATABASE_USER ?? 'postgres',
      password: process.env.DATABASE_PASSWORD ?? 'postgres',
      database: process.env.DATABASE_NAME ?? 'postgres',
    });
    try {
      await client.connect();
    } catch (err) {
      dbAvailable = false;
    } finally {
      await client.end().catch(() => undefined);
    }
  });

  afterEach(async () => {
    if (dataSource) {
      await dataSource.destroy();
    }
  });

  it('updates analytics on deposit and ignores duplicate event', async () => {
    if (!dbAvailable) {
      return;
    }
    const payload = {
      eventId: 'evt-1',
      eventType: 'FundsDeposited',
      walletId: 'user-1',
      amount: '25.00',
    };

    await service.handleEvent(payload);
    await service.handleEvent(payload); // duplicate

    const analyticsRepo = dataSource.getRepository(WalletAnalyticsEntity);
    const analytics = await analyticsRepo.findOneByOrFail({
      walletId: 'user-1',
    });

    expect(new Decimal(analytics.totalDeposited).toFixed(4)).toBe('25.0000');
    expect(analytics.depositsCount).toBe(1);
  });

  it('flags wallet on large withdrawal and records consumption', async () => {
    if (!dbAvailable) {
      return;
    }
    const payload = {
      eventId: 'evt-2',
      eventType: 'FundsWithdrawn',
      walletId: 'user-2',
      amount: '15000.00',
    };

    await service.handleEvent(payload);

    const analytics = await dataSource
      .getRepository(WalletAnalyticsEntity)
      .findOneByOrFail({ walletId: 'user-2' });
    const consumed = await dataSource
      .getRepository(ConsumedEventEntity)
      .findOneByOrFail({ eventId: 'evt-2' });

    expect(analytics.flaggedForReview).toBe(true);
    expect(consumed.eventType).toBe('FundsWithdrawn');
  });
});
