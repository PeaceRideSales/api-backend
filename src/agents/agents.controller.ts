import {
  Controller,
  Get,
  Patch,
  Param,
  Body,
  UseGuards,
  Request,
} from '@nestjs/common';
import { AgentsService } from './agents.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { IsEnum, IsString, IsOptional } from 'class-validator';

class UpdateStatusDto {
  @IsEnum(['APPROVED', 'REJECTED'])
  status: 'APPROVED' | 'REJECTED';
}

class UpdatePaymentDetailsDto {
  @IsString() payment_method: string;
  @IsString() payment_details: string;
}

class UpdateTargetsDto {
  @IsString() @IsOptional() daily_target?: string | number;
  @IsString() @IsOptional() weekly_target?: string | number;
  @IsString() @IsOptional() monthly_target?: string | number;
}

class AppealAccountDto {
  @IsString() appeal_reason: string;
  @IsOptional() documents?: any[];
  @IsOptional() @IsString() document_url?: string;
}

@Controller('agents')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AgentsController {
  constructor(private agents: AgentsService) {}

  /** Agent gets their own profile */
  @Get('me')
  @Roles('agent')
  getMe(@Request() req) {
    return this.agents.findByTelegramId(req.user.telegramId);
  }

  /** Agent gets only their own rank (no other agent names exposed) */
  @Get('me/rank')
  @Roles('agent')
  getMyRank(@Request() req) {
    return this.agents.getMyRank(req.user.userId);
  }

  /** Agent updates their own payment details */
  @Patch('me/payment-details')
  @Roles('agent')
  updatePaymentDetails(@Request() req, @Body() body: UpdatePaymentDetailsDto) {
    return this.agents.updatePaymentDetails(req.user.telegramId, body.payment_method, body.payment_details);
  }

  /** Agent updates their own target goals */
  @Patch('me/targets')
  @Roles('agent')
  updateTargets(@Request() req, @Body() body: UpdateTargetsDto) {
    return this.agents.updateTargets(
      req.user.telegramId, 
      Number(body.daily_target || 0), 
      Number(body.weekly_target || 0), 
      Number(body.monthly_target || 0)
    );
  }

  /** Leaderboard visible to agents and admins */
  @Get('leaderboard')
  @Roles('agent', 'admin')
  getLeaderboard() {
    return this.agents.getLeaderboard();
  }

  /** Admin only — list all agents */
  @Get()
  @Roles('admin')
  findAll() {
    return this.agents.findAll();
  }

  /** Admin only — pending agents */
  @Get('pending')
  @Roles('admin')
  getPending() {
    return this.agents.getPending();
  }

  /** Admin only — single agent */
  @Get(':id')
  @Roles('admin')
  findOne(@Param('id') id: string) {
    return this.agents.findById(id);
  }

  /** Admin only — approve/reject agent */
  @Patch(':id/status')
  @Roles('admin')
  updateStatus(@Param('id') id: string, @Body() body: UpdateStatusDto) {
    return this.agents.updateStatus(id, body.status);
  }

  /** Agent appeals their rejected account (one-time only) */
  @Patch('me/appeal')
  @Roles('agent')
  appealAccount(@Request() req, @Body() body: AppealAccountDto) {
    return this.agents.appealAccount(req.user.telegramId, body.appeal_reason, body.document_url, body.documents);
  }
}

