import { Module } from '@nestjs/common';

import { AppController } from '#server/app.controller.js';
import { AppService } from '#server/app.service.js';

@Module({
  imports: [],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
