import { Test, TestingModule } from '@nestjs/testing';

import { AppController } from '#server/app.controller.js';
import { AppService } from '#server/app.service.js';

describe('앱 컨트롤러', () => {
  let appController: AppController;

  beforeEach(async () => {
    const app: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [AppService],
    }).compile();

    appController = app.get<AppController>(AppController);
  });

  describe('루트 경로', () => {
    it('Hello World!를 반환한다', () => {
      expect(appController.getHello()).toBe('Hello World!');
    });
  });
});
