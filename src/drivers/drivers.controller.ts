import {
  Controller,
  Post,
  Get,
  Patch,
  Param,
  Body,
  Query,
  UseGuards,
  Request,
} from '@nestjs/common';
import { DriversService } from './drivers.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { IsString, IsOptional, IsUrl, IsEnum } from 'class-validator';

class CreateDriverDto {
  @IsString() full_name: string;
  @IsString() phone: string;
  @IsString() license_plate: string;
  @IsEnum(['LATEST_OR_EV', 'OLDER']) vehicle_category: string;
  @IsString() car_model: string;
  @IsString() location: string;
  @IsOptional() documents?: any[];
  @IsOptional() @IsString() document_url?: string; // Keep for backwards compatibility
  @IsString() telegram_init_data: string;
}

class UpdateDocumentDto {
  @IsOptional() @IsUrl() document_url?: string;
  @IsOptional() documents?: any[];
  @IsString() telegram_init_data: string;
}

class DeclineDriverDto {
  @IsOptional() @IsString() admin_note?: string;
}

class AppealDriverDto {
  @IsString() appeal_reason: string;
  @IsOptional() @IsString() full_name?: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsString() car_model?: string;
  @IsOptional() @IsString() license_plate?: string;
  @IsOptional() @IsString() location?: string;
  @IsOptional() @IsString() document_url?: string;
  @IsOptional() documents?: any[];
}

@Controller('drivers')
@UseGuards(JwtAuthGuard, RolesGuard)
export class DriversController {
  constructor(private drivers: DriversService) {}

  /** Agent submits a new driver */
  @Post()
  @Roles('agent')
  create(@Request() req, @Body() body: CreateDriverDto) {
    const { telegram_init_data, ...dto } = body;
    return this.drivers.create(req.user.telegramId, dto);
  }

  /** Agent gets their own drivers and stats */
  @Get('me')
  @Roles('agent')
  findMyDrivers(@Request() req) {
    return this.drivers.findMyDrivers(req.user.telegramId);
  }

  /** Admin gets all drivers with optional filters (Paginated) */
  @Get()
  @Roles('admin')
  findAll(
    @Query('agent_id') agent_id?: string,
    @Query('start_date') start_date?: string,
    @Query('end_date') end_date?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const pageNum = page ? parseInt(page, 10) : 1;
    let limitNum = limit ? parseInt(limit, 10) : 50;
    
    // Security: Hard cap the limit to prevent memory exhaustion (OOM)
    if (limitNum > 100) limitNum = 100;

    return this.drivers.findAll({ agent_id, start_date, end_date }, pageNum, limitNum);
  }

  /** Admin verifies a driver */
  @Patch(':id/verify')
  @Roles('admin')
  verifyDriver(@Param('id') id: string, @Request() req) {
    return this.drivers.verifyDriver(id, req.user.id);
  }

  /** Admin declines a driver */
  @Patch(':id/decline')
  @Roles('admin')
  declineDriver(@Param('id') id: string, @Body('admin_note') note: string, @Request() req) {
    return this.drivers.declineDriver(id, req.user.id, note);
  }

  /** Admin updates driver's document */
  @Patch(':id/admin-document')
  @Roles('admin')
  updateAdminDocument(@Param('id') id: string, @Body('document_url') document_url: string) {
    return this.drivers.updateAdminDocument(id, document_url);
  }

  /** Agent updates document (one-time) */
  @Patch(':id/document')
  @Roles('agent')
  updateDocument(
    @Param('id') id: string,
    @Request() req,
    @Body() body: UpdateDocumentDto,
  ) {
    return this.drivers.updateDocument(id, req.user.telegramId, body.document_url, body.documents);
  }

  /** Agent appeals a declined driver (one-time only) */
  @Patch(':id/appeal')
  @Roles('agent')
  appealDriver(
    @Param('id') id: string,
    @Request() req,
    @Body() body: AppealDriverDto,
  ) {
    const { appeal_reason, ...updatedFields } = body;
    return this.drivers.appealDriver(id, req.user.telegramId, appeal_reason, updatedFields);
  }
}
