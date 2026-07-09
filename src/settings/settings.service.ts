import { Injectable } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';

export interface TieredPrices {
  price_latest_model: number;
  price_older_model: number;
}

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
      return { id: 1, driver_registration_price: 0, price_latest_model: 150, price_older_model: 120 };
    }
    return data;
  }

  async updateSettings(dto: {
    driver_registration_price?: number;
    google_sheet_id?: string;
    price_latest_model?: number;
    price_older_model?: number;
  }, adminId?: string) {
    const { data: updated, error: updateError } = await this.supabase.admin
      .from('system_settings')
      .update({
        ...(dto.driver_registration_price !== undefined && { driver_registration_price: dto.driver_registration_price }),
        ...(dto.google_sheet_id !== undefined && { google_sheet_id: dto.google_sheet_id }),
        ...(dto.price_latest_model !== undefined && { price_latest_model: dto.price_latest_model }),
        ...(dto.price_older_model !== undefined && { price_older_model: dto.price_older_model }),
      })
      .eq('id', 1)
      .select()
      .single();

    if (!updateError && updated) {
      if (adminId) {
        await this.auditLogs.logAction(adminId, 'UPDATE_SETTINGS', 'system', '1', dto)
          .catch(() => { /* best-effort */ });
      }
      return updated;
    }

    // Row doesn't exist yet — insert it
    const { data: inserted, error: insertError } = await this.supabase.admin
      .from('system_settings')
      .insert({
        id: 1,
        driver_registration_price: dto.driver_registration_price ?? 0,
        google_sheet_id: dto.google_sheet_id,
        price_latest_model: dto.price_latest_model ?? 150,
        price_older_model: dto.price_older_model ?? 120,
      })
      .select()
      .single();

    if (insertError) {
      console.error('[Settings] Failed to update or insert settings:', insertError.code, insertError.message);
      throw new Error(insertError.message);
    }

    if (adminId) {
      await this.auditLogs.logAction(adminId, 'UPDATE_SETTINGS', 'system', '1', dto)
        .catch(() => { /* best-effort */ });
    }
    return inserted;
  }

  async getRegistrationPrice(): Promise<number> {
    const settings = await this.getSettings();
    return Number(settings.driver_registration_price) || 0;
  }

  async getTieredPrices(): Promise<TieredPrices> {
    const settings = await this.getSettings();
    return {
      price_latest_model: Number(settings.price_latest_model) || 150,
      price_older_model: Number(settings.price_older_model) || 120,
    };
  }
}
