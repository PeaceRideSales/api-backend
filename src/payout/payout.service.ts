import { Injectable } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { SettingsService } from '../settings/settings.service';

@Injectable()
export class PayoutService {
  constructor(
    private supabase: SupabaseService,
    private settings: SettingsService,
  ) {}

  async getSummary() {
    const globalPrice = await this.settings.getRegistrationPrice();

    // Get all agents with their driver counts
    const { data: agents, error: agentsErr } = await this.supabase.admin
      .from('agents')
      .select('id, full_name, telegram_username, status, price_per_driver, payment_method, payment_details')
      .eq('status', 'APPROVED');

    if (agentsErr) throw new Error(agentsErr.message);

    // Get verified drivers grouped by agent
    const { data: drivers, error: driversErr } = await this.supabase.admin
      .from('drivers')
      .select('registered_by, status, payout_amount')
      .eq('status', 'VERIFIED');

    if (driversErr) throw new Error(driversErr.message);

    // Build per-agent payout breakdown
    const verifiedByAgent: Record<string, { count: number, payout: number }> = {};
    for (const d of (drivers || [])) {
      if (!verifiedByAgent[d.registered_by]) verifiedByAgent[d.registered_by] = { count: 0, payout: 0 };
      verifiedByAgent[d.registered_by].count += 1;
      // Default to 100 if for some reason legacy drivers have no payout_amount
      verifiedByAgent[d.registered_by].payout += Number(d.payout_amount ?? 100); 
    }

    let totalPayout = 0;
    const agentBreakdown = (agents || []).map(agent => {
      const verifiedCount = verifiedByAgent[agent.id]?.count || 0;
      const payout = verifiedByAgent[agent.id]?.payout || 0;
      totalPayout += payout;
      
      return {
        id: agent.id,
        full_name: agent.full_name,
        telegram_username: agent.telegram_username,
        price_per_driver: Number(agent.price_per_driver ?? globalPrice),
        has_custom_price: agent.price_per_driver !== null && agent.price_per_driver !== undefined,
        payment_method: agent.payment_method,
        payment_details: agent.payment_details,
        verified_drivers: verifiedCount,
        payout,
      };
    });

    // Also get all drivers counts per agent (pending + declined)
    const { data: allDrivers } = await this.supabase.admin
      .from('drivers')
      .select('registered_by, status');

    const allByAgent: Record<string, { total: number; pending: number; declined: number }> = {};
    for (const d of (allDrivers || [])) {
      if (!allByAgent[d.registered_by]) allByAgent[d.registered_by] = { total: 0, pending: 0, declined: 0 };
      allByAgent[d.registered_by].total++;
      if (d.status === 'PENDING') allByAgent[d.registered_by].pending++;
      if (d.status === 'DECLINED') allByAgent[d.registered_by].declined++;
    }

    const enriched = agentBreakdown.map(a => ({
      ...a,
      total_drivers: allByAgent[a.id]?.total || 0,
      pending_drivers: allByAgent[a.id]?.pending || 0,
      declined_drivers: allByAgent[a.id]?.declined || 0,
    }));

    return {
      global_price: globalPrice,
      total_payout: totalPayout,
      total_verified_drivers: drivers?.length || 0,
      agents: enriched,
    };
  }

  async setAgentPrice(agentId: string, price: number | null) {
    const { data, error } = await this.supabase.admin
      .from('agents')
      .update({ price_per_driver: price })
      .eq('id', agentId)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return data;
  }
}
