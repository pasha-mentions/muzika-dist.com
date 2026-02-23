import type { IStorage } from './storage';
import { googleDriveStorage } from './googleDriveStorage';
import { processAllocationsForReport, updateAllocationStatuses, processSimplifiedRoyaltiesForReport } from './allocationProcessor';
import { getExchangeRate } from './currencyService';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const XLSX = require('xlsx');

interface ParseAndImportOptions {
  orgId: string;
  uploadedBy: string;
  fileBuffer: Buffer;
  fileName: string;
  period?: string;
  source: 'MANUAL_UPLOAD' | 'GOOGLE_DRIVE';
  driveFileId?: string;
  taxDeductionType?: 'fop_7' | 'agent_23' | 'both' | null;
  existingReportId?: string;
}

function applyTaxDeduction(originalAmount: number, taxDeductionType: 'fop_7' | 'agent_23' | 'both' | null | undefined): number {
  if (!taxDeductionType) {
    return originalAmount;
  }
  
  switch (taxDeductionType) {
    case 'fop_7':
      return originalAmount * 0.93;
    case 'agent_23':
      return originalAmount * 0.77;
    case 'both':
      return originalAmount * 0.93 * 0.77;
    default:
      return originalAmount;
  }
}

export function normalizePeriod(period: string): string {
  if (!period) return period;
  const p = String(period).trim();
  const match = p.match(/^(\d{1,2})[-\/](\d{4})$/);
  if (match) {
    const month = match[1].padStart(2, '0');
    return `${month}/${match[2]}`;
  }
  return p;
}

interface ParseAndImportResult {
  success: boolean;
  report?: any;
  rowsCount?: number;
  error?: string;
  errorDetails?: string;
  periodDistribution?: Record<string, number>;
}

