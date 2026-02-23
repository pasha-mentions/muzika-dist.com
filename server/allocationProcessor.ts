import type { IStorage } from './storage';

// ============================================================================
// SIMPLIFIED ROYALTY SYSTEM PROCESSOR
// Processes streaming reports into monthly summaries with split shares
// ============================================================================

interface SimplifiedRoyaltyResult {
  success: boolean;
  summariesCreated: number;
  summariesUpdated: number;
  splitSharesCreated: number;
  errors: string[];
}

/**
 * Convert report period (MM/YYYY or MM-YYYY) to YYYY-MM format for consistent storage
 */
function normalizeReportMonth(reportPeriod: string): string {
  const separator = reportPeriod.includes('/') ? '/' : '-';
  const parts = reportPeriod.split(separator);
  if (parts.length !== 2) return reportPeriod;
  
  const [month, year] = parts;
  return `${year}-${month.padStart(2, '0')}`;
}

/**
 * Convert EUR amount to nano-units (EUR * 10^10) as string for BigInt precision
 */
function eurToNano(eurAmount: number): string {
  return Math.round(eurAmount * 10000000000).toString();
}

/**
 * Process streaming report rows into simplified royalty summaries and split shares
 * This runs IN PARALLEL with the old allocation system for safe migration
 */
export async function processSimplifiedRoyaltiesForReport(
  storage: IStorage,
  reportId: string,
  orgId: string
): Promise<SimplifiedRoyaltyResult> {
  const result: SimplifiedRoyaltyResult = {
    success: true,
    summariesCreated: 0,
    summariesUpdated: 0,
    splitSharesCreated: 0,
    errors: [],
  };

  try {
    const reportRows = await storage.getStreamingReportRows(reportId);
    
    if (!reportRows || reportRows.length === 0) {
      result.errors.push('No report rows found');
      return result;
    }

    // Get track splits for this org
    const trackSplits = await storage.getTrackSplitsByOrg(orgId);
    const splitsByIsrc = new Map<string, typeof trackSplits[0]>();
    for (const split of trackSplits) {
      if (split.isrc && split.isActive) {
        splitsByIsrc.set(split.isrc, split);
      }
    }

    // Group rows by report month
    const rowsByMonth = new Map<string, typeof reportRows>();
    for (const row of reportRows) {
      if (!row.period || !row.netRevenue || parseFloat(row.netRevenue) <= 0) continue;
      
      const month = normalizeReportMonth(row.period);
      if (!rowsByMonth.has(month)) {
        rowsByMonth.set(month, []);
      }
      rowsByMonth.get(month)!.push(row);
    }

    // Process each month
    for (const [reportMonth, rows] of Array.from(rowsByMonth.entries())) {
      // Calculate totals for this month
      let totalGrossNano = BigInt(0);
      let ownerNetNano = BigInt(0);
      const participantShares = new Map<string, {
        participantId: string;
        paymentDetailId: string;
        name: string;
        iban: string;
        taxId: string | null;
        bankName: string | null;
        totalPercent: number;
        amountNano: bigint;
      }>();

      // Track unique ISRCs for accurate track count
      const uniqueIsrcs = new Set<string>();

      for (const row of rows) {
        if (!row.isrc) continue;
        
        const grossAmount = parseFloat(row.netRevenue);
        const grossNano = BigInt(eurToNano(grossAmount));
        totalGrossNano += grossNano;
        uniqueIsrcs.add(row.isrc); // Count unique ISRCs

        const split = splitsByIsrc.get(row.isrc);
        
        if (!split) {
          // No split configured - 100% goes to owner
          ownerNetNano += grossNano;
        } else {
          // Process split participants
          const splits = split.splits as Array<{
            name: string;
            iban: string;
            taxId: string;
            bankName: string;
            percentage: number;
            isOwner?: boolean;
          }>;

          if (!splits || splits.length === 0) {
            ownerNetNano += grossNano;
            continue;
          }

          for (const splitParticipant of splits) {
            const shareNano = BigInt(Math.round(grossAmount * splitParticipant.percentage * 100000000)); // * 10^10 / 100

            if (splitParticipant.isOwner) {
              // Owner's share
              ownerNetNano += shareNano;
            } else {
              // Participant's share - aggregate by IBAN
              const key = splitParticipant.iban;
              
              // Find or create participant record
              const participantRecord = await storage.findOrCreateParticipant(
                orgId,
                splitParticipant.name,
                splitParticipant.taxId,
                false
              );
              
              let paymentDetailRecord = await storage.getCurrentPaymentDetails(participantRecord.id);
              if (!paymentDetailRecord) {
                paymentDetailRecord = await storage.createPaymentDetailVersion(
                  participantRecord.id,
                  splitParticipant.iban,
                  splitParticipant.bankName || 'Unknown'
                );
              }

              if (participantShares.has(key)) {
                const existing = participantShares.get(key)!;
                existing.amountNano += shareNano;
              } else {
                participantShares.set(key, {
                  participantId: participantRecord.id,
                  paymentDetailId: paymentDetailRecord.id,
                  name: splitParticipant.name,
                  iban: splitParticipant.iban,
                  taxId: splitParticipant.taxId || null,
                  bankName: splitParticipant.bankName || null,
                  totalPercent: splitParticipant.percentage,
                  amountNano: shareNano,
                });
              }
            }
          }
        }
      }

      // Create or update summary for this month
      let summary = await storage.getReportRoyaltySummary(orgId, reportMonth);
      
      if (summary) {
        // Update existing summary (add to totals)
        await storage.updateReportRoyaltySummary(summary.id, {
          totalGrossNano: (BigInt(summary.totalGrossNano) + totalGrossNano).toString(),
          ownerNetNano: (BigInt(summary.ownerNetNano) + ownerNetNano).toString(),
          trackCount: (summary.trackCount || 0) + uniqueIsrcs.size,
        });
        result.summariesUpdated++;
      } else {
        // Create new summary
        summary = await storage.createReportRoyaltySummary({
          orgId,
          reportMonth,
          totalGrossNano: totalGrossNano.toString(),
          ownerNetNano: ownerNetNano.toString(),
          ownerPaidNano: "0",
          trackCount: uniqueIsrcs.size,
        });
        result.summariesCreated++;
      }

      // Create split shares for participants (only if summary was just created to avoid duplicates)
      if (!summary) continue;
      
      for (const [iban, participant] of Array.from(participantShares.entries())) {
        await storage.createReportSplitShare({
          summaryId: summary.id,
          participantId: participant.participantId,
          paymentDetailId: participant.paymentDetailId,
          participantName: participant.name,
          participantIban: participant.iban,
          participantTaxId: participant.taxId,
          participantBankName: participant.bankName,
          sharePercent: participant.totalPercent.toFixed(2),
          amountNano: participant.amountNano.toString(),
          remainingNano: participant.amountNano.toString(),
          status: "PENDING",
        });
        result.splitSharesCreated++;
      }
    }

    console.log(`✅ Simplified royalties processed for report ${reportId}:`, {
      summariesCreated: result.summariesCreated,
      summariesUpdated: result.summariesUpdated,
      splitSharesCreated: result.splitSharesCreated,
    });

  } catch (error) {
    result.success = false;
    result.errors.push(error instanceof Error ? error.message : 'Unknown error');
    console.error('❌ Error processing simplified royalties:', error);
  }

  return result;
}

