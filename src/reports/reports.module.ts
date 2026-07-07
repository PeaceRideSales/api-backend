import { Module } from '@nestjs/common';
import { ReportsService } from './reports.service';
import { ReportsController } from './reports.controller';
import { ExportModule } from '../export/export.module';

@Module({
  imports: [ExportModule],
  providers: [ReportsService],
  controllers: [ReportsController],
})
export class ReportsModule {}
