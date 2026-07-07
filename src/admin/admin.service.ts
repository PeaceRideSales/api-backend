import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SupabaseService } from '../supabase/supabase.service';
import { AuthService } from '../auth/auth.service';

@Injectable()
export class AdminService {
  constructor(
    private supabase: SupabaseService,
    private auth: AuthService,
    private config: ConfigService,
  ) {}

  private generateInviteCode(): string {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ0123456789';
    return Array.from({ length: 12 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  }

  async createInvite(createdBy: string) {
    const code = this.generateInviteCode();

    const { data, error } = await this.supabase.admin
      .from('admin_invites')
      .insert({ code, created_by: createdBy })
      .select()
      .single();

    if (error) throw new Error(error.message);
    return data;
  }

  async redeemInvite(code: string, email: string, password: string) {
    const { data: invite, error } = await this.supabase.admin
      .from('admin_invites')
      .select('*')
      .eq('code', code)
      .single();

    if (error || !invite) throw new NotFoundException('Invalid invite code');
    if (invite.used) throw new BadRequestException('Invite code already used');
    if (new Date(invite.expires_at) < new Date()) {
      throw new BadRequestException('Invite code expired');
    }

    // Create Supabase auth user
    const { data: authData, error: authError } = await this.supabase.admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { role: 'admin' },
    });

    if (authError) throw new BadRequestException(authError.message);

    // Mark invite as used
    await this.supabase.admin
      .from('admin_invites')
      .update({ used: true, used_by: authData.user.id })
      .eq('id', invite.id);

    const token = this.auth.signAdminToken(authData.user.id);
    return { token, user: authData.user };
  }

  async loginAdmin(email: string, password: string) {
    const adminEmail = this.config.get('ADMIN_EMAIL');
    const adminPassword = this.config.get('ADMIN_PASSWORD');

    // Debug: log what we're comparing (remove after login works)
    console.log('[AdminLogin] ENV email:', JSON.stringify(adminEmail));
    console.log('[AdminLogin] ENV password:', JSON.stringify(adminPassword));
    console.log('[AdminLogin] REQ email:', JSON.stringify(email));
    console.log('[AdminLogin] REQ password:', JSON.stringify(password));

    if (!adminEmail || !adminPassword) {
      throw new BadRequestException('Admin credentials not configured on the server.');
    }

    if (email.trim() !== adminEmail.trim() || password !== adminPassword) {
      throw new BadRequestException('Invalid credentials');
    }

    const adminId = 'admin-' + Buffer.from(email).toString('hex').slice(0, 16);
    const token = this.auth.signAdminToken(adminId);
    return { token, user: { id: adminId, email } };
  }

  async listInvites(adminId: string) {
    const { data, error } = await this.supabase.admin
      .from('admin_invites')
      .select('*')
      .eq('created_by', adminId)
      .order('created_at', { ascending: false });

    if (error) throw new Error(error.message);
    return data;
  }
}
