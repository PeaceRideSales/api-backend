import { Injectable, Logger } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';

@Injectable()
export class AuditLogsService {
  private readonly logger = new Logger(AuditLogsService.name);

  constructor(private supabase: SupabaseService) {}

  async logAction(
    adminId: string,
    action: string,
    entityType: string,
    entityId: string,
    details?: any,
  ) {
    try {
      const { error } = await this.supabase.admin
        .from('audit_logs')
        .insert({
          admin_id: adminId,
          action,
          entity_type: entityType,
          entity_id: entityId,
          details,
        });
      
      if (error) {
        this.logger.error(`Failed to create audit log: ${error.message}`);
      }
    } catch (e) {
      this.logger.error('Error logging action', e);
    }
  }

  async getLogs(page = 1, limit = 50) {
    const offset = (page - 1) * limit;
    
    const { data, count, error } = await this.supabase.admin
      .from('audit_logs')
      .select('*, admin:auth.users(email)', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);
      
    if (error) throw new Error(error.message);
    
    return {
      data,
      total: count || 0,
      page,
      limit,
    };
  }
}
