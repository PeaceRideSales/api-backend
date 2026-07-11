import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtThrottlerGuard } from './auth/jwt-throttler.guard';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerModule } from '@nestjs/throttler';
import { BullModule } from '@nestjs/bullmq';
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

import { TelegramModule } from './telegram/telegram.module';
import { NotificationsModule } from './notifications/notifications.module';
import { SupportModule } from './support/support.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: ['.env', '../../.env'] }),
    ScheduleModule.forRoot(),
    BullModule.forRootAsync({
      useFactory: () => {
        // Production (Upstash): REDIS_PASSWORD is set → eager connect with TLS
        const isProduction = !!process.env.REDIS_PASSWORD;
        return {
          connection: {
            host: process.env.REDIS_HOST || 'localhost',
            port: process.env.REDIS_PORT ? parseInt(process.env.REDIS_PORT, 10) : 6379,
            password: process.env.REDIS_PASSWORD || undefined,
            tls: isProduction ? {} : undefined,
            // Local dev: lazy so a missing Redis doesn't crash the app.
            // Production: eager connect so queue workers start immediately.
            lazyConnect: !isProduction,
            enableOfflineQueue: false,
            maxRetriesPerRequest: null,
          },
        };
      },
    }),
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
    TelegramModule,
    NotificationsModule,
    SupportModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: JwtThrottlerGuard,
    },
  ],
})
export class AppModule {}
