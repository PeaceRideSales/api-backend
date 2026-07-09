import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';

@Processor('telegram')
export class TelegramProcessor extends WorkerHost {
  private readonly logger = new Logger(TelegramProcessor.name);

  async process(job: Job<{ chat_id: number; message: string }>): Promise<void> {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    if (!token) return;

    try {
      const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          chat_id: job.data.chat_id, 
          text: job.data.message, 
          parse_mode: 'Markdown' 
        })
      });

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`Telegram API Error: ${res.status} ${errText}`);
      }

      this.logger.log(`Successfully sent telegram message to ${job.data.chat_id}`);
    } catch (error: any) {
      this.logger.error(`Failed to process telegram job ${job.id}: ${error.message}`);
      throw error; // Let BullMQ handle retries
    }
  }
}
