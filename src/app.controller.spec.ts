import { Test, TestingModule } from '@nestjs/testing';
import { AppController } from './app.controller';
import { AppService } from './app.service';

describe('AppController', () => {
  let appController: AppController;

  beforeEach(async () => {
    const mockAppService: Partial<AppService> = {
      getHello: jest.fn().mockReturnValue('Hello Wallet API!'),
    };

    const app: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [
        {
          provide: AppService,
          useValue: mockAppService,
        },
      ],
    }).compile();

    appController = app.get<AppController>(AppController);
  });

  it('should return greeting', () => {
    expect(appController.getHello()).toBe('Hello Wallet API!');
  });
});
