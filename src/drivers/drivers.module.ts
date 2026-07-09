import { Module } from '@nestjs/common';
import { DriversController } from './drivers.controller';
import { DriversService } from './drivers.service';
import { SupabaseModule } from '../supabase/supabase.module';
import { AgentsModule } from '../agents/agents.module';
import { SettingsModule } from '../settings/settings.module';
import { AuditLogsModule } from '../audit-logs/audit-logs.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [SupabaseModule, AgentsModule, SettingsModule, AuditLogsModule, NotificationsModule],
  controllers: [DriversController],
  providers: [DriversService],
  exports: [DriversService],
})
export class DriversModule {}
