import { Module } from '@nestjs/common';

import { QueueModule } from '#server/queue/queue.module.js';

@Module({
  imports: [QueueModule.forWorker()],
})
export class JobsModule {}
