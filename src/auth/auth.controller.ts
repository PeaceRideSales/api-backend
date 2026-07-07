import { Controller, Post, Body } from '@nestjs/common';
import { AuthService } from './auth.service';
import { IsString } from 'class-validator';

class TelegramAuthDto {
  @IsString()
  telegram_init_data: string;
}

@Controller('auth')
export class AuthController {
  constructor(private auth: AuthService) {}

  @Post('telegram')
  async telegramLogin(@Body() body: TelegramAuthDto) {
    return this.auth.loginAgent(body.telegram_init_data);
  }
}
