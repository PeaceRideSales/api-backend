import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';

@Injectable()
export class ReferralService {
  constructor(private supabase: SupabaseService) {}

  private generateCode(): string {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    const segment = (len: number) =>
      Array.from({ length: len }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
    return `PEACE-${segment(4)}-${segment(4)}`;
  }

  async createCode(adminUserId: string, label?: string) {
    const code = this.generateCode();

    const { data, error } = await this.supabase.admin
      .from('referral_codes')
      .insert({ code, label: label || null, created_by: adminUserId })
      .select()
      .single();

    if (error) throw new Error(error.message);
    return data;
  }

  async validateAndApplyCode(code: string, agentId: string) {
    const { data: referral, error } = await this.supabase.admin
      .from('referral_codes')
      .select('*')
      .eq('code', code.toUpperCase())
      .eq('is_active', true)
      .single();

    if (error || !referral) throw new NotFoundException('Invalid or inactive referral code');

    // Apply: approve agent and increment usage count
    await Promise.all([
      this.supabase.admin
        .from('agents')
        .update({ status: 'APPROVED', referral_code_used: referral.id })
        .eq('id', agentId),
      this.supabase.admin
        .from('referral_codes')
        .update({ used_count: referral.used_count + 1 })
        .eq('id', referral.id),
    ]);

    return { success: true, message: 'Account approved via referral code' };
  }

  async findAll() {
    const { data, error } = await this.supabase.admin
      .from('referral_codes')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw new Error(error.message);
    return data;
  }

  async toggleActive(id: string, is_active: boolean) {
    const { data, error } = await this.supabase.admin
      .from('referral_codes')
      .update({ is_active })
      .eq('id', id)
      .select()
      .single();

    if (error) throw new Error(error.message);
    return data;
  }
}
