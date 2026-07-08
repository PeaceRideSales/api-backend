import { Module } from '@nestjs/common';
import { ExportService } from './export.service';
import { ExportController } from './export.controller';
import { DriversModule } from '../drivers/drivers.module';
import { SettingsModule } from '../settings/settings.module';
import { GoogleSheetsService } from './google-sheets.service';

@Module({
  imports: [DriversModule, SettingsModule],
  providers: [ExportService, GoogleSheetsService],
  controllers: [ExportController],
  exports: [ExportService],
})
export class ExportModule {}
