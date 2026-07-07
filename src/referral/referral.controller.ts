import { Controller, Get, Post, Patch, Param, Body, UseGuards, Request } from '@nestjs/common';
import { ReferralService } from './referral.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { IsString, IsOptional, IsBoolean } from 'class-validator';

class CreateReferralDto {
  @IsOptional() @IsString() label?: string;
}

class ValidateReferralDto {
  @IsString() code: string;
  @IsString() agent_id: string;
}

class ToggleActiveDto {
  @IsBoolean() is_active: boolean;
}

@Controller('referral')
export class ReferralController {
  constructor(private referral: ReferralService) {}

  /** Public — agent submits referral code on /start (no auth required) */
  @Post('validate')
  validate(@Body() body: ValidateReferralDto) {
    return this.referral.validateAndApplyCode(body.code, body.agent_id);
  }

  /** Admin — view all codes */
  @Get()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  findAll() {
    return this.referral.findAll();
  }

  /** Admin — create new code */
  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  create(@Request() req, @Body() body: CreateReferralDto) {
    return this.referral.createCode(req.user.userId, body.label);
  }

  /** Admin — toggle active/inactive */
  @Patch(':id/toggle')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  toggle(@Param('id') id: string, @Body() body: ToggleActiveDto) {
    return this.referral.toggleActive(id, body.is_active);
  }
}
