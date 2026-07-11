import { Injectable } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';

export const DEFAULT_LATEST_PRICE = 150;
export const DEFAULT_OLDER_PRICE  = 120;

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

    if (error || !data) {
      // Column may not exist yet (migration not run), return safe defaults
      return {
        id: 1,
        driver_registration_price: 0,
        price_latest_model: DEFAULT_LATEST_PRICE,
        price_older_model: DEFAULT_OLDER_PRICE,
        google_sheet_id: null,
        driver_document_requirements: [{ id: 'primary_document', name: 'Primary Document', required: true }],
        agent_document_requirements: [{ id: 'primary_document', name: 'Primary Document', required: false }],
      };
    }

    // If columns exist but are null/missing (pre-migration row), fill defaults
    return {
      ...data,
      price_latest_model: data.price_latest_model != null ? Number(data.price_latest_model) : DEFAULT_LATEST_PRICE,
      price_older_model:  data.price_older_model  != null ? Number(data.price_older_model)  : DEFAULT_OLDER_PRICE,
    };
  }

  async updateSettings(dto: {
    driver_registration_price?: number;
    google_sheet_id?: string;
    price_latest_model?: number;
    price_older_model?: number;
    driver_document_requirements?: any;
    agent_document_requirements?: any;
  }, adminId?: string) {

    const patch: Record<string, any> = {};
    if (dto.driver_registration_price !== undefined) patch.driver_registration_price = dto.driver_registration_price;
    if (dto.google_sheet_id           !== undefined) patch.google_sheet_id           = dto.google_sheet_id;
    if (dto.price_latest_model        !== undefined) patch.price_latest_model        = dto.price_latest_model;
    if (dto.price_older_model         !== undefined) patch.price_older_model         = dto.price_older_model;
    if (dto.driver_document_requirements !== undefined) patch.driver_document_requirements = dto.driver_document_requirements;
    if (dto.agent_document_requirements !== undefined) patch.agent_document_requirements = dto.agent_document_requirements;

    // Try UPSERT first — handles both row-exists and row-missing cases
    const { data, error } = await this.supabase.admin
      .from('system_settings')
      .upsert({ id: 1, ...patch }, { onConflict: 'id' })
      .select()
      .single();

    if (error) {
      console.error('[Settings] Failed to save settings:', error.code, error.message);
      throw new Error(error.message);
    }

    if (adminId) {
      await this.auditLogs.logAction(adminId, 'UPDATE_SETTINGS', 'system', '1', dto)
        .catch(() => { /* best-effort */ });
    }

    return {
      ...data,
      price_latest_model: data?.price_latest_model != null ? Number(data.price_latest_model) : DEFAULT_LATEST_PRICE,
      price_older_model:  data?.price_older_model  != null ? Number(data.price_older_model)  : DEFAULT_OLDER_PRICE,
    };
  }

  async getRegistrationPrice(): Promise<number> {
    const settings = await this.getSettings();
    return Number(settings.driver_registration_price) || 0;
  }

  async getTieredPrices(): Promise<TieredPrices> {
    const settings = await this.getSettings();
    return {
      price_latest_model: settings.price_latest_model,
      price_older_model:  settings.price_older_model,
    };
  }
}
