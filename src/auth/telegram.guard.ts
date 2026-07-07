import { Injectable, CanActivate, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { AuthService } from './auth.service';

/**
 * Guard that validates Telegram WebApp initData from the request body.
 * Attaches the validated telegramUser to req.telegramUser.
 */
@Injectable()
export class TelegramGuard implements CanActivate {
  constructor(private auth: AuthService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const initData = request.body?.telegram_init_data || request.headers['x-telegram-init-data'];

    if (!initData) {
      throw new UnauthorizedException('Missing Telegram initData');
    }

    const validated = this.auth.validateTelegramInitData(initData);
    request.telegramUser = JSON.parse(validated.user || '{}');
    return true;
  }
}
