import { Injectable, Optional } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { SupabaseService } from '../supabase/supabase.service';

@Injectable()
export class NotificationsService {
  constructor(
    private supabase: SupabaseService,
    @Optional() @InjectQueue('telegram') private telegramQueue: Queue,
  ) {}

  async findAll(page = 1, limit = 50) {
    const offset = (page - 1) * limit;
    const { data, count, error } = await this.supabase.admin
      .from('telegram_queue')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) throw new Error(error.message);
    return { data, total: count || 0, page, limit };
  }

  async queueTelegramMessage(chatId: string, message: string) {
    if (!chatId || !message) return;

    // If BullMQ queue is available (Redis connected), use it
    if (this.telegramQueue) {
      try {
        await this.telegramQueue.add('sendMessage', {
          chat_id: Number(chatId),
          message,
        });
        return;
      } catch (err) {
        console.warn('[Notifications] BullMQ unavailable, falling back to Supabase queue:', (err as Error).message);
      }
    }

    // Fallback: write directly to the telegram_queue table
    await this.supabase.admin.from('telegram_queue').insert({
      chat_id: Number(chatId),
      message,
      status: 'pending',
    });
  }
}

