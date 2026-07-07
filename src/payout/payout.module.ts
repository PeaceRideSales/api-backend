import { Module } from '@nestjs/common';
import { PayoutController } from './payout.controller';
import { PayoutService } from './payout.service';
import { SupabaseModule } from '../supabase/supabase.module';
import { SettingsModule } from '../settings/settings.module';

@Module({
  imports: [SupabaseModule, SettingsModule],
  controllers: [PayoutController],
  providers: [PayoutService],
})
export class PayoutModule {}
