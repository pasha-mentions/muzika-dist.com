import { sql, relations } from 'drizzle-orm';
import {
  pgTable,
  varchar,
  text,
  timestamp,
  boolean,
  integer,
  decimal,
  jsonb,
  pgEnum,
  index,
  uniqueIndex,
  serial,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Enums
export const roleEnum = pgEnum("role", ["ARTIST", "LABEL", "TEAM", "ADMIN"]);
export const platformRoleEnum = pgEnum("platform_role", ["PLATFORM_OWNER", "PLATFORM_ADMIN", "PLATFORM_FINANCIER"]);
export const orgMemberRoleEnum = pgEnum("org_member_role", ["OWNER", "ADMIN", "MEMBER"]);
export const releaseTypeEnum = pgEnum("release_type", ["SINGLE", "EP", "ALBUM"]);
export const releaseStatusEnum = pgEnum("release_status", [
  "DRAFT", "ACTIVE", "IN_REVIEW", "APPROVED", "DELIVERING", "DELIVERED", "DELETED", "TAKEDOWN", "REJECTED"
]);
export const trackStatusEnum = pgEnum("track_status", ["DRAFT", "READY", "DELIVERED"]);
export const qcIssueSeverityEnum = pgEnum("qc_issue_severity", ["INFO", "WARN", "ERROR"]);
export const reportSourceEnum = pgEnum("report_source", [
  "SPOTIFY", "APPLE", "YT_MUSIC", "DEEZER", "TIKTOK", "IG", "SHORTS", "OTHER"
]);
export const paymentStatusEnum = pgEnum("payment_status", ["PENDING", "PROCESSING", "PAID", "FAILED"]);
export const pitchingStatusEnum = pgEnum("pitching_status", ["PENDING", "SUBMITTED"]);
export const socialPlatformEnum = pgEnum("social_platform", ["SPOTIFY", "YOUTUBE", "INSTAGRAM", "TIKTOK"]);
export const withdrawalStatusEnum = pgEnum("withdrawal_status", ["PENDING", "APPROVED", "COMPLETED", "REJECTED"]);
export const taxDeductionTypeEnum = pgEnum("tax_deduction_type", ["fop_7", "agent_23", "both"]);
export const labelArtistLinkStatusEnum = pgEnum("label_artist_link_status", ["ACTIVE", "INACTIVE"]);
export const allocationStatusEnum = pgEnum("allocation_status", ["PENDING", "AVAILABLE", "RESERVED", "PAID"]);
export const financeEntryTypeEnum = pgEnum("finance_entry_type", ["EXPENSE", "REVENUE"]);
export const expenseCategoryEnum = pgEnum("expense_category", [
  "TECHNICAL_MAINTENANCE",
  "PAYROLL", 
  "CONTRACTORS",
  "MARKETING",
  "DISTRIBUTION",
  "YOUTUBE_ADS",
  "META_ADS",
  "PLAYLIST",
  "OTHER"
]);
export const newsAudienceEnum = pgEnum("news_audience", ["ALL", "ARTIST", "CURATOR"]);

// Session storage table (required for Replit Auth)
export const sessions = pgTable(
  "sessions",
  {
    sid: varchar("sid").primaryKey(),
    sess: jsonb("sess").notNull(),
    expire: timestamp("expire").notNull(),
  },
  (table) => [index("IDX_session_expire").on(table.expire)],
);

// User Activity tracking for DAU and session duration analytics
export const userActivity = pgTable(
  "user_activity",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    userId: varchar("user_id").notNull(),
    date: varchar("date").notNull(), // YYYY-MM-DD format
    sessionStart: timestamp("session_start").notNull(),
    lastActivity: timestamp("last_activity").notNull(),
    requestCount: integer("request_count").default(1),
  },
  (table) => [
    index("IDX_user_activity_date").on(table.date),
    index("IDX_user_activity_user").on(table.userId),
    uniqueIndex("IDX_user_activity_user_date").on(table.userId, table.date),
  ],
);

// User storage table (required for Replit Auth and Google OAuth)
export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  email: varchar("email").unique(),
  passwordHash: varchar("password_hash"),
  firstName: varchar("first_name"),
  lastName: varchar("last_name"),
  profileImageUrl: varchar("profile_image_url"),
  profileImageFileId: varchar("profile_image_file_id"), // Google Drive file ID
  profileImageOriginalName: varchar("profile_image_original_name"),
  googleId: varchar("google_id").unique(),
  role: roleEnum("role").default("ARTIST"),
  platformRole: platformRoleEnum("platform_role"),
  country: varchar("country"),
  preferredLanguage: varchar("preferred_language"),
  address: varchar("address"),
  city: varchar("city"),
  postalCode: varchar("postal_code"),
  agreementAccepted: boolean("agreement_accepted").default(false),
  agreementAcceptedAt: timestamp("agreement_accepted_at"),
  hasSeenOnboarding: boolean("has_seen_onboarding").default(false),
  lastActiveAt: timestamp("last_active_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Password Reset Tokens
export const passwordResetTokens = pgTable("password_reset_tokens", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  token: varchar("token").notNull().unique(),
  expiresAt: timestamp("expires_at").notNull(),
  used: boolean("used").default(false),
  createdAt: timestamp("created_at").defaultNow(),
});

// Allowed Emails - Whitelist for user registration
export const allowedEmails = pgTable("allowed_emails", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  email: varchar("email").notNull().unique(),
  role: roleEnum("role").default("ARTIST"),
  addedBy: varchar("added_by"), // Admin user ID who added this email
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Organizations (Labels or Artist-Orgs)
export const organizations = pgTable("organizations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: varchar("name").notNull(),
  type: varchar("type").notNull(), // "ARTIST_ORG" | "LABEL"
  status: varchar("status").default("STANDARD"), // "STANDARD" | "AMBASSADOR" | "TEST" | "MILITARY" | "DISCOUNT_50"
  balance: integer("balance").default(0), // cents
  stripeCustomerId: varchar("stripe_customer_id"),
  stripeSubscriptionId: varchar("stripe_subscription_id"),
  planType: varchar("plan_type").default("FREE"), // FREE, PRO
  monthlyReleaseLimit: integer("monthly_release_limit").default(2),
  myMusicUrl: varchar("my_music_url"),
  spotifyUrl: varchar("spotify_url"),
  appleMusicUrl: varchar("apple_music_url"),
  youtubeUrl: varchar("youtube_url"),
  tiktokUrl: varchar("tiktok_url"),
  instagramUrl: varchar("instagram_url"),
  isFrozen: boolean("is_frozen").default(false),
  freeReleases: boolean("free_releases").default(false),
  telegramChatId: varchar("telegram_chat_id"), // Telegram group/chat ID for notifications
  curatorBio: text("curator_bio"), // Bio text for curator profile page
  curatorCoverImageUrl: varchar("curator_cover_image_url"), // Cover image for curator profile
  curatorSlug: varchar("curator_slug").unique(), // URL-friendly slug for curator profile /c/slug
  curatorBannerUrl: varchar("curator_banner_url"), // Banner image for curator landing page
  curatorAboutMe: text("curator_about_me"), // Extended "About Me" text for curator
  curatorGenres: text("curator_genres"), // JSON array of music genres
  curatorLanguages: text("curator_languages"), // JSON array of accepted track languages
  curatorVideoUrl: varchar("curator_video_url"), // Welcome video URL (YouTube/TikTok)
  curatorAchievements: text("curator_achievements"), // JSON array of achievements/badges
  curatorFaqItems: text("curator_faq_items"), // JSON array of FAQ items [{question, answer}]
  curatorNotifyEmail: boolean("curator_notify_email").default(true), // Email notifications for curators
  curatorNotifyNewApplications: boolean("curator_notify_new_applications").default(true), // Notify about new applications
  curatorNotifyStatusUpdates: boolean("curator_notify_status_updates").default(true), // Notify about status changes
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Telegram Verification Codes for linking organizations to Telegram chats
export const telegramVerificationCodes = pgTable("telegram_verification_codes", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  orgId: varchar("org_id").notNull(),
  code: varchar("code").notNull().unique(),
  expiresAt: timestamp("expires_at").notNull(),
  used: boolean("used").default(false),
  createdAt: timestamp("created_at").defaultNow(),
});

// Organization Members
export const orgMembers = pgTable("org_members", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  orgId: varchar("org_id").notNull(),
  userId: varchar("user_id").notNull(),
  role: orgMemberRoleEnum("role").notNull().default("MEMBER"), // OWNER, ADMIN, MEMBER
  createdAt: timestamp("created_at").defaultNow(),
});

// Artists
export const artists = pgTable("artists", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  orgId: varchar("org_id").notNull(),
  name: varchar("name").notNull(),
  upcPrefix: varchar("upc_prefix"), // for UPC/ISRC generation
  createdAt: timestamp("created_at").defaultNow(),
});

