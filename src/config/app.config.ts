import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as cookieParser from 'cookie-parser';
import { setupSwagger } from './swagger.config';

export const configureApp = (app: INestApplication) => {
  const configService = app.get(ConfigService);
  const nodeEnv = configService.get<string>('NODE_ENV') ?? 'development';

  app.enableShutdownHooks();

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  app.use(cookieParser());
  app.enableCors({
    origin: true,
    credentials: true,
  });

  setupSwagger(app);

  const port = configService.get<number>('APP_PORT') ?? 3000;

  return {
    port,
    nodeEnv,
  };
};
