import { ConfigService } from '@nestjs/config';
import { ThrottlerModuleOptions } from '@nestjs/throttler';

const toNumber = (value: string | undefined, fallback: number) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

export const buildThrottlerConfig = (
  configService: ConfigService,
): ThrottlerModuleOptions => {
  const ttl = toNumber(configService.get<string>('THROTTLE_TTL'), 60);
  const limit = toNumber(configService.get<string>('THROTTLE_LIMIT'), 50);
  const blockDuration = toNumber(
    configService.get<string>('THROTTLE_BLOCK_DURATION'),
    0,
  );

  const throttlerOptions = {
    ttl,
    limit,
    ...(blockDuration > 0 ? { blockDuration } : {}),
  };

  return {
    throttlers: [throttlerOptions],
  };
};
