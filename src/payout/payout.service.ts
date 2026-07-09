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
    const globalTiers = await this.settings.getTieredPrices();

    // Get all approved agents with their tier overrides
    const { data: agents, error: agentsErr } = await this.supabase.admin
      .from('agents')
      .select('id, full_name, telegram_username, status, price_per_driver, price_latest_model, price_older_model, payment_method, payment_details')
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
      verifiedByAgent[d.registered_by].payout += Number(d.payout_amount ?? 120);
    }

    let totalPayout = 0;
    const agentBreakdown = (agents || []).map(agent => {
      const verifiedCount = verifiedByAgent[agent.id]?.count || 0;
      const payout = verifiedByAgent[agent.id]?.payout || 0;
      totalPayout += payout;

      const hasCustomLatest = agent.price_latest_model !== null && agent.price_latest_model !== undefined;
      const hasCustomOlder = agent.price_older_model !== null && agent.price_older_model !== undefined;
      const hasCustomFlat = agent.price_per_driver !== null && agent.price_per_driver !== undefined;

      return {
        id: agent.id,
        full_name: agent.full_name,
        telegram_username: agent.telegram_username,
        // Flat override (legacy)
        price_per_driver: hasCustomFlat ? Number(agent.price_per_driver) : null,
        has_custom_price: hasCustomFlat,
        // Tiered overrides
        price_latest_model: hasCustomLatest ? Number(agent.price_latest_model) : null,
        price_older_model: hasCustomOlder ? Number(agent.price_older_model) : null,
        has_custom_latest: hasCustomLatest,
        has_custom_older: hasCustomOlder,
        payment_method: agent.payment_method,
        payment_details: agent.payment_details,
        verified_drivers: verifiedCount,
        payout,
      };
    });

    // Get all driver counts per agent
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
      global_price_latest_model: globalTiers.price_latest_model,
      global_price_older_model: globalTiers.price_older_model,
      total_payout: totalPayout,
      total_verified_drivers: drivers?.length || 0,
      agents: enriched,
    };
  }

  async setAgentPrice(agentId: string, body: {
    price_latest_model?: number | null;
    price_older_model?: number | null;
    price_per_driver?: number | null; // legacy flat override
  }) {
    const update: Record<string, any> = {};
    if ('price_latest_model' in body) update.price_latest_model = body.price_latest_model;
    if ('price_older_model' in body) update.price_older_model = body.price_older_model;
    if ('price_per_driver' in body) update.price_per_driver = body.price_per_driver;

    const { data, error } = await this.supabase.admin
      .from('agents')
      .update(update)
      .eq('id', agentId)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return data;
  }
}