// Releases
export const releases = pgTable("releases", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  orgId: varchar("org_id").notNull(),
  artistId: varchar("artist_id").notNull(),
  type: releaseTypeEnum("type").notNull(),
  title: varchar("title").notNull(),
  upc: varchar("upc"),
  upcRequested: boolean("upc_requested").default(false),
  primaryGenre: varchar("primary_genre"),
  secondaryGenre: varchar("secondary_genre"),
  language: varchar("language"),
  albumVersion: varchar("album_version"),
  originalReleaseDate: timestamp("original_release_date"),
  releaseDate: timestamp("release_date"),
  releaseTime: varchar("release_time"), // HH:MM format
  subLabel: varchar("sub_label"),
  status: releaseStatusEnum("status").default("DRAFT"),
  territories: text("territories").array(), // ISO country codes
  rightsOwner: varchar("rights_owner"),
  artworkUrl: varchar("artwork_url"),
  artworkFileId: varchar("artwork_file_id"), // Google Drive file ID
  artworkOriginalName: varchar("artwork_original_name"),
  artworkSize: integer("artwork_size"), // bytes
  // Legacy animated artwork fields (kept for backwards compatibility)
  animatedArtworkFileId: varchar("animated_artwork_file_id"),
  animatedArtworkFileName: varchar("animated_artwork_file_name"),
  animatedArtworkSize: integer("animated_artwork_size"),
  // Apple Music Animated Artwork - 3x4 Album Page Motion (2048x2732px, .mp4/.mov)
  animatedArtwork3x4FileId: varchar("animated_artwork_3x4_file_id"),
  animatedArtwork3x4FileName: varchar("animated_artwork_3x4_file_name"),
  animatedArtwork3x4Size: integer("animated_artwork_3x4_size"), // bytes
  // Apple Music Animated Artwork - 1x1 Square (3840x3840px, .mp4/.mov)
  animatedArtwork1x1FileId: varchar("animated_artwork_1x1_file_id"),
  animatedArtwork1x1FileName: varchar("animated_artwork_1x1_file_name"),
  animatedArtwork1x1Size: integer("animated_artwork_1x1_size"), // bytes
  animatedArtworkFeeApplied: integer("animated_artwork_fee_applied"), // fee in UAH cents (25000 = 250 UAH, 10000 = 100 UAH, 0 = free)
  labelName: varchar("label_name"),
  pCopyright: varchar("p_copyright"),
  performers: jsonb("performers"), // array of {name: string, role: string}
  multilink: varchar("multilink"),
  isDebut: boolean("is_debut"), // true if this is artist's first release on platform (nullable for backwards compatibility)
  spotifyArtistUrl: varchar("spotify_artist_url"), // Spotify artist profile URL (for non-debut releases)
  appleMusicArtistUrl: varchar("apple_music_artist_url"), // Apple Music artist profile URL (for non-debut releases)
  paymentStatus: paymentStatusEnum("payment_status").default("PENDING"),
  paymentAmount: integer("payment_amount"), // amount in UAH cents (100000 = 1000 UAH)
  paymentOrderReference: varchar("payment_order_reference"),
  paidAt: timestamp("paid_at"),
  codesAssignedAt: timestamp("codes_assigned_at"), // When UPC/ISRC codes were first assigned by admin
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Music Videos
export const musicVideos = pgTable("music_videos", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  orgId: varchar("org_id").notNull(),
  artistId: varchar("artist_id").notNull(),
  releaseId: varchar("release_id"), // Optional - if video is linked to existing release
  title: varchar("title").notNull(),
  isrc: varchar("isrc"),
  isrcRequested: boolean("isrc_requested").default(false),
  upc: varchar("upc"),
  upcRequested: boolean("upc_requested").default(false),
  primaryGenre: varchar("primary_genre"),
  secondaryGenre: varchar("secondary_genre"),
  language: varchar("language"),
  metadataLanguage: varchar("metadata_language"),
  firstReleaseDate: timestamp("first_release_date"), // Original release date
  releaseDate: timestamp("release_date"), // Publication date
  releaseTime: varchar("release_time"), // HH:MM format - publication time
  status: releaseStatusEnum("status").default("DRAFT"),
  territories: text("territories").array(), // ISO country codes
  platforms: text("platforms").array(), // Spotify, Apple Music Video, Tidal
  explicit: boolean("explicit").default(false),
  aiGenerated: boolean("ai_generated").default(false),
  videoFileId: varchar("video_file_id"), // Google Drive file ID for video
  videoUrl: varchar("video_url"),
  videoOriginalName: varchar("video_original_name"),
  videoSize: integer("video_size"), // bytes (can be up to 5GB)
  videoFormat: varchar("video_format"), // MP4, MOV
  videoCodec: varchar("video_codec"), // H.264, QuickTime, ProRes
  videoResolution: varchar("video_resolution"), // 4K, Full HD, HD, SD PAL, SD NTSC
  duration: integer("duration"), // seconds
  artworkFileId: varchar("artwork_file_id"), // Google Drive file ID for thumbnail
  artworkUrl: varchar("artwork_url"),
  artworkOriginalName: varchar("artwork_original_name"),
  artworkSize: integer("artwork_size"), // bytes
  performers: jsonb("performers"), // array of {name: string, role: string}
  credits: jsonb("credits"), // director, producer, etc
  pCopyright: varchar("p_copyright"),
  cCopyright: varchar("c_copyright"),
  labelName: varchar("label_name"),
  rightsOwner: varchar("rights_owner"),
  paymentStatus: paymentStatusEnum("payment_status").default("PENDING"),
  paymentAmount: integer("payment_amount"), // amount in UAH cents
  paymentOrderReference: varchar("payment_order_reference"),
  paidAt: timestamp("paid_at"),
  previewStart: varchar("preview_start"), // Format: HH:MM:SS
  thumbnailTime: varchar("thumbnail_time"), // Format: HH:MM:SS
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Tracks
export const tracks = pgTable("tracks", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  releaseId: varchar("release_id").notNull(),
  title: varchar("title").notNull(),
  isrc: varchar("isrc"),
  isrcRequested: boolean("isrc_requested").default(false),
  trackIndex: integer("track_index").notNull(),
  explicit: boolean("explicit").default(false),
  aiGenerated: boolean("ai_generated").default(false),
  primaryGenre: varchar("primary_genre"),
  secondaryGenre: varchar("secondary_genre"),
  audioUrl: varchar("audio_url"),
  audioFileId: varchar("audio_file_id"), // Google Drive file ID
  audioOriginalName: varchar("audio_original_name"),
  audioSize: integer("audio_size"), // bytes
  lyrics: text("lyrics"),
  version: varchar("version"), // "Original", "Radio Edit", "Instrumental"
  duration: integer("duration"), // seconds
  tiktokClipStart: integer("tiktok_clip_start"), // seconds - TikTok clip start time
  tiktokPreviewDate: timestamp("tiktok_preview_date"), // Date for TikTok preview before release
  participants: jsonb("participants"), // authors/composers/publishers/roles
  status: trackStatusEnum("status").default("DRAFT"),
  createdAt: timestamp("created_at").defaultNow(),
});

// Split Shares
export const splitShares = pgTable("split_shares", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  releaseId: varchar("release_id"),
  trackId: varchar("track_id"),
  userId: varchar("user_id"), // if exists in system
  email: varchar("email").notNull(), // if not registered yet
  percent: decimal("percent", { precision: 5, scale: 2 }).notNull(),
  role: varchar("role"), // "artist"|"producer"|...
  createdAt: timestamp("created_at").defaultNow(),
});

// QC Items
export const qcItems = pgTable("qc_items", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  releaseId: varchar("release_id").notNull(),
  trackId: varchar("track_id"),
  severity: qcIssueSeverityEnum("severity").notNull(),
  message: text("message").notNull(),
  resolved: boolean("resolved").default(false),
  createdAt: timestamp("created_at").defaultNow(),
});

// Delivery Jobs
export const deliveryJobs = pgTable("delivery_jobs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  releaseId: varchar("release_id").notNull(),
  target: varchar("target").notNull(), // "SPOTIFY"|"APPLE"|...
  status: varchar("status").default("PENDING"), // "PENDING"|"SENT"|"FAILED"
  payload: jsonb("payload"),
  response: jsonb("response"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Report Rows
export const reportRows = pgTable("report_rows", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  orgId: varchar("org_id").notNull(),
  period: varchar("period").notNull(), // "2025-01"
  source: reportSourceEnum("source").notNull(),
  territory: varchar("territory").notNull(),
  upc: varchar("upc"),
  isrc: varchar("isrc"),
  units: integer("units").default(0),
  revenueCents: integer("revenue_cents").default(0),
  createdAt: timestamp("created_at").defaultNow(),
});

// Streaming Reports (uploaded by admin for artists)
export const streamingReports = pgTable("streaming_reports", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  orgId: varchar("org_id").notNull(),
  uploadedBy: varchar("uploaded_by").notNull(), // Admin user ID
  period: varchar("period").notNull(), // "04/2025" format from Excel
  fileUrl: varchar("file_url"), // Google Drive URL
  fileName: varchar("file_name"),
  totalStreams: integer("total_streams").default(0),
  totalRevenue: decimal("total_revenue", { precision: 20, scale: 10 }).default("0"),
  currency: varchar("currency").default("EUR"),
  taxDeductionType: taxDeductionTypeEnum("tax_deduction_type"), // null (no tax), "fop_7" (7% FOP), "agent_23" (23% agent), "both" (7% then 23%)
  driveFileId: varchar("drive_file_id"), // Google Drive file ID (for auto-imported reports)
  source: varchar("source").default("MANUAL_UPLOAD"), // "MANUAL_UPLOAD" | "GOOGLE_DRIVE"
  eurToUahRate: decimal("eur_to_uah_rate", { precision: 10, scale: 4 }), // Wayforpay EUR sell rate at the time of report upload
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  uniqueIndex("streaming_reports_drive_file_id_unique_idx").on(table.driveFileId).where(sql`${table.driveFileId} IS NOT NULL`),
]);

export const streamingReportRows = pgTable("streaming_report_rows", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  reportId: varchar("report_id").notNull(),
  partner: varchar("partner").notNull(), // YouTube, Apple Music, Deezer, TikTok, etc.
  service: varchar("service").notNull(), // Streaming, Video Streaming, Premium Streaming, etc.
  album: varchar("album"),
  type: varchar("type"), // "track"
  artist: varchar("artist").notNull(),
  trackName: varchar("track_name").notNull(),
  isrc: varchar("isrc"), // ISRC code for track linking (nullable for backwards compatibility)
  upc: varchar("upc"), // UPC code for release linking (nullable for backwards compatibility)
  streams: integer("streams").default(0),
  pricePerUnit: decimal("price_per_unit", { precision: 20, scale: 18 }).default("0"),
  netRevenue: decimal("net_revenue", { precision: 20, scale: 10 }).default("0"),
  currency: varchar("currency").default("EUR"),
  period: varchar("period").notNull(),
  country: varchar("country"),
  createdAt: timestamp("created_at").defaultNow(),
});

