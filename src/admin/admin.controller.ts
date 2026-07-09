import { Controller, Post, Get, Body, UseGuards, Request } from '@nestjs/common';
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
  login(@Body() body: LoginDto) {
    return this.admin.loginAdmin(body.email, body.password);
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
