import { Controller, Get, Patch, Param, Body, UseGuards } from '@nestjs/common';
import { PayoutService } from './payout.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { IsOptional, IsNumber } from 'class-validator';
import { Type } from 'class-transformer';

class SetAgentPriceDto {
  @IsOptional() @Type(() => Number) @IsNumber() price_latest_model?: number | null;
  @IsOptional() @Type(() => Number) @IsNumber() price_older_model?: number | null;
  @IsOptional() @Type(() => Number) @IsNumber() price_per_driver?: number | null;
}

@Controller('payout')
@UseGuards(JwtAuthGuard, RolesGuard)
export class PayoutController {
  constructor(private payout: PayoutService) {}

  @Get('summary')
  @Roles('admin')
  getSummary() {
    return this.payout.getSummary();
  }

  @Patch('agents/:id/price')
  @Roles('admin')
  setAgentPrice(@Param('id') id: string, @Body() body: SetAgentPriceDto) {
    return this.payout.setAgentPrice(id, body);
  }
}