// Organization Drive Folders (mapping organizations to Google Drive folders for auto-import)
export const organizationDriveFolders = pgTable("organization_drive_folders", {
  orgId: varchar("org_id").primaryKey().notNull(), // One folder per organization
  driveFolderId: varchar("drive_folder_id").notNull(), // Google Drive folder ID
  driveFolderName: varchar("drive_folder_name").notNull(), // Folder name for reference
  linkedBy: varchar("linked_by").notNull(), // Admin user ID who created the mapping
  taxDeductionType: taxDeductionTypeEnum("tax_deduction_type"), // null (no tax), "fop_7" (7% FOP), "agent_23" (23% agent), "both" (7% then 23%)
  linkedAt: timestamp("linked_at").defaultNow(),
  lastSyncedAt: timestamp("last_synced_at"), // Last time we checked for new reports
  lastImportAttemptAt: timestamp("last_import_attempt_at"), // Last import attempt (success or failure)
  lastSuccessfulImportAt: timestamp("last_successful_import_at"), // Last successful import
});

// Streaming Report Import Logs (audit trail for auto-imported reports)
export const streamingReportImportLogs = pgTable("streaming_report_import_logs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  orgId: varchar("org_id").notNull(),
  reportPeriod: varchar("report_period"), // "09-2025" from filename
  driveFileId: varchar("drive_file_id"), // Google Drive file ID
  driveFileName: varchar("drive_file_name"), // Original filename
  status: varchar("status").notNull(), // "SUCCESS" | "ERROR" | "SKIPPED" | "DUPLICATE"
  errorMessage: text("error_message"), // Error details if failed
  reportId: varchar("report_id"), // Created streaming_report ID (if successful)
  importedAt: timestamp("imported_at").defaultNow(),
});

// Social Media Follower Snapshots (for tracking follower growth over time)
export const socialFollowerSnapshots = pgTable(
  "social_follower_snapshots",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    orgId: varchar("org_id").notNull(),
    platform: socialPlatformEnum("platform").notNull(),
    followerCount: integer("follower_count").notNull(),
    platformAccountId: varchar("platform_account_id"), // Spotify Artist ID, YouTube Channel ID, etc.
    collectedAt: timestamp("collected_at").defaultNow(),
  },
  (table) => [
    index("IDX_social_snapshots_org_platform_date").on(
      table.orgId,
      table.platform,
      table.collectedAt
    ),
  ]
);

// Payment Details (Saved bank account details for organizations)
export const paymentDetails = pgTable("payment_details", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  orgId: varchar("org_id").notNull(),
  recipientName: varchar("recipient_name").notNull(),
  iban: varchar("iban").notNull(), // Stored encrypted
  taxId: varchar("tax_id"), // РНОКПП - 10 digits
  bankName: varchar("bank_name").notNull(),
  isPrimary: boolean("is_primary").default(false),
  isDeleted: boolean("is_deleted").default(false), // Soft delete
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Royalty Split Templates (Saved split patterns for quick reuse)
export const royaltySplitTemplates = pgTable("royalty_split_templates", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  orgId: varchar("org_id").notNull(),
  name: varchar("name").notNull(), // User-friendly name, e.g., "Producer Split 50/50"
  splits: jsonb("splits").notNull(), // Array of {name, iban, taxId, bankName, percentage}
  isDeleted: boolean("is_deleted").default(false), // Soft delete
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Track Splits (Split configurations for individual tracks)
export const trackSplits = pgTable("track_splits", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  trackId: varchar("track_id").notNull(),
  releaseId: varchar("release_id").notNull(),
  orgId: varchar("org_id").notNull(),
  splits: jsonb("splits").notNull(), // Array of {name, iban, taxId, bankName, percentage}
  effectiveDate: timestamp("effective_date").defaultNow(), // Date from which splits apply
  isActive: boolean("is_active").default(true),
  createdBy: varchar("created_by").notNull(), // User ID who created
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("IDX_track_splits_track").on(table.trackId),
  index("IDX_track_splits_release").on(table.releaseId),
  index("IDX_track_splits_org").on(table.orgId),
]);

// Royalty Participants (Unique participants in splits, org-scoped)
export const royaltyParticipants = pgTable("royalty_participants", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  orgId: varchar("org_id").notNull(),
  name: varchar("name").notNull(),
  taxId: varchar("tax_id"), // РНОКПП - 10 digits
  isOwner: boolean("is_owner").default(false), // True if this is the org owner
  isDeleted: boolean("is_deleted").default(false), // Soft delete
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("IDX_royalty_participants_org").on(table.orgId),
  index("IDX_royalty_participants_name").on(table.name),
]);

// Participant Payment Details (Versioned payment details for participants)
export const participantPaymentDetails = pgTable("participant_payment_details", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  participantId: varchar("participant_id").notNull(), // Reference to royalty_participants.id
  iban: varchar("iban").notNull(),
  bankName: varchar("bank_name").notNull(),
  version: integer("version").default(1), // Incrementing version number
  isCurrent: boolean("is_current").default(true), // Only one current per participant
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("IDX_payment_details_participant").on(table.participantId),
  index("IDX_payment_details_current").on(table.isCurrent),
]);

// Track Royalty Allocations (links streaming report earnings to split participants)
export const trackRoyaltyAllocations = pgTable("track_royalty_allocations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  orgId: varchar("org_id").notNull(),
  reportRowId: varchar("report_row_id").notNull(), // Reference to streaming_report_rows.id
  trackSplitId: varchar("track_split_id"), // Reference to track_splits.id (null if no split configured)
  isrc: varchar("isrc"), // ISRC code from report for linking
  participantName: varchar("participant_name").notNull(), // Snapshot of participant name (legacy)
  participantIban: varchar("participant_iban").notNull(), // Snapshot of participant IBAN (legacy)
  participantTaxId: varchar("participant_tax_id"), // Snapshot of participant tax ID (legacy)
  participantBankName: varchar("participant_bank_name"), // Snapshot of participant bank name (legacy)
  participantId: varchar("participant_id"), // NEW: Reference to royalty_participants.id (nullable for backward compat)
  paymentDetailId: varchar("payment_detail_id"), // NEW: Reference to participant_payment_details.id (nullable for backward compat)
  sharePercent: decimal("share_percent", { precision: 5, scale: 2 }).notNull(), // Percentage (e.g., 50.00)
  grossAmount: decimal("gross_amount", { precision: 20, scale: 10 }).notNull(), // Full track earnings (EUR)
  shareAmount: decimal("share_amount", { precision: 20, scale: 10 }).notNull(), // Participant's share (EUR)
  shareAmountNano: text("share_amount_nano"), // Participant's share in nano-units (EUR * 10^10) as bigint string for precision
  shareAmountCents: integer("share_amount_cents"), // Participant's share in cents (floored, for legacy compatibility)
  currency: varchar("currency").default("EUR"),
  reportPeriod: varchar("report_period").notNull(), // Period from report (e.g., "04/2025")
  availableAt: timestamp("available_at").notNull(), // Date when funds become available (report period + 3 months)
  status: allocationStatusEnum("status").default("PENDING"), // PENDING -> AVAILABLE -> RESERVED -> PAID
  withdrawalId: varchar("withdrawal_id"), // Reference to withdrawal when reserved/paid
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("IDX_allocations_org").on(table.orgId),
  index("IDX_allocations_isrc").on(table.isrc),
  index("IDX_allocations_status").on(table.status),
  index("IDX_allocations_available").on(table.availableAt),
  index("IDX_allocations_report_row").on(table.reportRowId),
  index("IDX_allocations_participant").on(table.participantId),
]);

// Withdrawals (Financial transactions for withdrawing earnings)
export const withdrawals = pgTable("withdrawals", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  orgId: varchar("org_id").notNull(),
  amount: integer("amount").notNull(), // User-requested amount in cents (what they asked for)
  legacyAmount: integer("legacy_amount").default(0), // Amount from legacy balance (pre-split earnings) in cents
  allocationAmount: integer("allocation_amount").default(0), // Amount from track allocations in cents (floored for display)
  allocationAmountNano: text("allocation_amount_nano"), // Precise allocation amount in nano-units (EUR * 10^10)
  allocationOverageCents: integer("allocation_overage_cents").default(0), // Overage from atomic allocation selection (locked for future use)
  allocationOverageNano: text("allocation_overage_nano"), // Precise overage in nano-units (EUR * 10^10)
  currency: varchar("currency").default("EUR"), // Currency for future-proofing
  recipientName: varchar("recipient_name"), // Historical snapshot for main recipient
  iban: varchar("iban"), // Historical snapshot for main recipient
  taxId: varchar("tax_id"), // Historical snapshot for main recipient - РНОКПП
  bankName: varchar("bank_name"), // Historical snapshot for main recipient
  status: withdrawalStatusEnum("status").default("PENDING"),
  requestedBy: varchar("requested_by").notNull(), // User ID who requested withdrawal
  processedBy: varchar("processed_by"), // Admin ID who processed
  notes: text("notes"), // Admin notes or rejection reason
  requestedAt: timestamp("requested_at").defaultNow(),
  processedAt: timestamp("processed_at"),
});

// Withdrawal Splits (Royalty splits for each withdrawal)
export const withdrawalSplits = pgTable("withdrawal_splits", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  withdrawalId: varchar("withdrawal_id").notNull(),
  recipientName: varchar("recipient_name").notNull(),
  iban: varchar("iban").notNull(), // Stored encrypted, historical snapshot
  taxId: varchar("tax_id"), // РНОКПП - 10 digits, historical snapshot
  bankName: varchar("bank_name").notNull(),
  percentage: decimal("percentage", { precision: 5, scale: 2 }).notNull(), // e.g., 25.50 for 25.5%
  calculatedAmount: integer("calculated_amount").notNull(), // User-requested amount in cents for this split
  reservedAllocationCents: integer("reserved_allocation_cents").default(0), // Actual allocation cents reserved for this split (floored for display)
  reservedAllocationNano: text("reserved_allocation_nano"), // Precise reserved allocation in nano-units (EUR * 10^10)
  splitOverageCents: integer("split_overage_cents").default(0), // Overage for this split (locked for future use)
  splitOverageNano: text("split_overage_nano"), // Precise overage in nano-units (EUR * 10^10)
  createdAt: timestamp("created_at").defaultNow(),
});

