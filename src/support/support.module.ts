import { Module } from '@nestjs/common';
import { SupportController } from './support.controller';
import { NotificationsModule } from '../notifications/notifications.module';
import { SupabaseModule } from '../supabase/supabase.module';

@Module({
  imports: [NotificationsModule, SupabaseModule],
  controllers: [SupportController],
})
export class SupportModule {}
