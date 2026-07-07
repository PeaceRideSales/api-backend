import { Controller, Get, UseGuards } from '@nestjs/common';
import { StatsService } from './stats.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';

@Controller('stats')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
export class StatsController {
  constructor(private stats: StatsService) {}

  @Get()
  getDashboard() {
    return this.stats.getDashboardStats();
  }

  @Get('leaderboard')
  getLeaderboard() {
    return this.stats.getAgentLeaderboard();
  }
}