// Audit Log
export const auditLogs = pgTable("audit_logs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  orgId: varchar("org_id"),
  userId: varchar("user_id"),
  action: varchar("action").notNull(),
  entity: varchar("entity"),
  entityId: varchar("entity_id"),
  data: jsonb("data"),
  createdAt: timestamp("created_at").defaultNow(),
});

// Notifications
export const notifications = pgTable("notifications", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  releaseId: varchar("release_id"),
  pitchingId: varchar("pitching_id"),
  relatedEntityType: varchar("related_entity_type"), // "musicVideo", etc.
  relatedEntityId: varchar("related_entity_id"), // ID of music video or other entity
  title: varchar("title").notNull(),
  message: text("message").notNull(),
  type: varchar("type").notNull(), // "RELEASE_CREATED" | "RELEASE_UPDATED" | "RELEASE_UPDATED_BY_USER" | "VIDEO_UPDATED_BY_USER" | "ADMIN_CHANGED" | "USER_CHANGED" | "PITCHING_SUBMITTED" | "MUSIC_VIDEO_CREATED" | "MUSIC_VIDEO_UPDATED" | "MUSIC_VIDEO_UPDATE" | "STREAMING_REPORT_UPLOADED" | "STREAMING_REPORT_UPDATED" | "WITHDRAWAL_REQUESTED"
  changedFields: text("changed_fields"), // Formatted text of changed fields with before/after values
  link: varchar("link"), // Direct link for notification navigation
  isRead: boolean("is_read").default(false),
  createdAt: timestamp("created_at").defaultNow(),
});

// Pitching Submissions
export const pitchingSubmissions = pgTable("pitching_submissions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  releaseId: varchar("release_id").notNull(),
  orgId: varchar("org_id").notNull(),
  releaseDescription: text("release_description").notNull(),
  artistInfo: text("artist_info").notNull(),
  promoplan: text("promoplan").notNull(),
  focusTrack: varchar("focus_track").notNull(),
  budget: varchar("budget").notNull(),
  photosGoogleDrive: varchar("photos_google_drive").notNull(),
  spotifyUrl: varchar("spotify_url"),
  spotifyNoProfile: boolean("spotify_no_profile").default(false),
  appleMusicUrl: varchar("apple_music_url"),
  appleMusicNoProfile: boolean("apple_music_no_profile").default(false),
  instagramUrl: varchar("instagram_url"),
  instagramNoProfile: boolean("instagram_no_profile").default(false),
  status: pitchingStatusEnum("status").default("PENDING"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Label-Artist Links (connects LABEL organizations with ARTIST_ORG organizations)
export const labelArtistLinks = pgTable("label_artist_links", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  labelOrgId: varchar("label_org_id").notNull(), // References LABEL organization
  artistOrgId: varchar("artist_org_id").notNull(), // References ARTIST_ORG organization
  revenueSharePercent: integer("revenue_share_percent").default(0), // 0-100, % that goes to label
  labelPaysReleases: boolean("label_pays_releases").default(true), // If true, releases are paid by label
  fixedReleaseFee: integer("fixed_release_fee"), // Optional fixed fee per release (cents), null = no fee
  status: labelArtistLinkStatusEnum("status").default("ACTIVE"),
  notes: text("notes"), // Admin notes about this relationship
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Platform Settings - for storing platform-wide configuration
export const platformSettings = pgTable("platform_settings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  key: varchar("key").notNull().unique(), // Setting key (e.g., 'targetRevenue')
  value: text("value").notNull(), // JSON-serialized value
  updatedBy: varchar("updated_by"), // User ID who last updated this setting
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Platform News - for displaying news/updates on user dashboard
export const platformNews = pgTable("platform_news", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  titleEn: varchar("title_en").notNull(),
  titleUk: varchar("title_uk").notNull(),
  titlePl: varchar("title_pl").notNull(),
  contentEn: text("content_en").notNull(),
  contentUk: text("content_uk").notNull(),
  contentPl: text("content_pl").notNull(),
  // Media attachments (stored as Google Drive file IDs)
  images: jsonb("images").default([]), // Array of up to 5 image file IDs
  youtubeUrl: varchar("youtube_url"), // Optional YouTube video URL
  pdfFileId: varchar("pdf_file_id"), // Optional PDF document file ID
  targetAudience: newsAudienceEnum("target_audience").default("ALL"), // Who should see this news
  isPublished: boolean("is_published").default(true),
  publishedAt: timestamp("published_at").defaultNow(),
  createdBy: varchar("created_by").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Platform Expenses - for tracking platform operational costs and revenues
export const platformExpenses = pgTable("platform_expenses", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  type: financeEntryTypeEnum("type").notNull().default("EXPENSE"), // EXPENSE or REVENUE
  category: expenseCategoryEnum("category").notNull(),
  amount: integer("amount").notNull(), // Amount in cents (always positive)
  comment: text("comment"),
  organizationId: varchar("organization_id"), // Optional: linked organization for revenue tracking
  expenseDate: timestamp("expense_date").notNull(), // Date of the entry
  createdBy: varchar("created_by").notNull(), // User ID who created this entry
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// YouTube Ad Campaigns - for tracking YouTube advertising submissions
export const youtubeAdCampaigns = pgTable("youtube_ad_campaigns", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  orgId: varchar("org_id").notNull(),
  videoUrl: varchar("video_url").notNull(),
  videoId: varchar("video_id").notNull(),
  budget: integer("budget").notNull(), // Budget in USD (whole dollars)
  inStreamPercent: integer("in_stream_percent").notNull().default(50),
  discoveryPercent: integer("discovery_percent").notNull().default(50),
  duration: integer("duration").notNull(), // Number of days
  countries: jsonb("countries").notNull(), // Array of country codes
  cities: jsonb("cities"), // Object mapping country codes to arrays of city names (optional)
  audience: text("audience"), // Optional audience description
  // Calculated amounts (stored as cents for precision)
  launchFee: integer("launch_fee"), // Launch fee in cents
  adBudget: integer("ad_budget"), // Ad budget after all fees in cents
  wayforpayFee: integer("wayforpay_fee"), // Wayforpay fee in cents
  taxFee: integer("tax_fee"), // Tax fee in cents
  youtubeTax: integer("youtube_tax"), // YouTube tax in cents
  inStreamBudget: integer("in_stream_budget"), // In-stream budget in cents
  discoveryBudget: integer("discovery_budget"), // Discovery budget in cents
  status: varchar("status").notNull().default("PENDING"), // PENDING, APPROVED, ACTIVE, COMPLETED, REJECTED
  adminNotes: text("admin_notes"),
  reportData: jsonb("report_data"), // Legacy: Parsed CSV report data (kept for backwards compatibility)
  reportUploadedAt: timestamp("report_uploaded_at"), // Legacy: When report was uploaded
  inStreamReportData: jsonb("in_stream_report_data"), // In-Stream campaign report data
  inStreamReportUploadedAt: timestamp("in_stream_report_uploaded_at"), // When In-Stream report was uploaded
  discoveryReportData: jsonb("discovery_report_data"), // Discovery campaign report data
  discoveryReportUploadedAt: timestamp("discovery_report_uploaded_at"), // When Discovery report was uploaded
  paymentStatus: varchar("payment_status").notNull().default("PENDING"), // PENDING, PAID, FAILED
  paymentReference: varchar("payment_reference"), // Unique order reference for Wayforpay
  paidAt: timestamp("paid_at"), // When payment was completed
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Draft type enum for release/video drafts
export const draftTypeEnum = pgEnum("draft_type", ["RELEASE", "VIDEO"]);

// Support message sender type enum
export const supportMessageSenderEnum = pgEnum("support_message_sender", ["USER", "ADMIN"]);

// Release Drafts - Server-side storage for wizard autosave
export const releaseDrafts = pgTable("release_drafts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  orgId: varchar("org_id").notNull(),
  createdByUserId: varchar("created_by_user_id").notNull(),
  updatedByUserId: varchar("updated_by_user_id"),
  type: draftTypeEnum("type").notNull().default("RELEASE"),
  title: varchar("title"),
  currentStep: integer("current_step").default(0),
  payload: jsonb("payload").notNull(),
  version: integer("version").notNull().default(1),
  isArchived: boolean("is_archived").default(false),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("idx_release_drafts_org").on(table.orgId),
  index("idx_release_drafts_user").on(table.createdByUserId),
  index("idx_release_drafts_type").on(table.type),
]);

// Local Playlists - Curated playlists added by admin for pitching
export const localPlaylists = pgTable("local_playlists", {
  id: serial("id").primaryKey(),
  name: varchar("name").notNull(),
  description: text("description"),
  platform: varchar("platform").notNull(), // Spotify, YouTube, Apple Music, etc.
  followerCount: integer("follower_count"),
  tracksCount: integer("tracks_count"), // Total tracks in playlist (from Spotify API)
  averageTrackPopularity: integer("average_track_popularity"), // Average popularity (0-100) of tracks in playlist
  genre: varchar("genre"),
  country: varchar("country"), // Target country for the playlist (ISO country code)
  imageUrl: varchar("image_url"),
  playlistUrl: varchar("playlist_url"),
  spotifyId: varchar("spotify_id"), // Extracted from playlistUrl for API calls
  curatorOrgId: varchar("curator_org_id"), // References organization of type PLAYLIST_CURATOR
  isActive: boolean("is_active").default(true),
  lastSyncedAt: timestamp("last_synced_at"), // Last successful Spotify API sync
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("idx_local_playlists_active").on(table.isActive),
  index("idx_local_playlists_platform").on(table.platform),
  index("idx_local_playlists_curator").on(table.curatorOrgId),
  index("idx_local_playlists_spotify_id").on(table.spotifyId),
  index("idx_local_playlists_country").on(table.country),
]);

// Curator Pricing Packages - Flexible pricing for playlist placement
export const curatorPricingPackages = pgTable("curator_pricing_packages", {
  id: serial("id").primaryKey(),
  playlistId: integer("playlist_id").notNull(),
  name: varchar("name").notNull(),
  price: integer("price").notNull(),
  currency: varchar("currency").notNull().default("UAH"),
  benefits: jsonb("benefits").notNull().default([]),
  includesArtistPhoto: boolean("includes_artist_photo").default(false),
  sortOrder: integer("sort_order").default(0),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("idx_curator_pricing_playlist").on(table.playlistId),
  index("idx_curator_pricing_active").on(table.isActive),
]);

// Playlist Follower Snapshots - Historical data for playlist followers tracking
export const playlistFollowerSnapshots = pgTable("playlist_follower_snapshots", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  playlistId: integer("playlist_id").notNull(),
  followerCount: integer("follower_count").notNull(),
  tracksCount: integer("tracks_count"),
  collectedAt: timestamp("collected_at").defaultNow(),
}, (table) => [
  index("idx_playlist_follower_snapshots_playlist").on(table.playlistId),
  index("idx_playlist_follower_snapshots_date").on(table.collectedAt),
]);

// Curator Playlist Views - Tracks how many times playlists are viewed by artists
export const curatorPlaylistViews = pgTable("curator_playlist_views", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  playlistId: integer("playlist_id").notNull(),
  viewerOrgId: varchar("viewer_org_id"), // Organization that viewed the playlist (optional for anonymous views)
  viewedAt: timestamp("viewed_at").defaultNow(),
}, (table) => [
  index("idx_curator_playlist_views_playlist").on(table.playlistId),
  index("idx_curator_playlist_views_date").on(table.viewedAt),
  index("idx_curator_playlist_views_viewer").on(table.viewerOrgId),
]);

// Local Playlist Pitches - User submissions to local playlists
export const localPlaylistPitches = pgTable("local_playlist_pitches", {
  id: serial("id").primaryKey(),
  playlistId: integer("playlist_id").notNull(),
  releaseId: varchar("release_id").notNull(),
  orgId: varchar("org_id").notNull(),
  userId: varchar("user_id").notNull(),
  trackId: integer("track_id"),
  message: text("message"),
  status: varchar("status").notNull().default("PENDING"), // PENDING, APPROVED, REJECTED, PLACED
  adminNotes: text("admin_notes"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("idx_local_playlist_pitches_playlist").on(table.playlistId),
  index("idx_local_playlist_pitches_release").on(table.releaseId),
  index("idx_local_playlist_pitches_org").on(table.orgId),
  index("idx_local_playlist_pitches_status").on(table.status),
]);

// Playlist Likes - User favorites for playlists
export const playlistLikes = pgTable("playlist_likes", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  playlistId: integer("playlist_id").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("idx_playlist_likes_user").on(table.userId),
  index("idx_playlist_likes_playlist").on(table.playlistId),
  uniqueIndex("idx_playlist_likes_user_playlist").on(table.userId, table.playlistId),
]);

// Playlist Cart Items - Shopping cart for playlist packages
export const playlistCartItems = pgTable("playlist_cart_items", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  playlistId: integer("playlist_id").notNull(),
  packageId: integer("package_id").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("idx_playlist_cart_user").on(table.userId),
  index("idx_playlist_cart_playlist").on(table.playlistId),
  uniqueIndex("idx_playlist_cart_user_playlist").on(table.userId, table.playlistId),
]);

// Pitching Application Status Enum
export const pitchingApplicationStatusEnum = pgEnum("pitching_application_status", [
  "PENDING",
  "IN_REVIEW",
  "DATE_NEGOTIATION",
  "APPROVED",
  "REJECTED",
  "DISPUTE",
  "RESOLVED",
]);

// Pitching Applications - Full applications from artists to curators
export const pitchingApplications = pgTable("pitching_applications", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  applicationCode: varchar("application_code", { length: 12 }).unique(), // Unique code like APP-XXXXXX
  userId: varchar("user_id").notNull(),
  orgId: varchar("org_id").notNull(),
  trackId: varchar("track_id").notNull(),
  playlistId: integer("playlist_id").notNull(),
  packageId: integer("package_id").notNull(),
  curatorOrgId: varchar("curator_org_id").notNull(),
  spotifyLink: varchar("spotify_link"),
  instagramLink: varchar("instagram_link"),
  comment: text("comment"),
  photos: jsonb("photos").default([]), // Array of photo URLs/file IDs
  status: pitchingApplicationStatusEnum("status").default("PENDING"),
  curatorResponse: text("curator_response"),
  rejectionReason: varchar("rejection_reason"), // Reason code from PITCHING_REJECTION_REASONS
  paymentId: varchar("payment_id"),
  paymentStatus: varchar("payment_status").default("UNPAID"), // UNPAID, PENDING, PAID
  paidAt: timestamp("paid_at"), // When payment was completed
  paidAmount: integer("paid_amount"),
  paidCurrency: varchar("paid_currency"),
  spotifyTrackUrl: varchar("spotify_track_url"), // Found Spotify track URL for curator
  proposedPlacementDate: timestamp("proposed_placement_date"), // Date proposed by artist
  curatorProposedDate: timestamp("curator_proposed_date"), // Alternative date proposed by curator
  confirmedPlacementDate: timestamp("confirmed_placement_date"), // Final agreed placement date
  placementVerifiedAt: timestamp("placement_verified_at"), // When track was verified in playlist
  isPlacementVerified: boolean("is_placement_verified").default(false), // Whether track is confirmed in playlist
  disputeReason: text("dispute_reason"), // Reason for dispute
  disputeOpenedAt: timestamp("dispute_opened_at"), // When dispute was opened
  disputeResolvedAt: timestamp("dispute_resolved_at"), // When dispute was resolved
  disputeResolution: text("dispute_resolution"), // Admin resolution notes
  lastCuratorReminderAt: timestamp("last_curator_reminder_at"), // Track reminder timing
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
  reviewedAt: timestamp("reviewed_at"),
}, (table) => [
  index("idx_pitching_applications_user").on(table.userId),
  index("idx_pitching_applications_org").on(table.orgId),
  index("idx_pitching_applications_curator").on(table.curatorOrgId),
  index("idx_pitching_applications_playlist").on(table.playlistId),
  index("idx_pitching_applications_status").on(table.status),
  index("idx_pitching_applications_created").on(table.createdAt),
  index("idx_pitching_applications_code").on(table.applicationCode),
  index("idx_pitching_applications_placement_date").on(table.confirmedPlacementDate),
]);

// Curator Messages - Chat between artists and curators about playlist applications
export const curatorMessageSenderEnum = pgEnum("curator_message_sender", ["ARTIST", "CURATOR"]);

export const curatorMessages = pgTable("curator_messages", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  applicationId: varchar("application_id").notNull(),
  senderId: varchar("sender_id").notNull(),
  senderType: curatorMessageSenderEnum("sender_type").notNull(),
  message: text("message").notNull(),
  isRead: boolean("is_read").default(false),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("idx_curator_messages_application").on(table.applicationId),
  index("idx_curator_messages_created").on(table.createdAt),
]);

// Support Messages - Chat between users and platform admins
export const supportMessages = pgTable("support_messages", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  message: text("message").notNull(),
  senderType: supportMessageSenderEnum("sender_type").notNull(),
  adminId: varchar("admin_id"), // ID of admin who sent the message (if senderType is ADMIN)
  isRead: boolean("is_read").default(false),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("idx_support_messages_user").on(table.userId),
  index("idx_support_messages_created").on(table.createdAt),
]);

