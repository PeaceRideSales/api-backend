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
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    // Fetch drivers from last 30 days
    const { data: drivers, error } = await this.supabase.admin
      .from('drivers')
      .select('created_at, car_model, location')
      .gte('created_at', thirtyDaysAgo.toISOString());

    if (error) throw new Error(error.message);

    // 1. Trend (Area Chart): Registrations per day
    const trendMap = new Map<string, number>();
    // Pre-fill last 30 days with 0
    for (let i = 29; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      trendMap.set(d.toISOString().split('T')[0], 0);
    }
    
    // 2. Car Model (Donut Chart)
    const carModelMap = new Map<string, number>();

    // 3. Location (Bar Chart)
    const locationMap = new Map<string, number>();

    for (const driver of drivers || []) {
      // Trend
      const dateKey = driver.created_at.split('T')[0];
      if (trendMap.has(dateKey)) {
        trendMap.set(dateKey, trendMap.get(dateKey)! + 1);
      }

      // Car Model
      const cm = driver.car_model || 'Unknown';
      carModelMap.set(cm, (carModelMap.get(cm) || 0) + 1);

      // Location
      const loc = driver.location || 'Unknown';
      locationMap.set(loc, (locationMap.get(loc) || 0) + 1);
    }

    const trend = Array.from(trendMap.entries()).map(([date, count]) => ({ date, count }));
    
    const carModels = Array.from(carModelMap.entries())
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value) // Sort desc
      .slice(0, 8); // Top 8 models
      
    const locations = Array.from(locationMap.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count); // Sort desc

    return {
      trend,
      carModels,
      locations
    };
  }
}
