import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { configureApp } from './config/app.config';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  const configService = app.get(ConfigService);

  const { port, nodeEnv } = configureApp(app);
  const host = configService.get<string>('APP_HOST') ?? '0.0.0.0';

  await app.listen(port, host);
  Logger.log(`Server is running on ${host}:${port} [${nodeEnv}]`, 'Bootstrap');
}

void bootstrap();
