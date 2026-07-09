import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { TelegramProcessor } from './telegram.processor';

@Module({
  imports: [
    BullModule.registerQueue({
      name: 'telegram',
    }),
  ],
  providers: [TelegramProcessor],
  exports: [BullModule],
})
export class TelegramModule {}
