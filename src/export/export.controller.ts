import { Controller, Get, Post, Param, Query, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { ExportService } from './export.service';
import { GoogleSheetsService } from './google-sheets.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';

@Controller('export')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
export class ExportController {
  constructor(
    private export_: ExportService,
    private googleSheets: GoogleSheetsService,
  ) {}

  /** Download Excel for ALL agents */
  @Get('all')
  async exportAll(
    @Res() res: Response,
    @Query('start_date') start_date?: string,
    @Query('end_date') end_date?: string,
  ) {
    const buffer = await this.export_.generateAllAgentsExcel({ start_date, end_date });
    const date = new Date().toISOString().split('T')[0];
    res.set({
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="peace-ride-all-drivers-${date}.xlsx"`,
      'Content-Length': buffer.length,
    });
    res.end(buffer);
  }

  /** Download Excel for a single agent */
  @Get('agent/:id')
  async exportAgent(@Param('id') id: string, @Res() res: Response) {
    const buffer = await this.export_.generateAgentExcel(id);
    const date = new Date().toISOString().split('T')[0];
    res.set({
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="peace-ride-agent-${id}-${date}.xlsx"`,
      'Content-Length': buffer.length,
    });
    res.end(buffer);
  }

  /** Sync data to Google Sheets */
  @Post('google-sheets')
  async syncToGoogleSheets(
    @Query('start_date') start_date?: string,
    @Query('end_date') end_date?: string,
  ) {
    return this.googleSheets.syncAllDrivers({ start_date, end_date });
  }
}
