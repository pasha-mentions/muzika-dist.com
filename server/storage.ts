import {
  users,
  organizations,
  orgMembers,
  artists,
  releases,
  tracks,
  splitShares,
  qcItems,
  deliveryJobs,
  reportRows,
  auditLogs,
  notifications,
  pitchingSubmissions,
  allowedEmails,
  passwordResetTokens,
  telegramVerificationCodes,
  streamingReports,
  streamingReportRows,
  organizationDriveFolders,
  streamingReportImportLogs,
  socialFollowerSnapshots,
  withdrawals,
  withdrawalSplits,
  paymentDetails,
  royaltySplitTemplates,
  trackSplits,
  trackRoyaltyAllocations,
  royaltyParticipants,
  participantPaymentDetails,
  reportRoyaltySummaries,
  reportSplitShares,
  withdrawalReportApplications,
  musicVideos,
  labelArtistLinks,
  youtubeAdCampaigns,
  releaseDrafts,
  importCheckpoints,
  releaseStatusEvents,
  type User,
  type UpsertUser,
  type Organization,
  type InsertOrganization,
  type OrgMember,
  type Artist,
  type InsertArtist,
  type Release,
  type InsertRelease,
  type Track,
  type InsertTrack,
  type SplitShare,
  type InsertSplitShare,
  type QCItem,
  type DeliveryJob,
  type ReportRow,
  type AuditLog,
  type Notification,
  type PitchingSubmission,
  type InsertPitchingSubmission,
  type StreamingReport,
  type InsertStreamingReport,
  type StreamingReportRow,
  type InsertStreamingReportRow,
  type Withdrawal,
  type InsertWithdrawal,
  type MusicVideo,
  type InsertMusicVideo,
  type LabelArtistLink,
  type InsertLabelArtistLink,
  type YoutubeAdCampaign,
  type InsertYoutubeAdCampaign,
  type ReleaseDraft,
  type InsertReleaseDraft,
  type SupportMessage,
  type InsertSupportMessage,
  type ImportCheckpoint,
  type InsertImportCheckpoint,
  type ReleaseStatusEvent,
  type InsertReleaseStatusEvent,
  supportMessages,
  academyCourses,
  academyPurchases,
  type AcademyCourse,
  type InsertAcademyCourse,
  type AcademyPurchase,
  type InsertAcademyPurchase,
} from "@shared/schema";
import { db } from "./db";
import { eq, and, or, desc, asc, like, ilike, inArray, gte, lte, gt, ne, isNull, sql, aliasedTable } from "drizzle-orm";

export interface IStorage {
  // User operations (required for Replit Auth and Google OAuth)
  getUser(id: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  getUserByGoogleId(googleId: string): Promise<User | undefined>;
  getAllUsers(): Promise<User[]>;
  createUser(userData: {
    email: string;
    firstName: string;
    lastName: string;
    role: "ARTIST" | "LABEL" | "TEAM" | "ADMIN";
    passwordHash: string;
    country?: string;
  }): Promise<string>;
  createUserWithOrganization(userData: {
    email: string;
    firstName: string;
    lastName: string;
    role: "ARTIST" | "LABEL" | "TEAM" | "ADMIN";
    passwordHash: string;
    organizationName: string;
    organizationType: "ARTIST_ORG" | "LABEL" | "TEAM" | "ADMIN";
    organizationStatus?: "STANDARD" | "AMBASSADOR";
    country?: string;
  }): Promise<string>;
  createPlatformAdminUser(userData: {
    email: string;
    firstName: string;
    lastName: string;
    platformRole: "PLATFORM_OWNER" | "PLATFORM_ADMIN" | "PLATFORM_FINANCIER";
    passwordHash: string;
    country?: string;
  }): Promise<string>;
  createUserFromGoogle(userData: {
    googleId: string;
    email: string;
    firstName?: string;
    lastName?: string;
    profileImageUrl?: string;
    role?: "ARTIST" | "LABEL" | "TEAM" | "ADMIN";
  }): Promise<User>;
  linkGoogleAccount(userId: string, googleId: string): Promise<User>;
  upsertUser(user: UpsertUser): Promise<User>;
  updateUser(id: string, updates: Partial<User>): Promise<User | undefined>;
  deleteUser(id: string): Promise<void>;
  
  // Organization operations
  createOrganization(org: InsertOrganization): Promise<Organization>;
  getOrganization(id: string): Promise<Organization | undefined>;
  updateOrganization(id: string, updates: Partial<Organization>): Promise<Organization | undefined>;
  getUserOrganizations(userId: string): Promise<Organization[]>;
  getUserActiveOrganizations(userId: string): Promise<Organization[]>;
  addOrgMember(orgId: string, userId: string, role: string): Promise<OrgMember>;
  getOrgMembers(orgId: string): Promise<(OrgMember & { user: User })[]>;
  getOrgMember(orgId: string, userId: string): Promise<OrgMember | undefined>;
  isOrgMember(userId: string, orgId: string): Promise<boolean>;
  updateOrgMemberRole(memberId: string, role: "OWNER" | "ADMIN" | "MEMBER"): Promise<OrgMember | undefined>;
  removeOrgMember(memberId: string): Promise<void>;
  deleteOrganization(orgId: string): Promise<void>;
  
  // Artist operations
  createArtist(artist: InsertArtist): Promise<Artist>;
  getArtists(orgId: string): Promise<Artist[]>;
  getArtist(id: string): Promise<Artist | undefined>;
  
  // Release operations
  createRelease(release: InsertRelease): Promise<Release>;
  getRelease(id: string): Promise<Release | undefined>;
  getReleases(orgId: string): Promise<Release[]>;
  updateRelease(id: string, updates: Partial<Release>): Promise<Release>;
  getRecentReleases(orgId: string, limit?: number): Promise<(Release & { artist: Artist })[]>;
  getAllReleases(options?: {
    page?: number;
    limit?: number;
    search?: string;
    status?: string;
    paymentStatus?: string;
  }): Promise<{
    releases: (Release & { artist: Artist; organization: Organization })[];
    total: number;
    page: number;
    totalPages: number;
  }>;
  getReleaseDetails(id: string): Promise<(Release & { artist: Artist; organization: Organization; tracks: Track[] }) | undefined>;
  
  // Track operations
  createTrack(track: InsertTrack): Promise<Track>;
  getTrack(id: string): Promise<Track | undefined>;
  getTracks(releaseId: string): Promise<Track[]>;
  updateTrack(id: string, updates: Partial<Track>): Promise<Track>;
  
  // Split share operations
  createSplitShare(splitShare: InsertSplitShare): Promise<SplitShare>;
  getSplitShares(releaseId?: string, trackId?: string): Promise<SplitShare[]>;
  
  // QC operations
  createQCItem(item: Omit<QCItem, 'id' | 'createdAt'>): Promise<QCItem>;
  getQCItems(releaseId: string): Promise<QCItem[]>;
  getPendingQCReleases(): Promise<(Release & { artist: Artist; organization: Organization })[]>;
  
  // Delivery operations
  createDeliveryJob(job: Omit<DeliveryJob, 'id' | 'createdAt' | 'updatedAt'>): Promise<DeliveryJob>;
  getDeliveryJobs(releaseId: string): Promise<DeliveryJob[]>;
  updateDeliveryJob(id: string, updates: Partial<DeliveryJob>): Promise<DeliveryJob>;
  
  // Reporting operations
  createReportRow(row: Omit<ReportRow, 'id' | 'createdAt'>): Promise<ReportRow>;
  getReportRows(orgId: string, period?: string): Promise<ReportRow[]>;
  getRevenueSummary(orgId: string): Promise<{ totalRevenue: number; streams: number }>;
  
  // Audit log
  logAction(log: Omit<AuditLog, 'id' | 'createdAt'>): Promise<AuditLog>;
  
  // Notifications
  createNotification(notification: Omit<Notification, 'id' | 'createdAt'>): Promise<Notification>;
  getUserNotifications(userId: string, limit?: number): Promise<Notification[]>;
  markNotificationAsRead(id: string): Promise<Notification>;
  markAllNotificationsAsRead(userId: string): Promise<void>;
  getUnreadNotificationCount(userId: string): Promise<number>;
  
  // Pitching submissions
  createPitchingSubmission(submission: InsertPitchingSubmission): Promise<PitchingSubmission>;
  getPitchingSubmissions(userId: string): Promise<(PitchingSubmission & { release: Release & { artist: Artist } })[]>;
  getPitchingSubmission(id: string): Promise<PitchingSubmission | undefined>;
  getRecentReleasesForPitching(orgId: string): Promise<(Release & { artist: Artist; tracks: Track[] })[]>;
  getAllPitchingSubmissions(): Promise<(PitchingSubmission & { release: Release & { artist: Artist; organization: Organization } })[]>;
  updatePitchingSubmission(id: string, updates: Partial<PitchingSubmission>): Promise<PitchingSubmission | undefined>;
  
  // YouTube Ad Campaigns
  createYoutubeAdCampaign(data: InsertYoutubeAdCampaign): Promise<YoutubeAdCampaign>;
  getYoutubeAdCampaignsByOrg(orgId: string): Promise<YoutubeAdCampaign[]>;
  getAllYoutubeAdCampaigns(): Promise<(YoutubeAdCampaign & { organization?: { id: string; name: string } })[]>;
  getYoutubeAdCampaign(id: string): Promise<YoutubeAdCampaign | undefined>;
  getYoutubeAdCampaignByPaymentReference(paymentReference: string): Promise<YoutubeAdCampaign | undefined>;
  updateYoutubeAdCampaign(id: string, updates: Partial<YoutubeAdCampaign>): Promise<YoutubeAdCampaign | undefined>;
  deleteYoutubeAdCampaign(id: string): Promise<boolean>;
  
  // Statistics
  getOrgStats(orgId: string): Promise<{
    totalRevenue: number;
    activeReleases: number;
    totalStreams: number;
    pendingReview: number;
    monthlyReleases: number;
    hasDeliveredReleases: boolean;
    draftReleases: number;
    unpaidReleases: number;
    deletedReleases: number;
  }>;
  
  // Allowed Emails (Whitelist)
  getAllowedEmails(): Promise<any[]>;
  isEmailAllowed(email: string): Promise<{ allowed: boolean; role: string | null }>;
  addAllowedEmail(email: string, role: "ARTIST" | "LABEL" | "TEAM" | "ADMIN", addedBy: string): Promise<any>;
  removeAllowedEmail(id: string): Promise<void>;
  
  // Password management
  setUserPassword(userId: string, passwordHash: string): Promise<void>;
  
  // Password Reset Tokens
  createPasswordResetToken(data: { userId: string; token: string; expiresAt: Date }): Promise<any>;
  getPasswordResetToken(token: string): Promise<any | undefined>;
  invalidatePasswordResetTokens(userId: string): Promise<void>;
  markPasswordResetTokenUsed(tokenId: string): Promise<void>;
  
  // Telegram Verification Codes
  createTelegramVerificationCode(data: { orgId: string; code: string; expiresAt: Date }): Promise<any>;
  getTelegramVerificationCode(code: string): Promise<any | undefined>;
  markTelegramVerificationCodeUsed(codeId: string): Promise<void>;
  deleteTelegramVerificationCodesForOrg(orgId: string): Promise<void>;
  linkTelegramChatToOrg(code: string, chatId: string): Promise<{ success: boolean; error?: string; orgName?: string }>;
  
  // Streaming Reports
  createStreamingReport(data: InsertStreamingReport): Promise<StreamingReport>;
  getStreamingReports(orgId: string): Promise<StreamingReport[]>;
  getAllStreamingReports(): Promise<any[]>;
  getStreamingReport(id: string): Promise<StreamingReport | undefined>;
  createStreamingReportRow(data: InsertStreamingReportRow): Promise<StreamingReportRow>;
  createStreamingReportRowsBatch(rows: InsertStreamingReportRow[]): Promise<number>;
  updateStreamingReportRow(id: string, data: Partial<InsertStreamingReportRow>): Promise<StreamingReportRow | undefined>;
  getStreamingReportRows(reportId: string): Promise<StreamingReportRow[]>;
  deleteStreamingReport(id: string): Promise<void>;
  deleteStreamingReportRows(reportId: string): Promise<void>;
  updateStreamingReport(id: string, data: Partial<InsertStreamingReport>): Promise<StreamingReport | undefined>;
  checkStreamingReportExistsByDriveFileId(driveFileId: string): Promise<boolean>;
  checkStreamingReportExistsByPeriod(orgId: string, period: string): Promise<boolean>;
  
  // Organization Drive Folders (for auto-import)
  getOrganizationDriveFolder(orgId: string): Promise<any | undefined>;
  getAllOrganizationDriveFolders(): Promise<any[]>;
  setOrganizationDriveFolder(data: { orgId: string; driveFolderId: string; driveFolderName: string; linkedBy: string; taxDeductionType?: 'fop_7' | 'agent_23' | 'both' | null }): Promise<any>;
  updateOrganizationDriveFolderSyncTime(orgId: string, timestamp: Date): Promise<void>;
  updateOrganizationDriveFolderImportAttempt(orgId: string, timestamp: Date, wasSuccessful: boolean): Promise<void>;
  removeOrganizationDriveFolder(orgId: string): Promise<void>;
  
  // Streaming Report Import Logs
  createStreamingReportImportLog(data: { orgId: string; reportPeriod?: string; driveFileId?: string; driveFileName?: string; status: string; errorMessage?: string; reportId?: string }): Promise<any>;
  getStreamingReportImportLogs(orgId?: string): Promise<any[]>;
  
  // Payment Details
  createPaymentDetails(data: { orgId: string; recipientName: string; iban: string; taxId?: string; bankName: string; isPrimary: boolean }): Promise<any>;
  getPaymentDetails(orgId: string): Promise<any[]>;
  getPrimaryPaymentDetail(orgId: string): Promise<any | undefined>;
  deletePaymentDetails(id: string): Promise<void>;
  setPrimaryPaymentDetails(orgId: string, id: string): Promise<void>;
  
  // Royalty Participants
  findOrCreateParticipant(orgId: string, name: string, taxId?: string | null, isOwner?: boolean): Promise<any>;
  getParticipantsByOrg(orgId: string): Promise<any[]>;
  getCurrentPaymentDetails(participantId: string): Promise<any | undefined>;
  createPaymentDetailVersion(participantId: string, iban: string, bankName: string): Promise<any>;
  updateAvailableAllocationsPaymentDetails(participantId: string, newPaymentDetailId: string, newIban: string, newBankName: string): Promise<number>;
  
  // Track Royalty Allocations (Legacy system - kept for backward compatibility)
  createTrackRoyaltyAllocation(data: any): Promise<any>;
  getTrackRoyaltyAllocationsByOrg(orgId: string): Promise<any[]>;
  getAvailableAllocationsByOrg(orgId: string): Promise<any[]>;
  getPendingAllocationsReadyForAvailability(): Promise<any[]>;
  updateAllocationStatus(id: string, status: 'PENDING' | 'AVAILABLE' | 'RESERVED' | 'PAID'): Promise<any | undefined>;
  reserveAllocationsForWithdrawal(allocationIds: string[], withdrawalId: string): Promise<void>;
  
  // Report Royalty Summaries (Simplified system)
  getReportRoyaltySummary(orgId: string, reportMonth: string): Promise<any | undefined>;
  createReportRoyaltySummary(data: { orgId: string; reportMonth: string; totalGrossNano: string; ownerNetNano: string; ownerPaidNano: string; trackCount: number }): Promise<any>;
  updateReportRoyaltySummary(id: string, updates: { totalGrossNano?: string; ownerNetNano?: string; ownerPaidNano?: string; trackCount?: number }): Promise<any>;
  getReportRoyaltySummariesByOrg(orgId: string): Promise<any[]>;
  
  // Report Split Shares (Simplified system)
  createReportSplitShare(data: { summaryId: string; participantId: string; paymentDetailId: string; participantName: string; participantIban: string; participantTaxId?: string | null; participantBankName?: string | null; sharePercent: string; amountNano: string; remainingNano: string; status: string }): Promise<any>;
  getReportSplitSharesBySummary(summaryId: string): Promise<any[]>;
  getAvailableReportSplitSharesByOrg(orgId: string): Promise<any[]>;
  updateReportSplitShareRemaining(id: string, remainingNano: string, status?: string): Promise<any>;
  
  // Withdrawal Report Applications (Simplified system)
  createWithdrawalReportApplication(data: { withdrawalId: string; splitShareId: string; appliedNano: string }): Promise<any>;
  getWithdrawalReportApplications(withdrawalId: string): Promise<any[]>;
  
  // Royalty Split Templates
  createRoyaltySplitTemplate(data: { orgId: string; name: string; splits: any[] }): Promise<any>;
  getRoyaltySplitTemplates(orgId: string): Promise<any[]>;
  getRoyaltySplitTemplateById(id: string): Promise<any | undefined>;
  deleteRoyaltySplitTemplate(id: string): Promise<void>;
  
  // Track Splits
  createTrackSplit(data: { trackId: string; releaseId: string; orgId: string; splits: any[]; createdBy: string }): Promise<any>;
  getTrackSplit(trackId: string): Promise<any | undefined>;
  getTrackSplitsByRelease(releaseId: string): Promise<any[]>;
  getTrackSplitsByOrg(orgId: string): Promise<any[]>;
  updateTrackSplit(id: string, data: { splits: any[] }): Promise<any | undefined>;
  deleteTrackSplit(id: string): Promise<void>;
  
  // Withdrawals
  getWithdrawals(orgId: string): Promise<Withdrawal[]>;
  getWithdrawal(id: string): Promise<Withdrawal | undefined>;
  createWithdrawal(data: InsertWithdrawal): Promise<Withdrawal>;
  updateWithdrawal(id: string, data: Partial<InsertWithdrawal>): Promise<Withdrawal | undefined>;
  requestWithdrawal(data: { orgId: string; amount: number; requestedBy: string; recipientName?: string; iban?: string; taxId?: string; bankName?: string }): Promise<Withdrawal>;
  createWithdrawalWithSplits(data: { 
    orgId: string; 
    amount: number; 
    legacyAmount?: number;
    allocationAmount?: number;
    allocationAmountNano?: string;
    allocationOverageCents?: number;
    allocationOverageNano?: string;
    allocationIds?: string[];
    requestedBy: string;
    recipientName?: string;
    iban?: string;
    taxId?: string;
    bankName?: string;
    splits: Array<{ 
      recipientName: string; 
      iban: string; 
      taxId?: string; 
      bankName: string; 
      percentage: string; 
      calculatedAmount: number;
      reservedAllocationCents?: number;
      reservedAllocationNano?: string;
      splitOverageCents?: number;
      splitOverageNano?: string;
    }> 
  }): Promise<{ withdrawal: Withdrawal; splits: any[] }>;
  getWithdrawalSplits(withdrawalId: string): Promise<any[]>;
  getAllWithdrawalsWithSplits(): Promise<any[]>;
  getAvailableBalance(orgId: string): Promise<{ availableEarnings: number; totalWithdrawn: number; availableBalance: number; totalEarned: number; totalEarnedUah: number }>;
  getLegacyBalance(orgId: string): Promise<{ legacyAvailable: number; legacyTotal: number; legacyWithdrawn: number }>;
  getLegacyBalanceInTransaction(ctx: any, orgId: string): Promise<{ legacyAvailable: number; legacyTotal: number; legacyWithdrawn: number }>;
  getTotalStreams(orgId: string): Promise<number>;
  
  // Music Videos
  createMusicVideo(data: InsertMusicVideo): Promise<MusicVideo>;
  getMusicVideo(id: string): Promise<(MusicVideo & { artist: Artist; organization: Organization }) | undefined>;
  getMusicVideos(orgId: string): Promise<(MusicVideo & { artist: Artist })[]>;
  getAllMusicVideos(options?: {
    page?: number;
    limit?: number;
    search?: string;
    status?: string;
    paymentStatus?: string;
  }): Promise<{
    videos: (MusicVideo & { artist: Artist; organization: Organization })[];
    total: number;
    page: number;
    totalPages: number;
  }>;
  updateMusicVideo(id: string, updates: Partial<MusicVideo>): Promise<MusicVideo | undefined>;
  deleteMusicVideo(id: string): Promise<void>;
  
  // Organizations
  getAllOrganizations(): Promise<Organization[]>;
  getAllOrganizationsWithMemberInfo(): Promise<(Organization & { memberCount: number; hasOrphanedMembers: boolean })[]>;
  
  // Label-Artist Links
  createLabelArtistLink(data: InsertLabelArtistLink): Promise<LabelArtistLink>;
  getLabelArtistLink(id: string): Promise<LabelArtistLink | undefined>;
  getLabelArtistLinks(): Promise<(LabelArtistLink & { labelOrg: Organization; artistOrg: Organization })[]>;
  getLabelArtistLinksByLabel(labelOrgId: string): Promise<(LabelArtistLink & { artistOrg: Organization })[]>;
  getLabelArtistLinksByArtist(artistOrgId: string): Promise<(LabelArtistLink & { labelOrg: Organization })[]>;
  updateLabelArtistLink(id: string, updates: Partial<InsertLabelArtistLink>): Promise<LabelArtistLink | undefined>;
  deleteLabelArtistLink(id: string): Promise<void>;
}

export class DatabaseStorage implements IStorage {
  // User operations (required for Replit Auth and Google OAuth)
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    if (!user) return undefined;