// Relations
export const usersRelations = relations(users, ({ many }) => ({
  orgMembers: many(orgMembers),
  splitShares: many(splitShares),
  notifications: many(notifications),
}));

export const organizationsRelations = relations(organizations, ({ many }) => ({
  members: many(orgMembers),
  artists: many(artists),
  releases: many(releases),
  musicVideos: many(musicVideos),
  reportRows: many(reportRows),
  socialFollowerSnapshots: many(socialFollowerSnapshots),
  labelArtistLinksAsLabel: many(labelArtistLinks, { relationName: "labelOrg" }),
  labelArtistLinksAsArtist: many(labelArtistLinks, { relationName: "artistOrg" }),
}));

export const orgMembersRelations = relations(orgMembers, ({ one }) => ({
  organization: one(organizations, {
    fields: [orgMembers.orgId],
    references: [organizations.id],
  }),
  user: one(users, {
    fields: [orgMembers.userId],
    references: [users.id],
  }),
}));

export const labelArtistLinksRelations = relations(labelArtistLinks, ({ one }) => ({
  labelOrg: one(organizations, {
    fields: [labelArtistLinks.labelOrgId],
    references: [organizations.id],
    relationName: "labelOrg",
  }),
  artistOrg: one(organizations, {
    fields: [labelArtistLinks.artistOrgId],
    references: [organizations.id],
    relationName: "artistOrg",
  }),
}));

export const artistsRelations = relations(artists, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [artists.orgId],
    references: [organizations.id],
  }),
  releases: many(releases),
  musicVideos: many(musicVideos),
}));

export const releasesRelations = relations(releases, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [releases.orgId],
    references: [organizations.id],
  }),
  artist: one(artists, {
    fields: [releases.artistId],
    references: [artists.id],
  }),
  tracks: many(tracks),
  qcItems: many(qcItems),
  splitShares: many(splitShares),
  deliveryJobs: many(deliveryJobs),
  musicVideos: many(musicVideos),
}));

export const musicVideosRelations = relations(musicVideos, ({ one }) => ({
  organization: one(organizations, {
    fields: [musicVideos.orgId],
    references: [organizations.id],
  }),
  artist: one(artists, {
    fields: [musicVideos.artistId],
    references: [artists.id],
  }),
  release: one(releases, {
    fields: [musicVideos.releaseId],
    references: [releases.id],
  }),
}));

export const tracksRelations = relations(tracks, ({ one, many }) => ({
  release: one(releases, {
    fields: [tracks.releaseId],
    references: [releases.id],
  }),
  splitShares: many(splitShares),
  qcItems: many(qcItems),
}));

