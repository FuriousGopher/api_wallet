import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Cache } from 'cache-manager';
import Redis from 'ioredis';

@Injectable()
export class RedisCacheService {
  private readonly ttl: number;
  private readonly prefix: string;
  private readonly logger = new Logger(RedisCacheService.name);
  private readonly redisHealthClient: Redis;

  constructor(
    @Inject(CACHE_MANAGER) private readonly cacheManager: Cache,
    private readonly configService: ConfigService,
  ) {
    this.ttl = parseInt(
      this.configService.get<string>('REDIS_TTL') ?? '600',
      10,
    );
    this.prefix = this.configService.get<string>('CACHE_PREFIX') ?? 'cache';

    const host = this.configService.get<string>('REDIS_HOST') ?? '127.0.0.1';
    const port = parseInt(
      this.configService.get<string>('REDIS_PORT') ?? '6379',
      10,
    );
    const db = parseInt(this.configService.get<string>('REDIS_DB') ?? '0', 10);

    this.redisHealthClient = new Redis({
      host,
      port,
      db,
      username: this.configService.get<string>('REDIS_USER') || undefined,
      password: this.configService.get<string>('REDIS_PASSWORD') || undefined,
    });
  }

  private buildKey(key: string): string {
    return `${this.prefix}:${key}`;
  }

  async get<T>(key: string): Promise<T | null> {
    const value = await this.cacheManager.get<T>(this.buildKey(key));
    return (value as T) ?? null;
  }

  async set<T>(key: string, value: T, ttl?: number): Promise<void> {
    await this.cacheManager.set(this.buildKey(key), value, ttl ?? this.ttl);
  }

  async del(key: string): Promise<void> {
    await this.cacheManager.del(this.buildKey(key));
  }

  async wrap<T>(
    key: string,
    factory: () => Promise<T>,
    ttl?: number,
  ): Promise<T> {
    const cachedValue = await this.get<T>(key);
    if (cachedValue !== null) {
      return cachedValue;
    }

    const result = await factory();

    if (result === undefined || result === null) {
      this.logger.warn(
        `Skip caching empty result for key "${key}" to avoid storing invalid entries`,
      );
      return result;
    }

    await this.set(key, result, ttl);
    return result;
  }

  async ping(): Promise<string> {
    const response = await this.redisHealthClient.ping();
    return Array.isArray(response) ? response.join(';') : response;
  }
}
