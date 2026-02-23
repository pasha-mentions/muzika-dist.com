import { storage } from "./storage";

// Extract fileId from Google Drive URL
function extractFileIdFromUrl(url: string | null): string | null {
  if (!url) return null;
  
  const patterns = [
    /[?&]id=([^&]+)/,           // thumbnail?id=FILE_ID
    /\/d\/([^/?]+)/,             // /d/FILE_ID
    /\/file\/d\/([^/?]+)/        // /file/d/FILE_ID
  ];
  
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match && match[1]) {
      return match[1];
    }
  }
  
  return null;
}

/**
 * Migrate file IDs from URLs to dedicated columns
 * This ensures old releases that only have URLs also have fileIds
 */
export async function migrateFileIds() {
  try {
    console.log('🔄 Starting file ID migration...');
    
    // Get all organizations
    const orgs = await storage.getAllOrganizations();
    
    let releasesUpdated = 0;
    let tracksUpdated = 0;
    
    for (const org of orgs) {
      const releases = await storage.getReleases(org.id);
      
      for (const release of releases) {
        // Migrate artwork fileId if missing
        if (release.artworkUrl && !release.artworkFileId) {
          const fileId = extractFileIdFromUrl(release.artworkUrl);
          if (fileId) {
            await storage.updateRelease(release.id, {
              artworkFileId: fileId
            });
            releasesUpdated++;
            console.log(`  ✅ Updated artwork fileId for release: ${release.title}`);
          }
        }
        
        // Migrate track audio fileIds if missing
        const tracks = await storage.getTracks(release.id);
        for (const track of tracks) {
          if (track.audioUrl && !track.audioFileId) {
            const fileId = extractFileIdFromUrl(track.audioUrl);
            if (fileId) {
              await storage.updateTrack(track.id, {
                audioFileId: fileId
              });
              tracksUpdated++;
              console.log(`  ✅ Updated audio fileId for track: ${track.title}`);
            }
          }
        }
      }
    }
    
    if (releasesUpdated > 0 || tracksUpdated > 0) {
      console.log(`✅ Migration complete: ${releasesUpdated} releases and ${tracksUpdated} tracks updated`);
    } else {
      console.log('✅ No migration needed - all files already have IDs');
    }
  } catch (error) {
    console.error('❌ Error during file ID migration:', error);
    // Don't throw - migration errors shouldn't prevent server start
  }
}
