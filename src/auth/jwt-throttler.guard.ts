import { Injectable, ExecutionContext } from '@nestjs/common';
import { ThrottlerGuard, ThrottlerException } from '@nestjs/throttler';

@Injectable()
export class JwtThrottlerGuard extends ThrottlerGuard {
  protected async getTracker(req: Record<string, any>): Promise<string> {
    // If the request has an authenticated user (from JwtAuthGuard)
    if (req.user) {
      // Exempt ADMINs from global rate limits
      if (req.user.role === 'ADMIN') {
        return 'exempt-admin'; // Returning a single bucket for all admins is safe because they are exempt, 
        // but we actually want to bypass throttling. We can't return null. 
        // Throttler handles it. But wait, overriding getTracker just sets the key.
        // We will just let them share a bucket but we will give them high limits if we could, 
        // or we can override handleRequest.
      }
      
      // Limit by user ID instead of IP
      return req.user.userId;
    }

    // Fallback to IP address for unauthenticated routes (like login)
    return req.ips?.length ? req.ips[0] : req.ip;
  }

  // Override handleRequest to explicitly skip if role is ADMIN
  protected async handleRequest(requestProps: any): Promise<boolean> {
    const { req } = requestProps;
    
    // Exempt ADMINs completely
    if (req?.user?.role === 'ADMIN') {
      return true;
    }

    return super.handleRequest(requestProps);
  }
}
