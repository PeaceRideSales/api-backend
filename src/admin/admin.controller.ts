import { Controller, Post, Get, Body, UseGuards, Request, Res } from '@nestjs/common';
import { Response } from 'express';
import { AdminService } from './admin.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { IsString, IsEmail, MinLength } from 'class-validator';

class LoginDto {
  @IsEmail() email: string;
  @IsString() @MinLength(8) password: string;
}

class RedeemInviteDto {
  @IsString() code: string;
  @IsEmail() email: string;
  @IsString() @MinLength(8) password: string;
}

@Controller('admin')
export class AdminController {
  constructor(private admin: AdminService) {}

  /** Public — admin login */
  @Post('login')
  async login(@Body() body: LoginDto, @Res({ passthrough: true }) res: Response) {
    const data = await this.admin.loginAdmin(body.email, body.password);
    res.cookie('admin_token', data.token, {
      httpOnly: true,
      secure: true, // Always true since we use Vercel/HTTPS in prod and it requires SameSite=None
      sameSite: 'none',
      maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
    });
    return { success: true };
  }

  /** Public — admin logout */
  @Post('logout')
  async logout(@Res({ passthrough: true }) res: Response) {
    res.clearCookie('admin_token', {
      httpOnly: true,
      secure: true,
      sameSite: 'none',
    });
    return { success: true };
  }

  /** Admin only — verify session */
  @Get('me')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  verifySession(@Request() req) {
    return { userId: req.user.userId, role: req.user.role };
  }

  /** Public — redeem invite to create new admin account */
  @Post('redeem-invite')
  redeemInvite(@Body() body: RedeemInviteDto) {
    return this.admin.redeemInvite(body.code, body.email, body.password);
  }

  /** Admin only — create an invite for another admin */
  @Post('invite')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  createInvite(@Request() req) {
    return this.admin.createInvite(req.user.userId);
  }

  /** Admin only — list invites created by current admin */
  @Get('invites')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  listInvites(@Request() req) {
    return this.admin.listInvites(req.user.userId);
  }

  /** Admin only — reset system for production */
  @Post('reset')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  resetSystem(@Request() req) {
    return this.admin.resetSystem(req.user.userId);
  }
}
