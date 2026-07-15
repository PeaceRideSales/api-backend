import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { NotificationsService } from '../notifications/notifications.service';

@Injectable()
export class AgentsService {
  private leaderboardCache: any = null;
  private leaderboardCacheTime = 0;
  private readonly CACHE_TTL = 30000; // 30 seconds

  constructor(
    private supabase: SupabaseService,
    private notifications: NotificationsService,
  ) {}

  private sanitizeDocuments(docs: any[]): { type_id: string; url: string }[] {
    if (!Array.isArray(docs)) return [];
    return docs.flatMap(d => {
      if (Array.isArray(d) || d == null) return [];
      if (typeof d === 'string' && d.trim()) return [{ type_id: 'primary_document', url: d.trim() }];
      if (typeof d === 'object') {
        const url = (d.url || d.document_url || d.file_url || '').trim();
        const type_id = (d.type_id || 'primary_document').trim();
        if (url) return [{ type_id, url }];
      }
      return [];
    });
  }

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
    const now = Date.now();
    if (this.leaderboardCache && now - this.leaderboardCacheTime < this.CACHE_TTL) {
      return this.leaderboardCache;
    }

    // Get all approved agents
    const { data: agents, error: agentsErr } = await this.supabase.admin
      .from('agents')
      .select('id, full_name, telegram_username')
      .eq('status', 'APPROVED');

    if (agentsErr) throw new Error(agentsErr.message);

    // Get all drivers with status + registered_by (minimal columns for speed)
    const { data: drivers, error: driversErr } = await this.supabase.admin
      .from('drivers')
      .select('registered_by, status');

    if (driversErr) throw new Error(driversErr.message);

    // Count verified and total per agent
    const verifiedCounts: Record<string, number> = {};
    const totalCounts: Record<string, number> = {};
    for (let i = 0; i < drivers.length; i++) {
      const d = drivers[i];
      totalCounts[d.registered_by] = (totalCounts[d.registered_by] || 0) + 1;
      if (d.status === 'VERIFIED') {
        verifiedCounts[d.registered_by] = (verifiedCounts[d.registered_by] || 0) + 1;
      }
    }

    const leaderboard = agents.map(a => ({
      id: a.id,
      name: a.full_name || `@${a.telegram_username}`,
      verified_drivers: verifiedCounts[a.id] || 0,
      total_drivers: totalCounts[a.id] || 0,
    })).sort((a, b) => b.verified_drivers - a.verified_drivers);

    this.leaderboardCache = leaderboard;
    this.leaderboardCacheTime = now;

    return leaderboard;
  }

  async getMyRank(agentId: string) {
    const leaderboard = await this.getLeaderboard();
    const rank = leaderboard.findIndex(a => a.id === agentId) + 1;
    const myEntry = leaderboard.find(a => a.id === agentId);
    const agentAbove = rank > 1 ? leaderboard[rank - 2] : null;
    const agentBelow = rank < leaderboard.length ? leaderboard[rank] : null;

    return {
      rank: rank || null,
      total_agents: leaderboard.length,
      verified_drivers: myEntry?.verified_drivers ?? 0,
      total_drivers: myEntry?.total_drivers ?? 0,
      drivers_to_next_rank: agentAbove ? agentAbove.verified_drivers - (myEntry?.verified_drivers ?? 0) : 0,
      rank_above_verified: agentAbove?.verified_drivers ?? null,
      rank_below_verified: agentBelow?.verified_drivers ?? null,
    };
  }

  async appealAccount(telegramId: number, appealReason: string, documentUrl?: string, documents?: any[]) {
    const agent = await this.findByTelegramId(telegramId);
    if (!agent) throw new NotFoundException('Agent not found');

    if (agent.status !== 'REJECTED') {
      throw new BadRequestException('Your account is not currently rejected');
    }
    if ((agent as any).appealed) {
      throw new BadRequestException(
        'You have already submitted a one-time appeal for your account',
      );
    }
    if (!appealReason || appealReason.trim().length < 10) {
      throw new BadRequestException(
        'Please provide a detailed appeal reason (at least 10 characters)',
      );
    }

    const updatePayload: Record<string, any> = {
      status: 'PENDING',
      appealed: true,
      appeal_reason: appealReason.trim(),
    };
    if (documentUrl !== undefined) updatePayload.document_url = documentUrl;
    if (documents !== undefined) updatePayload.documents = this.sanitizeDocuments(documents);

    const { data, error } = await this.supabase.admin
      .from('agents')
      .update(updatePayload)
      .eq('telegram_id', telegramId)
      .select()
      .single();

    if (error) throw new Error(error.message);

    // Notify admin
    const adminChatId = process.env.ADMIN_TELEGRAM_ID;
    if (adminChatId) {
      const agentName = (agent as any).full_name || `@${(agent as any).telegram_username}` || 'Unknown';
      const text =
        `📣 *Agent Account Appeal*\n\n` +
        `Agent *${agentName}* has submitted an appeal for their rejected account.\n\n` +
        `*Appeal Reason:*\n_${appealReason.trim()}_\n\n` +
        `Please review this appeal in the admin portal.`;
      await this.notifications.queueTelegramMessage(adminChatId, text);
    }

    return data;
  }
}
