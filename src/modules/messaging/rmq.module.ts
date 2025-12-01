import { Global, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ClientProxy, ClientProxyFactory } from '@nestjs/microservices';
import { buildRmqClientOptions } from '../../config/rabbitmq.config';
import { ConsumedEventEntity } from './entities/consumed-event.entity';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WalletAnalyticsEntity } from './entities/wallet-analytics.entity';
import { WalletEventsConsumerService } from './wallet-events-consumer.service';
import { RmqConsumer } from './rmq.consumer';

export const RMQ_CLIENT = 'RMQ_CLIENT';

@Global()
@Module({
  imports: [
    ConfigModule,
    TypeOrmModule.forFeature([ConsumedEventEntity, WalletAnalyticsEntity]),
  ],
  controllers: [RmqConsumer],
  providers: [
    {
      provide: RMQ_CLIENT,
      inject: [ConfigService],
      useFactory: (configService: ConfigService): ClientProxy =>
        ClientProxyFactory.create(buildRmqClientOptions(configService)),
    },
    WalletEventsConsumerService,
  ],
  exports: [RMQ_CLIENT, WalletEventsConsumerService],
})
export class RmqModule {}
