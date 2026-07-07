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
import { IsEnum, IsString } from 'class-validator';

class UpdateStatusDto {
  @IsEnum(['APPROVED', 'REJECTED'])
  status: 'APPROVED' | 'REJECTED';
}

class UpdatePaymentDetailsDto {
  @IsString() payment_method: string;
  @IsString() payment_details: string;
}

@Controller('agents')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AgentsController {
  constructor(private agents: AgentsService) {}

  /** Agent updates their own payment details */
  @Patch('me/payment-details')
  @Roles('agent')
  updatePaymentDetails(@Request() req, @Body() body: UpdatePaymentDetailsDto) {
    return this.agents.updatePaymentDetails(req.user.telegramId, body.payment_method, body.payment_details);
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
}
