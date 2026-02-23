import { storage } from './storage';
import { googleDriveStorage } from './googleDriveStorage';
import { parseAndImportStreamingReport } from './streamingReportService';

interface ImportJobParams {
  storage: typeof storage;
  googleDriveStorage: typeof googleDriveStorage;
  orgId: string;
  fileBuffer: Buffer;
  fileName: string;
  source: 'MANUAL_UPLOAD' | 'GOOGLE_DRIVE';
  driveFileId?: string;
}

export async function runStreamingReportImportJob(targetOrgId?: string): Promise<void> {
  const jobType = targetOrgId ? `single organization (${targetOrgId})` : 'all organizations';
  console.log(`🔄 Starting streaming report import job for ${jobType}...`);
  const startTime = Date.now();

  try {
    let allFolderMappings = await storage.getAllOrganizationDriveFolders();
    
    if (targetOrgId) {
      allFolderMappings = allFolderMappings.filter(m => m.orgId === targetOrgId);
      if (allFolderMappings.length === 0) {
        console.log(`⚠️ Organization ${targetOrgId} has no Drive folder mapped - skipping import`);
        return;
      }
    }
    
    console.log(`📁 Found ${allFolderMappings.length} organization(s) with Drive folder mapping`);

    if (allFolderMappings.length === 0) {
      console.log('ℹ️ No organizations have Drive folders mapped - skipping import');
      return;
    }

    let totalProcessed = 0;
    let totalImported = 0;
    let totalSkipped = 0;
    let totalErrors = 0;

    for (const mapping of allFolderMappings) {
      const { orgId, driveFolderId, driveFolderName, taxDeductionType } = mapping;
      console.log(`\n📂 Processing organization folder: ${driveFolderName} (${orgId}), taxDeductionType: ${taxDeductionType || 'none'}`);

      const now = new Date();
      let importedThisOrg = 0;
      
      try {
        await storage.updateOrganizationDriveFolderSyncTime(orgId, now);

        const files = await googleDriveStorage.listXlsFilesInFolder(driveFolderId);
        console.log(`   Found ${files.length} XLS/XLSX file(s) in Drive folder`);

        if (files.length === 0) {
          console.log('   ℹ️ No files to process');
          continue;
        }

        for (const file of files) {
          totalProcessed++;
          const { id: fileId, name: fileName } = file;

          console.log(`   📄 Processing file: ${fileName} (${fileId})`);

          try {
            // Extract period from filename
            const { extractPeriodFromFilename } = await import('./driveUtils.js');
            const period = extractPeriodFromFilename(fileName);

            if (!period) {
              totalSkipped++;
              console.log(`   ⚠️ Skipped - invalid filename format: ${fileName}`);
              
              await storage.createStreamingReportImportLog({
                orgId,
                driveFileId: fileId,
                driveFileName: fileName,
                status: 'SKIPPED',
                errorMessage: 'Invalid filename format. Expected: [Artist Name] MM-YYYY.xlsx'
              });
              continue;
            }

            // Check if period already exists for this organization
            const periodExists = await storage.checkStreamingReportExistsByPeriod(orgId, period);
            
            if (periodExists) {
              totalSkipped++;
              console.log(`   ⏭️ Skipped - period ${period} already exists: ${fileName}`);
              
              await storage.createStreamingReportImportLog({
                orgId,
                driveFileId: fileId,
                driveFileName: fileName,
                reportPeriod: period,
                status: 'DUPLICATE',
                errorMessage: `Report for period ${period} already exists`
              });
              continue;
            }

            const fileBuffer = await googleDriveStorage.downloadFile(fileId);

            const result = await parseAndImportStreamingReport(storage, {
              orgId,
              uploadedBy: 'SYSTEM_AUTO_IMPORT',
              fileBuffer,
              fileName,
              source: 'GOOGLE_DRIVE',
              driveFileId: fileId,
              period, // Pass extracted period
              taxDeductionType // Pass tax deduction type from folder mapping
            });

            if (result.success) {
              importedThisOrg++;
              totalImported++;
              console.log(`   ✅ Successfully imported: ${fileName} (Report ID: ${result.report?.id})`);

              await storage.createStreamingReportImportLog({
                orgId,
                driveFileId: fileId,
                driveFileName: fileName,
                reportPeriod: result.report?.reportPeriod || undefined,
                status: 'SUCCESS',
                reportId: result.report?.id
              });
            } else {
              if (result.error === 'DUPLICATE') {
                totalSkipped++;
                console.log(`   ⏭️ Skipped duplicate: ${fileName}`);
                
                await storage.createStreamingReportImportLog({
                  orgId,
                  driveFileId: fileId,
                  driveFileName: fileName,
                  status: 'DUPLICATE',
                  errorMessage: result.errorDetails || 'File already imported'
                });
              } else if (result.error === 'SKIPPED') {
                totalSkipped++;
                console.log(`   ⚠️ Skipped: ${fileName} - ${result.errorDetails}`);
                
                await storage.createStreamingReportImportLog({
                  orgId,
                  driveFileId: fileId,
                  driveFileName: fileName,
                  status: 'SKIPPED',
                  errorMessage: result.errorDetails || 'File skipped'
                });
              } else {
                totalErrors++;
                console.error(`   ❌ Error importing ${fileName}:`, result.error);

                await storage.createStreamingReportImportLog({
                  orgId,
                  driveFileId: fileId,
                  driveFileName: fileName,
                  status: 'ERROR',
                  errorMessage: result.errorDetails || result.error || 'Unknown error'
                });
              }
            }
          } catch (error: any) {
            totalErrors++;
            console.error(`   ❌ Exception while processing ${fileName}:`, error.message);

            await storage.createStreamingReportImportLog({
              orgId,
              driveFileId: fileId,
              driveFileName: fileName,
              status: 'ERROR',
              errorMessage: error.message || 'Exception during import'
            });
          }
        }

      } catch (error: any) {
        totalErrors++;
        console.error(`❌ Error processing folder ${driveFolderName}:`, error.message);

        await storage.createStreamingReportImportLog({
          orgId,
          status: 'ERROR',
          errorMessage: `Folder processing error: ${error.message}`
        });
      } finally {
        const wasSuccessful = importedThisOrg > 0;
        await storage.updateOrganizationDriveFolderImportAttempt(orgId, now, wasSuccessful);
      }
    }

    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log(`\n✅ Import job completed in ${duration}s`);
    console.log(`   📊 Summary: ${totalProcessed} files processed, ${totalImported} imported, ${totalSkipped} skipped, ${totalErrors} errors`);

  } catch (error: any) {
    console.error('❌ Fatal error in import job:', error.message);
    throw error;
  }
}