export const splitSharesRelations = relations(splitShares, ({ one }) => ({
  release: one(releases, {
    fields: [splitShares.releaseId],
    references: [releases.id],
  }),
  track: one(tracks, {
    fields: [splitShares.trackId],
    references: [tracks.id],
  }),
  user: one(users, {
    fields: [splitShares.userId],
    references: [users.id],
  }),
}));

export const qcItemsRelations = relations(qcItems, ({ one }) => ({
  release: one(releases, {
    fields: [qcItems.releaseId],
    references: [releases.id],
  }),
  track: one(tracks, {
    fields: [qcItems.trackId],
    references: [tracks.id],
  }),
}));

export const deliveryJobsRelations = relations(deliveryJobs, ({ one }) => ({
  release: one(releases, {
    fields: [deliveryJobs.releaseId],
    references: [releases.id],
  }),
}));

export const reportRowsRelations = relations(reportRows, ({ one }) => ({
  organization: one(organizations, {
    fields: [reportRows.orgId],
    references: [organizations.id],
  }),
}));

export const streamingReportsRelations = relations(streamingReports, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [streamingReports.orgId],
    references: [organizations.id],
  }),
  uploadedByUser: one(users, {
    fields: [streamingReports.uploadedBy],
    references: [users.id],
  }),
  rows: many(streamingReportRows),
}));

export const streamingReportRowsRelations = relations(streamingReportRows, ({ one }) => ({
  report: one(streamingReports, {
    fields: [streamingReportRows.reportId],
    references: [streamingReports.id],
  }),
}));

export const socialFollowerSnapshotsRelations = relations(socialFollowerSnapshots, ({ one }) => ({
  organization: one(organizations, {
    fields: [socialFollowerSnapshots.orgId],
    references: [organizations.id],
  }),
}));

export const notificationsRelations = relations(notifications, ({ one }) => ({
  user: one(users, {
    fields: [notifications.userId],
    references: [users.id],
  }),
  release: one(releases, {
    fields: [notifications.releaseId],
    references: [releases.id],
  }),
}));

export const pitchingSubmissionsRelations = relations(pitchingSubmissions, ({ one }) => ({
  user: one(users, {
    fields: [pitchingSubmissions.userId],
    references: [users.id],
  }),
  release: one(releases, {
    fields: [pitchingSubmissions.releaseId],
    references: [releases.id],
  }),
  organization: one(organizations, {
    fields: [pitchingSubmissions.orgId],
    references: [organizations.id],
  }),
}));

// Insert schemas
export const insertUserSchema = createInsertSchema(users).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertOrganizationSchema = createInsertSchema(organizations).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertArtistSchema = createInsertSchema(artists).omit({
  id: true,
  createdAt: true,
});

export const insertReleaseSchema = createInsertSchema(releases).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

// Admin update schema - only allows safe fields to be updated
export const adminUpdateReleaseSchema = z.object({
  title: z.string().min(1).optional(),
  upc: z.string().optional(),
  paymentStatus: z.enum(["PENDING", "PAID", "FAILED"]).optional(),
  primaryGenre: z.string().optional(),
  secondaryGenre: z.string().optional(),
  language: z.string().optional(),
  albumVersion: z.string().optional(),
  originalReleaseDate: z.coerce.date().nullable().optional(),
  releaseDate: z.coerce.date().nullable().optional(),
  releaseTime: z.string().optional(),
  subLabel: z.string().optional(),
  rightsOwner: z.string().optional(),
  status: z.enum(["DRAFT", "ACTIVE", "IN_REVIEW", "APPROVED", "DELIVERING", "DELIVERED", "DELETED", "TAKEDOWN", "REJECTED"]).optional(),
  territories: z.array(z.string()).optional(),
  labelName: z.string().optional(),
  pCopyright: z.string().optional(),
  multilink: z.string().optional(),
  // Performers field for admin editing
  performers: z.array(z.object({
    name: z.string(),
    role: z.string(),
  })).optional(),
  // File-related fields (updated via file upload endpoints)
  artworkUrl: z.string().optional(),
  artworkFileId: z.string().optional(),
  artworkOriginalName: z.string().optional(),
  artworkSize: z.number().optional(),
  // Timestamp for when UPC/ISRC codes were assigned
  codesAssignedAt: z.coerce.date().nullable().optional(),
});

export const adminUpdateMusicVideoSchema = z.object({
  title: z.string().min(1).optional(),
  artistId: z.string().optional(),
  upc: z.string().optional(),
  isrc: z.string().optional(),
  paymentStatus: z.enum(["PENDING", "PROCESSING", "PAID", "FAILED"]).optional(),
  status: z.enum(["DRAFT", "ACTIVE", "IN_REVIEW", "APPROVED", "DELIVERING", "DELIVERED", "DELETED", "TAKEDOWN", "REJECTED"]).optional(),
  primaryGenre: z.string().optional(),
  secondaryGenre: z.string().optional(),
  language: z.string().optional(),
  metadataLanguage: z.string().optional(),
  firstReleaseDate: z.coerce.date().nullable().optional(),
  releaseDate: z.coerce.date().nullable().optional(),
  releaseTime: z.string().optional(),
  territories: z.array(z.string()).optional(),
  platforms: z.array(z.string()).optional(),
  explicit: z.boolean().optional(),
  aiGenerated: z.boolean().optional(),
  pCopyright: z.string().optional(),
  cCopyright: z.string().optional(),
  labelName: z.string().optional(),
  rightsOwner: z.string().optional(),
  previewStart: z.string().nullable().optional(),
  thumbnailTime: z.string().nullable().optional(),
});

export const insertTrackSchema = createInsertSchema(tracks).omit({
  id: true,
  createdAt: true,
});

export const insertSplitShareSchema = createInsertSchema(splitShares).omit({
  id: true,
  createdAt: true,
});

// Types
export type User = typeof users.$inferSelect & {
  organizations?: Organization[];
};
export type UpsertUser = typeof users.$inferInsert;
export type InsertUser = z.infer<typeof insertUserSchema>;

export type Organization = typeof organizations.$inferSelect;
export type InsertOrganization = z.infer<typeof insertOrganizationSchema>;

export type OrgMember = typeof orgMembers.$inferSelect;

export type Artist = typeof artists.$inferSelect;
export type InsertArtist = z.infer<typeof insertArtistSchema>;

export type Release = typeof releases.$inferSelect;
export type InsertRelease = z.infer<typeof insertReleaseSchema>;

export type Track = typeof tracks.$inferSelect;
export type InsertTrack = z.infer<typeof insertTrackSchema>;

export type SplitShare = typeof splitShares.$inferSelect;
export type InsertSplitShare = z.infer<typeof insertSplitShareSchema>;

export type QCItem = typeof qcItems.$inferSelect;
export type DeliveryJob = typeof deliveryJobs.$inferSelect;
export type ReportRow = typeof reportRows.$inferSelect;
export type AuditLog = typeof auditLogs.$inferSelect;
export type Notification = typeof notifications.$inferSelect;

export const insertPitchingSubmissionSchema = createInsertSchema(pitchingSubmissions).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type PitchingSubmission = typeof pitchingSubmissions.$inferSelect;
export type InsertPitchingSubmission = z.infer<typeof insertPitchingSubmissionSchema>;

export const insertStreamingReportSchema = createInsertSchema(streamingReports).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertStreamingReportRowSchema = createInsertSchema(streamingReportRows).omit({
  id: true,
  createdAt: true,
});

export type StreamingReport = typeof streamingReports.$inferSelect;
export type InsertStreamingReport = z.infer<typeof insertStreamingReportSchema>;
export type StreamingReportRow = typeof streamingReportRows.$inferSelect;
export type InsertStreamingReportRow = z.infer<typeof insertStreamingReportRowSchema>;

export const insertTrackRoyaltyAllocationSchema = createInsertSchema(trackRoyaltyAllocations).omit({
  id: true,
  createdAt: true,
});
export type TrackRoyaltyAllocation = typeof trackRoyaltyAllocations.$inferSelect;
export type InsertTrackRoyaltyAllocation = z.infer<typeof insertTrackRoyaltyAllocationSchema>;

export const insertWithdrawalSchema = createInsertSchema(withdrawals).omit({
  id: true,
  requestedAt: true,
  processedAt: true,
});

export type Withdrawal = typeof withdrawals.$inferSelect;
export type InsertWithdrawal = z.infer<typeof insertWithdrawalSchema>;

export const insertMusicVideoSchema = createInsertSchema(musicVideos).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type MusicVideo = typeof musicVideos.$inferSelect;
export type InsertMusicVideo = z.infer<typeof insertMusicVideoSchema>;

export type PasswordResetToken = typeof passwordResetTokens.$inferSelect;

// Label-Artist Links
export const insertLabelArtistLinkSchema = createInsertSchema(labelArtistLinks).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type LabelArtistLink = typeof labelArtistLinks.$inferSelect;
export type InsertLabelArtistLink = z.infer<typeof insertLabelArtistLinkSchema>;

// Platform Expenses
export const insertPlatformExpenseSchema = createInsertSchema(platformExpenses).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type PlatformExpense = typeof platformExpenses.$inferSelect;
export type InsertPlatformExpense = z.infer<typeof insertPlatformExpenseSchema>;

export type PlatformSetting = typeof platformSettings.$inferSelect;

// Platform News
export const insertPlatformNewsSchema = createInsertSchema(platformNews).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type PlatformNews = typeof platformNews.$inferSelect;
export type InsertPlatformNews = z.infer<typeof insertPlatformNewsSchema>;

