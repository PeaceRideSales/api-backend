import { Controller, Post, Body, Res } from '@nestjs/common';
import { Response } from 'express';
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
  async telegramLogin(@Body() body: TelegramAuthDto, @Res({ passthrough: true }) res: Response) {
    const data = await this.auth.loginAgent(body.telegram_init_data);
    res.cookie('token', data.token, {
      httpOnly: true,
      secure: true,
      sameSite: 'none',
      maxAge: 7 * 24 * 60 * 60 * 1000
    });
    return { agent: data.agent, success: true };
  }
}
