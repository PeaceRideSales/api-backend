import { Module } from '@nestjs/common';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { SupabaseModule } from '../supabase/supabase.module';

import { BullModule } from '@nestjs/bullmq';

@Module({
  imports: [
    SupabaseModule,
    BullModule.registerQueue({ name: 'telegram' })
  ],
  controllers: [NotificationsController],
  providers: [NotificationsService],
  exports: [NotificationsService],
})
export class NotificationsModule {}
