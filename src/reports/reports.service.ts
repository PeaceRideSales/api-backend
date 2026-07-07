import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { SupabaseService } from '../supabase/supabase.service';
import { ExportService } from '../export/export.service';

@Injectable()
export class ReportsService {
  private readonly logger = new Logger(ReportsService.name);

  constructor(
    private supabase: SupabaseService,
    private export_: ExportService,
  ) {}

  async findAll() {
    const { data, error } = await this.supabase.admin
      .from('reports')
      .select('*')
      .order('generated_at', { ascending: false });

    if (error) throw new Error(error.message);
    return data;
  }

  private async generateAndStore(
    type: 'DAILY' | 'WEEKLY' | 'MONTHLY',
    periodStart: Date,
    periodEnd: Date,
  ) {
    this.logger.log(`Generating ${type} report: ${periodStart.toISOString()} → ${periodEnd.toISOString()}`);

    const buffer = await this.export_.generateAllAgentsExcel({
      start_date: periodStart.toISOString().split('T')[0],
      end_date: periodEnd.toISOString().split('T')[0],
    });

    const fileName = `reports/${type.toLowerCase()}-${periodStart.toISOString().split('T')[0]}.xlsx`;

    // Upload to Supabase Storage
    const { error: uploadErr } = await this.supabase.admin.storage
      .from('reports')
      .upload(fileName, buffer, {
        contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        upsert: true,
      });

    if (uploadErr) {
      this.logger.error(`Failed to upload ${type} report: ${uploadErr.message}`);
      return;
    }

    const { data: { publicUrl } } = this.supabase.admin.storage
      .from('reports')
      .getPublicUrl(fileName);

    // Save metadata to reports table
    await this.supabase.admin.from('reports').insert({
      type,
      file_url: publicUrl,
      period_start: periodStart.toISOString().split('T')[0],
      period_end: periodEnd.toISOString().split('T')[0],
    });

    this.logger.log(`✅ ${type} report saved: ${publicUrl}`);
  }

  /** Daily: every day at 11:59 PM */
  @Cron('59 23 * * *')
  async generateDailyReport() {
    const today = new Date();
    await this.generateAndStore('DAILY', today, today);
  }

  /** Weekly: every Sunday at 11:59 PM */
  @Cron('59 23 * * 0')
  async generateWeeklyReport() {
    const end = new Date();
    const start = new Date(end.getTime() - 6 * 86400000);
    await this.generateAndStore('WEEKLY', start, end);
  }

  /** Monthly: last day of month at 11:59 PM */
  @Cron('59 23 28-31 * *')
  async generateMonthlyReport() {
    const now = new Date();
    const tomorrow = new Date(now.getTime() + 86400000);
    if (tomorrow.getDate() !== 1) return; // only run on actual last day

    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    await this.generateAndStore('MONTHLY', start, now);
  }
}
