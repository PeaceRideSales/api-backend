import { Injectable, NotFoundException } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';

@Injectable()
export class AgentsService {
  constructor(private supabase: SupabaseService) {}

  async findAll() {
    const { data, error } = await this.supabase.admin
      .from('agents')
      .select(`
        *,
        driver_count:drivers(count)
      `)
      .order('created_at', { ascending: false });

    if (error) throw new Error(error.message);

    return data.map((a) => ({
      ...a,
      driver_count: a.driver_count?.[0]?.count ?? 0,
    }));
  }

  async findById(id: string) {
    const { data, error } = await this.supabase.admin
      .from('agents')
      .select(`*, driver_count:drivers(count)`)
      .eq('id', id)
      .single();

    if (error || !data) throw new NotFoundException('Agent not found');
    return { ...data, driver_count: data.driver_count?.[0]?.count ?? 0 };
  }

  async findByTelegramId(telegramId: number) {
    const { data } = await this.supabase.admin
      .from('agents')
      .select('*')
      .eq('telegram_id', telegramId)
      .single();
    return data;
  }

  async updateStatus(id: string, status: 'APPROVED' | 'REJECTED') {
    const { data, error } = await this.supabase.admin
      .from('agents')
      .update({ status })
      .eq('id', id)
      .select()
      .single();

    if (error) throw new Error(error.message);
    return data;
  }

  async getPending() {
    const { data, error } = await this.supabase.admin
      .from('agents')
      .select('*')
      .eq('status', 'PENDING')
      .order('created_at', { ascending: true });

    if (error) throw new Error(error.message);
    return data;
  }

  async updatePaymentDetails(telegramId: number, method: string, details: string) {
    const { data, error } = await this.supabase.admin
      .from('agents')
      .update({ payment_method: method, payment_details: details })
      .eq('telegram_id', telegramId)
      .select()
      .single();

    if (error) throw new Error(error.message);
    return data;
  }
  async updateTargets(telegramId: number, daily: number, weekly: number, monthly: number) {
    const { data, error } = await this.supabase.admin
      .from('agents')
      .update({ daily_target: daily, weekly_target: weekly, monthly_target: monthly })
      .eq('telegram_id', telegramId)
      .select()
      .single();

    if (error) throw new Error(error.message);
    return data;
  }

  async getLeaderboard() {
    // Get all approved agents
    const { data: agents, error: agentsErr } = await this.supabase.admin
      .from('agents')
      .select('id, full_name, telegram_username')
      .eq('status', 'APPROVED');

    if (agentsErr) throw new Error(agentsErr.message);

    // Get verified drivers
    const { data: drivers, error: driversErr } = await this.supabase.admin
      .from('drivers')
      .select('registered_by')
      .eq('status', 'VERIFIED');

    if (driversErr) throw new Error(driversErr.message);

    // Count
    const counts: Record<string, number> = {};
    for (const d of drivers) {
      counts[d.registered_by] = (counts[d.registered_by] || 0) + 1;
    }

    const leaderboard = agents.map(a => ({
      id: a.id,
      name: a.full_name || `@${a.telegram_username}`,
      verified_drivers: counts[a.id] || 0
    })).sort((a, b) => b.verified_drivers - a.verified_drivers).slice(0, 10);

    return leaderboard;
  }
}