// Promotional Banners - rotating promotional messages for users
export const promotionalBanners = pgTable("promotional_banners", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  textEn: varchar("text_en").notNull(),
  textUk: varchar("text_uk").notNull(),
  textPl: varchar("text_pl").notNull(),
  linkUrl: varchar("link_url").notNull(),
  linkTarget: varchar("link_target").default("_self"), // "_self" or "_blank"
  targetCountry: varchar("target_country").default("UA").notNull(), // "ALL", "UA", "PL"
  displayOrder: integer("display_order").default(0).notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  createdBy: varchar("created_by").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertPromotionalBannerSchema = createInsertSchema(promotionalBanners).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type PromotionalBanner = typeof promotionalBanners.$inferSelect;
export type InsertPromotionalBanner = z.infer<typeof insertPromotionalBannerSchema>;

// YouTube Ad Campaigns
export const insertYoutubeAdCampaignSchema = createInsertSchema(youtubeAdCampaigns).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type YoutubeAdCampaign = typeof youtubeAdCampaigns.$inferSelect;
export type InsertYoutubeAdCampaign = z.infer<typeof insertYoutubeAdCampaignSchema>;

// Release Drafts
export const insertReleaseDraftSchema = createInsertSchema(releaseDrafts).omit({
  id: true,
  version: true,
  createdAt: true,
  updatedAt: true,
});

export type ReleaseDraft = typeof releaseDrafts.$inferSelect;
export type InsertReleaseDraft = z.infer<typeof insertReleaseDraftSchema>;

// Support Messages
export const insertSupportMessageSchema = createInsertSchema(supportMessages).omit({
  id: true,
  createdAt: true,
});

export type SupportMessage = typeof supportMessages.$inferSelect;
export type InsertSupportMessage = z.infer<typeof insertSupportMessageSchema>;

// Holiday Gift Prizes - catalog of available prizes with limits
export const holidayGiftPrizes = pgTable("holiday_gift_prizes", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: varchar("name").notNull(),
  description: text("description").notNull(),
  totalLimit: integer("total_limit").notNull(),
  claimedCount: integer("claimed_count").default(0).notNull(),
  weight: integer("weight").default(1).notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  seasonId: varchar("season_id").default("2024-christmas").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Holiday Gift Assignments - tracks which org got which prize
export const holidayGiftAssignments = pgTable("holiday_gift_assignments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  organizationId: varchar("organization_id").notNull(),
  prizeId: varchar("prize_id").notNull(),
  placementId: varchar("placement_id").notNull(),
  seasonId: varchar("season_id").default("2024-christmas").notNull(),
  assignedAt: timestamp("assigned_at").defaultNow().notNull(),
  claimedAt: timestamp("claimed_at"),
  claimedByUserId: varchar("claimed_by_user_id"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  uniqueIndex("holiday_gift_org_season_unique").on(table.organizationId, table.seasonId),
]);

export const holidayGiftPrizesRelations = relations(holidayGiftPrizes, ({ many }) => ({
  assignments: many(holidayGiftAssignments),
}));

export const holidayGiftAssignmentsRelations = relations(holidayGiftAssignments, ({ one }) => ({
  prize: one(holidayGiftPrizes, {
    fields: [holidayGiftAssignments.prizeId],
    references: [holidayGiftPrizes.id],
  }),
  organization: one(organizations, {
    fields: [holidayGiftAssignments.organizationId],
    references: [organizations.id],
  }),
}));

export type HolidayGiftPrize = typeof holidayGiftPrizes.$inferSelect;
export type HolidayGiftAssignment = typeof holidayGiftAssignments.$inferSelect;

// ============================================================================
// SIMPLIFIED ROYALTY SYSTEM (Report-Level Aggregation)
// These tables replace the complex allocation model with simpler report-based tracking
// ============================================================================

// Status enum for split share availability
export const splitShareStatusEnum = pgEnum("split_share_status", [
  "PENDING",   // Report month + 3 months not yet passed
  "AVAILABLE", // Ready for withdrawal
  "PAID",      // Fully paid out
]);

// Report Royalty Summaries - Aggregated royalty data per org/month
// One row per organization per report month
export const reportRoyaltySummaries = pgTable("report_royalty_summaries", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  orgId: varchar("org_id").notNull(),
  reportMonth: varchar("report_month").notNull(), // Format: "YYYY-MM" (e.g., "2025-08")
  
  // Total earnings for this org in this month (before splits)
  totalGrossNano: text("total_gross_nano").notNull().default("0"), // EUR * 10^10 as bigint string
  
  // Owner's share after applying splits (what org owner gets)
  ownerNetNano: text("owner_net_nano").notNull().default("0"), // EUR * 10^10 as bigint string
  
  // How much of owner's share has been paid out
  ownerPaidNano: text("owner_paid_nano").notNull().default("0"), // EUR * 10^10 as bigint string
  
  // Metadata
  trackCount: integer("track_count").default(0), // Number of tracks in this summary
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("IDX_report_summaries_org").on(table.orgId),
  index("IDX_report_summaries_month").on(table.reportMonth),
  uniqueIndex("report_summaries_org_month_unique").on(table.orgId, table.reportMonth),
]);

// Report Split Shares - Per-participant shares for each report summary
// Links to participant payment details for IBAN versioning
export const reportSplitShares = pgTable("report_split_shares", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  summaryId: varchar("summary_id").notNull(), // Reference to report_royalty_summaries.id
  
  // Participant reference (for IBAN versioning)
  participantId: varchar("participant_id").notNull(), // Reference to royalty_participants.id
  paymentDetailId: varchar("payment_detail_id").notNull(), // Reference to participant_payment_details.id (snapshot at creation)
  
  // Snapshot of payment details at creation time (for audit)
  participantName: varchar("participant_name").notNull(),
  participantIban: varchar("participant_iban").notNull(),
  participantTaxId: varchar("participant_tax_id"),
  participantBankName: varchar("participant_bank_name"),
  
  // Share details
  sharePercent: decimal("share_percent", { precision: 5, scale: 2 }).notNull(), // Percentage (e.g., 50.00)
  amountNano: text("amount_nano").notNull().default("0"), // Participant's total share in nano (EUR * 10^10)
  remainingNano: text("remaining_nano").notNull().default("0"), // What's left to pay out (decremented on withdrawal)
  
  // Status for availability tracking (convenience, could be computed from report month)
  status: splitShareStatusEnum("status").default("PENDING"),
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("IDX_split_shares_summary").on(table.summaryId),
  index("IDX_split_shares_participant").on(table.participantId),
  index("IDX_split_shares_status").on(table.status),
]);

// Withdrawal Report Applications - Links withdrawals to split shares (FIFO tracking)
// Records exactly which shares were used in each withdrawal
export const withdrawalReportApplications = pgTable("withdrawal_report_applications", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  withdrawalId: varchar("withdrawal_id").notNull(), // Reference to withdrawals.id
  splitShareId: varchar("split_share_id").notNull(), // Reference to report_split_shares.id
  
  // Amount applied from this share to this withdrawal
  appliedNano: text("applied_nano").notNull(), // EUR * 10^10 as bigint string
  
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("IDX_withdrawal_apps_withdrawal").on(table.withdrawalId),
  index("IDX_withdrawal_apps_share").on(table.splitShareId),
]);

// Relations for the new tables
export const reportRoyaltySummariesRelations = relations(reportRoyaltySummaries, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [reportRoyaltySummaries.orgId],
    references: [organizations.id],
  }),
  splitShares: many(reportSplitShares),
}));

export const reportSplitSharesRelations = relations(reportSplitShares, ({ one, many }) => ({
  summary: one(reportRoyaltySummaries, {
    fields: [reportSplitShares.summaryId],
    references: [reportRoyaltySummaries.id],
  }),
  participant: one(royaltyParticipants, {
    fields: [reportSplitShares.participantId],
    references: [royaltyParticipants.id],
  }),
  paymentDetail: one(participantPaymentDetails, {
    fields: [reportSplitShares.paymentDetailId],
    references: [participantPaymentDetails.id],
  }),
  withdrawalApplications: many(withdrawalReportApplications),
}));

export const withdrawalReportApplicationsRelations = relations(withdrawalReportApplications, ({ one }) => ({
  withdrawal: one(withdrawals, {
    fields: [withdrawalReportApplications.withdrawalId],
    references: [withdrawals.id],
  }),
  splitShare: one(reportSplitShares, {
    fields: [withdrawalReportApplications.splitShareId],
    references: [reportSplitShares.id],
  }),
}));

// Insert schemas and types for new tables
export const insertReportRoyaltySummarySchema = createInsertSchema(reportRoyaltySummaries).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type ReportRoyaltySummary = typeof reportRoyaltySummaries.$inferSelect;
export type InsertReportRoyaltySummary = z.infer<typeof insertReportRoyaltySummarySchema>;

export const insertReportSplitShareSchema = createInsertSchema(reportSplitShares).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type ReportSplitShare = typeof reportSplitShares.$inferSelect;
export type InsertReportSplitShare = z.infer<typeof insertReportSplitShareSchema>;

export const insertWithdrawalReportApplicationSchema = createInsertSchema(withdrawalReportApplications).omit({
  id: true,
  createdAt: true,
});
export type WithdrawalReportApplication = typeof withdrawalReportApplications.$inferSelect;
export type InsertWithdrawalReportApplication = z.infer<typeof insertWithdrawalReportApplicationSchema>;

// Import Checkpoints for rollback functionality
export const importCheckpoints = pgTable("import_checkpoints", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  lastReportId: varchar("last_report_id"), // ID of the last streaming_report at checkpoint time (null if no reports existed)
  lastReportCount: integer("last_report_count").notNull().default(0), // Total count of reports at checkpoint time
  description: text("description"), // Optional description (e.g., "Before manual import")
  createdBy: varchar("created_by").notNull(), // User ID who created the checkpoint
  status: varchar("status", { length: 20 }).notNull().default("ACTIVE"), // ACTIVE, ROLLED_BACK
  rolledBackAt: timestamp("rolled_back_at"), // When rollback was executed
  rolledBackBy: varchar("rolled_back_by"), // User who performed rollback
});

export const importCheckpointsRelations = relations(importCheckpoints, ({ one }) => ({
  creator: one(users, {
    fields: [importCheckpoints.createdBy],
    references: [users.id],
  }),
  rollbackExecutor: one(users, {
    fields: [importCheckpoints.rolledBackBy],
    references: [users.id],
    relationName: "rollbackExecutor",
  }),
}));

export const insertImportCheckpointSchema = createInsertSchema(importCheckpoints).omit({
  id: true,
  createdAt: true,
  rolledBackAt: true,
  rolledBackBy: true,
});
export type ImportCheckpoint = typeof importCheckpoints.$inferSelect;
export type InsertImportCheckpoint = z.infer<typeof insertImportCheckpointSchema>;