// ============================================================================
// LEGACY ALLOCATION SYSTEM (kept for backward compatibility during migration)
// ============================================================================

interface AllocationResult {
  success: boolean;
  allocationsCreated: number;
  tracksWithSplits: number;
  tracksWithoutSplits: number;
  errors: string[];
}

function calculateAvailableAt(reportPeriod: string): Date {
  // Support both MM/YYYY and MM-YYYY formats
  const separator = reportPeriod.includes('/') ? '/' : '-';
  const [month, year] = reportPeriod.split(separator).map(Number);
  const periodDate = new Date(year, month - 1, 1);
  periodDate.setMonth(periodDate.getMonth() + 3);
  return periodDate;
}

export async function processAllocationsForReport(
  storage: IStorage,
  reportId: string,
  orgId: string
): Promise<AllocationResult> {
  const result: AllocationResult = {
    success: true,
    allocationsCreated: 0,
    tracksWithSplits: 0,
    tracksWithoutSplits: 0,
    errors: [],
  };

  try {
    const reportRows = await storage.getStreamingReportRows(reportId);
    
    if (!reportRows || reportRows.length === 0) {
      result.errors.push('No report rows found');
      return result;
    }

    const trackSplits = await storage.getTrackSplitsByOrg(orgId);
    
    const splitsByIsrc = new Map<string, typeof trackSplits[0]>();
    for (const split of trackSplits) {
      if (split.isrc && split.isActive) {
        splitsByIsrc.set(split.isrc, split);
      }
    }

    for (const row of reportRows) {
      if (!row.isrc || !row.netRevenue || parseFloat(row.netRevenue) <= 0) {
        continue;
      }

      const split = splitsByIsrc.get(row.isrc);
      
      if (!split) {
        result.tracksWithoutSplits++;
        
        const organization = await storage.getOrganization(orgId);
        const primaryPaymentDetail = await storage.getPrimaryPaymentDetail(orgId);
        
        if (primaryPaymentDetail) {
          const availableAt = calculateAvailableAt(row.period);
          const grossAmount = parseFloat(row.netRevenue);
          
          const participant = await storage.findOrCreateParticipant(
            orgId, 
            primaryPaymentDetail.recipientName, 
            primaryPaymentDetail.taxId,
            true
          );
          
          let paymentDetailRecord = await storage.getCurrentPaymentDetails(participant.id);
          if (!paymentDetailRecord) {
            paymentDetailRecord = await storage.createPaymentDetailVersion(
              participant.id,
              primaryPaymentDetail.iban,
              primaryPaymentDetail.bankName
            );
          }
          
          await storage.createTrackRoyaltyAllocation({
            orgId,
            reportRowId: row.id,
            trackSplitId: null,
            isrc: row.isrc,
            participantName: primaryPaymentDetail.recipientName,
            participantIban: primaryPaymentDetail.iban,
            participantTaxId: primaryPaymentDetail.taxId,
            participantBankName: primaryPaymentDetail.bankName,
            participantId: participant.id,
            paymentDetailId: paymentDetailRecord.id,
            sharePercent: "100.00",
            grossAmount: grossAmount.toFixed(10),
            shareAmount: grossAmount.toFixed(10),
            shareAmountNano: Math.round(grossAmount * 10000000000).toString(), // Nano-units (EUR * 10^10) for precision
            currency: row.currency || "EUR",
            reportPeriod: row.period,
            availableAt,
            status: "PENDING",
            withdrawalId: null,
          });
          result.allocationsCreated++;
        }
        continue;
      }

      result.tracksWithSplits++;
      
      const splits = split.splits as Array<{
        name: string;
        iban: string;
        taxId: string;
        bankName: string;
        percentage: number;
        isOwner?: boolean;
      }>;

      if (!splits || splits.length === 0) {
        result.errors.push(`Empty splits array for ISRC ${row.isrc}`);
        continue;
      }

      const grossAmount = parseFloat(row.netRevenue);
      const availableAt = calculateAvailableAt(row.period);

      for (const splitParticipant of splits) {
        const shareAmount = (grossAmount * splitParticipant.percentage) / 100;

        const participantRecord = await storage.findOrCreateParticipant(
          orgId,
          splitParticipant.name,
          splitParticipant.taxId,
          splitParticipant.isOwner || false
        );
        
        let paymentDetailRecord = await storage.getCurrentPaymentDetails(participantRecord.id);
        if (!paymentDetailRecord) {
          paymentDetailRecord = await storage.createPaymentDetailVersion(
            participantRecord.id,
            splitParticipant.iban,
            splitParticipant.bankName || 'Unknown'
          );
        }

        await storage.createTrackRoyaltyAllocation({
          orgId,
          reportRowId: row.id,
          trackSplitId: split.id,
          isrc: row.isrc,
          participantName: splitParticipant.name,
          participantIban: splitParticipant.iban,
          participantTaxId: splitParticipant.taxId || null,
          participantBankName: splitParticipant.bankName || null,
          participantId: participantRecord.id,
          paymentDetailId: paymentDetailRecord.id,
          sharePercent: splitParticipant.percentage.toFixed(2),
          grossAmount: grossAmount.toFixed(10),
          shareAmount: shareAmount.toFixed(10),
          shareAmountNano: Math.round(shareAmount * 10000000000).toString(), // Nano-units (EUR * 10^10) for precision
          currency: row.currency || "EUR",
          reportPeriod: row.period,
          availableAt,
          status: "PENDING",
          withdrawalId: null,
        });
        result.allocationsCreated++;
      }
    }

    console.log(`✅ Allocations processed for report ${reportId}:`, {
      created: result.allocationsCreated,
      withSplits: result.tracksWithSplits,
      withoutSplits: result.tracksWithoutSplits,
    });

  } catch (error) {
    result.success = false;
    result.errors.push(error instanceof Error ? error.message : 'Unknown error');
    console.error('❌ Error processing allocations:', error);
  }

  return result;
}

export async function updateAllocationStatuses(storage: IStorage): Promise<number> {
  let updatedCount = 0;
  
  try {
    const pendingAllocations = await storage.getPendingAllocationsReadyForAvailability();
    
    for (const allocation of pendingAllocations) {
      await storage.updateAllocationStatus(allocation.id, 'AVAILABLE');
      updatedCount++;
    }
    
    if (updatedCount > 0) {
      console.log(`✅ Updated ${updatedCount} allocations from PENDING to AVAILABLE`);
    }
  } catch (error) {
    console.error('❌ Error updating allocation statuses:', error);
  }
  
  return updatedCount;
}
