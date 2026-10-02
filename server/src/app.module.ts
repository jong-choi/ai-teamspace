import { Module } from '@nestjs/common';

import { AppController } from '#server/app.controller.js';
import { AppService } from '#server/app.service.js';
import { AuthModule } from '#server/auth/auth.module.js';
import { DatabaseModule } from '#server/database/database.module.js';

@Module({
  imports: [DatabaseModule, AuthModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
