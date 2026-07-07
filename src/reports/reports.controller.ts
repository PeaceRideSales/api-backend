import { Controller, Get, UseGuards } from '@nestjs/common';
import { ReportsService } from './reports.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AdminGuard } from '../auth/admin.guard';

@Controller('reports')
@UseGuards(JwtAuthGuard, AdminGuard)
export class ReportsController {
  constructor(private reports: ReportsService) {}

  @Get()
  findAll() {
    return this.reports.findAll();
  }
}