export async function parseAndImportStreamingReport(
  storage: IStorage,
  options: ParseAndImportOptions
): Promise<ParseAndImportResult> {
  const { orgId, uploadedBy, fileBuffer, fileName, period, source, driveFileId, taxDeductionType, existingReportId } = options;

  try {
    console.log('📊 Processing Excel file:', {
      filename: fileName,
      size: fileBuffer.length,
      orgId,
      period,
      source,
      driveFileId
    });

    console.log('📖 Starting Excel parse...');
    const workbook = XLSX.read(fileBuffer, {
      type: 'buffer',
      codepage: 65001,
      cellText: false,
      cellDates: true,
      raw: true
    });
    console.log('✅ Excel parsed successfully, sheets:', workbook.SheetNames);
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const jsonData = XLSX.utils.sheet_to_json(worksheet, {
      raw: true,
      defval: ''
    }) as any[];

    if (jsonData.length === 0) {
      return {
        success: false,
        error: 'Excel file is empty'
      };
    }

    if (jsonData.length > 0) {
      console.log('XLS Column names:', Object.keys(jsonData[0]));
      console.log('First row sample:', jsonData[0]);
    }

    let reportPeriod = period ? normalizePeriod(period) : undefined;
    if (!reportPeriod && source === 'GOOGLE_DRIVE') {
      const periodMatch = fileName.match(/(\d{2})-(\d{4})/);
      if (periodMatch) {
        const [, month, year] = periodMatch;
        reportPeriod = `${month}/${year}`;
      }
    }

    if (!reportPeriod) {
      return {
        success: false,
        error: 'Period is required (either in filename or as parameter)'
      };
    }

    let fileUrl: string;
    let uploadedFileId: string;

    if (source === 'MANUAL_UPLOAD') {
      const { randomUUID } = await import('crypto');
      const fileExtension = fileName.split('.').pop()?.toLowerCase();
      const uniqueFilename = `report-${randomUUID()}.${fileExtension}`;

      let mimeType = 'application/vnd.ms-excel';
      if (fileExtension === 'xlsx') {
        mimeType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
      }

      const uploadResult = await googleDriveStorage.uploadFile(
        fileBuffer,
        uniqueFilename,
        mimeType
      );

      fileUrl = googleDriveStorage.getDirectDownloadLink(uploadResult.fileId);
      uploadedFileId = uploadResult.fileId;
    } else {
      if (!driveFileId) {
        console.log(`⚠️ Skipping auto-import - missing driveFileId for file: ${fileName}`);
        return {
          success: false,
          error: 'SKIPPED',
          errorDetails: 'Missing driveFileId - file skipped'
        };
      }
      
      const isDuplicate = await storage.checkStreamingReportExistsByDriveFileId(driveFileId);
      if (isDuplicate) {
        console.log(`⏭️ Skipping duplicate report - driveFileId ${driveFileId} already exists`);
        return {
          success: false,
          error: 'DUPLICATE',
          errorDetails: `Report with driveFileId ${driveFileId} already exists`
        };
      }
      
      fileUrl = googleDriveStorage.getDirectDownloadLink(driveFileId);
      uploadedFileId = driveFileId;
    }

    const getColumnValue = (row: any, ...possibleNames: string[]) => {
      for (const name of possibleNames) {
        if (row[name] !== undefined && row[name] !== null && row[name] !== '') {
          return row[name];
        }
      }
      return '';
    };

    let totalStreams = 0;
    let totalRevenue = 0;
    const periodDistribution: Record<string, number> = {};

    const rows = jsonData.map((row, index) => {
      const partner = getColumnValue(row, 'Партнер', 'Partner');
      const service = getColumnValue(row, 'Сервіс', 'Service');
      const album = getColumnValue(row, 'Альбом', 'Album');
      const type = getColumnValue(row, 'Тип', 'Type') || 'track';
      const artist = getColumnValue(row, 'Виконавець', 'Artist');
      const trackName = getColumnValue(row, 'Назва', 'Name', 'Track Name', 'Title');
      
      const isrc = getColumnValue(row, 'ISRC') || null;
      const upc = getColumnValue(row, 'UPC') || null;

      const streamsRaw = getColumnValue(row, 'Кількість', 'Quantity', 'Streams');
      const pricePerUnitRaw = getColumnValue(row, 'Ціна за одиницю', 'Price per unit', 'Price per Unit', 'Unit Price');
      const netRevenueRaw = getColumnValue(row, 'Винагорода нетто Ліцензіара', 'Net remuneration of Licensor', 'Net Revenue', 'Revenue');

      const streams = parseInt(streamsRaw) || 0;
      const pricePerUnit = parseFloat(String(pricePerUnitRaw).replace(',', '.')) || 0;
      const netRevenueOriginal = parseFloat(String(netRevenueRaw).replace(',', '.')) || 0;

      const netRevenue = applyTaxDeduction(netRevenueOriginal, taxDeductionType);

      const currency = getColumnValue(row, 'валюта', 'Currency') || 'EUR';
      const rawRowPeriod = getColumnValue(row, 'Звітний період', 'Period') || reportPeriod;
      const rowPeriod = normalizePeriod(String(rawRowPeriod));
      const country = getColumnValue(row, 'Країна', 'Country');

      periodDistribution[rowPeriod] = (periodDistribution[rowPeriod] || 0) + 1;

      if (rowPeriod === reportPeriod) {
        totalStreams += streams;
        totalRevenue += netRevenue;
      }

      if (index < 3) {
        console.log(`Row ${index}:`, {
          partner, service, album, type, artist, trackName, isrc, upc,
          streams, pricePerUnit, netRevenue, currency, rowPeriod, country,
          rawValues: { streamsRaw, pricePerUnitRaw, netRevenueRaw }
        });
      }

      return {
        partner: partner || '',
        service: service || '',
        album: album || '',
        type: type || 'track',
        artist: artist || '',
        trackName: trackName || '',
        isrc: isrc || null,
        upc: upc || null,
        streams,
        pricePerUnit: pricePerUnit.toString(),
        netRevenue: netRevenue.toString(),
        currency: currency || 'EUR',
        period: rowPeriod || reportPeriod,
        country: country || '',
      };
    });

    console.log(`📊 Period distribution:`, periodDistribution);
    console.log(`📊 Totals for report period ${reportPeriod}: ${totalStreams} streams, €${totalRevenue.toFixed(2)}`);

    let eurToUahRate: string | null = null;
    try {
      const rate = await getExchangeRate('EUR', 'UAH');
      eurToUahRate = rate.toFixed(4);
      console.log(`💱 EUR/UAH rate at import: ${eurToUahRate}`);
    } catch (rateError) {
      console.error('⚠️ Failed to fetch EUR/UAH rate:', rateError);
    }

    let report;
    if (existingReportId) {
      await storage.deleteStreamingReportRows(existingReportId);
      report = await storage.updateStreamingReport(existingReportId, {
        period: reportPeriod,
        fileUrl,
        fileName,
        totalStreams,
        totalRevenue: totalRevenue.toFixed(2),
        currency: rows[0]?.currency || 'EUR',
        taxDeductionType: taxDeductionType || null,
        eurToUahRate,
      });
      if (!report) {
        throw new Error('Failed to update report - report not found');
      }
    } else {
      report = await storage.createStreamingReport({
        orgId,
        uploadedBy,
        period: reportPeriod,
        fileUrl,
        fileName,
        totalStreams,
        totalRevenue: totalRevenue.toFixed(2),
        currency: rows[0]?.currency || 'EUR',
        taxDeductionType: taxDeductionType || null,
        driveFileId: uploadedFileId,
        source,
        eurToUahRate,
      });
    }

    const reportId = report.id;
    const rowsWithReportId = rows.map(row => ({ reportId, ...row }));
    const insertedCount = await storage.createStreamingReportRowsBatch(rowsWithReportId);
    console.log(`✅ Batch inserted ${insertedCount} rows for report ${reportId}`);

    runBackgroundTasks(storage, {
      reportId,
      orgId,
      uploadedBy,
      reportPeriod,
      totalStreams,
      totalRevenue,
      eurToUahRate,
      isUpdate: !!existingReportId,
    });

    console.log('✅ Report imported successfully (background tasks queued):', report.id);
    return {
      success: true,
      report,
      rowsCount: rows.length,
      periodDistribution,
    };

  } catch (error: any) {
    console.error("❌ Error parsing/importing Excel:", error);
    console.error("❌ Error stack:", error.stack);
    console.error("❌ Error message:", error.message);
    return {
      success: false,
      error: error.message || 'Failed to parse Excel file',
      errorDetails: error.toString()
    };
  }
}

