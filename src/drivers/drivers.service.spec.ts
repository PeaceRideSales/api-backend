import { Test, TestingModule } from '@nestjs/testing';
import { DriversService } from './drivers.service';
import { SupabaseService } from '../supabase/supabase.service';
import { AgentsService } from '../agents/agents.service';
import { SettingsService } from '../settings/settings.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { NotificationsService } from '../notifications/notifications.service';

describe('DriversService', () => {
  let service: DriversService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DriversService,
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
          provide: AgentsService,
          useValue: {
            findByTelegramId: jest.fn().mockResolvedValue({ id: 'agent-1', status: 'APPROVED' }),
          },
        },
        {
          provide: SettingsService,
          useValue: {
            getTieredPrices: jest.fn().mockResolvedValue({ price_latest_model: 1000, price_older_model: 500 }),
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

    service = module.get<DriversService>(DriversService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should create a driver successfully', async () => {
    const dto = {
      full_name: 'Test Driver',
      phone: '+1234567890',
      license_plate: 'TEST-123',
      vehicle_category: 'OLDER',
      car_model: 'Toyota Corolla',
      location: 'Addis Ababa',
    };

    const result = await service.create(123456789, dto);
    expect(result).toBeDefined();
  });
});
