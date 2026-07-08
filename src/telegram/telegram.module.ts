import { Module } from '@nestjs/common';
import { TelegramProcessor } from './telegram.processor';

@Module({
  providers: [TelegramProcessor],
})
export class TelegramModule {}
