import { Test, TestingModule } from '@nestjs/testing';
import { AgentsService } from './agents.service';
import { SupabaseService } from '../supabase/supabase.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { NotificationsService } from '../notifications/notifications.service';

describe('AgentsService', () => {
  let service: AgentsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AgentsService,
        {
          provide: SupabaseService,
          useValue: {
            admin: {
              from: jest.fn().mockReturnThis(),
              select: jest.fn().mockReturnThis(),
              insert: jest.fn().mockReturnThis(),
              update: jest.fn().mockReturnThis(),
              eq: jest.fn().mockReturnThis(),
              single: jest.fn().mockResolvedValue({ data: {}, error: null }),
            },
          },
        },
        {
          provide: AuditLogsService,
          useValue: {
            logAction: jest.fn(),
          },
        },
        {
          provide: NotificationsService,
          useValue: {
            queueTelegramMessage: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<AgentsService>(AgentsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
