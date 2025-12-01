import { ConfigService } from '@nestjs/config';
import { TypeOrmModuleOptions } from '@nestjs/typeorm';

export const buildTypeOrmConfig = (
  configService: ConfigService,
): TypeOrmModuleOptions => {
  const isSyncEnabled =
    configService.get<string>('DATABASE_SYNC')?.toLowerCase() === 'true';
  const isLoggingEnabled =
    configService.get<string>('DATABASE_LOGGING')?.toLowerCase() === 'true';

  const port = parseInt(
    configService.get<string>('DATABASE_PORT') ?? '5432',
    10,
  );

  return {
    type: 'postgres',
    host: configService.get<string>('DATABASE_HOST'),
    port,
    username: configService.get<string>('DATABASE_USER'),
    password: configService.get<string>('DATABASE_PASSWORD'),
    database: configService.get<string>('DATABASE_NAME'),
    synchronize: isSyncEnabled,
    logging: isLoggingEnabled,
    autoLoadEntities: true,
    entities: [__dirname + '/../modules/**/*.entity{.ts,.js}'],
    migrations: [__dirname + '/../migrations/**/*{.ts,.js}'],
  };
};
