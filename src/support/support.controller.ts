import { Controller, Post, Body, UseGuards, Request } from '@nestjs/common';
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

  @Post('message')
  @Roles('agent')
  async sendMessage(@Request() req, @Body() body: SendSupportMessageDto) {
    const { data: agent } = await this.supabase.admin
      .from('agents')
      .select('full_name, telegram_username, telegram_id')
      .eq('telegram_id', req.user.telegramId)
      .single();

    const agentName = agent?.full_name || `@${agent?.telegram_username}` || 'Unknown Agent';
    const agentId = req.user.telegramId;

    const adminChatId = this.config.get<string>('ADMIN_TELEGRAM_ID');
    if (adminChatId) {
      const typeLabel = body.type.charAt(0).toUpperCase() + body.type.slice(1);
      const text =
        `📩 *Support Message Received*\n\n` +
        `*From:* ${agentName} (ID: ${agentId})\n` +
        `*Type:* ${typeLabel}\n\n` +
        `*Message:*\n_${body.body}_`;
      await this.notifications.queueTelegramMessage(adminChatId, text);
    }

    return { success: true };
  }
}
