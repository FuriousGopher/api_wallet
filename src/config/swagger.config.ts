import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import * as basicAuth from 'express-basic-auth';

const SWAGGER_PATH = 'docs';

export const setupSwagger = (app: INestApplication) => {
  const configService = app.get(ConfigService);
  const swaggerUser = configService.get<string>('SWAGGER_USER') ?? 'admin';
  const swaggerPassword =
    configService.get<string>('SWAGGER_PASSWORD') ?? 'admin';

  app.use(
    [`/${SWAGGER_PATH}`, `/${SWAGGER_PATH}-json`],
    basicAuth({
      challenge: true,
      users: { [swaggerUser]: swaggerPassword },
      unauthorizedResponse: 'Unauthorized',
    }),
  );

  const documentConfig = new DocumentBuilder()
    .setTitle('Wallet API')
    .setDescription('Event-driven wallet service API documentation')
    .setVersion('1.0.0')
    .build();

  const document = SwaggerModule.createDocument(app, documentConfig);
  SwaggerModule.setup(SWAGGER_PATH, app, document);
};