// Release Status Events - tracks history of status transitions
export const releaseStatusEvents = pgTable("release_status_events", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  releaseId: varchar("release_id").notNull(),
  fromStatus: varchar("from_status"), // null for initial creation
  toStatus: varchar("to_status").notNull(),
  transitionedAt: timestamp("transitioned_at").defaultNow().notNull(),
  triggeredBy: varchar("triggered_by"), // user ID who triggered the change (null for system)
  metadata: jsonb("metadata"), // optional context (e.g., reason, notes)
}, (table) => [
  index("IDX_release_status_events_release").on(table.releaseId),
  index("IDX_release_status_events_transitioned").on(table.transitionedAt),
]);

export const releaseStatusEventsRelations = relations(releaseStatusEvents, ({ one }) => ({
  release: one(releases, {
    fields: [releaseStatusEvents.releaseId],
    references: [releases.id],
  }),
  user: one(users, {
    fields: [releaseStatusEvents.triggeredBy],
    references: [users.id],
  }),
}));

export const insertReleaseStatusEventSchema = createInsertSchema(releaseStatusEvents).omit({
  id: true,
  transitionedAt: true,
});
export type ReleaseStatusEvent = typeof releaseStatusEvents.$inferSelect;
export type InsertReleaseStatusEvent = z.infer<typeof insertReleaseStatusEventSchema>;

// Local Playlists
export const insertLocalPlaylistSchema = createInsertSchema(localPlaylists).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  lastSyncedAt: true,
});
export type LocalPlaylist = typeof localPlaylists.$inferSelect;
export type InsertLocalPlaylist = z.infer<typeof insertLocalPlaylistSchema>;

// Curator Pricing Packages
export const insertCuratorPricingPackageSchema = createInsertSchema(curatorPricingPackages).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type CuratorPricingPackage = typeof curatorPricingPackages.$inferSelect;
export type InsertCuratorPricingPackage = z.infer<typeof insertCuratorPricingPackageSchema>;

// Playlist Follower Snapshots
export const insertPlaylistFollowerSnapshotSchema = createInsertSchema(playlistFollowerSnapshots).omit({
  id: true,
  collectedAt: true,
});
export type PlaylistFollowerSnapshot = typeof playlistFollowerSnapshots.$inferSelect;
export type InsertPlaylistFollowerSnapshot = z.infer<typeof insertPlaylistFollowerSnapshotSchema>;

// Curator Playlist Views
export const insertCuratorPlaylistViewSchema = createInsertSchema(curatorPlaylistViews).omit({
  id: true,
  viewedAt: true,
});
export type CuratorPlaylistView = typeof curatorPlaylistViews.$inferSelect;
export type InsertCuratorPlaylistView = z.infer<typeof insertCuratorPlaylistViewSchema>;

// Local Playlist Pitches
export const insertLocalPlaylistPitchSchema = createInsertSchema(localPlaylistPitches).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type LocalPlaylistPitch = typeof localPlaylistPitches.$inferSelect;
export type InsertLocalPlaylistPitch = z.infer<typeof insertLocalPlaylistPitchSchema>;

// Playlist Likes
export const insertPlaylistLikeSchema = createInsertSchema(playlistLikes).omit({
  id: true,
  createdAt: true,
});
export type PlaylistLike = typeof playlistLikes.$inferSelect;
export type InsertPlaylistLike = z.infer<typeof insertPlaylistLikeSchema>;

// Playlist Cart Items
export const insertPlaylistCartItemSchema = createInsertSchema(playlistCartItems).omit({
  id: true,
  createdAt: true,
});
export type PlaylistCartItem = typeof playlistCartItems.$inferSelect;
export type InsertPlaylistCartItem = z.infer<typeof insertPlaylistCartItemSchema>;

// Pitching Applications
export const insertPitchingApplicationSchema = createInsertSchema(pitchingApplications).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  reviewedAt: true,
});
export type PitchingApplication = typeof pitchingApplications.$inferSelect;
export type InsertPitchingApplication = z.infer<typeof insertPitchingApplicationSchema>;

// Curator Transaction Type Enum
export const curatorTransactionTypeEnum = pgEnum("curator_transaction_type", [
  "INCOME",      // Payment from artist for playlist placement
  "WITHDRAWAL",  // Curator withdraws funds to their card
]);

// Curator Transaction Status Enum
export const curatorTransactionStatusEnum = pgEnum("curator_transaction_status", [
  "PENDING",     // Waiting (holding period)
  "AVAILABLE",   // Available for withdrawal
  "PROCESSING",  // Withdrawal in progress
  "COMPLETED",   // Withdrawal completed
  "CANCELLED",   // Cancelled
]);

// Curator Transactions - All financial transactions for curators
export const curatorTransactions = pgTable("curator_transactions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  curatorOrgId: varchar("curator_org_id").notNull(),
  type: curatorTransactionTypeEnum("type").notNull(),
  status: curatorTransactionStatusEnum("status").notNull().default("PENDING"),
  amount: integer("amount").notNull(), // Amount in kopecks (UAH * 100)
  currency: varchar("currency").notNull().default("UAH"),
  applicationId: varchar("application_id"), // Reference to pitching application (for INCOME)
  description: text("description"),
  availableAt: timestamp("available_at"), // When funds become available for withdrawal
  processedAt: timestamp("processed_at"), // When withdrawal was processed
  bankAccount: text("bank_account"), // Bank account details for withdrawal (JSON)
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("idx_curator_transactions_org").on(table.curatorOrgId),
  index("idx_curator_transactions_type").on(table.type),
  index("idx_curator_transactions_status").on(table.status),
  index("idx_curator_transactions_available").on(table.availableAt),
  index("idx_curator_transactions_created").on(table.createdAt),
]);

// Curator Transactions schema
export const insertCuratorTransactionSchema = createInsertSchema(curatorTransactions).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type CuratorTransaction = typeof curatorTransactions.$inferSelect;
export type InsertCuratorTransaction = z.infer<typeof insertCuratorTransactionSchema>;

export const curatorDonationStatusEnum = pgEnum("curator_donation_status", ["PENDING", "PAID", "FAILED"]);

export const curatorDonations = pgTable("curator_donations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  applicationId: varchar("application_id").notNull(),
  curatorOrgId: varchar("curator_org_id").notNull(),
  artistOrgId: varchar("artist_org_id").notNull(),
  amount: integer("amount").notNull(),
  currency: varchar("currency").notNull().default("UAH"),
  status: curatorDonationStatusEnum("status").notNull().default("PENDING"),
  orderReference: varchar("order_reference"),
  paidAt: timestamp("paid_at"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("idx_curator_donations_application").on(table.applicationId),
  index("idx_curator_donations_curator").on(table.curatorOrgId),
  index("idx_curator_donations_artist").on(table.artistOrgId),
  index("idx_curator_donations_status").on(table.status),
  index("idx_curator_donations_created").on(table.createdAt),
]);

export const insertCuratorDonationSchema = createInsertSchema(curatorDonations).omit({
  id: true,
  createdAt: true,
});
export type CuratorDonation = typeof curatorDonations.$inferSelect;
export type InsertCuratorDonation = z.infer<typeof insertCuratorDonationSchema>;

// Academy enums
export const academyCourseTypeEnum = pgEnum("academy_course_type", ["ARTICLE", "VIDEO"]);
export const academyCourseStatusEnum = pgEnum("academy_course_status", ["DRAFT", "PUBLISHED"]);
export const academyCourseCategoryEnum = pgEnum("academy_course_category", [
  "MARKETING", "DISTRIBUTION", "FINANCE", "LEGAL", "PRODUCTION", "SOCIAL_MEDIA"
]);
export const academyPurchaseStatusEnum = pgEnum("academy_purchase_status", ["PENDING", "PAID", "FAILED"]);

// Academy Courses
export const academyCourses = pgTable("academy_courses", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  title: varchar("title").notNull(),
  slug: varchar("slug").notNull().unique(),
  description: text("description"),
  category: academyCourseCategoryEnum("category").notNull(),
  type: academyCourseTypeEnum("type").notNull(),
  coverImageFileId: varchar("cover_image_file_id"),
  price: integer("price"), // Price in kopecks (UAH * 100), null = free
  isFree: boolean("is_free").default(true),
  contentHtml: text("content_html"),
  videoFileId: varchar("video_file_id"),
  readingTime: integer("reading_time"), // minutes for articles
  videoDuration: integer("video_duration"), // seconds for videos
  status: academyCourseStatusEnum("status").notNull().default("DRAFT"),
  createdBy: varchar("created_by").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("idx_academy_courses_status").on(table.status),
  index("idx_academy_courses_category").on(table.category),
  index("idx_academy_courses_type").on(table.type),
  index("idx_academy_courses_slug").on(table.slug),
]);

export const insertAcademyCourseSchema = createInsertSchema(academyCourses).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type AcademyCourse = typeof academyCourses.$inferSelect;
export type InsertAcademyCourse = z.infer<typeof insertAcademyCourseSchema>;

// Academy Purchases
export const academyPurchases = pgTable("academy_purchases", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  courseId: varchar("course_id").notNull(),
  amount: integer("amount").notNull(), // Amount in kopecks
  currency: varchar("currency").notNull().default("UAH"),
  status: academyPurchaseStatusEnum("status").notNull().default("PENDING"),
  orderReference: varchar("order_reference"),
  paidAt: timestamp("paid_at"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("idx_academy_purchases_user").on(table.userId),
  index("idx_academy_purchases_course").on(table.courseId),
  index("idx_academy_purchases_status").on(table.status),
  index("idx_academy_purchases_order_ref").on(table.orderReference),
])

export const insertAcademyPurchaseSchema = createInsertSchema(academyPurchases).omit({
  id: true,
  createdAt: true,
});
export type AcademyPurchase = typeof academyPurchases.$inferSelect;
export type InsertAcademyPurchase = z.infer<typeof insertAcademyPurchaseSchema>;
