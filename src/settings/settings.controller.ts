import { Controller, Get, Patch, Body, UseGuards, Request } from '@nestjs/common';
import { SettingsService } from './settings.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { IsNumber, Min, IsString, IsOptional } from 'class-validator';
import { Type } from 'class-transformer';

class UpdateSettingsDto {
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @IsOptional()
  driver_registration_price?: number;

  @IsString()
  @IsOptional()
  google_sheet_id?: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @IsOptional()
  price_latest_model?: number;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @IsOptional()
  price_older_model?: number;
}

@Controller('settings')
export class SettingsController {
  constructor(private readonly settingsService: SettingsService) {}

  /** Public — agents/admin can read settings */
  @Get()
  getSettings() {
    return this.settingsService.getSettings();
  }

  /** Admin only — update global settings */
  @Patch()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  updateSettings(@Request() req, @Body() dto: UpdateSettingsDto) {
    return this.settingsService.updateSettings(dto, req.user.id);
  }
}
