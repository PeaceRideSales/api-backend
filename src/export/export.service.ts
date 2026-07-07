import { Injectable } from '@nestjs/common';
import * as ExcelJS from 'exceljs';
import { DriversService } from '../drivers/drivers.service';

@Injectable()
export class ExportService {
  constructor(private drivers: DriversService) {}

  private styleHeader(sheet: ExcelJS.Worksheet) {
    const headerRow = sheet.getRow(1);
    headerRow.eachCell((cell) => {
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF1A1A2E' },
      };
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
      cell.alignment = { vertical: 'middle', horizontal: 'center' };
      cell.border = {
        bottom: { style: 'medium', color: { argb: 'FF16213E' } },
      };
    });
    headerRow.height = 28;
  }

  private addDriverRows(sheet: ExcelJS.Worksheet, drivers: any[]) {
    drivers.forEach((d, i) => {
      const row = sheet.addRow([
        i + 1,
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

      // Zebra striping
      if (i % 2 === 0) {
        row.eachCell((cell) => {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF5F5F5' } };
        });
      }
      row.eachCell((cell) => {
        cell.alignment = { vertical: 'middle' };
        cell.border = { bottom: { style: 'thin', color: { argb: 'FFE0E0E0' } } };
      });
      row.height = 22;
    });
  }

  /**
   * Generate Excel for ALL agents — one combined sheet with agent column
   */
  async generateAllAgentsExcel(filters?: {
    start_date?: string;
    end_date?: string;
  }): Promise<Buffer> {
    const { data: drivers } = await this.drivers.findAll(filters || {}, 1, 1000000);

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Peace Ride';
    workbook.created = new Date();

    const sheet = workbook.addWorksheet('All Drivers', {
      views: [{ state: 'frozen', ySplit: 1 }],
    });

    sheet.columns = [
      { header: '#', key: 'num', width: 6 },
      { header: 'Driver Name', key: 'full_name', width: 25 },
      { header: 'Phone', key: 'phone', width: 18 },
      { header: 'License Plate', key: 'license_plate', width: 16 },
      { header: 'Car Type', key: 'car_type', width: 12 },
      { header: 'Car Model', key: 'car_model', width: 22 },
      { header: 'Location', key: 'location', width: 20 },
      { header: 'Registered By', key: 'agent', width: 22 },
      { header: 'Date Registered', key: 'date', width: 18 },
      { header: 'Has Document', key: 'doc', width: 14 },
    ];

    this.styleHeader(sheet);
    this.addDriverRows(sheet, drivers);

    // Summary row at the bottom
    const summaryRow = sheet.addRow(['', `Total: ${drivers.length} drivers`, '', '', '', '', '', '', '']);
    summaryRow.getCell(2).font = { bold: true, color: { argb: 'FF1A1A2E' } };

    return (await workbook.xlsx.writeBuffer()) as unknown as Buffer;
  }

  /**
   * Generate Excel for a single agent — their drivers only
   */
  async generateAgentExcel(agentId: string): Promise<Buffer> {
    const { data: drivers } = await this.drivers.findAll({ agent_id: agentId }, 1, 1000000);

    const agentName =
      drivers[0]?.agent?.full_name ||
      drivers[0]?.agent?.telegram_username ||
      'Agent';

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Peace Ride';

    const sheet = workbook.addWorksheet(`${agentName} - Drivers`, {
      views: [{ state: 'frozen', ySplit: 1 }],
    });

    // Agent info header block
    sheet.mergeCells('A1:I1');
    const titleCell = sheet.getCell('A1');
    titleCell.value = `Peace Ride — Drivers Registered by ${agentName}`;
    titleCell.font = { bold: true, size: 13, color: { argb: 'FF1A1A2E' } };
    titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
    titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFECE8F7' } };
    sheet.getRow(1).height = 32;

    sheet.addRow([]); // spacer

    // Add headers as a standard row instead of sheet.columns to avoid overwriting row 1
    const headers = ['#', 'Driver Name', 'Phone', 'License Plate', 'Car Type', 'Car Model', 'Location', 'Registered By', 'Date Registered', 'Has Document'];
    const headerRow = sheet.addRow(headers);
    
    // Set column widths manually
    sheet.getColumn(1).width = 6;
    sheet.getColumn(2).width = 25;
    sheet.getColumn(3).width = 18;
    sheet.getColumn(4).width = 16;
    sheet.getColumn(5).width = 12;
    sheet.getColumn(6).width = 22;
    sheet.getColumn(7).width = 20;
    sheet.getColumn(8).width = 22;
    sheet.getColumn(9).width = 18;
    sheet.getColumn(10).width = 14;

    // Style the header row we just created (row 3)
    headerRow.eachCell((cell) => {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1A1A2E' } };
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
      cell.alignment = { vertical: 'middle', horizontal: 'center' };
      cell.border = { bottom: { style: 'medium', color: { argb: 'FF16213E' } } };
    });
    headerRow.height = 28;
    this.addDriverRows(sheet, drivers);

    const summaryRow = sheet.addRow(['', `Total: ${drivers.length} drivers`, '', '', '', '', '', '', '']);
    summaryRow.getCell(2).font = { bold: true };

    return (await workbook.xlsx.writeBuffer()) as unknown as Buffer;
  }
}
