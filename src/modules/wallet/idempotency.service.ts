import {
  Injectable,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { createHash } from 'crypto';
import {
  IdempotencyKeyEntity,
  IdempotencyStatus,
} from './entities/idempotency-key.entity';

export interface IdempotencyRecord<T = unknown> {
  status: IdempotencyStatus;
  responseStatus?: number | null;
  responseBody?: T | null;
}

@Injectable()
export class IdempotencyService {
  constructor(
    @InjectRepository(IdempotencyKeyEntity)
    private readonly repo: Repository<IdempotencyKeyEntity>,
  ) {}

  hashPayload(payload: unknown): string {
    const normalized =
      typeof payload === 'string' ? payload : JSON.stringify(payload ?? {});
    return createHash('sha256').update(normalized).digest('hex');
  }

  async begin(key?: string, requestHash?: string): Promise<void> {
    if (!key) {
      throw new BadRequestException('Idempotency key is required');
    }

    const existing = await this.repo.findOne({ where: { id: key } });
    if (existing) {
      if (
        requestHash &&
        existing.requestHash &&
        existing.requestHash !== requestHash
      ) {
        throw new ConflictException(
          'Idempotency key was used with a different payload',
        );
      }
      if (existing.status === 'processing') {
        throw new ConflictException('Request is already processing');
      }
      if (existing.status === 'completed') {
        throw new ConflictException('Request already completed');
      }
    }

    const record = this.repo.create({
      id: key,
      status: 'processing',
      requestHash: requestHash ?? null,
      lockedAt: new Date(),
    });
    await this.repo.save(record);
  }

  async finalize<T = unknown>(
    key: string | undefined,
    responseStatus: number,
    responseBody: T,
  ): Promise<void> {
    if (!key) return;

    await this.repo.update(
      { id: key },
      {
        status: 'completed',
        responseStatus,
        responseBody: responseBody as unknown as Record<string, unknown>,
        lockedAt: null,
      },
    );
  }

  async get<T = unknown>(
    key?: string,
    requestHash?: string,
  ): Promise<IdempotencyRecord<T> | null> {
    if (!key) return null;
    const record = await this.repo.findOne({ where: { id: key } });
    if (!record) return null;
    if (
      requestHash &&
      record.requestHash &&
      record.requestHash !== requestHash
    ) {
      throw new ConflictException(
        'Idempotency key was used with a different payload',
      );
    }
    return {
      status: record.status,
      responseStatus: record.responseStatus,
      responseBody: record.responseBody as T | null,
    };
  }
}
