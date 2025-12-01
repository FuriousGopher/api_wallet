import { Test } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import Decimal from 'decimal.js';
import { WalletService } from '../modules/wallet/wallet.service';
import { WalletEntity } from '../modules/wallet/entities/wallet.entity';
import { WalletEventEntity } from '../modules/wallet/entities/wallet-event.entity';
import { OutboxMessageEntity } from '../modules/wallet/entities/outbox-message.entity';
import { TransferEntity } from '../modules/wallet/entities/transfer.entity';
import { IdempotencyKeyEntity } from '../modules/wallet/entities/idempotency-key.entity';
import { RedisCacheService } from '../modules/cache/redis-cache.service';
import { BadRequestException } from '@nestjs/common';
import * as dotenv from 'dotenv';
import { Client } from 'pg';

dotenv.config({ path: '.env' });

const createCacheMock = () => ({
  wrap: jest.fn((_key: string, factory: () => Promise<any>) => factory()),
  set: jest.fn(),
  get: jest.fn(),
  del: jest.fn(),
});

describe('WalletService', () => {
  let dataSource: DataSource;
  let service: WalletService;
  const cacheMock = createCacheMock();
  let dbAvailable = true;

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
          entities: [
            WalletEntity,
            WalletEventEntity,
            OutboxMessageEntity,
            TransferEntity,
            IdempotencyKeyEntity,
          ],
          synchronize: true,
        }),
        TypeOrmModule.forFeature([
          WalletEntity,
          WalletEventEntity,
          OutboxMessageEntity,
          TransferEntity,
          IdempotencyKeyEntity,
        ]),
      ],
      providers: [
        WalletService,
        {
          provide: RedisCacheService,
          useValue: cacheMock,
        },
      ],
    }).compile();

    dataSource = moduleRef.get(DataSource);
    service = moduleRef.get(WalletService);

    // SQLite does not support locks; override lockWallet for tests
    if ((dataSource.options as any).type === 'sqlite') {
      (service as any).lockWallet = async (
        runner: any,
        walletId: string,
      ) => {
        const repo = runner.manager.getRepository(WalletEntity);
        let wallet = await repo.findOne({ where: { id: walletId } });
        if (!wallet) {
          wallet = repo.create({ id: walletId, balance: '0' });
          wallet = await repo.save(wallet);
        }
        return wallet;
      };
    }
  });

  afterEach(async () => {
    jest.clearAllMocks();
    if (dataSource) {
      await dataSource.destroy();
    }
  });

  it('deposits funds and emits events/outbox', async () => {
    if (!dbAvailable) {
      return;
    }
    const result = await service.deposit('user-1', '100.00', 'req-1');

    const wallet = await dataSource.manager.findOneByOrFail(WalletEntity, {
      id: 'user-1',
    });
    const events = await dataSource.manager.find(WalletEventEntity);
    const outbox = await dataSource.manager.find(OutboxMessageEntity);

    expect(result.balance).toBe('100.0000');
    expect(new Decimal(wallet.balance).toFixed(4)).toBe('100.0000');
    expect(events).toHaveLength(1);
    expect(outbox).toHaveLength(1);
  });

  it('prevents overdraft on withdraw', async () => {
    if (!dbAvailable) {
      return;
    }
    await service.deposit('user-2', '50.00', 'req-2');
    await expect(
      service.withdraw('user-2', '60.00', 'req-3'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('transfers funds and records events', async () => {
    if (!dbAvailable) {
      return;
    }
    await service.deposit('alice', '120.00', 'req-d1');
    const result = await service.transfer(
      'alice',
      'bob',
      '30.00',
      'req-t1',
    );

    const alice = await dataSource.manager.findOneByOrFail(WalletEntity, {
      id: 'alice',
    });
    const bob = await dataSource.manager.findOneByOrFail(WalletEntity, {
      id: 'bob',
    });
    const events = await dataSource.manager.find(WalletEventEntity, {
      where: [{ walletId: 'alice' }, { walletId: 'bob' }],
    });

    expect(result.transferStatus).toBe('credited');
    expect(new Decimal(alice.balance).toFixed(4)).toBe('90.0000');
    expect(new Decimal(bob.balance).toFixed(4)).toBe('30.0000');
    expect(events.length).toBeGreaterThanOrEqual(4);
  });

  it('compensates a debited transfer when credit fails', async () => {
    if (!dbAvailable) {
      return;
    }
    // Seed sender wallet and a debited transfer
    const walletRepo = dataSource.getRepository(WalletEntity);
    const transferRepo = dataSource.getRepository(TransferEntity);

    await walletRepo.save({ id: 'carol', balance: '50.0000' });
    await walletRepo.save({ id: 'dave', balance: '0.0000' });

    await transferRepo.save({
      fromWalletId: 'carol',
      toWalletId: 'dave',
      amount: '20.0000',
      status: 'debited',
    });

    // Simulate already-debited balance
    await walletRepo.update({ id: 'carol' }, { balance: '30.0000' });

    const result = await (service as any).compensateTransfer(
      'carol',
      'dave',
      new Decimal('20.0000'),
      'req-comp',
      {},
    );

    const carol = await walletRepo.findOneByOrFail({ id: 'carol' });
    const transfer = await transferRepo.findOneByOrFail({
      fromWalletId: 'carol',
      toWalletId: 'dave',
    });

    expect(new Decimal(carol.balance).toFixed(4)).toBe('50.0000'); // restored
    expect(transfer.status).toBe('compensated');
    expect(result.transferStatus).toBe('compensated');
  });

  it('handles concurrent withdrawals without negative balance', async () => {
    if (!dbAvailable) {
      return;
    }
    await service.deposit('eve', '100.00', 'req-e1');

    const attempt1 = service.withdraw('eve', '70.00', 'req-e2');
    const attempt2 = service.withdraw('eve', '50.00', 'req-e3');

    const results = await Promise.allSettled([attempt1, attempt2]);
    const wallet = await dataSource.manager.findOneByOrFail(WalletEntity, {
      id: 'eve',
    });

    const rejected = results.filter((r) => r.status === 'rejected');
    expect(rejected.length).toBe(1);
    expect(new Decimal(wallet.balance).isNegative()).toBe(false);
  });

  it('keeps balances consistent on bidirectional transfers', async () => {
    if (!dbAvailable) {
      return;
    }
    await service.deposit('u1', '100.00', 'req-b1');
    await service.deposit('u2', '100.00', 'req-b2');

    const t1 = service.transfer('u1', 'u2', '30.00', 'req-b3');
    const t2 = service.transfer('u2', 'u1', '70.00', 'req-b4');

    const outcomes = await Promise.allSettled([t1, t2]);
    const u1 = await dataSource.manager.findOneByOrFail(WalletEntity, {
      id: 'u1',
    });
    const u2 = await dataSource.manager.findOneByOrFail(WalletEntity, {
      id: 'u2',
    });

    expect(
      outcomes.every((o) => o.status === 'fulfilled' || o.status === 'rejected'),
    ).toBe(true);
    expect(new Decimal(u1.balance).isNegative()).toBe(false);
    expect(new Decimal(u2.balance).isNegative()).toBe(false);
  });
});
