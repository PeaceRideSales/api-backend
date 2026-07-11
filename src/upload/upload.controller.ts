import {
  Controller,
  Post,
  Get,
  Query,
  Body,
  UseGuards,
  BadRequestException,
  Res,
} from '@nestjs/common';
import { Response } from 'express';
import { SupabaseService } from '../supabase/supabase.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { randomUUID } from 'crypto';

@Controller('upload')
@UseGuards(JwtAuthGuard)
export class UploadController {
  constructor(private readonly supabase: SupabaseService) {}

  @Post('document/presigned')
  async getPresignedUrl(@Body('filename') originalFilename: string) {
    if (!originalFilename) throw new BadRequestException('Filename is required');

    const ext = originalFilename.split('.').pop() || 'bin';
    const filename = `${randomUUID()}.${ext}`;

    // Get a signed URL valid for 60 seconds
    const { data, error } = await this.supabase.admin.storage
      .from('documents')
      .createSignedUploadUrl(filename);

    if (error) {
      throw new BadRequestException(`Failed to generate upload URL: ${error.message}`);
    }

    // Also pre-calculate the public URL so the client knows what it will be
    const { data: publicData } = this.supabase.admin.storage
      .from('documents')
      .getPublicUrl(filename);

    return { 
      signedUrl: data.signedUrl,
      publicUrl: publicData.publicUrl,
      token: data.token,
      path: data.path
    };
  }

  /**
   * Download proxy — admin only.
   * Fetches a Supabase storage file server-side and streams it to the browser
   * with Content-Disposition: attachment so it actually downloads instead of opening in tab.
   */
  @Get('download')
  @UseGuards(RolesGuard)
  @Roles('admin')
  async downloadFile(
    @Query('url') fileUrl: string,
    @Query('name') fileName: string,
    @Res() res: Response,
  ) {
    if (!fileUrl) throw new BadRequestException('url query param is required');

    // Validate it's our Supabase domain to prevent SSRF
    const allowedHost = 'supabase.co';
    try {
      const parsed = new URL(fileUrl);
      if (!parsed.hostname.endsWith(allowedHost)) {
        throw new BadRequestException('Invalid file URL');
      }
    } catch {
      throw new BadRequestException('Invalid file URL');
    }

    let fetchUrl = fileUrl;
    if (fetchUrl.includes('/object/public/')) {
      fetchUrl = fetchUrl.replace('/object/public/', '/object/authenticated/');
    }

    const response = await fetch(fetchUrl, {
      headers: {
        Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`
      }
    });
    if (!response.ok) {
      throw new BadRequestException(`Failed to fetch file from storage: ${response.statusText}`);
    }

    const contentType = response.headers.get('content-type') || 'application/octet-stream';
    const safeFileName = (fileName || 'document').replace(/[^a-zA-Z0-9._-]/g, '_');

    res.setHeader('Content-Disposition', `attachment; filename="${safeFileName}"`);
    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'no-cache');

    const body: any = response.body;
    if (body && typeof body.getReader === 'function') {
      // It's a Web ReadableStream (Node 18+ fetch)
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { Readable } = require('stream');
      const nodeStream = Readable.fromWeb(body);
      nodeStream.pipe(res);
    } else {
      const blob = await response.arrayBuffer();
      res.end(Buffer.from(blob));
    }
  }
}
