import {
  Controller,
  Post,
  Body,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { v4 as uuidv4 } from 'uuid';

@Controller('upload')
@UseGuards(JwtAuthGuard)
export class UploadController {
  constructor(private readonly supabase: SupabaseService) {}

  @Post('document/presigned')
  async getPresignedUrl(@Body('filename') originalFilename: string) {
    if (!originalFilename) throw new BadRequestException('Filename is required');

    const ext = originalFilename.split('.').pop() || 'bin';
    const filename = `${uuidv4()}.${ext}`;

    // Get a signed URL valid for 60 seconds
    const { data, error } = await this.supabase.admin.storage
      .from('driver_documents')
      .createSignedUploadUrl(filename);

    if (error) {
      throw new BadRequestException(`Failed to generate upload URL: ${error.message}`);
    }

    // Also pre-calculate the public URL so the client knows what it will be
    const { data: publicData } = this.supabase.admin.storage
      .from('driver_documents')
      .getPublicUrl(filename);

    return { 
      signedUrl: data.signedUrl,
      publicUrl: publicData.publicUrl,
      token: data.token,
      path: data.path
    };
  }
}
