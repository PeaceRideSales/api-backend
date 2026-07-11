import { Controller, Post, Get, Body, UseGuards, Request, Param } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { IsString, IsEnum, IsOptional } from 'class-validator';
import { NotificationsService } from '../notifications/notifications.service';
import { SupabaseService } from '../supabase/supabase.service';
import { ConfigService } from '@nestjs/config';

class SendSupportMessageDto {
  @IsEnum(['general', 'appeal', 'payment', 'technical', 'other'])
  type: string;

  @IsString() body: string;
  @IsOptional() @IsString() document_url?: string;
}

@Controller('support')
@UseGuards(JwtAuthGuard, RolesGuard)
export class SupportController {
  constructor(
    private notifications: NotificationsService,
    private supabase: SupabaseService,
    private config: ConfigService,
  ) {}

  @Get('messages')
  @Roles('agent')
  async getMessages(@Request() req) {
    const { data, error } = await this.supabase.admin
      .from('support_messages')
      .select('*')
      .eq('agent_id', req.user.userId)
      .order('created_at', { ascending: true });

    if (error) throw new Error(error.message);
    return data;
  }

  @Post('message')
  @Roles('agent')
  async sendMessage(@Request() req, @Body() body: SendSupportMessageDto) {
    const { data: agent } = await this.supabase.admin
      .from('agents')
      .select('id, full_name, telegram_username, telegram_id')
      .eq('telegram_id', req.user.telegramId)
      .single();

    // 1. Save to DB
    const { data: message, error } = await this.supabase.admin
      .from('support_messages')
      .insert({
        agent_id: agent.id,
        sender_type: 'AGENT',
        message_type: body.type,
        message: body.body,
        attachment_url: body.document_url || null,
      })
      .select()
      .single();

    if (error) throw new Error(error.message);

    // 2. Notify Admins
    const agentName = agent?.full_name || `@${agent?.telegram_username}` || 'Unknown Agent';
    const agentId = agent?.telegram_id;

    const adminChatIdsRaw = this.config.get<string>('ADMIN_TELEGRAM_ID');
    if (adminChatIdsRaw) {
      const adminChatIds = adminChatIdsRaw.split(',').map(id => id.trim()).filter(id => id);
      const typeLabel = body.type.charAt(0).toUpperCase() + body.type.slice(1);
      
      let text = `📩 *Support Message Received*\n\n` +
                 `*From:* ${agentName} (ID: ${agentId})\n` +
                 `*Type:* ${typeLabel}\n\n` +
                 `*Message:*\n_${body.body}_`;
      
      if (body.document_url) {
        text += `\n\n🔗 [View Attachment](${body.document_url})`;
      }

      for (const chatId of adminChatIds) {
        await this.notifications.queueTelegramMessage(chatId, text);
      }
    }

    return message;
  }

  @Get('admin/chats')
  @Roles('admin')
  async getAdminChats() {
    const { data, error } = await this.supabase.admin
      .from('support_messages')
      .select('*, agent:agents(id, full_name, telegram_username)')
      .order('created_at', { ascending: false });

    if (error) throw new Error(error.message);

    // Group by agent_id
    const chats = {};
    for (const msg of data) {
      if (!chats[msg.agent_id]) {
        chats[msg.agent_id] = {
          agent: msg.agent,
          messages: [],
          unread_count: 0,
        };
      }
      chats[msg.agent_id].messages.push(msg);
      if (msg.sender_type === 'AGENT' && !msg.is_read) {
        chats[msg.agent_id].unread_count++;
      }
    }

    // Sort messages in each chat chronologically
    Object.values(chats).forEach((chat: any) => {
      chat.messages.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
    });

    return Object.values(chats);
  }

  @Post('admin/reply/:agentId')
  @Roles('admin')
  async replyToAgent(
    @Param('agentId') agentId: string,
    @Body('message') messageText: string,
  ) {
    // 1. Mark unread as read
    await this.supabase.admin
      .from('support_messages')
      .update({ is_read: true })
      .eq('agent_id', agentId)
      .eq('sender_type', 'AGENT')
      .eq('is_read', false);

    // 2. Insert admin reply
    const { data, error } = await this.supabase.admin
      .from('support_messages')
      .insert({
        agent_id: agentId,
        sender_type: 'ADMIN',
        message: messageText,
        is_read: false,
      })
      .select()
      .single();

    if (error) throw new Error(error.message);
    
    // We notify the agent in the Telegram bot here? We can, but the agent uses the Mini-App. 
    // They can see it in the app. However, a TG message would be nice:
    const { data: agent } = await this.supabase.admin.from('agents').select('telegram_id').eq('id', agentId).single();
    if (agent?.telegram_id) {
       await this.notifications.queueTelegramMessage(
         agent.telegram_id.toString(),
         `💬 *Admin Reply:*\n\n_${messageText}_\n\nOpen the Mini-App to reply!`
       );
    }

    return data;
  }
}
