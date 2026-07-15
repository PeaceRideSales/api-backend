import { Controller, Get, Post, Body, Query, UseGuards } from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { IsEnum, IsString, IsOptional, IsNumber } from 'class-validator';

class CreateNotificationDto {
  @IsEnum(['ALL', 'INDIVIDUAL'])
  type: 'ALL' | 'INDIVIDUAL';

  @IsOptional()
  @IsNumber()
  telegram_id?: number;

  @IsString()
  message: string;
}

@Controller('notifications')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
export class NotificationsController {
  constructor(private notifications: NotificationsService) {}

  @Get()
  findAll(
    @Query('page') page = '1',
    @Query('limit') limit = '50',
  ) {
    return this.notifications.findAll(Number(page), Math.min(Number(limit), 100));
  }

  @Post()
  create(@Body() body: CreateNotificationDto) {
    return this.notifications.broadcastNotification(body.type, body.message, body.telegram_id);
  }
}
