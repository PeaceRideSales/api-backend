import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerModule } from '@nestjs/throttler';
import { SupabaseModule } from './supabase/supabase.module';
import { AuthModule } from './auth/auth.module';
import { AgentsModule } from './agents/agents.module';
import { DriversModule } from './drivers/drivers.module';
import { ReferralModule } from './referral/referral.module';
import { ExportModule } from './export/export.module';
import { ReportsModule } from './reports/reports.module';
import { StatsModule } from './stats/stats.module';
import { AdminModule } from './admin/admin.module';
import { SettingsModule } from './settings/settings.module';
import { PayoutModule } from './payout/payout.module';

import { UploadModule } from './upload/upload.module';
import { AuditLogsModule } from './audit-logs/audit-logs.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: ['.env', '../../.env'] }),
    ScheduleModule.forRoot(),
    ThrottlerModule.forRoot([{
      name: 'global',
      ttl: 60000,   // 60 second window
      limit: 120,   // 120 requests per window per IP
    }]),
    SupabaseModule,
    AuthModule,
    AgentsModule,
    DriversModule,
    ReferralModule,
    ExportModule,
    ReportsModule,
    StatsModule,
    AdminModule,
    SettingsModule,
    PayoutModule,
    UploadModule,
    AuditLogsModule,
  ],
})
export class AppModule {}
