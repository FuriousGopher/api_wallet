import { Logger } from '@nestjs/common';
import { RmqContext } from '@nestjs/microservices';

export const ackOnSuccessNackOnError = async (
  handler: () => Promise<void>,
  context: RmqContext,
  logger: Logger,
) => {
  const channel = context.getChannelRef();
  const message = context.getMessage();
  try {
    await handler();
    channel.ack(message);
  } catch (error) {
    logger.error(
      `Failed to process message ${message?.properties?.messageId ?? ''}: ${
        error instanceof Error ? error.message : 'unknown error'
      }`,
    );
    channel.nack(message, false, false);
  }
};