    // Fetch organizations for the user
    const userOrgs = await db
      .select({
        organization: organizations,
      })
      .from(orgMembers)
      .leftJoin(organizations, eq(orgMembers.orgId, organizations.id))
      .where(eq(orgMembers.userId, id));

    return {
      ...user,
      organizations: userOrgs
        .filter(({ organization }) => organization)
        .map(({ organization }) => organization!),
    };
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.email, email));
    return user;
  }

  async getUserByGoogleId(googleId: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.googleId, googleId));
    return user;
  }

  async createUserFromGoogle(userData: {
    googleId: string;
    email: string;
    firstName?: string;
    lastName?: string;
    profileImageUrl?: string;
    role?: "ARTIST" | "LABEL" | "TEAM" | "ADMIN";
  }): Promise<User> {
    const [user] = await db
      .insert(users)
      .values({
        googleId: userData.googleId,
        email: userData.email,
        firstName: userData.firstName,
        lastName: userData.lastName,
        profileImageUrl: userData.profileImageUrl,
        role: userData.role || "ARTIST"
      })
      .returning();
    return user;
  }

  async linkGoogleAccount(userId: string, googleId: string): Promise<User> {
    const [user] = await db
      .update(users)
      .set({ googleId, updatedAt: new Date() })
      .where(eq(users.id, userId))
      .returning();
    return user;
  }

  async upsertUser(userData: UpsertUser): Promise<User> {
    const [user] = await db
      .insert(users)
      .values(userData)
      .onConflictDoUpdate({
        target: users.id,
        set: {
          ...userData,
          updatedAt: new Date(),
        },
      })
      .returning();
    return user;
  }

  async updateUser(id: string, updates: Partial<User>): Promise<User | undefined> {
    const [user] = await db
      .update(users)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(users.id, id))
      .returning();
    return user;
  }

  async getAllUsers(): Promise<User[]> {
    const allUsers = await db
      .select({
        id: users.id,
        email: users.email,
        passwordHash: users.passwordHash,
        firstName: users.firstName,
        lastName: users.lastName,
        profileImageUrl: users.profileImageUrl,
        profileImageFileId: users.profileImageFileId,
        profileImageOriginalName: users.profileImageOriginalName,
        googleId: users.googleId,
        role: users.role,
        platformRole: users.platformRole,
        country: users.country,
        address: users.address,
        city: users.city,
        postalCode: users.postalCode,
        preferredLanguage: users.preferredLanguage,
        agreementAccepted: users.agreementAccepted,
        agreementAcceptedAt: users.agreementAcceptedAt,
        hasSeenOnboarding: users.hasSeenOnboarding,
        createdAt: users.createdAt,
        updatedAt: users.updatedAt,
      })
      .from(users)
      .orderBy(desc(users.createdAt));

    // Fetch organizations for each user
    const usersWithOrgs = await Promise.all(
      allUsers.map(async (user) => {
        const userOrgs = await db
          .select({
            organization: organizations,
          })
          .from(orgMembers)
          .leftJoin(organizations, eq(orgMembers.orgId, organizations.id))
          .where(eq(orgMembers.userId, user.id));

        return {
          ...user,
          organizations: userOrgs
            .filter(({ organization }) => organization)
            .map(({ organization }) => organization!),
        };
      })
    );

    return usersWithOrgs;
  }

  async createUserWithOrganization(userData: {
    email: string;
    firstName: string;
    lastName: string;
    role: "ARTIST" | "LABEL" | "TEAM" | "ADMIN";
    passwordHash: string;
    organizationName: string;
    organizationType: "ARTIST_ORG" | "LABEL" | "TEAM" | "ADMIN";
    organizationStatus?: "STANDARD" | "AMBASSADOR";
    country?: string;
  }): Promise<string> {
    return await db.transaction(async (tx) => {
      const country = userData.country || "UA";
      const preferredLanguage = (country === "UA" || country === "Ukraine") ? "uk" : undefined;
      
      // Create user
      const [user] = await tx
        .insert(users)
        .values({
          email: userData.email,
          firstName: userData.firstName,
          lastName: userData.lastName,
          role: userData.role,
          passwordHash: userData.passwordHash,
          country: country,
          preferredLanguage: preferredLanguage,
        })
        .returning();

      // Create organization
      const [org] = await tx
        .insert(organizations)
        .values({
          name: userData.organizationName,
          type: userData.organizationType,
          status: userData.organizationStatus || "STANDARD",
        })
        .returning();

      // Link user to organization as OWNER
      await tx.insert(orgMembers).values({
        orgId: org.id,
        userId: user.id,
        role: "OWNER",
      });

      return user.id;
    });
  }

  async createPlatformAdminUser(userData: {
    email: string;
    firstName: string;
    lastName: string;
    platformRole: "PLATFORM_OWNER" | "PLATFORM_ADMIN" | "PLATFORM_FINANCIER";
    passwordHash: string;
    country?: string;
  }): Promise<string> {
    const country = userData.country || "UA";
    const preferredLanguage = (country === "UA" || country === "Ukraine") ? "uk" : undefined;
    
    const [user] = await db
      .insert(users)
      .values({
        email: userData.email,
        firstName: userData.firstName,
        lastName: userData.lastName,
        role: "ADMIN",
        platformRole: userData.platformRole,
        passwordHash: userData.passwordHash,
        country: country,
        preferredLanguage: preferredLanguage,
      })
      .returning();

    return user.id;
  }

  async createUser(userData: {
    email: string;
    firstName: string;
    lastName: string;
    role: "ARTIST" | "LABEL" | "TEAM" | "ADMIN";
    passwordHash: string;
    country?: string;
  }): Promise<string> {
    const country = userData.country || "UA";
    const preferredLanguage = (country === "UA" || country === "Ukraine") ? "uk" : undefined;
    
    const [user] = await db
      .insert(users)
      .values({
        email: userData.email,
        firstName: userData.firstName,
        lastName: userData.lastName,
        role: userData.role,
        passwordHash: userData.passwordHash,
        country: country,
        preferredLanguage: preferredLanguage,
      })
      .returning();

    return user.id;
  }

  async deleteUser(id: string): Promise<void> {
    await db
      .delete(users)
      .where(eq(users.id, id));
  }

  // Organization operations
  async createOrganization(org: InsertOrganization): Promise<Organization> {
    const [organization] = await db.insert(organizations).values(org).returning();
    return organization;
  }

  async getOrganization(id: string): Promise<Organization | undefined> {
    const [org] = await db.select().from(organizations).where(eq(organizations.id, id));
    return org;
  }

  async getUserOrganizations(userId: string): Promise<Organization[]> {
    const userOrgs = await db
      .select({ organization: organizations })
      .from(orgMembers)
      .innerJoin(organizations, eq(orgMembers.orgId, organizations.id))
      .where(eq(orgMembers.userId, userId));
    
    return userOrgs.map(item => item.organization);
  }

  async getUserActiveOrganizations(userId: string): Promise<Organization[]> {
    const userOrgs = await db
      .select({ organization: organizations })
      .from(orgMembers)
      .innerJoin(organizations, eq(orgMembers.orgId, organizations.id))
      .where(and(
        eq(orgMembers.userId, userId),
        eq(organizations.isFrozen, false)
      ));
    
    return userOrgs.map(item => item.organization);
  }

  async addOrgMember(orgId: string, userId: string, role: string): Promise<OrgMember> {
    const [member] = await db
      .insert(orgMembers)
      .values({ orgId, userId, role })
      .returning();
    return member;
  }

  async getOrgMembers(orgId: string): Promise<(OrgMember & { user: User })[]> {
    const members = await db
      .select()
      .from(orgMembers)
      .innerJoin(users, eq(orgMembers.userId, users.id))
      .where(eq(orgMembers.orgId, orgId));
    
    return members.map(item => ({
      ...item.org_members,
      user: item.users,
    }));
  }

  async getOrgMember(orgId: string, userId: string): Promise<OrgMember | undefined> {
    const [member] = await db
      .select()
      .from(orgMembers)
      .where(and(eq(orgMembers.orgId, orgId), eq(orgMembers.userId, userId)));
    return member;
  }

  async updateOrganization(id: string, updates: Partial<Organization>): Promise<Organization | undefined> {
    const [org] = await db
      .update(organizations)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(organizations.id, id))
      .returning();
    return org;
  }

  async isOrgMember(userId: string, orgId: string): Promise<boolean> {
    const [member] = await db
      .select()
      .from(orgMembers)
      .where(and(eq(orgMembers.userId, userId), eq(orgMembers.orgId, orgId)));
    return !!member;
  }

  async updateOrgMemberRole(memberId: string, role: "OWNER" | "ADMIN" | "MEMBER"): Promise<OrgMember | undefined> {
    const [member] = await db
      .select()
      .from(orgMembers)
      .where(eq(orgMembers.id, memberId));
    
    if (!member) {
      throw new Error("Organization member not found");
    }

    if (member.role === "OWNER" && role !== "OWNER") {
      const owners = await db
        .select()
        .from(orgMembers)
        .where(and(
          eq(orgMembers.orgId, member.orgId),
          eq(orgMembers.role, "OWNER")
        ));
      
      if (owners.length === 1) {
        throw new Error("Cannot change role of the last owner. Organization must have at least one owner.");
      }
    }

    const [updated] = await db
      .update(orgMembers)
      .set({ role })
      .where(eq(orgMembers.id, memberId))
      .returning();
    return updated;
  }

  async removeOrgMember(memberId: string): Promise<void> {
    const [member] = await db
      .select()
      .from(orgMembers)
      .where(eq(orgMembers.id, memberId));
    
    if (!member) {
      throw new Error("Organization member not found");
    }

    if (member.role === "OWNER") {
      const owners = await db
        .select()
        .from(orgMembers)
        .where(and(
          eq(orgMembers.orgId, member.orgId),
          eq(orgMembers.role, "OWNER")
        ));
      
      if (owners.length === 1) {
        throw new Error("Cannot remove the last owner. Organization must have at least one owner.");
      }
    }

    await db
      .delete(orgMembers)
      .where(eq(orgMembers.id, memberId));
  }

  async deleteOrganization(orgId: string): Promise<void> {
    // Delete all related data in correct order (child tables first, then parent)
    
    // Get all releases for this organization to delete their child records
    const orgReleases = await db
      .select({ id: releases.id })
      .from(releases)
      .where(eq(releases.orgId, orgId));
    
    const releaseIds = orgReleases.map(r => r.id);
    
    if (releaseIds.length > 0) {
      // Delete release child records
      await db.delete(splitShares).where(inArray(splitShares.releaseId, releaseIds));
      await db.delete(qcItems).where(inArray(qcItems.releaseId, releaseIds));
      await db.delete(deliveryJobs).where(inArray(deliveryJobs.releaseId, releaseIds));
      await db.delete(tracks).where(inArray(tracks.releaseId, releaseIds));
      
      // Delete pitching submissions
      await db.delete(pitchingSubmissions).where(inArray(pitchingSubmissions.releaseId, releaseIds));
    }
    
    // Get all streaming reports for this organization
    const orgReports = await db
      .select({ id: streamingReports.id })
      .from(streamingReports)
      .where(eq(streamingReports.orgId, orgId));
    
    const reportIds = orgReports.map(r => r.id);
    
    if (reportIds.length > 0) {
      // Delete streaming report rows
      await db.delete(streamingReportRows).where(inArray(streamingReportRows.reportId, reportIds));
    }
    
    // Get all withdrawals for this organization
    const orgWithdrawals = await db
      .select({ id: withdrawals.id })
      .from(withdrawals)
      .where(eq(withdrawals.orgId, orgId));
    
    const withdrawalIds = orgWithdrawals.map(w => w.id);
    
    if (withdrawalIds.length > 0) {
      // Delete withdrawal splits
      await db.delete(withdrawalSplits).where(inArray(withdrawalSplits.withdrawalId, withdrawalIds));
    }
    
    // Delete organization-level records
    await db.delete(orgMembers).where(eq(orgMembers.orgId, orgId));
    await db.delete(artists).where(eq(artists.orgId, orgId));
    await db.delete(releases).where(eq(releases.orgId, orgId));
    await db.delete(musicVideos).where(eq(musicVideos.orgId, orgId));
    await db.delete(reportRows).where(eq(reportRows.orgId, orgId));
    await db.delete(streamingReports).where(eq(streamingReports.orgId, orgId));
    await db.delete(socialFollowerSnapshots).where(eq(socialFollowerSnapshots.orgId, orgId));
    await db.delete(organizationDriveFolders).where(eq(organizationDriveFolders.orgId, orgId));
    await db.delete(streamingReportImportLogs).where(eq(streamingReportImportLogs.orgId, orgId));
    await db.delete(paymentDetails).where(eq(paymentDetails.orgId, orgId));
    await db.delete(royaltySplitTemplates).where(eq(royaltySplitTemplates.orgId, orgId));
    await db.delete(withdrawals).where(eq(withdrawals.orgId, orgId));
    await db.delete(auditLogs).where(eq(auditLogs.orgId, orgId));
    
    // Finally, delete the organization itself
    await db.delete(organizations).where(eq(organizations.id, orgId));
  }

  // Artist operations
  async createArtist(artist: InsertArtist): Promise<Artist> {
    const [newArtist] = await db.insert(artists).values(artist).returning();
    return newArtist;
  }

  async getArtists(orgId: string): Promise<Artist[]> {
    return await db.select().from(artists).where(eq(artists.orgId, orgId)).orderBy(artists.createdAt);
  }

  async getArtist(id: string): Promise<Artist | undefined> {
    const [artist] = await db.select().from(artists).where(eq(artists.id, id));
    return artist;
  }

  // Release operations
  async createRelease(release: InsertRelease): Promise<Release> {
    const [newRelease] = await db.insert(releases).values(release).returning();
    return newRelease;
  }

  async getRelease(id: string): Promise<Release | undefined> {
    const [release] = await db.select().from(releases).where(eq(releases.id, id));
    return release;
  }

  async getReleases(orgId: string): Promise<Release[]> {
    return await db
      .select()
      .from(releases)
      .where(eq(releases.orgId, orgId))
      .orderBy(desc(releases.createdAt));
  }

  async updateRelease(id: string, updates: Partial<Release>): Promise<Release> {
    // Convert date strings to Date objects for Drizzle
    const sanitizedUpdates: any = { ...updates };
    if (sanitizedUpdates.releaseDate && typeof sanitizedUpdates.releaseDate === 'string') {
      sanitizedUpdates.releaseDate = new Date(sanitizedUpdates.releaseDate);
    }
    if (sanitizedUpdates.originalReleaseDate && typeof sanitizedUpdates.originalReleaseDate === 'string') {
      sanitizedUpdates.originalReleaseDate = new Date(sanitizedUpdates.originalReleaseDate);
    }
    if (sanitizedUpdates.codesAssignedAt && typeof sanitizedUpdates.codesAssignedAt === 'string') {
      sanitizedUpdates.codesAssignedAt = new Date(sanitizedUpdates.codesAssignedAt);
    }
    
    const [updated] = await db
      .update(releases)
      .set({ ...sanitizedUpdates, updatedAt: new Date() })
      .where(eq(releases.id, id))
      .returning();
    return updated;
  }

  async getRecentReleases(orgId: string, limit = 5): Promise<(Release & { artist: Artist })[]> {
    const recentReleases = await db
      .select()
      .from(releases)
      .innerJoin(artists, eq(releases.artistId, artists.id))
      .where(and(
        eq(releases.orgId, orgId),
        or(
          isNull(releases.releaseDate),
          lte(releases.releaseDate, new Date())
        )
      ))
      .orderBy(desc(releases.createdAt))
      .limit(limit);
    
    return recentReleases.map(item => ({
      ...item.releases,
      artist: item.artists,
    }));
  }

  async getAllReleases(options?: {
    page?: number;
    limit?: number;
    search?: string;
    status?: string;
    paymentStatus?: string;
  }): Promise<{
    releases: (Release & { artist: Artist; organization: Organization })[];
    total: number;
    page: number;
    totalPages: number;
  }> {
    const page = options?.page || 1;
    const limit = options?.limit || 50;
    const offset = (page - 1) * limit;
    const search = options?.search?.trim();
    const status = options?.status;
    const paymentStatus = options?.paymentStatus;

    // Build where conditions
    const conditions = [];
    
    if (search) {
      // Search in title, artist name, organization name, or UPC (case-insensitive)
      conditions.push(
        or(
          ilike(releases.title, `%${search}%`),
          ilike(artists.name, `%${search}%`),
          ilike(organizations.name, `%${search}%`),
          ilike(releases.upc, `%${search}%`)
        )
      );
    }
    
    if (status && status !== 'all') {
      conditions.push(eq(releases.status, status));
    }
    
    if (paymentStatus && paymentStatus !== 'all') {
      conditions.push(eq(releases.paymentStatus, paymentStatus));
    }

    // Get total count
    const countQuery = await db
      .select({ count: sql<number>`count(*)` })
      .from(releases)
      .innerJoin(artists, eq(releases.artistId, artists.id))
      .innerJoin(organizations, eq(releases.orgId, organizations.id))
      .where(conditions.length > 0 ? and(...conditions) : undefined);
    
    const total = Number(countQuery[0]?.count || 0);
    const totalPages = Math.ceil(total / limit);

    // Get paginated results
    const allReleases = await db
      .select()
      .from(releases)
      .innerJoin(artists, eq(releases.artistId, artists.id))
      .innerJoin(organizations, eq(releases.orgId, organizations.id))
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(releases.createdAt))
      .limit(limit)
      .offset(offset);
    
    return {
      releases: allReleases.map(item => ({
        ...item.releases,
        artist: item.artists,
        organization: item.organizations,
      })),
      total,
      page,
      totalPages,
    };
  }

  async getUserReleases(userId: string, options?: {
    page?: number;
    limit?: number;
    search?: string;
    status?: string;
    paymentStatus?: string;
  }): Promise<{
    releases: (Release & { artist: Artist; organization: Organization })[];
    total: number;
    page: number;
    totalPages: number;
  }> {
    const page = options?.page || 1;
    const limit = options?.limit || 50;
    const offset = (page - 1) * limit;
    const search = options?.search?.trim();
    const status = options?.status;
    const paymentStatus = options?.paymentStatus;

    // Get user to check if they're a platform admin
    const user = await this.getUser(userId);
    const isPlatformAdmin = user?.platformRole !== null && user?.platformRole !== undefined;

    // Build where conditions
    const conditions = [];
    
    // Only filter by organization if user is NOT a platform admin
    if (!isPlatformAdmin) {
      const userOrgs = await this.getUserOrganizations(userId);
      const userOrgIds = userOrgs.map(org => org.id);

      if (userOrgIds.length === 0) {
        return {
          releases: [],
          total: 0,
          page: 1,
          totalPages: 0,
        };
      }

      // CRITICAL: Filter by user's organizations only (for regular users)
      conditions.push(inArray(releases.orgId, userOrgIds));
    }
    
    if (search) {
      // Search in title, artist name, organization name, or UPC (case-insensitive)
      conditions.push(
        or(
          ilike(releases.title, `%${search}%`),
          ilike(artists.name, `%${search}%`),
          ilike(organizations.name, `%${search}%`),
          ilike(releases.upc, `%${search}%`)
        )
      );
    }
    
    if (status && status !== 'all') {
      conditions.push(eq(releases.status, status));
    }
    
    if (paymentStatus && paymentStatus !== 'all') {
      conditions.push(eq(releases.paymentStatus, paymentStatus));
    }

    // Get total count
    const countQuery = await db
      .select({ count: sql<number>`count(*)` })
      .from(releases)
      .innerJoin(artists, eq(releases.artistId, artists.id))
      .innerJoin(organizations, eq(releases.orgId, organizations.id))
      .where(conditions.length > 0 ? and(...conditions) : undefined);
    
    const total = Number(countQuery[0]?.count || 0);
    const totalPages = Math.ceil(total / limit);

    // Get paginated results
    const userReleases = await db
      .select()
      .from(releases)
      .innerJoin(artists, eq(releases.artistId, artists.id))
      .innerJoin(organizations, eq(releases.orgId, organizations.id))
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(releases.createdAt))
      .limit(limit)
      .offset(offset);
    
    return {
      releases: userReleases.map(item => ({
        ...item.releases,
        artist: item.artists,
        organization: item.organizations,
      })),
      total,
      page,
      totalPages,
    };
  }

  async getReleaseDetails(id: string): Promise<(Release & { artist: Artist; organization: Organization; tracks: Track[] }) | undefined> {
    // Get release with artist and organization
    const releaseQuery = await db
      .select()
      .from(releases)
      .innerJoin(artists, eq(releases.artistId, artists.id))
      .innerJoin(organizations, eq(releases.orgId, organizations.id))
      .where(eq(releases.id, id));
    
    if (releaseQuery.length === 0) {
      return undefined;
    }
    
    const releaseData = releaseQuery[0];
    
    // Get tracks for this release
    const releaseTracks = await this.getTracks(id);
    
    return {
      ...releaseData.releases,
      artist: releaseData.artists,
      organization: releaseData.organizations,
      tracks: releaseTracks,
    };
  }

  // Track operations
  async createTrack(track: InsertTrack): Promise<Track> {
    const [newTrack] = await db.insert(tracks).values(track).returning();
    return newTrack;
  }

  async getTrack(id: string): Promise<Track | undefined> {
    const [track] = await db
      .select()
      .from(tracks)
      .where(eq(tracks.id, id))
      .limit(1);
    return track;
  }

  async getTracks(releaseId: string): Promise<Track[]> {
    return await db
      .select()
      .from(tracks)
      .where(eq(tracks.releaseId, releaseId))
      .orderBy(asc(tracks.trackIndex));
  }

  async updateTrack(id: string, updates: Partial<Track>): Promise<Track> {
    const [updated] = await db
      .update(tracks)
      .set(updates)
      .where(eq(tracks.id, id))
      .returning();
    return updated;
  }

  async deleteTracks(releaseId: string): Promise<void> {
    await db
      .delete(tracks)
      .where(eq(tracks.releaseId, releaseId));
  }

  async deleteRelease(id: string): Promise<void> {
    await db
      .delete(releases)
      .where(eq(releases.id, id));
  }

  // Split share operations
  async createSplitShare(splitShare: InsertSplitShare): Promise<SplitShare> {
    const [newSplit] = await db.insert(splitShares).values(splitShare).returning();
    return newSplit;
  }

  async getSplitShares(releaseId?: string, trackId?: string): Promise<SplitShare[]> {
    const conditions = [] as any[];
    if (releaseId) {
      conditions.push(eq(splitShares.releaseId, releaseId));
    }
    if (trackId) {
      conditions.push(eq(splitShares.trackId, trackId));
    }

    if (conditions.length > 0) {
      return await db.select().from(splitShares).where(and(...conditions));
    }
    return await db.select().from(splitShares);
  }

  // QC operations
  async createQCItem(item: Omit<QCItem, 'id' | 'createdAt'>): Promise<QCItem> {
    const [qcItem] = await db.insert(qcItems).values(item).returning();
    return qcItem;
  }

  async getQCItems(releaseId: string): Promise<QCItem[]> {
    return await db.select().from(qcItems).where(eq(qcItems.releaseId, releaseId));
  }

  async getPendingQCReleases(): Promise<(Release & { artist: Artist; organization: Organization })[]> {
    const pending = await db
      .select()
      .from(releases)
      .innerJoin(artists, eq(releases.artistId, artists.id))
      .innerJoin(organizations, eq(releases.orgId, organizations.id))
      .where(eq(releases.status, "IN_REVIEW"))
      .orderBy(asc(releases.updatedAt));
    
    return pending.map(item => ({
      ...item.releases,
      artist: item.artists,
      organization: item.organizations,
    }));
  }

  // Delivery operations
  async createDeliveryJob(job: Omit<DeliveryJob, 'id' | 'createdAt' | 'updatedAt'>): Promise<DeliveryJob> {
    const [deliveryJob] = await db.insert(deliveryJobs).values(job).returning();
    return deliveryJob;
  }

  async getDeliveryJobs(releaseId: string): Promise<DeliveryJob[]> {
    return await db
      .select()
      .from(deliveryJobs)
      .where(eq(deliveryJobs.releaseId, releaseId))
      .orderBy(desc(deliveryJobs.createdAt));
  }

  async updateDeliveryJob(id: string, updates: Partial<DeliveryJob>): Promise<DeliveryJob> {
    const [updated] = await db
      .update(deliveryJobs)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(deliveryJobs.id, id))
      .returning();
    return updated;
  }

  // Reporting operations
  async createReportRow(row: Omit<ReportRow, 'id' | 'createdAt'>): Promise<ReportRow> {
    const [reportRow] = await db.insert(reportRows).values(row).returning();
    return reportRow;
  }

  async getReportRows(orgId: string, period?: string): Promise<ReportRow[]> {
    
    if (period) {
      return await db
      .select()
      .from(reportRows)
      .where(and(eq(reportRows.orgId, orgId), eq(reportRows.period, period)))
      .orderBy(desc(reportRows.createdAt));
    }

    return await db
      .select()
      .from(reportRows)
      .where(eq(reportRows.orgId, orgId))
      .orderBy(desc(reportRows.createdAt));
  }

  async getRevenueSummary(orgId: string): Promise<{ totalRevenue: number; streams: number }> {
    const summary = await db
      .select()
      .from(reportRows)
      .where(eq(reportRows.orgId, orgId));
    
    const totalRevenue = summary.reduce((sum, row) => sum + (row.revenueCents || 0), 0) / 100;
    const streams = summary.reduce((sum, row) => sum + (row.units || 0), 0);
    
    return { totalRevenue, streams };
  }

  // Audit log
  async logAction(log: Omit<AuditLog, 'id' | 'createdAt'>): Promise<AuditLog> {
    const [auditLog] = await db.insert(auditLogs).values(log).returning();
    return auditLog;
  }

  // Notifications
  async createNotification(notification: Omit<Notification, 'id' | 'createdAt'>): Promise<Notification> {
    const [newNotification] = await db.insert(notifications).values(notification).returning();
    return newNotification;
  }

  async getUserNotifications(userId: string, limit = 50): Promise<Notification[]> {
    const userNotifications = await db
      .select()
      .from(notifications)
      .where(eq(notifications.userId, userId))
      .orderBy(desc(notifications.createdAt))
      .limit(limit);
    return userNotifications;
  }

  async markNotificationAsRead(id: string): Promise<Notification> {
    const [updated] = await db
      .update(notifications)
      .set({ isRead: true })
      .where(eq(notifications.id, id))
      .returning();
    return updated;
  }

  async markAllNotificationsAsRead(userId: string): Promise<void> {
    await db
      .update(notifications)
      .set({ isRead: true })
      .where(and(
        eq(notifications.userId, userId),
        eq(notifications.isRead, false)
      ));
  }

  async getUnreadNotificationCount(userId: string): Promise<number> {
    const unread = await db
      .select()
      .from(notifications)
      .where(and(
        eq(notifications.userId, userId),
        eq(notifications.isRead, false)
      ));
    return unread.length;
  }

  // Pitching submissions
  async createPitchingSubmission(submission: InsertPitchingSubmission): Promise<PitchingSubmission> {
    const [newSubmission] = await db.insert(pitchingSubmissions).values(submission).returning();
    return newSubmission;
  }

  async getPitchingSubmissions(userId: string): Promise<(PitchingSubmission & { release: Release & { artist: Artist } })[]> {
    const submissions = await db
      .select()
      .from(pitchingSubmissions)
      .leftJoin(releases, eq(pitchingSubmissions.releaseId, releases.id))
      .leftJoin(artists, eq(releases.artistId, artists.id))
      .where(eq(pitchingSubmissions.userId, userId))
      .orderBy(desc(pitchingSubmissions.createdAt));
    
    return submissions
      .filter(({ releases: release, artists: artist }) => release && artist)
      .map(({ pitching_submissions: submission, releases: release, artists: artist }) => ({
        ...submission,
        release: {
          ...release!,
          artist: artist!,
        },
      }));
  }

  async getPitchingSubmission(id: string): Promise<PitchingSubmission | undefined> {
    const [submission] = await db
      .select()
      .from(pitchingSubmissions)
      .where(eq(pitchingSubmissions.id, id));
    return submission;
  }

  async getRecentReleasesForPitching(orgId: string): Promise<(Release & { artist: Artist; tracks: Track[] })[]> {
    // Calculate minimum date: today + 14 days (at start of day)
    const minReleaseDate = new Date();
    minReleaseDate.setHours(0, 0, 0, 0);
    minReleaseDate.setDate(minReleaseDate.getDate() + 14);
    
    // Show releases that have release date at least 14 days from now
    const recentReleases = await db
      .select()
      .from(releases)
      .leftJoin(artists, eq(releases.artistId, artists.id))
      .where(eq(releases.orgId, orgId))
      .orderBy(desc(releases.createdAt));
    
    const releasesWithTracks = await Promise.all(
      recentReleases
        .filter(({ releases: release }) => {
          // Check if release date is at least 14 days from now
          const releaseDateStr = release.releaseDate || release.originalReleaseDate;
          if (!releaseDateStr) return false;
          // Parse the date properly (handles "2026-02-07 00:00:00" format)
          const releaseDate = new Date(releaseDateStr);
          return releaseDate >= minReleaseDate;
        })
        .map(async ({ releases: release, artists: artist }) => {
          const releaseTracks = await this.getTracks(release.id);
          return {
            ...release,
            // Use releaseDate if set, otherwise fall back to originalReleaseDate
            releaseDate: release.releaseDate || release.originalReleaseDate,
            artist: artist!,
            tracks: releaseTracks,
          };
        })
    );
    
    return releasesWithTracks;
  }

  async getAllPitchingSubmissions(): Promise<(PitchingSubmission & { release: Release & { artist: Artist; organization: Organization } })[]> {
    const submissions = await db
      .select()
      .from(pitchingSubmissions)
      .leftJoin(releases, eq(pitchingSubmissions.releaseId, releases.id))
      .leftJoin(artists, eq(releases.artistId, artists.id))
      .leftJoin(organizations, eq(pitchingSubmissions.orgId, organizations.id))
      .orderBy(desc(pitchingSubmissions.createdAt));
    
    return submissions
      .filter(({ releases: release, artists: artist, organizations: org }) => release && artist && org)
      .map(({ pitching_submissions: submission, releases: release, artists: artist, organizations: org }) => ({
        ...submission,
        release: {
          ...release!,
          // Use releaseDate if set, otherwise fall back to originalReleaseDate
          releaseDate: release!.releaseDate || release!.originalReleaseDate,
          artist: artist!,
          organization: org!,
        },
      }));
  }

  async updatePitchingSubmission(id: string, updates: Partial<PitchingSubmission>): Promise<PitchingSubmission | undefined> {
    // Build update object with only provided fields
    const updateData: Partial<typeof pitchingSubmissions.$inferInsert> = {
      updatedAt: new Date(),
    };
    
    if (updates.releaseDescription !== undefined) updateData.releaseDescription = updates.releaseDescription;
    if (updates.artistInfo !== undefined) updateData.artistInfo = updates.artistInfo;
    if (updates.promoplan !== undefined) updateData.promoplan = updates.promoplan;
    if (updates.focusTrack !== undefined) updateData.focusTrack = updates.focusTrack;
    if (updates.budget !== undefined) updateData.budget = updates.budget;
    if (updates.photosGoogleDrive !== undefined) updateData.photosGoogleDrive = updates.photosGoogleDrive;
    if (updates.spotifyUrl !== undefined) updateData.spotifyUrl = updates.spotifyUrl;
    if (updates.spotifyNoProfile !== undefined) updateData.spotifyNoProfile = updates.spotifyNoProfile;
    if (updates.appleMusicUrl !== undefined) updateData.appleMusicUrl = updates.appleMusicUrl;
    if (updates.appleMusicNoProfile !== undefined) updateData.appleMusicNoProfile = updates.appleMusicNoProfile;
    if (updates.instagramUrl !== undefined) updateData.instagramUrl = updates.instagramUrl;
    if (updates.instagramNoProfile !== undefined) updateData.instagramNoProfile = updates.instagramNoProfile;
    if (updates.status !== undefined) updateData.status = updates.status;
    
    const [updated] = await db
      .update(pitchingSubmissions)
      .set(updateData)
      .where(eq(pitchingSubmissions.id, id))
      .returning();
    return updated;
  }

  // YouTube Ad Campaigns
  async createYoutubeAdCampaign(data: InsertYoutubeAdCampaign): Promise<YoutubeAdCampaign> {
    const [campaign] = await db.insert(youtubeAdCampaigns).values(data).returning();
    return campaign;
  }

  async getYoutubeAdCampaignsByOrg(orgId: string): Promise<YoutubeAdCampaign[]> {
    return db
      .select()
      .from(youtubeAdCampaigns)
      .where(eq(youtubeAdCampaigns.orgId, orgId))
      .orderBy(desc(youtubeAdCampaigns.createdAt));
  }

  async getAllYoutubeAdCampaigns(): Promise<(YoutubeAdCampaign & { organization?: { id: string; name: string } })[]> {
    const results = await db
      .select({
        campaign: youtubeAdCampaigns,
        organization: {
          id: organizations.id,
          name: organizations.name,
        },
      })
      .from(youtubeAdCampaigns)
      .leftJoin(organizations, eq(youtubeAdCampaigns.orgId, organizations.id))
      .orderBy(desc(youtubeAdCampaigns.createdAt));
    
    return results.map(row => ({
      ...row.campaign,
      organization: row.organization?.id && row.organization?.name ? row.organization : undefined,
    }));
  }

  async getYoutubeAdCampaign(id: string): Promise<YoutubeAdCampaign | undefined> {
    const [campaign] = await db
      .select()
      .from(youtubeAdCampaigns)
      .where(eq(youtubeAdCampaigns.id, id));
    return campaign;
  }

  async getYoutubeAdCampaignByPaymentReference(paymentReference: string): Promise<YoutubeAdCampaign | undefined> {
    const [campaign] = await db
      .select()
      .from(youtubeAdCampaigns)
      .where(eq(youtubeAdCampaigns.paymentReference, paymentReference));
    return campaign;
  }

  async updateYoutubeAdCampaign(id: string, updates: Partial<YoutubeAdCampaign>): Promise<YoutubeAdCampaign | undefined> {
    const updateData: Partial<typeof youtubeAdCampaigns.$inferInsert> = {
      updatedAt: new Date(),
    };
    
    if (updates.status !== undefined) updateData.status = updates.status;
    if (updates.adminNotes !== undefined) updateData.adminNotes = updates.adminNotes;
    if (updates.reportData !== undefined) updateData.reportData = updates.reportData;
    if (updates.reportUploadedAt !== undefined) updateData.reportUploadedAt = updates.reportUploadedAt;
    if (updates.inStreamReportData !== undefined) updateData.inStreamReportData = updates.inStreamReportData;
    if (updates.inStreamReportUploadedAt !== undefined) updateData.inStreamReportUploadedAt = updates.inStreamReportUploadedAt;
    if (updates.discoveryReportData !== undefined) updateData.discoveryReportData = updates.discoveryReportData;
    if (updates.discoveryReportUploadedAt !== undefined) updateData.discoveryReportUploadedAt = updates.discoveryReportUploadedAt;
    if (updates.paymentStatus !== undefined) updateData.paymentStatus = updates.paymentStatus;
    if (updates.paidAt !== undefined) updateData.paidAt = updates.paidAt;
    if (updates.paymentReference !== undefined) updateData.paymentReference = updates.paymentReference;
    
    const [updated] = await db
      .update(youtubeAdCampaigns)
      .set(updateData)
      .where(eq(youtubeAdCampaigns.id, id))
      .returning();
    return updated;
  }

  async deleteYoutubeAdCampaign(id: string): Promise<boolean> {
    const result = await db
      .delete(youtubeAdCampaigns)
      .where(eq(youtubeAdCampaigns.id, id));
    return true;
  }

  // Statistics
  async getOrgStats(orgId: string): Promise<{
    totalRevenue: number;
    activeReleases: number;
    totalStreams: number;
    pendingReview: number;
    monthlyReleases: number;
    hasDeliveredReleases: boolean;
    draftReleases: number;
    unpaidReleases: number;
    deletedReleases: number;
  }> {
    const [releaseStats] = await db
      .select()
      .from(releases)
      .where(eq(releases.orgId, orgId));
    
    const activeReleases = await db
      .select()
      .from(releases)
      .where(and(
        eq(releases.orgId, orgId),
        inArray(releases.status, ["ACTIVE", "DELIVERED", "DELIVERING"])
      ));
    
    const pendingReleases = await db
      .select()
      .from(releases)
      .where(and(
        eq(releases.orgId, orgId),
        eq(releases.status, "IN_REVIEW")
      ));
    
    const draftReleasesResult = await db
      .select()
      .from(releases)
      .where(and(
        eq(releases.orgId, orgId),
        eq(releases.status, "DRAFT")
      ));
    
    const unpaidReleasesResult = await db
      .select()
      .from(releases)
      .where(and(
        eq(releases.orgId, orgId),
        inArray(releases.paymentStatus, ["PENDING", "FAILED"])
      ));
    
    const deletedReleasesResult = await db
      .select()
      .from(releases)
      .where(and(
        eq(releases.orgId, orgId),
        eq(releases.status, "TAKEDOWN")
      ));
    
    // Get monthly releases (current month)
    const now = new Date();
    const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    
    const monthlyReleasesResult = await db
      .select()
      .from(releases)
      .where(and(
        eq(releases.orgId, orgId),
        gte(releases.createdAt, firstDayOfMonth)
      ));
    
    const { totalRevenue, streams } = await this.getRevenueSummary(orgId);
    
    return {
      totalRevenue,
      activeReleases: activeReleases.length,
      totalStreams: streams,
      pendingReview: pendingReleases.length,
      monthlyReleases: monthlyReleasesResult.length,
      hasDeliveredReleases: activeReleases.length > 0,
      draftReleases: draftReleasesResult.length,
      unpaidReleases: unpaidReleasesResult.length,
      deletedReleases: deletedReleasesResult.length,
    };
  }
  
  // Allowed Emails (Whitelist) operations
  async getAllowedEmails(): Promise<any[]> {
    const emails = await db
      .select()
      .from(allowedEmails)
      .orderBy(desc(allowedEmails.createdAt));
    return emails;
  }

  async isEmailAllowed(email: string): Promise<{ allowed: boolean; role: string | null }> {
    const [result] = await db
      .select()
      .from(allowedEmails)
      .where(eq(allowedEmails.email, email.toLowerCase()));
    
    if (result) {
      return { allowed: true, role: result.role || "ARTIST" };
    }
    
    return { allowed: false, role: null };
  }

  async addAllowedEmail(email: string, role: "ARTIST" | "LABEL" | "TEAM" | "ADMIN", addedBy: string): Promise<any> {
    const [newEmail] = await db
      .insert(allowedEmails)
      .values({
        email: email.toLowerCase(),
        role,
        addedBy,
      })
      .returning();
    return newEmail;
  }

  async removeAllowedEmail(id: string): Promise<void> {
    await db
      .delete(allowedEmails)
      .where(eq(allowedEmails.id, id));
  }

  // Password management
  async setUserPassword(userId: string, passwordHash: string): Promise<void> {
    await db
      .update(users)
      .set({ passwordHash, updatedAt: new Date() })
      .where(eq(users.id, userId));
  }
  
  // Password Reset Tokens
  async createPasswordResetToken(data: { userId: string; token: string; expiresAt: Date }): Promise<any> {
    const [token] = await db
      .insert(passwordResetTokens)
      .values({
        userId: data.userId,
        token: data.token,
        expiresAt: data.expiresAt,
      })
      .returning();
    return token;
  }
  
  async getPasswordResetToken(token: string): Promise<any | undefined> {
    const [result] = await db
      .select()
      .from(passwordResetTokens)
      .where(eq(passwordResetTokens.token, token));
    return result;
  }
  
  async invalidatePasswordResetTokens(userId: string): Promise<void> {
    await db
      .update(passwordResetTokens)
      .set({ used: true })
      .where(eq(passwordResetTokens.userId, userId));
  }
  
  async markPasswordResetTokenUsed(tokenId: string): Promise<void> {
    await db
      .update(passwordResetTokens)
      .set({ used: true })
      .where(eq(passwordResetTokens.id, tokenId));
  }
  
  // Telegram Verification Codes
  async createTelegramVerificationCode(data: { orgId: string; code: string; expiresAt: Date }): Promise<any> {
    const [code] = await db
      .insert(telegramVerificationCodes)
      .values({
        orgId: data.orgId,
        code: data.code,
        expiresAt: data.expiresAt,
      })
      .returning();
    return code;
  }
  
  async getTelegramVerificationCode(code: string): Promise<any | undefined> {
    const [result] = await db
      .select()
      .from(telegramVerificationCodes)
      .where(eq(telegramVerificationCodes.code, code));
    return result;
  }
  
  async markTelegramVerificationCodeUsed(codeId: string): Promise<void> {
    await db
      .update(telegramVerificationCodes)
      .set({ used: true })
      .where(eq(telegramVerificationCodes.id, codeId));
  }
  
  async deleteTelegramVerificationCodesForOrg(orgId: string): Promise<void> {
    await db
      .delete(telegramVerificationCodes)
      .where(eq(telegramVerificationCodes.orgId, orgId));
  }

  /**
   * Atomically links a Telegram chat to an organization using a verification code.
   * All operations are wrapped in a transaction for database safety.
   * Uses UPDATE...WHERE used=false with RETURNING to prevent race conditions.
   */
  async linkTelegramChatToOrg(
    code: string,
    chatId: string
  ): Promise<{ success: boolean; error?: string; orgName?: string }> {
    return await db.transaction(async (tx) => {
      // Atomically claim the code: UPDATE only if not used, check expiry, return the row
      // This prevents race conditions - only ONE transaction can successfully claim
      const [claimedCode] = await tx
        .update(telegramVerificationCodes)
        .set({ used: true })
        .where(
          and(
            eq(telegramVerificationCodes.code, code),
            eq(telegramVerificationCodes.used, false),
            gt(telegramVerificationCodes.expiresAt, new Date())
          )
        )
        .returning();

      // If no row was updated, check why
      if (!claimedCode) {
        // Check if code exists at all
        const [existingCode] = await tx
          .select()
          .from(telegramVerificationCodes)
          .where(eq(telegramVerificationCodes.code, code))
          .limit(1);

        if (!existingCode) {
          return { success: false, error: 'CODE_NOT_FOUND' };
        }
        if (existingCode.used) {
          return { success: false, error: 'CODE_ALREADY_USED' };
        }
        if (new Date(existingCode.expiresAt) < new Date()) {
          return { success: false, error: 'CODE_EXPIRED' };
        }
        // Fallback - shouldn't happen but handle gracefully
        return { success: false, error: 'CODE_NOT_FOUND' };
      }

      // Get organization
      const [org] = await tx
        .select()
        .from(organizations)
        .where(eq(organizations.id, claimedCode.orgId))
        .limit(1);

      if (!org) {
        return { success: false, error: 'ORG_NOT_FOUND' };
      }

      // Update organization with chat ID
      await tx
        .update(organizations)
        .set({ telegramChatId: chatId })
        .where(eq(organizations.id, claimedCode.orgId));

      // Delete all verification codes for this org (cleanup)
      await tx
        .delete(telegramVerificationCodes)
        .where(eq(telegramVerificationCodes.orgId, claimedCode.orgId));

      return { success: true, orgName: org.name };
    });
  }
  
  // Streaming Reports
  async createStreamingReport(data: InsertStreamingReport): Promise<StreamingReport> {
    const [report] = await db.insert(streamingReports).values(data).returning();
    return report;
  }
  
  async getStreamingReports(orgId: string): Promise<StreamingReport[]> {
    return await db
      .select()
      .from(streamingReports)
      .where(eq(streamingReports.orgId, orgId))
      .orderBy(desc(streamingReports.createdAt));
  }
  
  async getStreamingReport(id: string): Promise<StreamingReport | undefined> {
    const [report] = await db
      .select()
      .from(streamingReports)
      .where(eq(streamingReports.id, id));
    return report;
  }
  
  async createStreamingReportRow(data: InsertStreamingReportRow): Promise<StreamingReportRow> {
    const [row] = await db.insert(streamingReportRows).values(data).returning();
    return row;
  }

  async createStreamingReportRowsBatch(rows: InsertStreamingReportRow[]): Promise<number> {
    if (rows.length === 0) return 0;
    const CHUNK_SIZE = 500;
    let inserted = 0;
    for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
      const chunk = rows.slice(i, i + CHUNK_SIZE);
      await db.insert(streamingReportRows).values(chunk);
      inserted += chunk.length;
    }
    return inserted;
  }
  
  async updateStreamingReportRow(id: string, data: Partial<InsertStreamingReportRow>): Promise<StreamingReportRow | undefined> {
    const [row] = await db
      .update(streamingReportRows)
      .set(data)
      .where(eq(streamingReportRows.id, id))
      .returning();
    return row;
  }
  
  async getStreamingReportRows(reportId: string): Promise<StreamingReportRow[]> {
    return await db
      .select()
      .from(streamingReportRows)
      .where(eq(streamingReportRows.reportId, reportId));
  }
  
  async getAllStreamingReports(): Promise<any[]> {
    const reports = await db
      .select({
        id: streamingReports.id,
        orgId: streamingReports.orgId,
        uploadedBy: streamingReports.uploadedBy,
        period: streamingReports.period,
        fileUrl: streamingReports.fileUrl,
        fileName: streamingReports.fileName,
        totalStreams: streamingReports.totalStreams,
        totalRevenue: streamingReports.totalRevenue,
        currency: streamingReports.currency,
        createdAt: streamingReports.createdAt,
        organization: {
          name: organizations.name,
        },
      })
      .from(streamingReports)
      .leftJoin(organizations, eq(streamingReports.orgId, organizations.id))
      .orderBy(desc(streamingReports.createdAt));
    
    return reports;
  }
  
  // Organization Drive Folders (for auto-import)
  async getOrganizationDriveFolder(orgId: string): Promise<any | undefined> {
    const [folder] = await db
      .select()
      .from(organizationDriveFolders)
      .where(eq(organizationDriveFolders.orgId, orgId));
    return folder;
  }
  
  async getAllOrganizationDriveFolders(): Promise<any[]> {
    return await db
      .select()
      .from(organizationDriveFolders)
      .orderBy(desc(organizationDriveFolders.linkedAt));
  }
  
  async setOrganizationDriveFolder(data: { orgId: string; driveFolderId: string; driveFolderName: string; linkedBy: string; taxDeductionType?: 'fop_7' | 'agent_23' | 'both' | null }): Promise<any> {
    const [folder] = await db
      .insert(organizationDriveFolders)
      .values(data)
      .onConflictDoUpdate({
        target: organizationDriveFolders.orgId,
        set: {
          driveFolderId: data.driveFolderId,
          driveFolderName: data.driveFolderName,
          linkedBy: data.linkedBy,
          taxDeductionType: data.taxDeductionType,
          linkedAt: sql`NOW()`
        }
      })
      .returning();
    return folder;
  }
  
  async updateOrganizationDriveFolderSyncTime(orgId: string, timestamp: Date): Promise<void> {
    await db
      .update(organizationDriveFolders)
      .set({ 
        lastSyncedAt: timestamp
      })
      .where(eq(organizationDriveFolders.orgId, orgId));
  }
  
  async updateOrganizationDriveFolderImportAttempt(orgId: string, timestamp: Date, wasSuccessful: boolean): Promise<void> {
    const updates: any = {
      lastImportAttemptAt: timestamp
    };
    
    if (wasSuccessful) {
      updates.lastSuccessfulImportAt = timestamp;
    }
    
    await db
      .update(organizationDriveFolders)
      .set(updates)
      .where(eq(organizationDriveFolders.orgId, orgId));
  }
  
  async removeOrganizationDriveFolder(orgId: string): Promise<void> {
    await db
      .delete(organizationDriveFolders)
      .where(eq(organizationDriveFolders.orgId, orgId));
  }
  
  // Streaming Report Import Logs
  async createStreamingReportImportLog(data: { orgId: string; reportPeriod?: string; driveFileId?: string; driveFileName?: string; status: string; errorMessage?: string; reportId?: string }): Promise<any> {
    const [log] = await db
      .insert(streamingReportImportLogs)
      .values(data)
      .returning();
    return log;
  }
  
  async getStreamingReportImportLogs(orgId?: string): Promise<any[]> {
    const query = db
      .select()
      .from(streamingReportImportLogs)
      .orderBy(desc(streamingReportImportLogs.importedAt));
    
    if (orgId) {
      return await query.where(eq(streamingReportImportLogs.orgId, orgId));
    }
    
    return await query;
  }
  
  // Music Videos
  async createMusicVideo(data: InsertMusicVideo): Promise<MusicVideo> {
    const [video] = await db.insert(musicVideos).values(data).returning();
    return video;
  }

  async getMusicVideo(id: string): Promise<(MusicVideo & { artist: Artist; organization: Organization }) | undefined> {
    const [result] = await db
      .select({
        musicVideo: musicVideos,
        artist: artists,
        organization: organizations,
      })
      .from(musicVideos)
      .leftJoin(artists, eq(musicVideos.artistId, artists.id))
      .leftJoin(organizations, eq(musicVideos.orgId, organizations.id))
      .where(eq(musicVideos.id, id));
    
    if (!result) return undefined;
    
    return {
      ...result.musicVideo,
      artist: result.artist!,
      organization: result.organization!,
    };
  }

  async getMusicVideos(orgId: string): Promise<(MusicVideo & { artist: Artist })[]> {
    const videos = await db
      .select({
        musicVideo: musicVideos,
        artist: artists,
      })
      .from(musicVideos)
      .leftJoin(artists, eq(musicVideos.artistId, artists.id))
      .where(eq(musicVideos.orgId, orgId))
      .orderBy(desc(musicVideos.createdAt));

    return videos.map(({ musicVideo, artist }) => ({
      ...musicVideo,
      artist: artist!,
    }));
  }

  async getAllMusicVideos(options?: {
    page?: number;
    limit?: number;
    search?: string;
    status?: string;
    paymentStatus?: string;
  }): Promise<{
    videos: (MusicVideo & { artist: Artist; organization: Organization })[];
    total: number;
    page: number;
    totalPages: number;
  }> {
    const page = options?.page || 1;
    const limit = options?.limit || 50;
    const offset = (page - 1) * limit;
    const search = options?.search?.trim();
    const status = options?.status;
    const paymentStatus = options?.paymentStatus;

    // Build where conditions
    const conditions = [];
    
    if (search) {
      // Search in title, artist name, organization name, UPC, or ISRC (case-insensitive)
      conditions.push(
        or(
          ilike(musicVideos.title, `%${search}%`),
          ilike(artists.name, `%${search}%`),
          ilike(organizations.name, `%${search}%`),
          ilike(musicVideos.upc, `%${search}%`),
          ilike(musicVideos.isrc, `%${search}%`)
        )
      );
    }
    
    if (status && status !== 'all') {
      conditions.push(eq(musicVideos.status, status));
    }
    
    if (paymentStatus && paymentStatus !== 'all') {
      conditions.push(eq(musicVideos.paymentStatus, paymentStatus));
    }

    // Get total count
    const countQuery = await db
      .select({ count: sql<number>`count(*)` })
      .from(musicVideos)
      .leftJoin(artists, eq(musicVideos.artistId, artists.id))
      .leftJoin(organizations, eq(musicVideos.orgId, organizations.id))
      .where(conditions.length > 0 ? and(...conditions) : undefined);
    
    const total = Number(countQuery[0]?.count || 0);
    const totalPages = Math.ceil(total / limit);

    // Get paginated results
    const videos = await db
      .select({
        musicVideo: musicVideos,
        artist: artists,
        organization: organizations,
      })
      .from(musicVideos)
      .leftJoin(artists, eq(musicVideos.artistId, artists.id))
      .leftJoin(organizations, eq(musicVideos.orgId, organizations.id))
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(musicVideos.createdAt))
      .limit(limit)
      .offset(offset);

    return {
      videos: videos.map(({ musicVideo, artist, organization }) => ({
        ...musicVideo,
        artist: artist!,
        organization: organization!,
      })),
      total,
      page,
      totalPages,
    };
  }

  async getUserMusicVideos(userId: string, options?: {
    page?: number;
    limit?: number;
    search?: string;
    status?: string;
    paymentStatus?: string;
  }): Promise<{
    videos: (MusicVideo & { artist: Artist; organization: Organization })[];
    total: number;
    page: number;
    totalPages: number;
  }> {
    const page = options?.page || 1;
    const limit = options?.limit || 50;
    const offset = (page - 1) * limit;
    const search = options?.search?.trim();
    const status = options?.status;
    const paymentStatus = options?.paymentStatus;

    // Get user to check if they're a platform admin
    const user = await this.getUser(userId);
    const isPlatformAdmin = user?.platformRole !== null && user?.platformRole !== undefined;

    // Build where conditions
    const conditions = [];
    
    // Only filter by organization if user is NOT a platform admin
    if (!isPlatformAdmin) {
      const userOrgs = await this.getUserOrganizations(userId);
      const userOrgIds = userOrgs.map(org => org.id);

      if (userOrgIds.length === 0) {
        return {
          videos: [],
          total: 0,
          page: 1,
          totalPages: 0,
        };
      }

      // CRITICAL: Filter by user's organizations only (for regular users)
      conditions.push(inArray(musicVideos.orgId, userOrgIds));
    }
    
    if (search) {
      // Search in title, artist name, organization name, UPC, or ISRC (case-insensitive)
      conditions.push(
        or(
          ilike(musicVideos.title, `%${search}%`),
          ilike(artists.name, `%${search}%`),
          ilike(organizations.name, `%${search}%`),
          ilike(musicVideos.upc, `%${search}%`),
          ilike(musicVideos.isrc, `%${search}%`)
        )
      );
    }
    
    if (status && status !== 'all') {
      conditions.push(eq(musicVideos.status, status));
    }
    
    if (paymentStatus && paymentStatus !== 'all') {
      conditions.push(eq(musicVideos.paymentStatus, paymentStatus));
    }

    // Get total count
    const countQuery = await db
      .select({ count: sql<number>`count(*)` })
      .from(musicVideos)
      .leftJoin(artists, eq(musicVideos.artistId, artists.id))
      .leftJoin(organizations, eq(musicVideos.orgId, organizations.id))
      .where(conditions.length > 0 ? and(...conditions) : undefined);
    
    const total = Number(countQuery[0]?.count || 0);
    const totalPages = Math.ceil(total / limit);

    // Get paginated results
    const videos = await db
      .select({
        musicVideo: musicVideos,
        artist: artists,
        organization: organizations,
      })
      .from(musicVideos)
      .leftJoin(artists, eq(musicVideos.artistId, artists.id))
      .leftJoin(organizations, eq(musicVideos.orgId, organizations.id))
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(musicVideos.createdAt))
      .limit(limit)
      .offset(offset);

    return {
      videos: videos.map(({ musicVideo, artist, organization }) => ({
        ...musicVideo,
        artist: artist!,
        organization: organization!,
      })),
      total,
      page,
      totalPages,
    };
  }

  async updateMusicVideo(id: string, updates: Partial<MusicVideo>): Promise<MusicVideo | undefined> {
    const [video] = await db
      .update(musicVideos)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(musicVideos.id, id))
      .returning();
    return video;
  }

  async deleteMusicVideo(id: string): Promise<void> {
    await db.delete(musicVideos).where(eq(musicVideos.id, id));
  }

  async getAllOrganizations(): Promise<Organization[]> {
    return await db.select().from(organizations).orderBy(asc(organizations.name));
  }

  async getAllOrganizationsWithMemberInfo(): Promise<(Organization & { memberCount: number; hasOrphanedMembers: boolean })[]> {
    // Use a single optimized query with LEFT JOINs to get all data at once
    const allOrgs = await db.select().from(organizations).orderBy(asc(organizations.name));
    
    // Get all member records with user existence check in one query per org
    const orgsWithMemberInfo = await Promise.all(allOrgs.map(async (org) => {
      // Get all org_members records (even those pointing to deleted users)
      const memberRecords = await db
        .select({
          memberId: orgMembers.id,
          userId: orgMembers.userId,
          userExists: users.id,
        })
        .from(orgMembers)
        .leftJoin(users, eq(orgMembers.userId, users.id))
        .where(eq(orgMembers.orgId, org.id));
      
      // Count valid members and detect orphaned records
      const totalRecords = memberRecords.length;
      const validMemberCount = memberRecords.filter(m => m.userExists !== null).length;
      const orphanedCount = totalRecords - validMemberCount;
      
      return {
        ...org,
        memberCount: validMemberCount,
        hasOrphanedMembers: orphanedCount > 0,
      };
    }));
    
    return orgsWithMemberInfo;
  }
  
  async deleteStreamingReportRows(reportId: string): Promise<void> {
    await db
      .delete(streamingReportRows)
      .where(eq(streamingReportRows.reportId, reportId));
  }
  
  async deleteStreamingReport(id: string): Promise<void> {
    await db
      .delete(streamingReports)
      .where(eq(streamingReports.id, id));
  }
  
  async updateStreamingReport(id: string, data: Partial<InsertStreamingReport>): Promise<StreamingReport | undefined> {
    const [updated] = await db
      .update(streamingReports)
      .set(data)
      .where(eq(streamingReports.id, id))
      .returning();
    return updated;
  }
  
  async checkStreamingReportExistsByDriveFileId(driveFileId: string): Promise<boolean> {
    const [result] = await db
      .select({ id: streamingReports.id })
      .from(streamingReports)
      .where(eq(streamingReports.driveFileId, driveFileId))
      .limit(1);
    return !!result;
  }
  
  async checkStreamingReportExistsByPeriod(orgId: string, period: string): Promise<boolean> {
    // Support both formats: MM-YYYY and MM/YYYY
    // Generate both variants regardless of input format
    const periodDash = period.includes('/') ? period.replace('/', '-') : period;
    const periodSlash = period.includes('-') ? period.replace('-', '/') : period;
    
    const [result] = await db
      .select({ id: streamingReports.id })
      .from(streamingReports)
      .where(and(
        eq(streamingReports.orgId, orgId),
        or(
          eq(streamingReports.period, periodDash),
          eq(streamingReports.period, periodSlash)
        )
      ))
      .limit(1);
    return !!result;
  }
  
  // Withdrawals
  async getWithdrawals(orgId: string): Promise<Withdrawal[]> {
    return await db
      .select()
      .from(withdrawals)
      .where(eq(withdrawals.orgId, orgId))
      .orderBy(desc(withdrawals.requestedAt));
  }
  
  async getWithdrawal(id: string): Promise<Withdrawal | undefined> {
    const [result] = await db
      .select()
      .from(withdrawals)
      .where(eq(withdrawals.id, id))
      .limit(1);
    return result;
  }
  
  async createWithdrawal(data: InsertWithdrawal): Promise<Withdrawal> {
    const [withdrawal] = await db
      .insert(withdrawals)
      .values(data)
      .returning();
    return withdrawal;
  }
  
  async updateWithdrawal(id: string, data: Partial<InsertWithdrawal>): Promise<Withdrawal | undefined> {
    const [updated] = await db
      .update(withdrawals)
      .set(data)
      .where(eq(withdrawals.id, id))
      .returning();
    return updated;
  }
  
  // Private helper: calculate balance using provided database context (tx or db)
  // This allows same logic to work in both transactional and non-transactional contexts
  private async calculateAvailableBalance(
    ctx: any, // Transaction or db context
    orgId: string
  ): Promise<{ availableEarnings: number; totalWithdrawn: number; availableBalance: number; totalEarned: number; totalEarnedUah: number }> {
    // Get all withdrawals using provided context
    const allWithdrawals = await ctx
      .select()
      .from(withdrawals)
      .where(eq(withdrawals.orgId, orgId));
    
    // Calculate total withdrawn (approved and completed - these are paid out or being processed)
    // APPROVED = admin confirmed payout, COMPLETED = fully processed
    const completedWithdrawals = allWithdrawals.filter(w => w.status === 'APPROVED' || w.status === 'COMPLETED');
    const totalWithdrawn = completedWithdrawals.reduce((sum, w) => sum + w.amount, 0);
    
    // Calculate total reserved (ONLY pending - reserves available funds until admin decision)
    // APPROVED/COMPLETED withdrawals are counted in totalWithdrawn
    const reservedWithdrawals = allWithdrawals.filter(w => 
      w.status === 'PENDING'
    );
    const totalReserved = reservedWithdrawals.reduce((sum, w) => sum + w.amount, 0);
    
    // Calculate total earned from streaming reports using provided context
    const reports = await ctx
      .select()
      .from(streamingReports)
      .where(eq(streamingReports.orgId, orgId));
      
    let totalEarned = 0;
    let totalEarnedUah = 0;
    
    for (const report of reports) {
      const revenue = parseFloat(report.totalRevenue?.toString() || '0');
      const eurToUahRate = report.eurToUahRate ? parseFloat(report.eurToUahRate.toString()) : 0;
      // Convert revenue to cents (assuming it's in EUR)
      totalEarned += Math.round(revenue * 100);
      // Convert to UAH kopiyky using per-report exchange rate
      if (eurToUahRate > 0) {
        totalEarnedUah += Math.round(revenue * eurToUahRate * 100);
      }
    }
    
    // Calculate available earnings (only reports older than 3 months)
    const now = new Date();
    // Normalize to first day of current month, then subtract 3 months
    const firstOfCurrentMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const threeMonthsAgo = new Date(firstOfCurrentMonth.getFullYear(), firstOfCurrentMonth.getMonth() - 3, 1);
    
    let availableEarnings = 0;
    
    for (const report of reports) {
      // Parse period "MM/YYYY" format
      const [month, year] = report.period.split('/').map((s: string) => parseInt(s, 10));
      const reportDate = new Date(year, month - 1, 1); // month is 0-indexed in Date
      
      // Only count reports strictly older than 3 months (before the cutoff month)
      if (reportDate < threeMonthsAgo) {
        const revenue = parseFloat(report.totalRevenue?.toString() || '0');
        availableEarnings += Math.round(revenue * 100); // Convert to cents
      }
    }
    
    // Calculate available balance:
    // = availableEarnings (3-month hold applied)
    // - totalWithdrawn (already paid out COMPLETED withdrawals)
    // - totalReserved (reserved for PENDING/PROCESSING withdrawals)
    const availableBalance = availableEarnings - totalWithdrawn - totalReserved;
    
    return {
      availableEarnings,
      totalWithdrawn,  // Historical tracking - only completed
      availableBalance,  // Actual available - accounts for all withdrawals
      totalEarned,
      totalEarnedUah,  // UAH equivalent using per-report exchange rates
    };
  }
  
  // Public method for non-transactional callers (finance summaries)
  async getAvailableBalance(orgId: string): Promise<{ availableEarnings: number; totalWithdrawn: number; availableBalance: number; totalEarned: number; totalEarnedUah: number }> {
    return await this.calculateAvailableBalance(db, orgId);
  }
  
  // Calculate legacy balance (revenue from rows WITHOUT allocations, older than 3 months)
  // Subtracts historical legacy withdrawals (PENDING, APPROVED, COMPLETED)
  // FALLBACK: If streamingReportRows is empty, uses streaming_reports.totalRevenue directly
  // This ensures backward compatibility with production data where report_rows may be empty
  async getLegacyBalance(orgId: string): Promise<{ legacyAvailable: number; legacyTotal: number; legacyWithdrawn: number }> {
    const now = new Date();
    const firstOfCurrentMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const threeMonthsAgo = new Date(firstOfCurrentMonth.getFullYear(), firstOfCurrentMonth.getMonth() - 3, 1);
    
    // Helper to parse period (handles both MM/YYYY and MM-YYYY formats)
    const parsePeriod = (period: string): Date | null => {
      if (!period) return null;
      const parts = period.split(/[\/\-]/);
      if (parts.length !== 2) return null;
      const month = parseInt(parts[0], 10);
      const year = parseInt(parts[1], 10);
      if (isNaN(month) || isNaN(year)) return null;
      return new Date(year, month - 1, 1);
    };
    
    // Get all reports for this org (with totalRevenue for fallback)
    const reports = await db
      .select({ 
        id: streamingReports.id, 
        period: streamingReports.period,
        totalRevenue: streamingReports.totalRevenue 
      })
      .from(streamingReports)
      .where(eq(streamingReports.orgId, orgId));
    
    if (reports.length === 0) {
      return { legacyAvailable: 0, legacyTotal: 0, legacyWithdrawn: 0 };
    }
    
    const reportIds = reports.map(r => r.id);
    
    // Check if we have ANY rows in streamingReportRows for this org
    const rowsCount = await db
      .select({ count: sql<number>`count(*)` })
      .from(streamingReportRows)
      .where(inArray(streamingReportRows.reportId, reportIds));
    
    const hasReportRows = (rowsCount[0]?.count || 0) > 0;
    
    let legacyTotal = 0;
    let legacyEarnings = 0;
    
    if (hasReportRows) {
      // NEW LOGIC: Use streamingReportRows when available
      // Get streaming report rows WITHOUT allocations
      const rowsWithoutAllocations = await db
        .select({
          id: streamingReportRows.id,
          netRevenue: streamingReportRows.netRevenue,
          period: streamingReportRows.period,
        })
        .from(streamingReportRows)
        .leftJoin(trackRoyaltyAllocations, eq(streamingReportRows.id, trackRoyaltyAllocations.reportRowId))
        .where(and(
          inArray(streamingReportRows.reportId, reportIds),
          isNull(trackRoyaltyAllocations.id)
        ));
      
      for (const row of rowsWithoutAllocations) {
        const revenue = parseFloat(row.netRevenue?.toString() || '0');
        const revenueCents = Math.round(revenue * 100);
        legacyTotal += revenueCents;
        
        // Check if row is older than 3 months
        const rowDate = parsePeriod(row.period);
        if (rowDate && rowDate < threeMonthsAgo) {
          legacyEarnings += revenueCents;
        }
      }
    } else {
      // FALLBACK: Use streaming_reports.totalRevenue directly
      // This handles production data where report_rows is empty
      for (const report of reports) {
        const revenue = parseFloat(report.totalRevenue?.toString() || '0');
        const revenueCents = Math.round(revenue * 100);
        legacyTotal += revenueCents;
        
        // Check if report is older than 3 months
        const reportDate = parsePeriod(report.period);
        if (reportDate && reportDate < threeMonthsAgo) {
          legacyEarnings += revenueCents;
        }
      }
    }
    
    // Get all legacy withdrawals for this org
    // We must subtract ALL non-rejected withdrawals because:
    // - PENDING = reserved, awaiting admin approval
    // - APPROVED = reserved, awaiting payment
    // - COMPLETED = paid out
    // Only REJECTED withdrawals release the funds back
    const allWithdrawals = await db
      .select({ legacyAmount: withdrawals.legacyAmount, amount: withdrawals.amount, status: withdrawals.status })
      .from(withdrawals)
      .where(eq(withdrawals.orgId, orgId));
    
    // Subtract from all non-rejected withdrawals (reserved + paid)
    // Discriminate between legacy-era and allocation-era withdrawals:
    // - legacyAmount = NULL → old withdrawal (before split system), use full amount
    // - legacyAmount = 0 → allocation-only withdrawal, don't touch legacy balance
    // - legacyAmount > 0 → mixed withdrawal, use legacyAmount portion
    const legacyWithdrawn = allWithdrawals
      .filter(w => w.status !== 'REJECTED')
      .reduce((sum, w) => {
        // NULL = old withdrawal before split tracking, use full amount
        // 0 = allocation-only, contributes nothing to legacy
        // >0 = mixed, use the legacy portion
        const amount = w.legacyAmount === null 
          ? w.amount 
          : w.legacyAmount;
        return sum + amount;
      }, 0);
    
    // Available = earned (3-month hold) - already withdrawn/reserved
    const legacyAvailable = Math.max(0, legacyEarnings - legacyWithdrawn);
    
    return { legacyAvailable, legacyTotal, legacyWithdrawn };
  }
  
  // Transaction-based version of getLegacyBalance for use inside transactions
  // FALLBACK: If streamingReportRows is empty, uses streaming_reports.totalRevenue directly
  // This ensures backward compatibility with production data where report_rows may be empty
  async getLegacyBalanceInTransaction(
    ctx: any, // Transaction or db context
    orgId: string
  ): Promise<{ legacyAvailable: number; legacyTotal: number; legacyWithdrawn: number }> {
    const now = new Date();
    const firstOfCurrentMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const threeMonthsAgo = new Date(firstOfCurrentMonth.getFullYear(), firstOfCurrentMonth.getMonth() - 3, 1);
    
    // Helper to parse period (handles both MM/YYYY and MM-YYYY formats)
    const parsePeriod = (period: string): Date | null => {
      if (!period) return null;
      const parts = period.split(/[\/\-]/);
      if (parts.length !== 2) return null;
      const month = parseInt(parts[0], 10);
      const year = parseInt(parts[1], 10);
      if (isNaN(month) || isNaN(year)) return null;
      return new Date(year, month - 1, 1);
    };
    
    // Get all reports for this org (with totalRevenue for fallback)
    const reports = await ctx
      .select({ 
        id: streamingReports.id, 
        period: streamingReports.period,
        totalRevenue: streamingReports.totalRevenue 
      })
      .from(streamingReports)
      .where(eq(streamingReports.orgId, orgId));
    
    if (reports.length === 0) {
      return { legacyAvailable: 0, legacyTotal: 0, legacyWithdrawn: 0 };
    }
    
    const reportIds = reports.map(r => r.id);
    
    // Check if we have ANY rows in streamingReportRows for this org
    const rowsCount = await ctx
      .select({ count: sql<number>`count(*)` })
      .from(streamingReportRows)
      .where(inArray(streamingReportRows.reportId, reportIds));
    
    const hasReportRows = (rowsCount[0]?.count || 0) > 0;
    
    let legacyTotal = 0;
    let legacyEarnings = 0;
    
    if (hasReportRows) {
      // NEW LOGIC: Use streamingReportRows when available
      // Get streaming report rows WITHOUT allocations
      const rowsWithoutAllocations = await ctx
        .select({
          id: streamingReportRows.id,
          netRevenue: streamingReportRows.netRevenue,
          period: streamingReportRows.period,
        })
        .from(streamingReportRows)
        .leftJoin(trackRoyaltyAllocations, eq(streamingReportRows.id, trackRoyaltyAllocations.reportRowId))
        .where(and(
          inArray(streamingReportRows.reportId, reportIds),
          isNull(trackRoyaltyAllocations.id)
        ));
      
      for (const row of rowsWithoutAllocations) {
        const revenue = parseFloat(row.netRevenue?.toString() || '0');
        const revenueCents = Math.round(revenue * 100);
        legacyTotal += revenueCents;
        
        // Check if row is older than 3 months
        const rowDate = parsePeriod(row.period);
        if (rowDate && rowDate < threeMonthsAgo) {
          legacyEarnings += revenueCents;
        }
      }
    } else {
      // FALLBACK: Use streaming_reports.totalRevenue directly
      // This handles production data where report_rows is empty
      for (const report of reports) {
        const revenue = parseFloat(report.totalRevenue?.toString() || '0');
        const revenueCents = Math.round(revenue * 100);
        legacyTotal += revenueCents;
        
        // Check if report is older than 3 months
        const reportDate = parsePeriod(report.period);
        if (reportDate && reportDate < threeMonthsAgo) {
          legacyEarnings += revenueCents;
        }
      }
    }
    
    // Get all legacy withdrawals for this org
    const allWithdrawals = await ctx
      .select({ legacyAmount: withdrawals.legacyAmount, amount: withdrawals.amount, status: withdrawals.status })
      .from(withdrawals)
      .where(eq(withdrawals.orgId, orgId));
    
    // Subtract from all non-rejected withdrawals (reserved + paid)
    // Discriminate between legacy-era and allocation-era withdrawals:
    // - legacyAmount = NULL → old withdrawal (before split system), use full amount
    // - legacyAmount = 0 → allocation-only withdrawal, don't touch legacy balance
    // - legacyAmount > 0 → mixed withdrawal, use legacyAmount portion
    const legacyWithdrawn = allWithdrawals
      .filter(w => w.status !== 'REJECTED')
      .reduce((sum, w) => {
        // NULL = old withdrawal before split tracking, use full amount
        // 0 = allocation-only, contributes nothing to legacy
        // >0 = mixed, use the legacy portion
        const amount = w.legacyAmount === null 
          ? w.amount 
          : w.legacyAmount;
        return sum + amount;
      }, 0);
    
    // Available = earned (3-month hold) - already withdrawn/reserved
    const legacyAvailable = Math.max(0, legacyEarnings - legacyWithdrawn);
    
    return { legacyAvailable, legacyTotal, legacyWithdrawn };
  }
  
  async getTotalStreams(orgId: string): Promise<number> {
    const reports = await this.getStreamingReports(orgId);
    if (reports.length === 0) return 0;
    
    const reportIds = reports.map(r => r.id);
    
    const result = await db
      .select({
        total: sql<number>`COALESCE(SUM(${streamingReportRows.streams}), 0)`,
      })
      .from(streamingReportRows)
      .where(inArray(streamingReportRows.reportId, reportIds));
    
    return Number(result[0]?.total || 0);
  }
  
  async requestWithdrawal(data: { orgId: string; amount: number; requestedBy: string; recipientName?: string; iban?: string; taxId?: string; bankName?: string }): Promise<Withdrawal> {
    const { orgId, amount, requestedBy, recipientName, iban, taxId, bankName } = data;
    
    return await db.transaction(async (tx) => {
      // Lock organization row to prevent concurrent withdrawals
      const [org] = await tx
        .select()
        .from(organizations)
        .where(eq(organizations.id, orgId))
        .for('update');
      
      if (!org) {
        throw new Error('Organization not found');
      }
      
      // Calculate available balance INSIDE transaction using transaction context
      const balanceBefore = await this.calculateAvailableBalance(tx, orgId);
      
      if (amount > balanceBefore.availableBalance) {
        throw new Error('Insufficient balance');
      }
      
      const [withdrawal] = await tx
        .insert(withdrawals)
        .values({
          orgId,
          amount,
          recipientName,
          iban,
          taxId,
          bankName,
          status: 'PENDING',
          requestedBy,
        })
        .returning();
      
      // Post-insert verification: recheck balance to catch race conditions
      const balanceAfter = await this.calculateAvailableBalance(tx, orgId);
      if (balanceAfter.availableBalance < 0) {
        throw new Error('Insufficient balance - concurrent withdrawal detected');
      }
      
      // Legacy: Keep org.balance updated for backwards compatibility
      const currentBalance = org.balance || 0;
      await tx
        .update(organizations)
        .set({ balance: currentBalance - amount })
        .where(eq(organizations.id, orgId));
      
      return withdrawal;
    });
  }
  
  async createPaymentDetails(data: { orgId: string; recipientName: string; iban: string; taxId?: string; bankName: string; isPrimary: boolean }): Promise<any> {
    if (data.isPrimary) {
      await db
        .update(paymentDetails)
        .set({ isPrimary: false })
        .where(and(eq(paymentDetails.orgId, data.orgId), eq(paymentDetails.isDeleted, false)));
    }
    
    const [details] = await db
      .insert(paymentDetails)
      .values(data)
      .returning();
    return details;
  }
  
  async getPaymentDetails(orgId: string): Promise<any[]> {
    return await db
      .select()
      .from(paymentDetails)
      .where(and(eq(paymentDetails.orgId, orgId), eq(paymentDetails.isDeleted, false)))
      .orderBy(desc(paymentDetails.isPrimary), desc(paymentDetails.createdAt));
  }
  
  async deletePaymentDetails(id: string): Promise<void> {
    await db
      .update(paymentDetails)
      .set({ isDeleted: true })
      .where(eq(paymentDetails.id, id));
  }
  
  async setPrimaryPaymentDetails(orgId: string, id: string): Promise<void> {
    await db.transaction(async (tx) => {
      await tx
        .update(paymentDetails)
        .set({ isPrimary: false })
        .where(and(eq(paymentDetails.orgId, orgId), eq(paymentDetails.isDeleted, false)));
      
      await tx
        .update(paymentDetails)
        .set({ isPrimary: true })
        .where(eq(paymentDetails.id, id));
    });
  }
  
  async getPrimaryPaymentDetail(orgId: string): Promise<any | undefined> {
    const [primary] = await db
      .select()
      .from(paymentDetails)
      .where(and(
        eq(paymentDetails.orgId, orgId),
        eq(paymentDetails.isPrimary, true),
        eq(paymentDetails.isDeleted, false)
      ));
    return primary;
  }
  
  async findOrCreateParticipant(orgId: string, name: string, taxId?: string | null, isOwner: boolean = false): Promise<any> {
    let existing = await db.select()
      .from(royaltyParticipants)
      .where(and(
        eq(royaltyParticipants.orgId, orgId),
        eq(royaltyParticipants.name, name),
        eq(royaltyParticipants.isDeleted, false),
        taxId ? eq(royaltyParticipants.taxId, taxId) : sql`TRUE`
      ))
      .limit(1);
    
    if (existing.length === 0 && taxId) {
      existing = await db.select()
        .from(royaltyParticipants)
        .where(and(
          eq(royaltyParticipants.orgId, orgId),
          eq(royaltyParticipants.name, name),
          eq(royaltyParticipants.isDeleted, false),
          isNull(royaltyParticipants.taxId)
        ))
        .limit(1);
    }
    
    if (existing.length > 0) {
      const found = existing[0];
      const updates: any = {};
      
      if (isOwner && !found.isOwner) {
        updates.isOwner = true;
      }
      if (taxId && !found.taxId) {
        updates.taxId = taxId;
      }
      
      if (Object.keys(updates).length > 0) {
        updates.updatedAt = new Date();
        const [updated] = await db.update(royaltyParticipants)
          .set(updates)
          .where(eq(royaltyParticipants.id, found.id))
          .returning();
        return updated;
      }
      return found;
    }
    
    const [participant] = await db.insert(royaltyParticipants).values({
      orgId,
      name,
      taxId: taxId || null,
      isOwner,
      isDeleted: false
    }).returning();
    return participant;
  }
  
  async getParticipantsByOrg(orgId: string): Promise<any[]> {
    return await db.select()
      .from(royaltyParticipants)
      .where(and(
        eq(royaltyParticipants.orgId, orgId),
        eq(royaltyParticipants.isDeleted, false)
      ))
      .orderBy(desc(royaltyParticipants.isOwner), asc(royaltyParticipants.name));
  }
  
  async getCurrentPaymentDetails(participantId: string): Promise<any | undefined> {
    const [current] = await db.select()
      .from(participantPaymentDetails)
      .where(and(
        eq(participantPaymentDetails.participantId, participantId),
        eq(participantPaymentDetails.isCurrent, true)
      ));
    return current;
  }
  
  async createPaymentDetailVersion(participantId: string, iban: string, bankName: string): Promise<any> {
    return await db.transaction(async (tx) => {
      const [latest] = await tx.select()
        .from(participantPaymentDetails)
        .where(eq(participantPaymentDetails.participantId, participantId))
        .orderBy(desc(participantPaymentDetails.version))
        .limit(1);
      
      await tx.update(participantPaymentDetails)
        .set({ isCurrent: false })
        .where(and(
          eq(participantPaymentDetails.participantId, participantId),
          eq(participantPaymentDetails.isCurrent, true)
        ));
      
      const [newDetails] = await tx.insert(participantPaymentDetails).values({
        participantId,
        iban,
        bankName,
        version: latest ? latest.version + 1 : 1,
        isCurrent: true
      }).returning();
      
      return newDetails;
    });
  }
  
  async updateAvailableAllocationsPaymentDetails(participantId: string, newPaymentDetailId: string, newIban: string, newBankName: string): Promise<number> {
    const result = await db.update(trackRoyaltyAllocations)
      .set({
        paymentDetailId: newPaymentDetailId,
        participantIban: newIban,
        participantBankName: newBankName
      })
      .where(and(
        eq(trackRoyaltyAllocations.participantId, participantId),
        eq(trackRoyaltyAllocations.status, 'AVAILABLE')
      ))
      .returning();
    return result.length;
  }
  
  async createTrackRoyaltyAllocation(data: any): Promise<any> {
    const [allocation] = await db
      .insert(trackRoyaltyAllocations)
      .values(data)
      .returning();
    return allocation;
  }
  
  async getTrackRoyaltyAllocationsByOrg(orgId: string): Promise<any[]> {
    return await db
      .select()
      .from(trackRoyaltyAllocations)
      .where(eq(trackRoyaltyAllocations.orgId, orgId))
      .orderBy(desc(trackRoyaltyAllocations.createdAt));
  }
  
  async getAvailableAllocationsByOrg(orgId: string): Promise<any[]> {
    const results = await db
      .select({
        id: trackRoyaltyAllocations.id,
        orgId: trackRoyaltyAllocations.orgId,
        reportRowId: trackRoyaltyAllocations.reportRowId,
        trackSplitId: trackRoyaltyAllocations.trackSplitId,
        isrc: trackRoyaltyAllocations.isrc,
        participantName: trackRoyaltyAllocations.participantName,
        participantIban: trackRoyaltyAllocations.participantIban,
        participantTaxId: trackRoyaltyAllocations.participantTaxId,
        participantBankName: trackRoyaltyAllocations.participantBankName,
        participantId: trackRoyaltyAllocations.participantId,
        paymentDetailId: trackRoyaltyAllocations.paymentDetailId,
        sharePercent: trackRoyaltyAllocations.sharePercent,
        grossAmount: trackRoyaltyAllocations.grossAmount,
        shareAmount: trackRoyaltyAllocations.shareAmount,
        shareAmountNano: trackRoyaltyAllocations.shareAmountNano,
        currency: trackRoyaltyAllocations.currency,
        reportPeriod: trackRoyaltyAllocations.reportPeriod,
        availableAt: trackRoyaltyAllocations.availableAt,
        status: trackRoyaltyAllocations.status,
        withdrawalId: trackRoyaltyAllocations.withdrawalId,
        createdAt: trackRoyaltyAllocations.createdAt,
        trackTitle: streamingReportRows.trackName,
        releaseTitle: streamingReportRows.album,
        eurToUahRate: streamingReports.eurToUahRate,
      })
      .from(trackRoyaltyAllocations)
      .leftJoin(streamingReportRows, eq(trackRoyaltyAllocations.reportRowId, streamingReportRows.id))
      .leftJoin(streamingReports, eq(streamingReportRows.reportId, streamingReports.id))
      .where(and(
        eq(trackRoyaltyAllocations.orgId, orgId),
        eq(trackRoyaltyAllocations.status, 'AVAILABLE')
      ))
      .orderBy(asc(trackRoyaltyAllocations.availableAt));
    return results;
  }
  
  async getPendingAllocationsReadyForAvailability(): Promise<any[]> {
    return await db
      .select()
      .from(trackRoyaltyAllocations)
      .where(and(
        eq(trackRoyaltyAllocations.status, 'PENDING'),
        lte(trackRoyaltyAllocations.availableAt, new Date())
      ));
  }
  
  async updateAllocationStatus(id: string, status: 'PENDING' | 'AVAILABLE' | 'RESERVED' | 'PAID'): Promise<any | undefined> {
    const [updated] = await db
      .update(trackRoyaltyAllocations)
      .set({ status })
      .where(eq(trackRoyaltyAllocations.id, id))
      .returning();
    return updated;
  }
  
  async reserveAllocationsForWithdrawal(allocationIds: string[], withdrawalId: string): Promise<void> {
    await db
      .update(trackRoyaltyAllocations)
      .set({ status: 'RESERVED', withdrawalId })
      .where(inArray(trackRoyaltyAllocations.id, allocationIds));
  }
  
  // ============================================================================
  // Report Royalty Summaries (Simplified system) Implementation
  // ============================================================================
  
  async getReportRoyaltySummary(orgId: string, reportMonth: string): Promise<any | undefined> {
    const [summary] = await db
      .select()
      .from(reportRoyaltySummaries)
      .where(and(
        eq(reportRoyaltySummaries.orgId, orgId),
        eq(reportRoyaltySummaries.reportMonth, reportMonth)
      ))
      .limit(1);
    return summary;
  }
  
  async createReportRoyaltySummary(data: { orgId: string; reportMonth: string; totalGrossNano: string; ownerNetNano: string; ownerPaidNano: string; trackCount: number }): Promise<any> {
    const [summary] = await db
      .insert(reportRoyaltySummaries)
      .values(data)
      .returning();
    return summary;
  }
  
  async updateReportRoyaltySummary(id: string, updates: { totalGrossNano?: string; ownerNetNano?: string; ownerPaidNano?: string; trackCount?: number }): Promise<any> {
    const [updated] = await db
      .update(reportRoyaltySummaries)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(reportRoyaltySummaries.id, id))
      .returning();
    return updated;
  }
  
  async getReportRoyaltySummariesByOrg(orgId: string): Promise<any[]> {
    return await db
      .select()
      .from(reportRoyaltySummaries)
      .where(eq(reportRoyaltySummaries.orgId, orgId))
      .orderBy(desc(reportRoyaltySummaries.reportMonth));
  }
  
  // ============================================================================
  // Report Split Shares (Simplified system) Implementation
  // ============================================================================
  
  async createReportSplitShare(data: { summaryId: string; participantId: string; paymentDetailId: string; participantName: string; participantIban: string; participantTaxId?: string | null; participantBankName?: string | null; sharePercent: string; amountNano: string; remainingNano: string; status: string }): Promise<any> {
    const [share] = await db
      .insert(reportSplitShares)
      .values(data)
      .returning();
    return share;
  }
  
  async getReportSplitSharesBySummary(summaryId: string): Promise<any[]> {
    return await db
      .select()
      .from(reportSplitShares)
      .where(eq(reportSplitShares.summaryId, summaryId))
      .orderBy(desc(reportSplitShares.createdAt));
  }
  
  async getAvailableReportSplitSharesByOrg(orgId: string): Promise<any[]> {
    // Get all split shares from summaries where report month is 3+ months old
    const threeMonthsAgo = new Date();
    threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
    const cutoffMonth = `${threeMonthsAgo.getFullYear()}-${String(threeMonthsAgo.getMonth() + 1).padStart(2, '0')}`;
    
    return await db
      .select({
        id: reportSplitShares.id,
        summaryId: reportSplitShares.summaryId,
        participantId: reportSplitShares.participantId,
        paymentDetailId: reportSplitShares.paymentDetailId,
        participantName: reportSplitShares.participantName,
        participantIban: reportSplitShares.participantIban,
        participantTaxId: reportSplitShares.participantTaxId,
        participantBankName: reportSplitShares.participantBankName,
        sharePercent: reportSplitShares.sharePercent,
        amountNano: reportSplitShares.amountNano,
        remainingNano: reportSplitShares.remainingNano,
        status: reportSplitShares.status,
        reportMonth: reportRoyaltySummaries.reportMonth,
      })
      .from(reportSplitShares)
      .innerJoin(reportRoyaltySummaries, eq(reportSplitShares.summaryId, reportRoyaltySummaries.id))
      .where(and(
        eq(reportRoyaltySummaries.orgId, orgId),
        lte(reportRoyaltySummaries.reportMonth, cutoffMonth),
        ne(reportSplitShares.status, 'PAID')
      ))
      .orderBy(asc(reportRoyaltySummaries.reportMonth));
  }
  
  async updateReportSplitShareRemaining(id: string, remainingNano: string, status?: string): Promise<any> {
    const updates: any = { remainingNano, updatedAt: new Date() };
    if (status) updates.status = status;
    
    const [updated] = await db
      .update(reportSplitShares)
      .set(updates)
      .where(eq(reportSplitShares.id, id))
      .returning();
    return updated;
  }
  
  // ============================================================================
  // Withdrawal Report Applications (Simplified system) Implementation
  // ============================================================================
  
  async createWithdrawalReportApplication(data: { withdrawalId: string; splitShareId: string; appliedNano: string }): Promise<any> {
    const [application] = await db
      .insert(withdrawalReportApplications)
      .values(data)
      .returning();
    return application;
  }
  
  async getWithdrawalReportApplications(withdrawalId: string): Promise<any[]> {
    return await db
      .select()
      .from(withdrawalReportApplications)
      .where(eq(withdrawalReportApplications.withdrawalId, withdrawalId))
      .orderBy(desc(withdrawalReportApplications.createdAt));
  }
  
  async createRoyaltySplitTemplate(data: { orgId: string; name: string; splits: any[] }): Promise<any> {
    const [template] = await db
      .insert(royaltySplitTemplates)
      .values(data)
      .returning();
    return template;
  }
  
  async getRoyaltySplitTemplates(orgId: string): Promise<any[]> {
    return await db
      .select()
      .from(royaltySplitTemplates)
      .where(and(eq(royaltySplitTemplates.orgId, orgId), eq(royaltySplitTemplates.isDeleted, false)))
      .orderBy(desc(royaltySplitTemplates.createdAt));
  }
  
  async getRoyaltySplitTemplateById(id: string): Promise<any | undefined> {
    const [template] = await db
      .select()
      .from(royaltySplitTemplates)
      .where(and(eq(royaltySplitTemplates.id, id), eq(royaltySplitTemplates.isDeleted, false)))
      .limit(1);
    return template;
  }
  
  async deleteRoyaltySplitTemplate(id: string): Promise<void> {
    await db
      .update(royaltySplitTemplates)
      .set({ isDeleted: true })
      .where(eq(royaltySplitTemplates.id, id));
  }
  
  // Track Splits implementation
  async createTrackSplit(data: { trackId: string; releaseId: string; orgId: string; splits: any[]; createdBy: string }): Promise<any> {
    // First deactivate any existing active splits for this track
    await db
      .update(trackSplits)
      .set({ isActive: false, updatedAt: new Date() })
      .where(and(eq(trackSplits.trackId, data.trackId), eq(trackSplits.isActive, true)));
    
    // Create new split configuration
    const [split] = await db
      .insert(trackSplits)
      .values({
        trackId: data.trackId,
        releaseId: data.releaseId,
        orgId: data.orgId,
        splits: data.splits,
        createdBy: data.createdBy,
        effectiveDate: new Date(),
      })
      .returning();
    return split;
  }
  
  async getTrackSplit(trackId: string): Promise<any | undefined> {
    const [split] = await db
      .select()
      .from(trackSplits)
      .where(and(eq(trackSplits.trackId, trackId), eq(trackSplits.isActive, true)));
    return split;
  }
  
  async getTrackSplitsByRelease(releaseId: string): Promise<any[]> {
    return await db
      .select()
      .from(trackSplits)
      .where(and(eq(trackSplits.releaseId, releaseId), eq(trackSplits.isActive, true)))
      .orderBy(desc(trackSplits.createdAt));
  }
  
  async getTrackSplitsByOrg(orgId: string): Promise<any[]> {
    const results = await db
      .select({
        id: trackSplits.id,
        trackId: trackSplits.trackId,
        releaseId: trackSplits.releaseId,
        orgId: trackSplits.orgId,
        splits: trackSplits.splits,
        effectiveDate: trackSplits.effectiveDate,
        isActive: trackSplits.isActive,
        createdBy: trackSplits.createdBy,
        createdAt: trackSplits.createdAt,
        updatedAt: trackSplits.updatedAt,
        isrc: tracks.isrc,
      })
      .from(trackSplits)
      .leftJoin(tracks, eq(trackSplits.trackId, tracks.id))
      .where(and(eq(trackSplits.orgId, orgId), eq(trackSplits.isActive, true)))
      .orderBy(desc(trackSplits.createdAt));
    return results;
  }
  
  async updateTrackSplit(id: string, data: { splits: any[] }): Promise<any | undefined> {
    const [updated] = await db
      .update(trackSplits)
      .set({ splits: data.splits, updatedAt: new Date() })
      .where(eq(trackSplits.id, id))
      .returning();
    return updated;
  }
  
  async deleteTrackSplit(id: string): Promise<void> {
    await db
      .update(trackSplits)
      .set({ isActive: false, updatedAt: new Date() })
      .where(eq(trackSplits.id, id));
  }
  
  async createWithdrawalWithSplits(data: { 
    orgId: string; 
    amount: number; 
    legacyAmount?: number;
    allocationAmount?: number;
    allocationAmountNano?: string; // Precise nano amount
    allocationOverageCents?: number;
    allocationOverageNano?: string; // Precise nano overage
    allocationIds?: string[];
    requestedBy: string;
    recipientName?: string;
    iban?: string;
    taxId?: string;
    bankName?: string;
    splits: Array<{ 
      recipientName: string; 
      iban: string; 
      taxId?: string; 
      bankName: string; 
      percentage: string; 
      calculatedAmount: number;
      reservedAllocationCents?: number;
      reservedAllocationNano?: string; // Precise nano
      splitOverageCents?: number;
      splitOverageNano?: string; // Precise nano
    }> 
  }): Promise<{ withdrawal: Withdrawal; splits: any[] }> {
    return await db.transaction(async (tx) => {
      // Lock organization row to prevent concurrent withdrawals
      const [org] = await tx
        .select()
        .from(organizations)
        .where(eq(organizations.id, data.orgId))
        .for('update');
      
      if (!org) {
        throw new Error('Organization not found');
      }
      
      // If we have allocation IDs, lock and verify them first
      let lockedAllocationsSum = 0;
      if (data.allocationIds && data.allocationIds.length > 0) {
        // Lock allocation rows with FOR UPDATE to prevent concurrent reservation
        const lockedAllocations = await tx
          .select()
          .from(trackRoyaltyAllocations)
          .where(inArray(trackRoyaltyAllocations.id, data.allocationIds))
          .for('update');
        
        // Verify all allocations are still AVAILABLE (not already reserved)
        const unavailable = lockedAllocations.filter(a => a.status !== 'AVAILABLE');
        if (unavailable.length > 0) {
          throw new Error('Some allocations are no longer available - they may have been reserved by another request');
        }
        
        // Verify we found all requested allocations
        if (lockedAllocations.length !== data.allocationIds.length) {
          throw new Error('Some allocations could not be found');
        }
        
        // Calculate total value of locked allocations using nano precision when available
        // For legacy allocations without nano, fall back to shareAmount (EUR) * 100
        // This hybrid approach preserves precision for new data while supporting legacy data
        let totalNano = BigInt(0);
        let legacyCents = 0;
        
        for (const a of lockedAllocations) {
          if (a.shareAmountNano) {
            // New allocation with nano precision - accumulate in nano
            totalNano += BigInt(a.shareAmountNano);
          } else {
            // Legacy allocation without nano - use shareAmount (EUR) converted to cents
            legacyCents += Math.round(Number(a.shareAmount) * 100);
          }
        }
        
        // Convert nano to cents (100000000 nano = 1 cent) and add legacy cents
        lockedAllocationsSum = Number(totalNano / BigInt(100000000)) + legacyCents;
      }
      
      // For allocation-based withdrawals, check against legacy + allocation balance
      // Legacy balance handles the case where user might also want to withdraw from legacy earnings
      const legacyBalance = await this.getLegacyBalanceInTransaction(tx, data.orgId);
      const availableForWithdrawal = legacyBalance.legacyAvailable + lockedAllocationsSum;
      
      if (data.amount > availableForWithdrawal) {
        throw new Error('Insufficient balance');
      }
      
      const [withdrawal] = await tx
        .insert(withdrawals)
        .values({
          orgId: data.orgId,
          amount: data.amount,
          legacyAmount: data.legacyAmount || 0,
          allocationAmount: data.allocationAmount || 0,
          allocationAmountNano: data.allocationAmountNano || null,
          allocationOverageCents: data.allocationOverageCents || 0,
          allocationOverageNano: data.allocationOverageNano || null,
          recipientName: data.recipientName,
          iban: data.iban,
          taxId: data.taxId,
          bankName: data.bankName,
          status: 'PENDING',
          requestedBy: data.requestedBy,
        })
        .returning();
      
      const splitsData = data.splits.map(split => ({
        withdrawalId: withdrawal.id,
        recipientName: split.recipientName,
        iban: split.iban,
        taxId: split.taxId,
        bankName: split.bankName,
        percentage: split.percentage,
        calculatedAmount: split.calculatedAmount,
        reservedAllocationCents: split.reservedAllocationCents || 0,
        reservedAllocationNano: split.reservedAllocationNano || null,
        splitOverageCents: split.splitOverageCents || 0,
        splitOverageNano: split.splitOverageNano || null,
      }));
      
      let insertedSplits: any[] = [];
      if (splitsData.length > 0) {
        insertedSplits = await tx
          .insert(withdrawalSplits)
          .values(splitsData)
          .returning();
      }
      
      // Reserve allocations INSIDE the transaction
      if (data.allocationIds && data.allocationIds.length > 0) {
        await tx
          .update(trackRoyaltyAllocations)
          .set({ 
            status: 'RESERVED',
            withdrawalId: withdrawal.id,
          })
          .where(inArray(trackRoyaltyAllocations.id, data.allocationIds));
      }
      
      // Post-insert verification: recheck legacy balance to catch race conditions
      // Note: Allocations are already reserved at this point, so we only check legacy balance
      const legacyBalanceAfter = await this.getLegacyBalanceInTransaction(tx, data.orgId);
      if (legacyBalanceAfter.legacyAvailable < 0) {
        throw new Error('Insufficient balance - concurrent withdrawal detected');
      }
      
      // Legacy: Keep org.balance updated for backwards compatibility
      // 
      // OPTION C ACCOUNTING:
      // - amount = user-requested amount (what they asked for)
      // - allocationAmount = actual cents reserved from allocations (may exceed due to atomic allocations)
      // - allocationOverageCents = surplus (allocationAmount minus what was needed from allocations)
      // - Balance deduction = amount (user request only)
      // 
      // The overage cents remain in RESERVED allocations:
      // - On REJECTION: allocations return to AVAILABLE, overage is released automatically
      // - On APPROVAL: admin pays 'amount', overage allocations stay RESERVED for next withdrawal
      const currentBalance = org.balance || 0;
      
      await tx
        .update(organizations)
        .set({ balance: currentBalance - data.amount })
        .where(eq(organizations.id, data.orgId));
      
      return { withdrawal, splits: insertedSplits };
    });
  }
  
  async getWithdrawalSplits(withdrawalId: string): Promise<any[]> {
    return await db
      .select()
      .from(withdrawalSplits)
      .where(eq(withdrawalSplits.withdrawalId, withdrawalId));
  }
  
  async getAllWithdrawalsWithSplits(): Promise<any[]> {
    const usersAlias = aliasedTable(users, 'processor');
    
    const allWithdrawals = await db
      .select({
        withdrawal: withdrawals,
        organization: organizations,
        requester: users,
        processor: usersAlias,
      })
      .from(withdrawals)
      .leftJoin(organizations, eq(withdrawals.orgId, organizations.id))
      .leftJoin(users, eq(withdrawals.requestedBy, users.id))
      .leftJoin(usersAlias, eq(withdrawals.processedBy, usersAlias.id))
      .orderBy(desc(withdrawals.requestedAt));
    
    const result = await Promise.all(
      allWithdrawals.map(async (item) => {
        const splits = await this.getWithdrawalSplits(item.withdrawal.id);
        return {
          ...item.withdrawal,
          organization: item.organization,
          requester: item.requester ? {
            id: item.requester.id,
            firstName: item.requester.firstName,
            lastName: item.requester.lastName,
            email: item.requester.email,
          } : null,
          processor: item.processor ? {
            id: item.processor.id,
            firstName: item.processor.firstName,
            lastName: item.processor.lastName,
            email: item.processor.email,
          } : null,
          splits,
        };
      })
    );
    
    return result;
  }
  
  // Social Follower Snapshots
  async getSocialFollowerSnapshots(orgId: string, platform?: string, daysAgo?: number): Promise<any[]> {
    const conditions: any[] = [eq(socialFollowerSnapshots.orgId, orgId)];
    
    if (platform) {
      conditions.push(eq(socialFollowerSnapshots.platform, platform as any));
    }
    
    if (daysAgo) {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - daysAgo);
      conditions.push(gte(socialFollowerSnapshots.collectedAt, cutoffDate));
    }
    
    return await db
      .select()
      .from(socialFollowerSnapshots)
      .where(and(...conditions))
      .orderBy(desc(socialFollowerSnapshots.collectedAt));
  }

  // Admin stats - count releases by status and payment status
  async getReleasesCountByStatus(): Promise<{
    total: number;
    byStatus: Record<string, number>;
    byPaymentStatus: Record<string, number>;
  }> {
    // Get total count
    const totalResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(releases);
    
    const total = Number(totalResult[0]?.count || 0);
    
    // Count by status
    const statusCounts = await db
      .select({
        status: releases.status,
        count: sql<number>`count(*)`,
      })
      .from(releases)
      .groupBy(releases.status);
    
    // Count by payment status
    const paymentStatusCounts = await db
      .select({
        paymentStatus: releases.paymentStatus,
        count: sql<number>`count(*)`,
      })
      .from(releases)
      .groupBy(releases.paymentStatus);
    
    const byStatus: Record<string, number> = {};
    statusCounts.forEach(row => {
      if (row.status) {
        byStatus[row.status] = Number(row.count);
      }
    });
    
    const byPaymentStatus: Record<string, number> = {
      PAID: 0,
      UNPAID: 0,
    };
    
    paymentStatusCounts.forEach(row => {
      const count = Number(row.count);
      if (row.paymentStatus === 'PAID') {
        byPaymentStatus.PAID = count;
      } else {
        byPaymentStatus.UNPAID += count;
      }
    });
    
    return {
      total,
      byStatus,
      byPaymentStatus,
    };
  }

  // Admin stats - count music videos by status and payment status
  async getMusicVideosCountByStatus(): Promise<{
    total: number;
    byStatus: Record<string, number>;
    byPaymentStatus: Record<string, number>;
  }> {
    // Get total count
    const totalResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(musicVideos);
    
    const total = Number(totalResult[0]?.count || 0);
    
    // Count by status
    const statusCounts = await db
      .select({
        status: musicVideos.status,
        count: sql<number>`count(*)`,
      })
      .from(musicVideos)
      .groupBy(musicVideos.status);
    
    // Count by payment status
    const paymentStatusCounts = await db
      .select({
        paymentStatus: musicVideos.paymentStatus,
        count: sql<number>`count(*)`,
      })
      .from(musicVideos)
      .groupBy(musicVideos.paymentStatus);
    
    const byStatus: Record<string, number> = {};
    statusCounts.forEach(row => {
      if (row.status) {
        byStatus[row.status] = Number(row.count);
      }
    });
    
    const byPaymentStatus: Record<string, number> = {
      PAID: 0,
      UNPAID: 0,
    };
    
    paymentStatusCounts.forEach(row => {
      const count = Number(row.count);
      if (row.paymentStatus === 'PAID') {
        byPaymentStatus.PAID = count;
      } else {
        byPaymentStatus.UNPAID += count;
      }
    });
    
    return {
      total,
      byStatus,
      byPaymentStatus,
    };
  }

  // Label-Artist Links
  async createLabelArtistLink(data: InsertLabelArtistLink): Promise<LabelArtistLink> {
    const [link] = await db
      .insert(labelArtistLinks)
      .values(data)
      .returning();
    return link;
  }

  async getLabelArtistLink(id: string): Promise<LabelArtistLink | undefined> {
    const [link] = await db
      .select()
      .from(labelArtistLinks)
      .where(eq(labelArtistLinks.id, id));
    return link;
  }

  async getLabelArtistLinks(): Promise<(LabelArtistLink & { labelOrg: Organization; artistOrg: Organization })[]> {
    const results = await db
      .select({
        link: labelArtistLinks,
        labelOrg: organizations,
      })
      .from(labelArtistLinks)
      .leftJoin(organizations, eq(labelArtistLinks.labelOrgId, organizations.id))
      .orderBy(desc(labelArtistLinks.createdAt));

    // Need to get artist organizations in a second query due to double join limitation
    const artistOrgIds = results.map(r => r.link.artistOrgId);
    const artistOrgs = artistOrgIds.length > 0 
      ? await db.select().from(organizations).where(inArray(organizations.id, artistOrgIds))
      : [];
    
    const artistOrgMap = new Map(artistOrgs.map(org => [org.id, org]));

    return results.map(({ link, labelOrg }) => ({
      ...link,
      labelOrg: labelOrg!,
      artistOrg: artistOrgMap.get(link.artistOrgId)!,
    }));
  }

  async getLabelArtistLinksByLabel(labelOrgId: string): Promise<(LabelArtistLink & { artistOrg: Organization })[]> {
    const results = await db
      .select({
        link: labelArtistLinks,
        artistOrg: organizations,
      })
      .from(labelArtistLinks)
      .leftJoin(organizations, eq(labelArtistLinks.artistOrgId, organizations.id))
      .where(eq(labelArtistLinks.labelOrgId, labelOrgId))
      .orderBy(desc(labelArtistLinks.createdAt));

    return results.map(({ link, artistOrg }) => ({
      ...link,
      artistOrg: artistOrg!,
    }));
  }

  async getLabelArtistLinksByArtist(artistOrgId: string): Promise<(LabelArtistLink & { labelOrg: Organization })[]> {
    const results = await db
      .select({
        link: labelArtistLinks,
        labelOrg: organizations,
      })
      .from(labelArtistLinks)
      .leftJoin(organizations, eq(labelArtistLinks.labelOrgId, organizations.id))
      .where(eq(labelArtistLinks.artistOrgId, artistOrgId))
      .orderBy(desc(labelArtistLinks.createdAt));

    return results.map(({ link, labelOrg }) => ({
      ...link,
      labelOrg: labelOrg!,
    }));
  }

  async updateLabelArtistLink(id: string, updates: Partial<InsertLabelArtistLink>): Promise<LabelArtistLink | undefined> {
    const [updated] = await db
      .update(labelArtistLinks)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(labelArtistLinks.id, id))
      .returning();
    return updated;
  }

  async deleteLabelArtistLink(id: string): Promise<void> {
    await db.delete(labelArtistLinks).where(eq(labelArtistLinks.id, id));
  }

  // Release Drafts
  async createReleaseDraft(data: InsertReleaseDraft): Promise<ReleaseDraft> {
    const [draft] = await db
      .insert(releaseDrafts)
      .values(data)
      .returning();
    return draft;
  }

  async getReleaseDraft(id: string): Promise<ReleaseDraft | undefined> {
    const [draft] = await db
      .select()
      .from(releaseDrafts)
      .where(and(eq(releaseDrafts.id, id), eq(releaseDrafts.isArchived, false)));
    return draft;
  }

  async getReleaseDraftsByOrg(orgId: string, type?: "RELEASE" | "VIDEO"): Promise<ReleaseDraft[]> {
    const conditions = [eq(releaseDrafts.orgId, orgId), eq(releaseDrafts.isArchived, false)];
    if (type) {
      conditions.push(eq(releaseDrafts.type, type));
    }
    return db
      .select()
      .from(releaseDrafts)
      .where(and(...conditions))
      .orderBy(desc(releaseDrafts.updatedAt));
  }

  async getReleaseDraftsByUser(userId: string, type?: "RELEASE" | "VIDEO"): Promise<ReleaseDraft[]> {
    const conditions = [eq(releaseDrafts.createdByUserId, userId), eq(releaseDrafts.isArchived, false)];
    if (type) {
      conditions.push(eq(releaseDrafts.type, type));
    }
    return db
      .select()
      .from(releaseDrafts)
      .where(and(...conditions))
      .orderBy(desc(releaseDrafts.updatedAt));
  }

  async updateReleaseDraft(
    id: string, 
    updates: Partial<InsertReleaseDraft>, 
    expectedVersion: number
  ): Promise<{ draft?: ReleaseDraft; conflict?: boolean; currentDraft?: ReleaseDraft }> {
    const [current] = await db
      .select()
      .from(releaseDrafts)
      .where(eq(releaseDrafts.id, id));
    
    if (!current) {
      return { draft: undefined };
    }

    if (current.version !== expectedVersion) {
      return { conflict: true, currentDraft: current };
    }

    const [updated] = await db
      .update(releaseDrafts)
      .set({ 
        ...updates, 
        version: current.version + 1,
        updatedAt: new Date() 
      })
      .where(eq(releaseDrafts.id, id))
      .returning();
    return { draft: updated };
  }

  async archiveReleaseDraft(id: string): Promise<void> {
    await db
      .update(releaseDrafts)
      .set({ isArchived: true, updatedAt: new Date() })
      .where(eq(releaseDrafts.id, id));
  }

  async deleteReleaseDraft(id: string): Promise<void> {
    await db.delete(releaseDrafts).where(eq(releaseDrafts.id, id));
  }

  async cleanupOldDrafts(daysOld: number = 90): Promise<number> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysOld);
    
    const deleted = await db
      .delete(releaseDrafts)
      .where(and(
        eq(releaseDrafts.isArchived, true),
        sql`${releaseDrafts.updatedAt} < ${cutoffDate}`
      ))
      .returning();
    return deleted.length;
  }

  async getAllReleaseDrafts(type?: "RELEASE" | "VIDEO"): Promise<ReleaseDraft[]> {
    const conditions = [eq(releaseDrafts.isArchived, false)];
    if (type) {
      conditions.push(eq(releaseDrafts.type, type));
    }
    return db
      .select()
      .from(releaseDrafts)
      .where(and(...conditions))
      .orderBy(desc(releaseDrafts.updatedAt));
  }

  // Support Messages
  async createSupportMessage(data: InsertSupportMessage): Promise<SupportMessage> {
    const [message] = await db.insert(supportMessages).values(data).returning();
    return message;
  }

  async getSupportMessagesByUser(userId: string): Promise<SupportMessage[]> {
    return db
      .select()
      .from(supportMessages)
      .where(eq(supportMessages.userId, userId))
      .orderBy(asc(supportMessages.createdAt));
  }

  async getAllSupportConversations(): Promise<{
    userId: string;
    user: User;
    lastMessage: SupportMessage;
    unreadCount: number;
  }[]> {
    const allMessages = await db
      .select()
      .from(supportMessages)
      .orderBy(desc(supportMessages.createdAt));

    const conversationsMap = new Map<string, { lastMessage: SupportMessage; unreadCount: number }>();
    
    for (const msg of allMessages) {
      if (!conversationsMap.has(msg.userId)) {
        const unreadMessages = allMessages.filter(
          m => m.userId === msg.userId && m.senderType === 'USER' && !m.isRead
        );
        conversationsMap.set(msg.userId, {
          lastMessage: msg,
          unreadCount: unreadMessages.length,
        });
      }
    }

    const result: { userId: string; user: User; lastMessage: SupportMessage; unreadCount: number }[] = [];
    
    for (const [userId, data] of conversationsMap) {
      const user = await this.getUser(userId);
      if (user) {
        result.push({
          userId,
          user,
          ...data,
        });
      }
    }

    return result.sort((a, b) => 
      new Date(b.lastMessage.createdAt!).getTime() - new Date(a.lastMessage.createdAt!).getTime()
    );
  }

  async markSupportMessagesAsRead(userId: string, senderType: 'USER' | 'ADMIN'): Promise<void> {
    await db
      .update(supportMessages)
      .set({ isRead: true })
      .where(and(
        eq(supportMessages.userId, userId),
        eq(supportMessages.senderType, senderType)
      ));
  }

  async getUnreadSupportMessagesCount(userId: string): Promise<number> {
    const messages = await db
      .select()
      .from(supportMessages)
      .where(and(
        eq(supportMessages.userId, userId),
        eq(supportMessages.senderType, 'ADMIN'),
        eq(supportMessages.isRead, false)
      ));
    return messages.length;
  }

  async getAdminUnreadSupportMessagesCount(): Promise<number> {
    const messages = await db
      .select()
      .from(supportMessages)
      .where(and(
        eq(supportMessages.senderType, 'USER'),
        eq(supportMessages.isRead, false)
      ));
    return messages.length;
  }

  // Import Checkpoint methods
  async createImportCheckpoint(data: { createdBy: string; description?: string }): Promise<ImportCheckpoint> {
    // Get the last report ID and count at this moment
    const [lastReport] = await db
      .select({ id: streamingReports.id })
      .from(streamingReports)
      .orderBy(desc(streamingReports.createdAt))
      .limit(1);
    
    const [countResult] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(streamingReports);
    
    const [checkpoint] = await db
      .insert(importCheckpoints)
      .values({
        lastReportId: lastReport?.id || null,
        lastReportCount: countResult?.count || 0,
        description: data.description || 'Before manual import',
        createdBy: data.createdBy,
        status: 'ACTIVE',
      })
      .returning();
    
    return checkpoint;
  }

  async getImportCheckpoints(): Promise<(ImportCheckpoint & { creatorEmail?: string })[]> {
    const checkpoints = await db
      .select({
        id: importCheckpoints.id,
        createdAt: importCheckpoints.createdAt,
        lastReportId: importCheckpoints.lastReportId,
        lastReportCount: importCheckpoints.lastReportCount,
        description: importCheckpoints.description,
        createdBy: importCheckpoints.createdBy,
        status: importCheckpoints.status,
        rolledBackAt: importCheckpoints.rolledBackAt,
        rolledBackBy: importCheckpoints.rolledBackBy,
        creatorEmail: users.email,
      })
      .from(importCheckpoints)
      .leftJoin(users, eq(importCheckpoints.createdBy, users.id))
      .orderBy(desc(importCheckpoints.createdAt));
    
    return checkpoints;
  }

  async getImportCheckpointById(id: string): Promise<ImportCheckpoint | undefined> {
    const [checkpoint] = await db
      .select()
      .from(importCheckpoints)
      .where(eq(importCheckpoints.id, id));
    
    return checkpoint;
  }

  async getReportsCreatedAfterCheckpoint(checkpointId: string): Promise<{ id: string; orgId: string; reportPeriod: string }[]> {
    const checkpoint = await this.getImportCheckpointById(checkpointId);
    if (!checkpoint) return [];

    // If no lastReportId, all reports are "after" the checkpoint (database was empty)
    if (!checkpoint.lastReportId) {
      const result = await db.execute(sql`
        SELECT id, org_id as "orgId", report_period as "reportPeriod"
        FROM streaming_reports
        ORDER BY created_at ASC
      `);
      return (result.rows || []) as { id: string; orgId: string; reportPeriod: string }[];
    }

    // Get the checkpoint report's createdAt using raw SQL
    const checkpointReportResult = await db.execute(sql`
      SELECT created_at as "createdAt"
      FROM streaming_reports
      WHERE id = ${checkpoint.lastReportId}
    `);
    
    const checkpointReport = checkpointReportResult.rows?.[0] as { createdAt: Date } | undefined;
    if (!checkpointReport) return [];

    // Get all reports created after that timestamp using raw SQL
    // Include tie-breaker for reports with same timestamp but higher ID
    const reportsResult = await db.execute(sql`
      SELECT id, org_id as "orgId", report_period as "reportPeriod"
      FROM streaming_reports
      WHERE created_at > ${checkpointReport.createdAt}
         OR (created_at = ${checkpointReport.createdAt} AND id > ${checkpoint.lastReportId})
      ORDER BY created_at ASC, id ASC
    `);
    
    return (reportsResult.rows || []) as { id: string; orgId: string; reportPeriod: string }[];
  }

  async checkRollbackSafety(checkpointId: string): Promise<{ safe: boolean; reason?: string; affectedReports: number }> {
    const reportsToDelete = await this.getReportsCreatedAfterCheckpoint(checkpointId);
    
    if (reportsToDelete.length === 0) {
      return { safe: true, affectedReports: 0 };
    }

    const reportIds = reportsToDelete.map(r => r.id);

    // Check for RESERVED or PAID allocations on these reports using raw SQL to avoid inArray issues
    const allocationsResult = await db.execute(sql`
      SELECT COUNT(*)::int as count
      FROM track_royalty_allocations tra
      INNER JOIN streaming_report_rows srr ON tra.report_row_id = srr.id
      WHERE srr.report_id = ANY(ARRAY[${sql.join(reportIds.map(id => sql`${id}`), sql`, `)}]::text[])
      AND tra.status IN ('RESERVED', 'PAID')
    `);

    const allocationsCount = Number((allocationsResult.rows[0] as any)?.count ?? 0);
    if (allocationsCount > 0) {
      return { 
        safe: false, 
        reason: `Знайдено ${allocationsCount} алокацій зі статусом RESERVED або PAID. Відкат неможливий.`,
        affectedReports: reportsToDelete.length
      };
    }

    // Check for withdrawals linked to these reports via reportRoyaltySummaries
    const summariesResult = await db.execute(sql`
      SELECT COUNT(*)::int as count
      FROM withdrawal_report_applications wra
      INNER JOIN report_split_shares rss ON wra.split_share_id = rss.id
      INNER JOIN report_royalty_summaries rrs ON rss.summary_id = rrs.id
      WHERE rrs.report_id = ANY(ARRAY[${sql.join(reportIds.map(id => sql`${id}`), sql`, `)}]::text[])
    `);

    const summariesCount = Number((summariesResult.rows[0] as any)?.count ?? 0);
    if (summariesCount > 0) {
      return { 
        safe: false, 
        reason: `Знайдено ${summariesCount} виплат, пов'язаних з цими звітами. Відкат неможливий.`,
        affectedReports: reportsToDelete.length
      };
    }

    return { safe: true, affectedReports: reportsToDelete.length };
  }

  async executeRollback(checkpointId: string, executedBy: string): Promise<{ success: boolean; deletedReports: number; error?: string }> {
    const safetyCheck = await this.checkRollbackSafety(checkpointId);
    
    if (!safetyCheck.safe) {
      return { success: false, deletedReports: 0, error: safetyCheck.reason };
    }

    const reportsToDelete = await this.getReportsCreatedAfterCheckpoint(checkpointId);
    
    if (reportsToDelete.length === 0) {
      return { success: true, deletedReports: 0 };
    }

    const reportIds = reportsToDelete.map(r => r.id);

    // Execute deletion in transaction
    await db.transaction(async (tx) => {
      // 1. Delete withdrawalReportApplications linked to these reports
      await tx.execute(sql`
        DELETE FROM withdrawal_report_applications
        WHERE split_share_id IN (
          SELECT rss.id FROM report_split_shares rss
          INNER JOIN report_royalty_summaries rrs ON rss.summary_id = rrs.id
          WHERE rrs.report_id = ANY(${reportIds})
        )
      `);

      // 2. Delete reportSplitShares for these reports
      await tx.execute(sql`
        DELETE FROM report_split_shares
        WHERE summary_id IN (
          SELECT id FROM report_royalty_summaries
          WHERE report_id = ANY(${reportIds})
        )
      `);

      // 3. Delete reportRoyaltySummaries for these reports
      await tx
        .delete(reportRoyaltySummaries)
        .where(inArray(reportRoyaltySummaries.reportId, reportIds));

      // 4. Delete trackRoyaltyAllocations for these reports
      await tx.execute(sql`
        DELETE FROM track_royalty_allocations
        WHERE report_row_id IN (
          SELECT id FROM streaming_report_rows
          WHERE report_id = ANY(${reportIds})
        )
      `);

      // 5. Delete streamingReportRows for these reports
      await tx
        .delete(streamingReportRows)
        .where(inArray(streamingReportRows.reportId, reportIds));

      // 6. Delete streamingReports
      await tx
        .delete(streamingReports)
        .where(inArray(streamingReports.id, reportIds));

      // 7. Delete import logs for these reports
      await tx
        .delete(streamingReportImportLogs)
        .where(inArray(streamingReportImportLogs.reportId, reportIds));

      // 8. Mark checkpoint as rolled back
      await tx
        .update(importCheckpoints)
        .set({
          status: 'ROLLED_BACK',
          rolledBackAt: new Date(),
          rolledBackBy: executedBy,
        })
        .where(eq(importCheckpoints.id, checkpointId));
    });

    return { success: true, deletedReports: reportIds.length };
  }

  // Release Status Events
  async createReleaseStatusEvent(data: InsertReleaseStatusEvent): Promise<ReleaseStatusEvent> {
    const [event] = await db
      .insert(releaseStatusEvents)
      .values(data)
      .returning();
    return event;
  }

  async getReleaseStatusHistory(releaseId: string): Promise<ReleaseStatusEvent[]> {
    return db
      .select()
      .from(releaseStatusEvents)
      .where(eq(releaseStatusEvents.releaseId, releaseId))
      .orderBy(asc(releaseStatusEvents.transitionedAt));
  }

  // Academy Courses
  async getAcademyCourses(filters?: { status?: string; category?: string; type?: string }): Promise<AcademyCourse[]> {
    const conditions = [];
    if (filters?.status) conditions.push(eq(academyCourses.status, filters.status as any));
    if (filters?.category) conditions.push(eq(academyCourses.category, filters.category as any));
    if (filters?.type) conditions.push(eq(academyCourses.type, filters.type as any));
    
    const query = db.select().from(academyCourses);
    if (conditions.length > 0) {
      return query.where(and(...conditions)).orderBy(desc(academyCourses.createdAt));
    }
    return query.orderBy(desc(academyCourses.createdAt));
  }

  async getAcademyCourse(id: string): Promise<AcademyCourse | undefined> {
    const [course] = await db.select().from(academyCourses).where(eq(academyCourses.id, id));
    return course;
  }

  async getAcademyCourseBySlug(slug: string): Promise<AcademyCourse | undefined> {
    const [course] = await db.select().from(academyCourses).where(eq(academyCourses.slug, slug));
    return course;
  }

  async createAcademyCourse(data: InsertAcademyCourse): Promise<AcademyCourse> {
    const [course] = await db.insert(academyCourses).values(data).returning();
    return course;
  }

  async updateAcademyCourse(id: string, updates: Partial<AcademyCourse>): Promise<AcademyCourse | undefined> {
    const [course] = await db.update(academyCourses).set({ ...updates, updatedAt: new Date() }).where(eq(academyCourses.id, id)).returning();
    return course;
  }

  async deleteAcademyCourse(id: string): Promise<void> {
    await db.delete(academyCourses).where(eq(academyCourses.id, id));
  }

  // Academy Purchases
  async getAcademyPurchase(userId: string, courseId: string): Promise<AcademyPurchase | undefined> {
    const [purchase] = await db.select().from(academyPurchases)
      .where(and(eq(academyPurchases.userId, userId), eq(academyPurchases.courseId, courseId), eq(academyPurchases.status, 'PAID')));
    return purchase;
  }

  async getAcademyPurchaseByOrderRef(orderReference: string): Promise<AcademyPurchase | undefined> {
    const [purchase] = await db.select().from(academyPurchases)
      .where(eq(academyPurchases.orderReference, orderReference));
    return purchase;
  }

  async createAcademyPurchase(data: InsertAcademyPurchase): Promise<AcademyPurchase> {
    const [purchase] = await db.insert(academyPurchases).values(data).returning();
    return purchase;
  }

  async updateAcademyPurchase(id: string, updates: Partial<AcademyPurchase>): Promise<AcademyPurchase | undefined> {
    const [purchase] = await db.update(academyPurchases).set(updates).where(eq(academyPurchases.id, id)).returning();
    return purchase;
  }

  async getUserAcademyPurchases(userId: string): Promise<AcademyPurchase[]> {
    return db.select().from(academyPurchases)
      .where(and(eq(academyPurchases.userId, userId), eq(academyPurchases.status, 'PAID')))
      .orderBy(desc(academyPurchases.createdAt));
  }
}

export const storage = new DatabaseStorage();
