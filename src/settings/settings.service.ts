import { Injectable } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';

@Injectable()
export class SettingsService {
  constructor(
    private supabase: SupabaseService,
    private auditLogs: AuditLogsService
  ) {}

  async getSettings() {
    const { data, error } = await this.supabase.admin
      .from('system_settings')
      .select('*')
      .eq('id', 1)
      .single();

    if (error) {
      // Return defaults if table doesn't exist yet
      return { id: 1, driver_registration_price: 0 };
    }
    return data;
  }

  async updateSettings(dto: { driver_registration_price: number, google_sheet_id?: string }, adminId?: string) {
    // Try UPDATE first (most common path — row exists)
    const { data: updated, error: updateError } = await this.supabase.admin
      .from('system_settings')
      .update({ 
        driver_registration_price: dto.driver_registration_price,
        google_sheet_id: dto.google_sheet_id
      })
      .eq('id', 1)
      .select()
      .single();

    if (!updateError && updated) {
      // Row existed and was updated — log and return
      if (adminId) {
        await this.auditLogs.logAction(adminId, 'UPDATE_SETTINGS', 'system', '1', {
          new_price: dto.driver_registration_price,
          google_sheet_id: dto.google_sheet_id
        }).catch(() => { /* audit log is best-effort */ });
      }
      return updated;
    }

    // Row doesn't exist yet — insert it
    const { data: inserted, error: insertError } = await this.supabase.admin
      .from('system_settings')
      .insert({ 
        id: 1, 
        driver_registration_price: dto.driver_registration_price,
        google_sheet_id: dto.google_sheet_id
      })
      .select()
      .single();

    if (insertError) {
      console.error('[Settings] Failed to update or insert settings:', insertError.code, insertError.message);
      throw new Error(insertError.message);
    }

    if (adminId) {
      await this.auditLogs.logAction(adminId, 'UPDATE_SETTINGS', 'system', '1', {
        new_price: dto.driver_registration_price,
        google_sheet_id: dto.google_sheet_id
      }).catch(() => { /* audit log is best-effort */ });
    }

    return inserted;
  }

  async getRegistrationPrice(): Promise<number> {
    const settings = await this.getSettings();
    return Number(settings.driver_registration_price) || 0;
  }
}
