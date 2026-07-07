import {
  Injectable,
  ForbiddenException,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { AgentsService } from '../agents/agents.service';
import { SettingsService } from '../settings/settings.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';

export interface CreateDriverDto {
  full_name: string;
  phone: string;
  license_plate: string;
  car_type: string;
  car_model: string;
  location: string;
  document_url?: string;
}

@Injectable()
export class DriversService {
  constructor(
    private supabase: SupabaseService,
    private agents: AgentsService,
    private settings: SettingsService,
    private auditLogs: AuditLogsService,
  ) {}

  async create(agentTelegramId: number, dto: CreateDriverDto) {
    // Verify agent is approved
    const agent = await this.agents.findByTelegramId(agentTelegramId);
    if (!agent) throw new ForbiddenException('Agent not found');
    if (agent.status !== 'APPROVED') {
      throw new ForbiddenException('Your account is pending approval');
    }

    // Check for duplicate phone or license plate
    const { data: existing } = await this.supabase.admin
      .from('drivers')
      .select('phone, license_plate')
      .or(`phone.eq.${dto.phone},license_plate.eq.${dto.license_plate}`)
      .limit(1)
      .maybeSingle();

    if (existing) {
      if (existing.phone === dto.phone) {
        throw new BadRequestException('This phone number is already registered by another agent.');
      }
      if (existing.license_plate === dto.license_plate) {
        throw new BadRequestException('This license plate is already registered by another agent.');
      }
    }

    const { data, error } = await this.supabase.admin
      .from('drivers')
      .insert({
        full_name: dto.full_name,
        phone: dto.phone,
        license_plate: dto.license_plate,
        car_type: dto.car_type,
        car_model: dto.car_model,
        location: dto.location,
        document_url: dto.document_url || null,
        registered_by: agent.id,
      })
      .select()
      .single();

    if (error) throw new Error(error.message);
    return data;
  }

  async findAll(filters: { agent_id?: string; start_date?: string; end_date?: string }, page = 1, limit = 50) {
    const offset = (page - 1) * limit;

    let query = this.supabase.admin
      .from('drivers')
      .select(`*, agent:agents(id, full_name, telegram_username)`, { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (filters?.agent_id) query = query.eq('registered_by', filters.agent_id);
    if (filters?.start_date) query = query.gte('created_at', filters.start_date);
    if (filters?.end_date) query = query.lte('created_at', filters.end_date + 'T23:59:59Z');

    const { data, count, error } = await query;
    if (error) throw new Error(error.message);
    
    return {
      data,
      total: count || 0,
      page,
      limit,
    };
  }

  async findMyDrivers(agentTelegramId: number) {
    const agent = await this.agents.findByTelegramId(agentTelegramId);
    if (!agent) throw new ForbiddenException('Agent not found');

    const { data: drivers, error } = await this.supabase.admin
      .from('drivers')
      .select('*')
      .eq('registered_by', agent.id)
      .order('created_at', { ascending: false });

    if (error) throw new Error(error.message);

    const now = new Date();
    const weekStart = new Date(now.getTime() - 7 * 86400000).getTime();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();

    let thisWeek = 0, thisMonth = 0, verified = 0, pending = 0, declined = 0;

    drivers.forEach(d => {
      const time = new Date(d.created_at).getTime();
      if (time >= weekStart) thisWeek++;
      if (time >= monthStart) thisMonth++;
      if (d.status === 'VERIFIED') verified++;
      else if (d.status === 'DECLINED') declined++;
      else pending++;
    });

    // Use agent's custom price if set, otherwise global default
    const globalPrice = await this.settings.getRegistrationPrice();
    const pricePerDriver = Number((agent as any).price_per_driver ?? globalPrice);

    return {
      stats: {
        total: drivers.length,
        thisWeek,
        thisMonth,
        verified,
        pending,
        declined,
        earnings: verified * pricePerDriver,
        pricePerDriver,
      },
      drivers,
    };
  }

  async verifyDriver(driverId: string, adminId: string) {
    const { data, error } = await this.supabase.admin
      .from('drivers')
      .update({ status: 'VERIFIED', admin_note: null })
      .eq('id', driverId)
      .select('*, agent:agents!registered_by(telegram_id, price_per_driver)')
      .single();
    if (error) throw new Error(error.message);

    // Log the action
    await this.auditLogs.logAction(adminId, 'VERIFY_DRIVER', 'driver', driverId, { driverName: data.full_name });

    // Send Telegram notification
    try {
      const globalPrice = await this.settings.getRegistrationPrice();
      const price = Number((data.agent as any)?.price_per_driver ?? globalPrice);
      const token = process.env.TELEGRAM_BOT_TOKEN;
      const chatId = (data.agent as any)?.telegram_id;
      if (token && chatId) {
        const text = `✅ *Good news!*\nYour driver *${data.full_name}* (${data.license_plate}) was verified.\nYou just earned *$${price.toFixed(2)}*!`;
        await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'Markdown' })
        });
      }
    } catch (e) {
      console.error('Failed to send Telegram notification:', e);
    }

    return data;
  }

  async declineDriver(driverId: string, adminId: string, adminNote?: string) {
    const { data, error } = await this.supabase.admin
      .from('drivers')
      .update({ status: 'DECLINED', admin_note: adminNote || null })
      .eq('id', driverId)
      .select('*, agent:agents!registered_by(telegram_id)')
      .single();
    if (error) throw new Error(error.message);

    // Log the action
    await this.auditLogs.logAction(adminId, 'DECLINE_DRIVER', 'driver', driverId, { adminNote, driverName: data.full_name });

    // Send Telegram notification
    try {
      const token = process.env.TELEGRAM_BOT_TOKEN;
      const chatId = (data.agent as any)?.telegram_id;
      if (token && chatId) {
        const text = `❌ *Driver Declined*\nYour driver *${data.full_name}* (${data.license_plate}) was declined.${adminNote ? `\nReason: _${adminNote}_` : ''}`;
        await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'Markdown' })
        });
      }
    } catch (e) {
      console.error('Failed to send Telegram notification:', e);
    }

    return data;
  }

  async updateDocument(driverId: string, agentTelegramId: number, documentUrl: string) {
    // Find the driver
    const { data: driver, error: fetchErr } = await this.supabase.admin
      .from('drivers')
      .select('*, agent:agents!registered_by(*)')
      .eq('id', driverId)
      .single();

    if (fetchErr || !driver) throw new NotFoundException('Driver not found');

    // Must be registered by this agent
    if (driver.agent.telegram_id !== agentTelegramId) {
      throw new ForbiddenException('You can only update your own drivers');
    }

    // Check one-time update
    if (driver.agent.document_update_used) {
      throw new BadRequestException('Document update limit reached');
    }

    // Update driver document
    const { data: updated, error: updateErr } = await this.supabase.admin
      .from('drivers')
      .update({ document_url: documentUrl })
      .eq('id', driverId)
      .select()
      .single();

    if (updateErr) throw new Error(updateErr.message);

    // Mark agent's one-time update as used
    await this.supabase.admin
      .from('agents')
      .update({ document_update_used: true })
      .eq('id', driver.registered_by);

    return updated;
  }
}
