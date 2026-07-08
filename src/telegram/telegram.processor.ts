import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { SupabaseService } from '../supabase/supabase.service';

@Injectable()
export class TelegramProcessor {
  private readonly logger = new Logger(TelegramProcessor.name);
  private isProcessing = false;

  constructor(private supabase: SupabaseService) {}

  @Cron(CronExpression.EVERY_10_SECONDS)
  async processQueue() {
    if (this.isProcessing) return;
    this.isProcessing = true;

    try {
      const token = process.env.TELEGRAM_BOT_TOKEN;
      if (!token) return; // Silent return if no bot token

      // 1. Fetch up to 10 pending jobs
      const { data: jobs, error: fetchError } = await this.supabase.admin
        .from('telegram_queue')
        .select('*')
        .eq('status', 'PENDING')
        .order('created_at', { ascending: true })
        .limit(10);

      if (fetchError || !jobs || jobs.length === 0) return;

      // 2. Process jobs
      for (const job of jobs) {
        try {
          const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
              chat_id: job.chat_id, 
              text: job.message, 
              parse_mode: 'Markdown' 
            })
          });

          if (!res.ok) {
            const errText = await res.text();
            throw new Error(`Telegram API Error: ${res.status} ${errText}`);
          }

          // Mark completed
          await this.supabase.admin
            .from('telegram_queue')
            .update({ status: 'COMPLETED', processed_at: new Date().toISOString() })
            .eq('id', job.id);

        } catch (jobError: any) {
          this.logger.error(`Failed to process telegram job ${job.id}: ${jobError.message}`);
          // Mark failed
          await this.supabase.admin
            .from('telegram_queue')
            .update({ status: 'FAILED', error: jobError.message, processed_at: new Date().toISOString() })
            .eq('id', job.id);
        }
      }

    } catch (e) {
      this.logger.error('Error in Telegram queue processor', e);
    } finally {
      this.isProcessing = false;
    }
  }
}
