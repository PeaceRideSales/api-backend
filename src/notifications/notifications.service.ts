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

    const token = process.env.TELEGRAM_BOT_TOKEN;

    // Write to DB for logging (status starts as PENDING)
    const { data, error: insertErr } = await this.supabase.admin
      .from('telegram_queue')
      .insert({ chat_id: Number(chatId), message, status: 'PENDING' })
      .select('id')
      .single();

    if (insertErr) {
      console.error('[Notifications] DB insert failed:', insertErr.message);
    }
    const dbId = data?.id;

    // If BullMQ is available (Redis connected in production), delegate to the worker
    if (this.telegramQueue) {
      try {
        await this.telegramQueue.add('sendMessage', { id: dbId, chat_id: Number(chatId), message });
        return; // Worker will update the DB status when it processes the job
      } catch (err) {
        console.warn('[Notifications] BullMQ unavailable, sending directly:', (err as Error).message);
      }
    }

    // Fallback (local dev / no Redis): send directly via Telegram API right now
    if (!token) {
      console.warn('[Notifications] No TELEGRAM_BOT_TOKEN set, message left as PENDING.');
      return;
    }

    try {
      const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // Use no parse_mode so arbitrary user text never breaks delivery
        body: JSON.stringify({ chat_id: Number(chatId), text: message }),
      });

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`Telegram API ${res.status}: ${errText}`);
      }

      // Mark as delivered
      if (dbId) {
        await this.supabase.admin
          .from('telegram_queue')
          .update({ status: 'COMPLETED', processed_at: new Date().toISOString() })
          .eq('id', dbId);
      }
      console.log(`[Notifications] Sent directly to chat ${chatId}`);
    } catch (err: any) {
      console.error('[Notifications] Direct send failed:', err.message);
      if (dbId) {
        await this.supabase.admin
          .from('telegram_queue')
          .update({ status: 'FAILED', error: err.message, processed_at: new Date().toISOString() })
          .eq('id', dbId);
      }
    }
  }


  async broadcastNotification(type: 'ALL' | 'INDIVIDUAL', message: string, telegramId?: number) {
    if (!message || message.trim() === '') {
      throw new Error('Message cannot be empty');
    }

    if (type === 'ALL') {
      // Fetch all unique agents with telegram IDs
      const { data: agents, error } = await this.supabase.admin
        .from('agents')
        .select('telegram_id, full_name')
        .not('telegram_id', 'is', null);

      if (error) throw new Error(error.message);

      const count = agents?.length || 0;
      if (count === 0) return { success: true, sent: 0 };

      // Queue messages for all agents — continue even if one fails
      let sent = 0;
      let failed = 0;
      for (const agent of agents!) {
        const agentName = agent.full_name || 'Agent';
        const formattedMessage = `📢 Dear ${agentName},\n\n${message}`;
        try {
          await this.queueTelegramMessage(String(agent.telegram_id), formattedMessage);
          sent++;
        } catch (e: any) {
          console.error(`[Broadcast] Failed for agent ${agent.telegram_id}:`, e.message);
          failed++;
        }
      }
      return { success: true, sent, failed };
    } else if (type === 'INDIVIDUAL') {
      if (!telegramId) {
        throw new Error('Telegram ID is required for individual notifications');
      }
      
      const { data: agent } = await this.supabase.admin
        .from('agents')
        .select('full_name')
        .eq('telegram_id', telegramId)
        .single();
        
      const agentName = agent?.full_name || 'Agent';
      const formattedMessage = `📢 Dear ${agentName},\n\n${message}`;
      
      await this.queueTelegramMessage(String(telegramId), formattedMessage);
      return { success: true, sent: 1 };
    }
    
    throw new Error('Invalid notification type');
  }
}

