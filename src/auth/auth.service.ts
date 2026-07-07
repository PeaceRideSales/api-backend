import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as crypto from 'crypto';
import { SupabaseService } from '../supabase/supabase.service';

@Injectable()
export class AuthService {
  constructor(
    private config: ConfigService,
    private jwt: JwtService,
    private supabase: SupabaseService,
  ) {}

  /**
   * Validates Telegram WebApp initData hash.
   * https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
   */
  validateTelegramInitData(initData: string): Record<string, string> {
    const params = new URLSearchParams(initData);
    const hash = params.get('hash');
    if (!hash) throw new UnauthorizedException('Missing hash');

    params.delete('hash');

    const dataCheckString = Array.from(params.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}=${v}`)
      .join('\n');

    const secretKey = crypto
      .createHmac('sha256', 'WebAppData')
      .update(this.config.getOrThrow('TELEGRAM_BOT_TOKEN'))
      .digest();

    const expectedHash = crypto
      .createHmac('sha256', secretKey)
      .update(dataCheckString)
      .digest('hex');

    if (expectedHash !== hash) {
      throw new UnauthorizedException('Invalid Telegram signature');
    }

    // Check data is not older than 24 hours
    const authDate = parseInt(params.get('auth_date') || '0', 10);
    const now = Math.floor(Date.now() / 1000);
    if (now - authDate > 86400) {
      throw new UnauthorizedException('Telegram data expired');
    }

    return Object.fromEntries(params.entries());
  }

  /**
   * Given validated initData, upsert agent and return JWT
   */
  async loginAgent(initData: string): Promise<{ token: string; agent: any }> {
    const data = this.validateTelegramInitData(initData);
    const telegramUser = JSON.parse(data.user || '{}');

    const telegramId = telegramUser.id;
    if (!telegramId) throw new UnauthorizedException('No user in initData');

    // Upsert agent record
    const { data: agent, error } = await this.supabase.admin
      .from('agents')
      .upsert(
        {
          telegram_id: telegramId,
          telegram_username: telegramUser.username || null,
          full_name:
            `${telegramUser.first_name || ''} ${telegramUser.last_name || ''}`.trim() ||
            null,
        },
        { onConflict: 'telegram_id', ignoreDuplicates: false },
      )
      .select()
      .single();

    if (error) throw new UnauthorizedException('Failed to upsert agent');

    const token = this.jwt.sign({
      sub: agent.id,
      telegram_id: agent.telegram_id,
      role: 'agent',
    });

    return { token, agent };
  }

  /** Validates Supabase admin JWT for admin dashboard */
  verifyAdminToken(token: string): any {
    try {
      return this.jwt.verify(token);
    } catch {
      throw new UnauthorizedException('Invalid admin token');
    }
  }

  signAdminToken(userId: string): string {
    return this.jwt.sign({ sub: userId, role: 'admin' });
  }
}