async function runBackgroundTasks(
  storage: IStorage,
  params: {
    reportId: string;
    orgId: string;
    uploadedBy: string;
    reportPeriod: string;
    totalStreams: number;
    totalRevenue: number;
    eurToUahRate: string | null;
    isUpdate: boolean;
  }
) {
  const { reportId, orgId, uploadedBy, reportPeriod, totalStreams, totalRevenue, eurToUahRate, isUpdate } = params;

  try {
    if (!isUpdate) {
      try {
        const allocationResult = await processAllocationsForReport(storage, reportId, orgId);
        console.log('📊 [BG] Allocation processing result:', allocationResult);
      } catch (allocationError) {
        console.error('⚠️ [BG] Error processing allocations (non-critical):', allocationError);
      }
      
      try {
        const simplifiedResult = await processSimplifiedRoyaltiesForReport(storage, reportId, orgId);
        console.log('📊 [BG] Simplified royalty processing result:', simplifiedResult);
      } catch (simplifiedError) {
        console.error('⚠️ [BG] Error processing simplified royalties (non-critical):', simplifiedError);
      }
    }

    try {
      const updatedCount = await updateAllocationStatuses(storage);
      if (updatedCount > 0) {
        console.log(`💰 [BG] Updated ${updatedCount} allocations from PENDING to AVAILABLE`);
      }
    } catch (statusError) {
      console.error('⚠️ [BG] Error updating allocation statuses (non-critical):', statusError);
    }

    const orgMembers = await storage.getOrgMembers(orgId);
    const organization = await storage.getOrganization(orgId);
    const formattedRevenue = totalRevenue.toFixed(2);
    const formattedStreams = totalStreams.toLocaleString('uk-UA');
    const rateInfo = eurToUahRate ? ` • Курс: 1€ = ${eurToUahRate}₴` : '';
    const notificationTitle = "Новий звіт про стрімінг";
    const notificationMessage = `Завантажено звіт за період ${reportPeriod}\n${formattedStreams} стрімів • €${formattedRevenue}${rateInfo}`;

    for (const member of orgMembers) {
      if (member.userId !== uploadedBy) {
        try {
          await storage.createNotification({
            userId: member.userId,
            releaseId: null,
            pitchingId: null,
            relatedEntityType: null,
            relatedEntityId: null,
            title: notificationTitle,
            message: notificationMessage,
            type: "STREAMING_REPORT_UPLOADED",
            changedFields: null,
            isRead: false,
          });
        } catch (notifyError) {
          console.error(`⚠️ [BG] Error sending notification to user ${member.userId} (non-critical):`, notifyError);
        }
      }
    }

    try {
      const { sendOrgTelegramNotification } = await import("./telegram");
      const telegramRateInfo = eurToUahRate ? `\n💱 Курс: 1€ = ${eurToUahRate}₴` : '';
      const telegramMessage = `📊 Звіт за період: ${reportPeriod}\n🎵 Стрімів: ${formattedStreams}\n💰 Дохід: €${formattedRevenue}${telegramRateInfo}`;
      await sendOrgTelegramNotification(storage, orgId, notificationTitle, telegramMessage);
    } catch (telegramError) {
      console.error('⚠️ [BG] Error sending Telegram notification (non-critical):', telegramError);
    }

    console.log('✅ [BG] All background tasks completed for report:', reportId);
  } catch (bgError) {
    console.error('❌ [BG] Unexpected error in background tasks:', bgError);
  }
}
