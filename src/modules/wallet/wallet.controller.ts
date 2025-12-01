import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  Res,
  BadRequestException,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Response, Request } from 'express';
import { WalletService } from './wallet.service';
import { DepositDto } from './dto/deposit.dto';
import { WithdrawDto } from './dto/withdraw.dto';
import { TransferDto } from './dto/transfer.dto';
import { HistoryQueryDto } from './dto/history.query';
import { IdempotencyService } from './idempotency.service';

@ApiTags('wallet')
@Controller('wallet')
export class WalletController {
  constructor(
    private readonly walletService: WalletService,
    private readonly idempotency: IdempotencyService,
  ) {}

  @Post(':id/deposit')
  async deposit(
    @Param('id') walletId: string,
    @Body() dto: DepositDto,
    @Res() res: Response,
    @Req() req: Request,
  ) {
    const key = this.resolveIdempotencyKey(req, dto.idempotencyKey);
    const requestIdHeader =
      typeof req.headers['x-request-id'] === 'string'
        ? req.headers['x-request-id']
        : undefined;
    const payloadHash = this.idempotency.hashPayload({
      path: req.path,
      method: req.method,
      walletId,
      body: dto,
    });

    const cached = await this.idempotency.get(key, payloadHash);
    if (
      cached?.status === 'completed' &&
      cached.responseStatus &&
      cached.responseBody
    ) {
      return res.status(cached.responseStatus).json(cached.responseBody);
    }

    await this.idempotency.begin(key, payloadHash);

    const result = await this.walletService.deposit(
      walletId,
      dto.amount,
      key ?? requestIdHeader,
      dto.metadata,
    );

    const responseBody = {
      walletId: result.walletId,
      balance: result.balance,
      events: result.events,
    };
    await this.idempotency.finalize(key, 200, responseBody);
    return res.status(200).json(responseBody);
  }

  @Post(':id/withdraw')
  async withdraw(
    @Param('id') walletId: string,
    @Body() dto: WithdrawDto,
    @Res() res: Response,
    @Req() req: Request,
  ) {
    const key = this.resolveIdempotencyKey(req, dto.idempotencyKey);
    const requestIdHeader =
      typeof req.headers['x-request-id'] === 'string'
        ? req.headers['x-request-id']
        : undefined;
    const payloadHash = this.idempotency.hashPayload({
      path: req.path,
      method: req.method,
      walletId,
      body: dto,
    });
    const cached = await this.idempotency.get(key, payloadHash);
    if (
      cached?.status === 'completed' &&
      cached.responseStatus &&
      cached.responseBody
    ) {
      return res.status(cached.responseStatus).json(cached.responseBody);
    }

    await this.idempotency.begin(key, payloadHash);

    const result = await this.walletService.withdraw(
      walletId,
      dto.amount,
      key ?? requestIdHeader,
      dto.metadata,
    );

    const responseBody = {
      walletId: result.walletId,
      balance: result.balance,
      events: result.events,
    };
    await this.idempotency.finalize(key, 200, responseBody);
    return res.status(200).json(responseBody);
  }

  @Post(':id/transfer')
  async transfer(
    @Param('id') walletId: string,
    @Body() dto: TransferDto,
    @Res() res: Response,
    @Req() req: Request,
  ) {
    const key = this.resolveIdempotencyKey(req, dto.idempotencyKey);
    const requestIdHeader =
      typeof req.headers['x-request-id'] === 'string'
        ? req.headers['x-request-id']
        : undefined;
    const payloadHash = this.idempotency.hashPayload({
      path: req.path,
      method: req.method,
      walletId,
      toWalletId: dto.toWalletId,
      body: dto,
    });
    const cached = await this.idempotency.get(key, payloadHash);
    if (
      cached?.status === 'completed' &&
      cached.responseStatus &&
      cached.responseBody
    ) {
      return res.status(cached.responseStatus).json(cached.responseBody);
    }

    await this.idempotency.begin(key, payloadHash);

    const result = await this.walletService.transfer(
      walletId,
      dto.toWalletId,
      dto.amount,
      key ?? requestIdHeader,
      dto.metadata,
    );

    const responseBody = {
      walletId: result.walletId,
      toWalletId: result.toWalletId,
      balance: result.balance,
      transferId: result.transferId,
      transferStatus: result.transferStatus,
      events: result.events,
    };
    await this.idempotency.finalize(key, 200, responseBody);
    return res.status(200).json(responseBody);
  }

  @Get(':id')
  async getBalance(@Param('id') walletId: string) {
    return this.walletService.getBalance(walletId);
  }

  @Get(':id/history')
  async history(
    @Param('id') walletId: string,
    @Query() query: HistoryQueryDto,
  ) {
    return this.walletService.getHistory(walletId, {
      offset: query.offset,
      limit: query.limit,
    });
  }

  private resolveIdempotencyKey(req: Request, bodyKey?: string): string {
    const headerKey =
      typeof req.headers['idempotency-key'] === 'string'
        ? req.headers['idempotency-key']
        : typeof req.headers['x-idempotency-key'] === 'string'
          ? req.headers['x-idempotency-key']
          : undefined;
    const key = bodyKey ?? headerKey;
    if (!key) {
      throw new BadRequestException('Idempotency key is required');
    }
    return key;
  }
}
