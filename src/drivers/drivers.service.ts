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
  vehicle_category: string;
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

    try {
      const { data, error } = await this.supabase.admin
        .from('drivers')
        .insert({
          full_name: dto.full_name,
          phone: dto.phone,
          license_plate: dto.license_plate,
          vehicle_category: dto.vehicle_category,
          car_model: dto.car_model,
          location: dto.location,
          document_url: dto.document_url || null,
          registered_by: agent.id,
        })
        .select()
        .single();

      if (error) {
        // Handle Postgres unique constraint violation (code 23505) gracefully
        if (error.code === '23505') {
          if (error.message.includes('phone')) {
            throw new BadRequestException('This phone number is already registered.');
          }
          if (error.message.includes('license_plate')) {
            throw new BadRequestException('This license plate is already registered.');
          }
          throw new BadRequestException('This driver is already registered.');
        }
        throw new Error(error.message);
      }
      return data;
    } catch (e: any) {
      if (e instanceof BadRequestException || e instanceof ForbiddenException) {
        throw e;
      }
      throw new Error(`Registration failed: ${e.message}`);
    }
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
    // 1. Get driver and full agent details
    const { data: driverInfo, error: fetchError } = await this.supabase.admin
      .from('drivers')
      .select('*, agent:agents!registered_by(telegram_id, full_name, price_per_driver, price_latest_model, price_older_model)')
      .eq('id', driverId)
      .single();

    if (fetchError || !driverInfo) {
      throw new Error('Driver not found');
    }

    const agent = driverInfo.agent as any;

    // 2. Calculate payout: agent flat override > agent tier override > global tier
    let calculatedPayout = 0;
    if (agent?.price_per_driver !== null && agent?.price_per_driver !== undefined) {
      // Flat per-agent custom override (overrides everything)
      calculatedPayout = Number(agent.price_per_driver);
    } else if (driverInfo.vehicle_category === 'LATEST_OR_EV') {
      // Latest model: use agent tier override, or global tier
      const globalTiers = await this.settings.getTieredPrices();
      calculatedPayout = (agent?.price_latest_model !== null && agent?.price_latest_model !== undefined)
        ? Number(agent.price_latest_model)
        : globalTiers.price_latest_model;
    } else {
      // Older model: use agent tier override, or global tier
      const globalTiers = await this.settings.getTieredPrices();
      calculatedPayout = (agent?.price_older_model !== null && agent?.price_older_model !== undefined)
        ? Number(agent.price_older_model)
        : globalTiers.price_older_model;
    }

    // 3. Update driver status and save the exact payout amount
    const { data, error } = await this.supabase.admin
      .from('drivers')
      .update({ status: 'VERIFIED', payout_amount: calculatedPayout })
      .eq('id', driverId)
      .select('*, agent:agents!registered_by(telegram_id, full_name)')
      .single();
    if (error) throw new Error(error.message);

    const updatedAgent = data.agent as any;

    // Log the action
    await this.auditLogs.logAction(adminId, 'VERIFY_DRIVER', 'driver', driverId, { driverName: data.full_name });

    // Enqueue personalized Telegram notification
    const chatId = updatedAgent?.telegram_id;
    if (chatId) {
      const agentName = updatedAgent?.full_name || 'Agent';
      const categoryLabel = data.vehicle_category === 'LATEST_OR_EV' ? 'Latest Model / EV' : 'Standard Model';
      const text =
        `🌟 *Dear ${agentName},*\n\n` +
        `We are pleased to inform you that your registered driver has been successfully verified.\n\n` +
        `*Driver:* ${data.full_name}\n` +
        `*Phone:* ${data.phone}\n` +
        `*Vehicle:* ${data.car_model} (${categoryLabel})\n\n` +
        `*You have earned ${calculatedPayout.toFixed(0)} Birr* for this verification. 💰\n\n` +
        `Thank you for your continued hard work and dedication. Keep up the great effort!`;
      await this.supabase.admin.from('telegram_queue').insert({ chat_id: String(chatId), message: text });
    }

    return data;
  }

  async declineDriver(driverId: string, adminId: string, adminNote?: string) {
    const { data, error } = await this.supabase.admin
      .from('drivers')
      .update({ status: 'DECLINED', admin_note: adminNote || null })
      .eq('id', driverId)
      .select('*, agent:agents!registered_by(telegram_id, full_name)')
      .single();
    if (error) throw new Error(error.message);

    // Log the action
    await this.auditLogs.logAction(adminId, 'DECLINE_DRIVER', 'driver', driverId, { adminNote, driverName: data.full_name });

    // Enqueue personalized Telegram notification
    const agent = data.agent as any;
    const chatId = agent?.telegram_id;
    if (chatId) {
      const agentName = agent?.full_name || 'Agent';
      const text =
        `📋 *Dear ${agentName},*\n\n` +
        `We regret to inform you that after a thorough review, we were unfortunately unable to verify the following driver in our Peace Ride platform.\n\n` +
        `*Driver:* ${data.full_name}\n` +
        `*Phone:* ${data.phone}\n` +
        `*Vehicle:* ${data.car_model}\n` +
        (adminNote ? `\n*Reason:* _${adminNote}_\n` : '\n') +
        `If you believe this is a mistake or have any questions, please do not hesitate to reach out to the Peace Ride team. We appreciate your understanding and continued efforts.`;
      await this.supabase.admin.from('telegram_queue').insert({ chat_id: String(chatId), message: text });
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
