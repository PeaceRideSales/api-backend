import { Injectable } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';

@Injectable()
export class StatsService {
  constructor(private supabase: SupabaseService) {}

  async getDashboardStats() {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
    const weekStart = new Date(now.getTime() - 7 * 86400000).toISOString();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

    const [
      { count: total_drivers },
      { count: total_agents },
      { count: pending_agents },
      { count: drivers_today },
      { count: drivers_this_week },
      { count: drivers_this_month },
    ] = await Promise.all([
      this.supabase.admin.from('drivers').select('*', { count: 'exact', head: true }),
      this.supabase.admin.from('agents').select('*', { count: 'exact', head: true }).eq('status', 'APPROVED'),
      this.supabase.admin.from('agents').select('*', { count: 'exact', head: true }).eq('status', 'PENDING'),
      this.supabase.admin.from('drivers').select('*', { count: 'exact', head: true }).gte('created_at', todayStart),
      this.supabase.admin.from('drivers').select('*', { count: 'exact', head: true }).gte('created_at', weekStart),
      this.supabase.admin.from('drivers').select('*', { count: 'exact', head: true }).gte('created_at', monthStart),
    ]);

    return {
      total_drivers: total_drivers ?? 0,
      total_agents: total_agents ?? 0,
      pending_agents: pending_agents ?? 0,
      drivers_today: drivers_today ?? 0,
      drivers_this_week: drivers_this_week ?? 0,
      drivers_this_month: drivers_this_month ?? 0,
    };
  }

  async getAgentLeaderboard() {
    const { data, error } = await this.supabase.admin
      .from('agents')
      .select(`id, full_name, telegram_username, status, driver_count:drivers(count)`)
      .eq('status', 'APPROVED')
      .order('created_at', { ascending: false });

    if (error) throw new Error(error.message);

    return data
      .map((a) => ({ ...a, driver_count: a.driver_count?.[0]?.count ?? 0 }))
      .sort((a, b) => b.driver_count - a.driver_count);
  }

  async getChartData() {
    const { data, error } = await this.supabase.admin.rpc('get_dashboard_stats', { days_back: 30 });
    
    if (error) {
      throw new Error(`Failed to fetch chart data: ${error.message}`);
    }

    return data;
  }
}
