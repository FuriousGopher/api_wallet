import { CacheModuleOptions } from '@nestjs/cache-manager';
import { ConfigService } from '@nestjs/config';
import { redisStore } from 'cache-manager-ioredis-yet';

export const buildCacheConfig = async (
  configService: ConfigService,
): Promise<CacheModuleOptions> => {
  const ttl = parseInt(configService.get<string>('REDIS_TTL') ?? '600', 10);
  const port = parseInt(configService.get<string>('REDIS_PORT') ?? '6379', 10);
  const db = parseInt(configService.get<string>('REDIS_DB') ?? '0', 10);

  return {
    isGlobal: true,
    store: await redisStore({
      host: configService.get<string>('REDIS_HOST') ?? '127.0.0.1',
      port,
      db,
      username: configService.get<string>('REDIS_USER') ?? undefined,
      password: configService.get<string>('REDIS_PASSWORD') ?? undefined,
    }),
    ttl,
  };
};
