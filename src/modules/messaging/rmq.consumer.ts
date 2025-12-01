import {
  Controller,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { Ctx, EventPattern, Payload, RmqContext } from '@nestjs/microservices';
import { WalletEventsConsumerService } from './wallet-events-consumer.service';
import { ackOnSuccessNackOnError } from './rabbitmq.strategy';

type WalletEventPayload = Record<string, unknown> & {
  eventId?: string;
  eventType?: string;
  walletId?: string;
  transferId?: string;
  amount?: string | number;
  requestId?: string;
};

@Controller()
@Injectable()
export class RmqConsumer implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RmqConsumer.name);

  constructor(
    private readonly walletEventsConsumer: WalletEventsConsumerService,
  ) {}

  onModuleInit() {
    this.logger.log('RMQ consumer initialized');
  }

  onModuleDestroy() {
    this.logger.log('RMQ consumer destroyed');
  }

  @EventPattern('FundsDeposited')
  async handleFundsDeposited(
    @Payload() data: WalletEventPayload,
    @Ctx() context: RmqContext,
  ) {
    await ackOnSuccessNackOnError(
      () =>
        this.walletEventsConsumer.handleEvent({
          ...data,
          eventType: 'FundsDeposited',
        }),
      context,
      this.logger,
    );
  }

  @EventPattern('FundsWithdrawn')
  async handleFundsWithdrawn(
    @Payload() data: WalletEventPayload,
    @Ctx() context: RmqContext,
  ) {
    await ackOnSuccessNackOnError(
      () =>
        this.walletEventsConsumer.handleEvent({
          ...data,
          eventType: 'FundsWithdrawn',
        }),
      context,
      this.logger,
    );
  }

  @EventPattern('TransferInitiated')
  async handleTransferInitiated(
    @Payload() data: WalletEventPayload,
    @Ctx() context: RmqContext,
  ) {
    await ackOnSuccessNackOnError(
      () =>
        this.walletEventsConsumer.handleEvent({
          ...data,
          eventType: 'TransferInitiated',
        }),
      context,
      this.logger,
    );
  }

  @EventPattern('TransferCompleted')
  async handleTransferCompleted(
    @Payload() data: WalletEventPayload,
    @Ctx() context: RmqContext,
  ) {
    await ackOnSuccessNackOnError(
      () =>
        this.walletEventsConsumer.handleEvent({
          ...data,
          eventType: 'TransferCompleted',
        }),
      context,
      this.logger,
    );
  }

  @EventPattern('TransferFailed')
  async handleTransferFailed(
    @Payload() data: WalletEventPayload,
    @Ctx() context: RmqContext,
  ) {
    await ackOnSuccessNackOnError(
      () =>
        this.walletEventsConsumer.handleEvent({
          ...data,
          eventType: 'TransferFailed',
        }),
      context,
      this.logger,
    );
  }

  @EventPattern('TransferCompensated')
  async handleTransferCompensated(
    @Payload() data: WalletEventPayload,
    @Ctx() context: RmqContext,
  ) {
    await ackOnSuccessNackOnError(
      () =>
        this.walletEventsConsumer.handleEvent({
          ...data,
          eventType: 'TransferCompensated',
        }),
      context,
      this.logger,
    );
  }
}
