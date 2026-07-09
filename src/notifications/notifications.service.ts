import { Injectable } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';

@Injectable()
export class NotificationsService {
  constructor(private supabase: SupabaseService) {}

  async findAll(page = 1, limit = 50) {
    const offset = (page - 1) * limit;
    const { data, count, error } = await this.supabase.admin
      .from('telegram_queue')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) throw new Error(error.message);
    return { data, total: count || 0, page, limit };
  }
}
