import { ConfigService } from '@nestjs/config';
import { RmqOptions, Transport } from '@nestjs/microservices';

const toInt = (value: string | undefined, fallback: number): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const buildBaseOptions = (configService: ConfigService) => {
  const urls = [
    configService.get<string>('RABBITMQ_URL') ??
      'amqp://guest:guest@localhost:5672',
  ];

  const queue = configService.get<string>('RABBITMQ_QUEUE') ?? 'wallet.events';
  const prefetchCount = toInt(
    configService.get<string>('RABBITMQ_PREFETCH'),
    20,
  );

  const deadLetterExchange =
    configService.get<string>('RABBITMQ_DLX') ?? undefined;
  const deadLetterRoutingKey =
    configService.get<string>('RABBITMQ_DLQ') ?? undefined;

  const queueOptions = {
    durable: true,
    arguments:
      deadLetterExchange && deadLetterRoutingKey
        ? {
            'x-dead-letter-exchange': deadLetterExchange,
            'x-dead-letter-routing-key': deadLetterRoutingKey,
          }
        : undefined,
  };

  return { urls, queue, queueOptions, prefetchCount };
};

export const buildRmqClientOptions = (
  configService: ConfigService,
): RmqOptions => {
  const base = buildBaseOptions(configService);
  return {
    transport: Transport.RMQ,
    options: {
      ...base,
      noAck: true, // client reply consumer should not ack
    },
  };
};

export const buildRmqServerOptions = (
  configService: ConfigService,
): RmqOptions => {
  const base = buildBaseOptions(configService);
  return {
    transport: Transport.RMQ,
    options: {
      ...base,
      noAck: false, // enable manual ack for worker
    },
  };
};
