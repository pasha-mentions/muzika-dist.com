import cron from 'node-cron';
import { db } from './db';
import { releases, organizations, socialFollowerSnapshots, releaseDrafts, localPlaylists, playlistFollowerSnapshots, pitchingApplications, orgMembers, notifications, musicVideos } from '@shared/schema';
import { eq, lt, and, isNotNull } from 'drizzle-orm';
import {
  extractSpotifyArtistId,
  extractYouTubeChannelId,
  extractYouTubeHandle,
  fetchSpotifyFollowerCount,
  extractSpotifyPlaylistId,
  fetchSpotifyPlaylistData,
  checkTrackInPlaylist
} from './socialMedia';
import { fetchYouTubeSubscriberCountViaOAuth, resolveYouTubeHandleToChannelId } from './youtubeClient';
import { runStreamingReportImportJob } from './streamingReportImportJob';
import { sendTelegramMessageToChat, sendTelegramNotification } from './telegram';

function getKievDateString(): string {
  const now = new Date();
  const kievDateString = now.toLocaleDateString('en-CA', { 
    timeZone: 'Europe/Kiev',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
  return kievDateString;
}

export function startScheduledTasks() {
  cron.schedule('1 0 * * *', async () => {
    try {
      console.log('🕐 Running scheduled task: Activating releases at 00:01 Kiev time');
      
      const todayKiev = getKievDateString();
      console.log(`📅 Today in Kiev timezone: ${todayKiev}`);
      
      const deliveringReleases = await db
        .select()
        .from(releases)
        .where(eq(releases.status, 'DELIVERING'));
      
      const releasesToActivate = deliveringReleases.filter(release => {
        if (!release.releaseDate) return false;
        
        const releaseDate = new Date(release.releaseDate);
        const releaseDateString = releaseDate.toLocaleDateString('en-CA', {
          timeZone: 'Europe/Kiev',
          year: 'numeric',
          month: '2-digit',
          day: '2-digit'
        });
        
        return releaseDateString === todayKiev;
      });
      
      if (releasesToActivate.length > 0) {
        console.log(`📦 Found ${releasesToActivate.length} releases to activate`);
        
        for (const release of releasesToActivate) {
          await db
            .update(releases)
            .set({ 
              status: 'ACTIVE',
              updatedAt: new Date()
            })
            .where(eq(releases.id, release.id));
          
          console.log(`✅ Activated release: ${release.title} (ID: ${release.id})`);
        }
        
        console.log(`🎉 Successfully activated ${releasesToActivate.length} releases`);
      } else {
        console.log('📭 No releases to activate today');
      }
    } catch (error) {
      console.error('❌ Error in scheduled task (activate releases):', error);
    }
  }, {
    timezone: "Europe/Kiev"
  });
  
  cron.schedule('0 3 * * 0', async () => {
    try {
      console.log('📊 Running scheduled task: Collecting social media follower counts (weekly)');
      
      const orgs = await db.select().from(organizations);
      
      let successCount = 0;
      let errorCount = 0;
      
      for (const org of orgs) {
        if (org.spotifyUrl) {
          try {
            const artistId = extractSpotifyArtistId(org.spotifyUrl);
            if (artistId) {
              const followerCount = await fetchSpotifyFollowerCount(artistId);
              if (followerCount !== null) {
                await db.insert(socialFollowerSnapshots).values({
                  orgId: org.id,
                  platform: 'SPOTIFY',
                  followerCount,
                  platformAccountId: artistId,
                });
                console.log(`✅ Spotify: ${org.name} - ${followerCount} followers`);
                successCount++;
              }
            }
          } catch (error) {
            console.error(`❌ Error fetching Spotify data for ${org.name}:`, error);
            errorCount++;
          }
        }
        
        if (org.youtubeUrl) {
          try {
            let channelId = extractYouTubeChannelId(org.youtubeUrl);
            
            if (!channelId) {
              const handle = extractYouTubeHandle(org.youtubeUrl);
              if (handle) {
                console.log(`🔄 Resolving YouTube handle @${handle} for ${org.name}...`);
                channelId = await resolveYouTubeHandleToChannelId(handle);
                if (!channelId) {
                  console.log(`⚠️ Could not resolve handle @${handle} to channel ID`);
                }
              }
            }
            
            if (channelId) {
              const subscriberCount = await fetchYouTubeSubscriberCountViaOAuth(channelId);
              if (subscriberCount !== null) {
                await db.insert(socialFollowerSnapshots).values({
                  orgId: org.id,
                  platform: 'YOUTUBE',
                  followerCount: subscriberCount,
                  platformAccountId: channelId,
                });
                console.log(`✅ YouTube: ${org.name} - ${subscriberCount} subscribers`);
                successCount++;
              }
            }
          } catch (error) {
            console.error(`❌ Error fetching YouTube data for ${org.name}:`, error);
            errorCount++;
          }
        }
      }
      
      console.log(`🎉 Social media data collection complete: ${successCount} successful, ${errorCount} errors`);
    } catch (error) {
      console.error('❌ Error in scheduled task (collect social media data):', error);
    }
  }, {
    timezone: "Europe/Kiev"
  });
  
  // Weekly playlist data collection (Sunday 3:30 AM Kiev time)
  cron.schedule('30 3 * * 0', async () => {
    try {
      console.log('📊 Running scheduled task: Collecting Spotify playlist follower counts (weekly)');
      
      const playlists = await db
        .select()
        .from(localPlaylists)
        .where(and(
          eq(localPlaylists.platform, 'Spotify'),
          eq(localPlaylists.isActive, true)
        ));
      
      let successCount = 0;
      let errorCount = 0;
      
      for (const playlist of playlists) {
        try {
          let spotifyId = playlist.spotifyId;
          if (!spotifyId && playlist.playlistUrl) {
            spotifyId = extractSpotifyPlaylistId(playlist.playlistUrl);
          }
          
          if (spotifyId) {
            const playlistData = await fetchSpotifyPlaylistData(spotifyId);
            if (playlistData) {
              // Update playlist with fresh data
              await db
                .update(localPlaylists)
                .set({
                  name: playlistData.name,
                  description: playlistData.description,
                  followerCount: playlistData.followerCount,
                  tracksCount: playlistData.tracksCount,
                  imageUrl: playlistData.imageUrl,
                  spotifyId: spotifyId,
                  lastSyncedAt: new Date(),
                  updatedAt: new Date(),
                })
                .where(eq(localPlaylists.id, playlist.id));
              
              // Save snapshot for history
              await db.insert(playlistFollowerSnapshots).values({
                playlistId: playlist.id,
                followerCount: playlistData.followerCount,
                tracksCount: playlistData.tracksCount,
              });
              
              console.log(`✅ Playlist: ${playlist.name} - ${playlistData.followerCount} followers, ${playlistData.tracksCount} tracks`);
              successCount++;
            }
          }
        } catch (error) {
          console.error(`❌ Error fetching Spotify data for playlist ${playlist.name}:`, error);
          errorCount++;
        }
      }
      
      console.log(`🎉 Playlist data collection complete: ${successCount} successful, ${errorCount} errors`);
    } catch (error) {
      console.error('❌ Error in scheduled task (collect playlist data):', error);
    }
  }, {
    timezone: "Europe/Kiev"
  });
  
  cron.schedule('0 4 16-31 * 1,5', async () => {
    try {
      console.log('📥 Running scheduled task: Automatic streaming report import from Google Drive');
      
      await runStreamingReportImportJob();
      
      console.log('🎉 Automatic import task completed');
    } catch (error) {
      console.error('❌ Error in scheduled task (streaming report import):', error);
    }
  }, {
    timezone: "Europe/Kiev"
  });
  
  cron.schedule('0 5 * * 0', async () => {
    try {
      console.log('🧹 Running scheduled task: Cleaning up old release drafts');
      
      const ninetyDaysAgo = new Date();
      ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
      
      const deletedDrafts = await db
        .delete(releaseDrafts)
        .where(lt(releaseDrafts.updatedAt, ninetyDaysAgo))
        .returning({ id: releaseDrafts.id });
      
      if (deletedDrafts.length > 0) {
        console.log(`🗑️ Deleted ${deletedDrafts.length} old drafts (older than 90 days)`);
      } else {
        console.log('📭 No old drafts to clean up');
      }
    } catch (error) {
      console.error('❌ Error in scheduled task (draft cleanup):', error);
    }
  }, {
    timezone: "Europe/Kiev"
  });
  
  // 10:00 - Morning reminder for curators about placements due today
  cron.schedule('0 10 * * *', async () => {
    try {
      console.log('📬 Running scheduled task: Sending curator placement reminders');
      
      const todayKiev = getKievDateString();
      console.log(`📅 Checking placements for today: ${todayKiev}`);
      
      // Find approved applications with confirmed placement date = today that are not yet verified
      const applicationsToRemind = await db
        .select({
          application: pitchingApplications,
          playlist: localPlaylists,
          artistOrg: organizations,
        })
        .from(pitchingApplications)
        .innerJoin(localPlaylists, eq(pitchingApplications.playlistId, localPlaylists.id))
        .innerJoin(organizations, eq(pitchingApplications.orgId, organizations.id))
        .where(
          and(
            eq(pitchingApplications.status, 'APPROVED'),
            eq(pitchingApplications.paymentStatus, 'PAID'),
            eq(pitchingApplications.isPlacementVerified, false),
            isNotNull(pitchingApplications.confirmedPlacementDate)
          )
        );
      
      let remindersSent = 0;
      
      for (const row of applicationsToRemind) {
        const app = row.application;
        const playlist = row.playlist;
        const artistOrg = row.artistOrg;
        
        if (!app.confirmedPlacementDate) continue;
        
        // Check if placement date is today
        const placementDateString = new Date(app.confirmedPlacementDate).toLocaleDateString('en-CA', {
          timeZone: 'Europe/Kiev',
          year: 'numeric',
          month: '2-digit',
          day: '2-digit'
        });
        
        if (placementDateString !== todayKiev) continue;
        
        console.log(`📢 Sending reminder for application ${app.applicationCode}`);
        
        // Get curator organization
        const curatorOrg = await db
          .select()
          .from(organizations)
          .where(eq(organizations.id, app.curatorOrgId))
          .limit(1);
        
        if (!curatorOrg[0]) continue;
        
        // Get curator users to notify
        const curatorMembers = await db
          .select({ userId: orgMembers.userId })
          .from(orgMembers)
          .where(eq(orgMembers.orgId, app.curatorOrgId));
        
        const appUrl = `/curator/applications?chatApplicationId=${app.id}`;
        const formattedDate = new Date(app.confirmedPlacementDate).toLocaleDateString('uk-UA', {
          day: 'numeric',
          month: 'long',
          year: 'numeric',
          timeZone: 'Europe/Kiev'
        });
        
        // Send in-app notification to curator members
        for (const member of curatorMembers) {
          await db.insert(notifications).values({
            userId: member.userId,
            title: 'Нагадування про публікацію',
            message: `Сьогодні (${formattedDate}) потрібно додати трек "${artistOrg.name}" до плейлиста "${playlist.name}". Код заявки: ${app.applicationCode}`,
            type: 'PLACEMENT_REMINDER',
            isRead: false,
            changedFields: JSON.stringify({ applicationId: app.id, appUrl }),
          });
        }
        
        // Send Telegram notification to curator organization
        if (curatorOrg[0].telegramChatId) {
          await sendTelegramMessageToChat(
            curatorOrg[0].telegramChatId,
            'Нагадування про публікацію',
            `Сьогодні (${formattedDate}) потрібно додати трек "${artistOrg.name}" до плейлиста "${playlist.name}".\n\nКод заявки: ${app.applicationCode}`
          );
        }
        
        // Update last reminder timestamp
        await db
          .update(pitchingApplications)
          .set({ lastCuratorReminderAt: new Date(), updatedAt: new Date() })
          .where(eq(pitchingApplications.id, app.id));
        
        remindersSent++;
      }
      
      console.log(`🎉 Curator placement reminders complete: ${remindersSent} reminders sent`);
    } catch (error) {
      console.error('❌ Error in scheduled task (curator placement reminders):', error);
    }
  }, {
    timezone: "Europe/Kiev"
  });
  
  // 18:00 - Evening verification: check if tracks were added to playlists
  cron.schedule('0 18 * * *', async () => {
    try {
      console.log('🔍 Running scheduled task: Verifying playlist placements');
      
      const todayKiev = getKievDateString();
      console.log(`📅 Checking placements for today: ${todayKiev}`);
      
      // Find approved, paid applications with confirmed placement date = today that are not yet verified
      const applicationsToVerify = await db
        .select({
          application: pitchingApplications,
          playlist: localPlaylists,
          artistOrg: organizations,
        })
        .from(pitchingApplications)
        .innerJoin(localPlaylists, eq(pitchingApplications.playlistId, localPlaylists.id))
        .innerJoin(organizations, eq(pitchingApplications.orgId, organizations.id))
        .where(
          and(
            eq(pitchingApplications.status, 'APPROVED'),
            eq(pitchingApplications.paymentStatus, 'PAID'),
            eq(pitchingApplications.isPlacementVerified, false),
            isNotNull(pitchingApplications.confirmedPlacementDate)
          )
        );
      
      let verified = 0;
      let notFound = 0;
      
      for (const row of applicationsToVerify) {
        const app = row.application;
        const playlist = row.playlist;
        const artistOrg = row.artistOrg;
        
        if (!app.confirmedPlacementDate) continue;
        
        // Check if placement date is today
        const placementDateString = new Date(app.confirmedPlacementDate).toLocaleDateString('en-CA', {
          timeZone: 'Europe/Kiev',
          year: 'numeric',
          month: '2-digit',
          day: '2-digit'
        });
        
        if (placementDateString !== todayKiev) continue;
        
        // Get Spotify track URL from application
        const trackUrl = app.spotifyTrackUrl || app.spotifyLink;
        if (!trackUrl) {
          console.log(`⚠️ No Spotify track URL for application ${app.applicationCode}`);
          continue;
        }
        
        // Get playlist Spotify ID
        const playlistSpotifyId = playlist.spotifyId || extractSpotifyPlaylistId(playlist.playlistUrl || '');
        if (!playlistSpotifyId) {
          console.log(`⚠️ No Spotify playlist ID for playlist ${playlist.name}`);
          continue;
        }
        
        console.log(`🔍 Checking track in playlist for application ${app.applicationCode}...`);
        
        const isInPlaylist = await checkTrackInPlaylist(playlistSpotifyId, trackUrl);
        
        if (isInPlaylist) {
          // Track found in playlist - mark as verified
          await db
            .update(pitchingApplications)
            .set({
              isPlacementVerified: true,
              placementVerifiedAt: new Date(),
              updatedAt: new Date()
            })
            .where(eq(pitchingApplications.id, app.id));
          
          console.log(`✅ Track verified in playlist for ${app.applicationCode}`);
          verified++;
          
          // Notify artist about successful placement
          const artistMembers = await db
            .select({ userId: orgMembers.userId })
            .from(orgMembers)
            .where(eq(orgMembers.orgId, app.orgId));
          
          for (const member of artistMembers) {
            await db.insert(notifications).values({
              userId: member.userId,
              title: 'Трек додано до плейлиста',
              message: `Ваш трек успішно додано до плейлиста "${playlist.name}"! Заявка: ${app.applicationCode}`,
              type: 'PLACEMENT_VERIFIED',
              isRead: false,
              changedFields: JSON.stringify({ applicationId: app.id }),
            });
          }
          
          // Send Telegram to artist org
          if (artistOrg.telegramChatId) {
            await sendTelegramMessageToChat(
              artistOrg.telegramChatId,
              'Трек додано до плейлиста',
              `Ваш трек успішно додано до плейлиста "${playlist.name}"!\n\nКод заявки: ${app.applicationCode}`
            );
          }
        } else {
          // Track NOT found in playlist - notify curator again and alert artist
          console.log(`⚠️ Track NOT found in playlist for ${app.applicationCode}`);
          notFound++;
          
          // Get curator organization
          const curatorOrg = await db
            .select()
            .from(organizations)
            .where(eq(organizations.id, app.curatorOrgId))
            .limit(1);
          
          // Notify curator again
          const curatorMembers = await db
            .select({ userId: orgMembers.userId })
            .from(orgMembers)
            .where(eq(orgMembers.orgId, app.curatorOrgId));
          
          const formattedDate = new Date(app.confirmedPlacementDate).toLocaleDateString('uk-UA', {
            day: 'numeric',
            month: 'long',
            year: 'numeric',
            timeZone: 'Europe/Kiev'
          });
          
          for (const member of curatorMembers) {
            await db.insert(notifications).values({
              userId: member.userId,
              title: 'Трек не знайдено в плейлисті',
              message: `Трек "${artistOrg.name}" не знайдено в плейлисті "${playlist.name}". Дата публікації: ${formattedDate}. Будь ласка, перевірте та додайте трек. Заявка: ${app.applicationCode}`,
              type: 'PLACEMENT_NOT_FOUND',
              isRead: false,
              changedFields: JSON.stringify({ applicationId: app.id }),
            });
          }
          
          if (curatorOrg[0]?.telegramChatId) {
            await sendTelegramMessageToChat(
              curatorOrg[0].telegramChatId,
              'Трек не знайдено в плейлисті',
              `Трек "${artistOrg.name}" не знайдено в плейлисті "${playlist.name}".\n\nДата публікації: ${formattedDate}\nБудь ласка, перевірте та додайте трек.\n\nКод заявки: ${app.applicationCode}`
            );
          }
          
          // Notify artist about delay
          const artistMembers = await db
            .select({ userId: orgMembers.userId })
            .from(orgMembers)
            .where(eq(orgMembers.orgId, app.orgId));
          
          for (const member of artistMembers) {
            await db.insert(notifications).values({
              userId: member.userId,
              title: 'Затримка з публікацією',
              message: `Ваш трек ще не додано до плейлиста "${playlist.name}". Куратор отримав нагадування. Заявка: ${app.applicationCode}`,
              type: 'PLACEMENT_DELAYED',
              isRead: false,
              changedFields: JSON.stringify({ applicationId: app.id }),
            });
          }
          
          if (artistOrg.telegramChatId) {
            await sendTelegramMessageToChat(
              artistOrg.telegramChatId,
              'Затримка з публікацією',
              `Ваш трек ще не додано до плейлиста "${playlist.name}".\n\nКуратор отримав нагадування.\n\nКод заявки: ${app.applicationCode}`
            );
          }
          
          // Log incident for admin
          await sendTelegramNotification(
            'Інцидент: Трек не додано',
            `Заявка: ${app.applicationCode}\nПлейлист: ${playlist.name}\nКуратор: ${curatorOrg[0]?.name || 'Невідомий'}\nАртист: ${artistOrg.name}\nДата: ${formattedDate}\n\nТрек не було додано до плейлиста в зазначену дату.`
          );
        }
      }
      
      console.log(`🎉 Playlist verification complete: ${verified} verified, ${notFound} not found`);
    } catch (error) {
      console.error('❌ Error in scheduled task (playlist verification):', error);
    }
  }, {
    timezone: "Europe/Kiev"
  });
  
  // Daily task: Auto-freeze inactive organizations without paid releases (02:00 Kiev time)
  cron.schedule('0 2 * * *', async () => {
    try {
      console.log('🔒 Running scheduled task: Auto-freezing inactive organizations without paid releases');
      
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      
      // Get all non-frozen organizations
      const allOrgs = await db
        .select()
        .from(organizations)
        .where(eq(organizations.isFrozen, false));
      
      let frozenCount = 0;
      
      for (const org of allOrgs) {
        // Skip curators (organizations with curatorSlug) - they don't need paid releases
        if (org.curatorSlug) {
          continue;
        }
        
        // Skip organizations with missing createdAt (legacy data - can't determine age)
        if (!org.createdAt) {
          console.log(`⏭️ Skipping org ${org.name} (ID: ${org.id}) - missing createdAt (legacy data)`);
          continue;
        }
        
        // Skip organizations created less than 30 days ago (grace period)
        if (new Date(org.createdAt) > thirtyDaysAgo) {
          continue;
        }
        
        // Check if organization has any paid releases
        const paidReleases = await db
          .select({ id: releases.id })
          .from(releases)
          .where(
            and(
              eq(releases.orgId, org.id),
              eq(releases.paymentStatus, 'PAID')
            )
          )
          .limit(1);
        
        // If there's at least one paid release, skip freezing
        if (paidReleases.length > 0) {
          continue;
        }
        
        // Also check if organization has any paid music videos
        const paidMusicVideos = await db
          .select({ id: musicVideos.id })
          .from(musicVideos)
          .where(
            and(
              eq(musicVideos.orgId, org.id),
              eq(musicVideos.paymentStatus, 'PAID')
            )
          )
          .limit(1);
        
        // If there's at least one paid music video, skip freezing
        if (paidMusicVideos.length > 0) {
          continue;
        }
        
        // Organization has no paid releases and is older than 30 days - freeze it
        // Get all members for notifications
        const members = await db
          .select({ userId: orgMembers.userId })
          .from(orgMembers)
          .where(eq(orgMembers.orgId, org.id));
        
        if (members.length === 0) {
          continue;
        }
        
        // Freeze the organization
        await db
          .update(organizations)
          .set({
            isFrozen: true,
            updatedAt: new Date()
          })
          .where(eq(organizations.id, org.id));
        
        console.log(`🔒 Auto-frozen organization: ${org.name} (ID: ${org.id}) - No paid releases after 30 days`);
        frozenCount++;
        
        // Notify organization members
        for (const member of members) {
          await db.insert(notifications).values({
            userId: member.userId,
            title: 'Обліковий запис призупинено',
            message: 'Ваш обліковий запис було автоматично призупинено через відсутність оплачених релізів протягом 30 днів після реєстрації. Зверніться до підтримки для відновлення.',
            type: 'ACCOUNT_FROZEN',
            isRead: false,
            changedFields: JSON.stringify({ reason: 'auto_freeze_no_paid_release' }),
          });
        }
        
        // Send Telegram notification to org if configured
        if (org.telegramChatId) {
          await sendTelegramMessageToChat(
            org.telegramChatId,
            'Обліковий запис призупинено',
            'Ваш обліковий запис було автоматично призупинено через відсутність оплачених релізів протягом 30 днів після реєстрації.\n\nДля відновлення доступу зверніться до підтримки: muzika.ua.info@gmail.com'
          );
        }
      }
      
      console.log(`🎉 Auto-freeze task complete: ${frozenCount} organizations frozen`);
    } catch (error) {
      console.error('❌ Error in scheduled task (auto-freeze organizations):', error);
    }
  }, {
    timezone: "Europe/Kiev"
  });
  
  console.log('✅ Scheduled tasks started successfully');
}

// Collect social media data for a specific organization
export async function collectSocialMediaDataForOrg(orgId: string): Promise<{ success: number; errors: number }> {
  let successCount = 0;
  let errorCount = 0;
  
  const org = await db.select().from(organizations).where(eq(organizations.id, orgId)).limit(1);
  
  if (!org || org.length === 0) {
    throw new Error('Organization not found');
  }
  
  const organization = org[0];
  
  if (organization.spotifyUrl) {
    try {
      const artistId = extractSpotifyArtistId(organization.spotifyUrl);
      if (artistId) {
        const followerCount = await fetchSpotifyFollowerCount(artistId);
        if (followerCount !== null) {
          await db.insert(socialFollowerSnapshots).values({
            orgId: organization.id,
            platform: 'SPOTIFY',
            followerCount,
            platformAccountId: artistId,
          });
          console.log(`✅ Spotify: ${organization.name} - ${followerCount} followers`);
          successCount++;
        }
      }
    } catch (error) {
      console.error(`❌ Error fetching Spotify data for ${organization.name}:`, error);
      errorCount++;
    }
  }
  
  if (organization.youtubeUrl) {
    try {
      let channelId = extractYouTubeChannelId(organization.youtubeUrl);
      
      if (!channelId) {
        const handle = extractYouTubeHandle(organization.youtubeUrl);
        if (handle) {
          console.log(`🔄 Resolving YouTube handle @${handle} for ${organization.name}...`);
          channelId = await resolveYouTubeHandleToChannelId(handle);
          if (!channelId) {
            console.log(`⚠️ Could not resolve handle @${handle} to channel ID`);
          }
        }
      }
      
      if (channelId) {
        const subscriberCount = await fetchYouTubeSubscriberCountViaOAuth(channelId);
        if (subscriberCount !== null) {
          await db.insert(socialFollowerSnapshots).values({
            orgId: organization.id,
            platform: 'YOUTUBE',
            followerCount: subscriberCount,
            platformAccountId: channelId,
          });
          console.log(`✅ YouTube: ${organization.name} - ${subscriberCount} subscribers`);
          successCount++;
        }
      }
    } catch (error) {
      console.error(`❌ Error fetching YouTube data for ${organization.name}:`, error);
      errorCount++;
    }
  }
  
  return { success: successCount, errors: errorCount };
}

export { getKievDateString };
