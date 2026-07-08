import { Injectable, BadRequestException } from '@nestjs/common';
import { google } from 'googleapis';
import { DriversService } from '../drivers/drivers.service';
import { SettingsService } from '../settings/settings.service';

@Injectable()
export class GoogleSheetsService {
  constructor(
    private drivers: DriversService,
    private settings: SettingsService,
  ) {}

  /**
   * Syncs the "All Drivers" report to the configured Google Sheet
   */
  async syncAllDrivers(filters?: { start_date?: string; end_date?: string }) {
    const settings = await this.settings.getSettings();
    const spreadsheetId = settings.google_sheet_id;

    if (!spreadsheetId) {
      throw new BadRequestException('Google Sheet ID is not configured in Settings.');
    }

    const credentialsJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
    if (!credentialsJson) {
      throw new BadRequestException('Google Service Account credentials are not configured on the server.');
    }

    let credentials;
    try {
      credentials = JSON.parse(credentialsJson);
    } catch (e) {
      throw new BadRequestException('Invalid Google Service Account JSON configuration.');
    }

    const auth = new google.auth.GoogleAuth({
      credentials,
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });

    const sheets = google.sheets({ version: 'v4', auth });

    // Fetch the data
    const { data: drivers } = await this.drivers.findAll(filters || {}, 1, 1000000);

    // Prepare headers
    const values = [
      [
        '#',
        'Driver Name',
        'Phone',
        'License Plate',
        'Car Type',
        'Car Model',
        'Location',
        'Registered By',
        'Date Registered',
        'Has Document',
      ],
    ];

    // Prepare rows
    drivers.forEach((d, i) => {
      values.push([
        (i + 1).toString(),
        d.full_name,
        d.phone,
        d.license_plate,
        d.car_type,
        d.car_model,
        d.location || 'Unknown',
        d.agent?.full_name || d.agent?.telegram_username || 'Unknown',
        new Date(d.created_at).toLocaleDateString('en-KE'),
        d.document_url ? 'Yes' : 'No',
      ]);
    });

    // Summary row
    values.push([]);
    values.push(['', `Total: ${drivers.length} drivers`, '', '', '', '', '', '', '', '']);

    // Write to Google Sheet (overwrites 'Sheet1' entirely)
    try {
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: 'Sheet1!A1',
        valueInputOption: 'USER_ENTERED',
        requestBody: {
          values,
        },
      });

      return { success: true, message: 'Successfully synced to Google Sheets.' };
    } catch (error: any) {
      console.error('Google Sheets Sync Error:', error.message);
      if (error.message.includes('Requested entity was not found')) {
        throw new BadRequestException('Google Sheet not found. Make sure the ID is correct.');
      }
      if (error.message.includes('The caller does not have permission')) {
        throw new BadRequestException('Permission denied. Make sure you shared the Google Sheet with the Service Account email.');
      }
      throw new BadRequestException('Failed to sync to Google Sheets: ' + error.message);
    }
  }
}
