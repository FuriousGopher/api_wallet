import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { MicroserviceOptions } from '@nestjs/microservices';
import { AppModule } from './app.module';
import { buildRmqServerOptions } from './config/rabbitmq.config';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    logger: ['error', 'warn', 'log', 'debug'],
  });
  const configService = app.get(ConfigService);

  const rmqOptions = buildRmqServerOptions(configService);
  app.connectMicroservice<MicroserviceOptions>(rmqOptions);

  await app.startAllMicroservices();
  Logger.log('RMQ microservice listener started', 'Bootstrap');
}

void bootstrap();
