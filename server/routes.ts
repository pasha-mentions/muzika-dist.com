import type { Express } from "express";
import { createServer, type Server } from "http";
import passport from "passport";
import multer from "multer";
import crypto from "crypto";
import { promises as fs } from "fs";
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const XLSX = require('xlsx');

import { storage } from "./storage";
import { setupAuth } from "./replitAuth";
import { setupLocalAuthRoutes } from "./localAuth";
import { isAuthenticated } from "./auth";
import bcrypt from "bcrypt";
import { googleDriveStorage } from "./googleDriveStorage";
import { renderMotionVideo, getFfmpegPath, resetFfmpegPath, initializeBinaries } from "./videoRenderer";
import { createReleaseCalendarEvent } from "./googleCalendar";
import { sendAdminToUserEmail, sendUserToAdminEmail } from "./googleMail";
import { parseAndImportStreamingReport, normalizePeriod } from "./streamingReportService";
import { z } from "zod";
import { sql, count, gte, lte, lt, and, isNull, isNotNull, or, eq, ne, not, asc, desc, inArray } from "drizzle-orm";
import {
  insertTrackSchema,
  insertArtistSchema,
  insertOrganizationSchema,
  insertReleaseSchema,
  insertSplitShareSchema,
  adminUpdateReleaseSchema,
  adminUpdateMusicVideoSchema,
  insertPlatformExpenseSchema,
  type User,
  organizations,
  users,
  releases,
  musicVideos,
  tracks,
  pitchingSubmissions,
  orgMembers,
  socialFollowerSnapshots,
  platformExpenses,
  platformSettings,
  platformNews,
  promotionalBanners,
  withdrawals,
  holidayGiftPrizes,
  holidayGiftAssignments,
  userActivity,
  trackSplits,
  localPlaylists,
  localPlaylistPitches,
  insertLocalPlaylistSchema,
  insertLocalPlaylistPitchSchema,
  playlistFollowerSnapshots,
  curatorPlaylistViews,
  curatorPricingPackages,
  playlistLikes,
  playlistCartItems,
  pitchingApplications,
  curatorTransactions,
  curatorDonations,
  youtubeAdCampaigns,
  reportRoyaltySummaries,
  streamingReports,
  streamingReportRows,
  curatorMessages,
  artists,
  academyCourses,
  academyPurchases,
} from "@shared/schema";
import { extractSpotifyPlaylistId, fetchSpotifyPlaylistData } from "./socialMedia";
import { db } from "./db";
import { getPaymentUrl, getProductPrice, type ProductType, type OrganizationStatus } from "../shared/paymentHelpers";

// Helper function to check if user is a platform admin (any platform role)
function isPlatformAdmin(user: User | undefined): boolean {
  return user?.platformRole !== null && user?.platformRole !== undefined;
}

// Helper function to check if user is specifically a platform owner
function isPlatformOwner(user: User | undefined): boolean {
  return user?.platformRole === 'PLATFORM_OWNER';
}

// Helper function to check if user has access to an organization (considers frozen status)
// Platform admins always have access, regular users cannot access frozen organizations
async function hasOrgAccess(user: User | undefined, orgId: string, storage: any): Promise<boolean> {
  if (!user) return false;
  
  // Platform admins always have access to all organizations
  if (isPlatformAdmin(user)) return true;
  
  // For regular users, check if they are a member of a non-frozen organization
  const activeOrgs = await storage.getUserActiveOrganizations(user.id);
  return activeOrgs.some((org: any) => org.id === orgId);
}

// Helper function to get accessible organizations for a user (considers frozen status)
// Platform admins see all organizations, regular users only see non-frozen organizations
async function getAccessibleOrganizations(user: User | undefined, userId: string, storage: any): Promise<any[]> {
  if (!user) return [];
  
  // Platform admins see all organizations
  if (isPlatformAdmin(user)) {
    return storage.getUserOrganizations(userId);
  }
  
  // Regular users only see active (non-frozen) organizations
  return storage.getUserActiveOrganizations(userId);
}

// Ensure upload directory exists at startup
const UPLOAD_DIR = '/tmp/uploads';
await fs.mkdir(UPLOAD_DIR, { recursive: true }).catch(() => {});

// Configure multer for file uploads to Google Drive (500MB limit for audio files)
// Use disk storage to prevent memory exhaustion with large files
const fileUpload = multer({ 
  storage: multer.diskStorage({
    destination: UPLOAD_DIR,
    filename: (req, file, cb) => {
      const uniqueName = `${Date.now()}-${crypto.randomBytes(8).toString('hex')}-${file.originalname}`;
      cb(null, uniqueName);
    }
  }),
  limits: {
    fileSize: 500 * 1024 * 1024, // 500MB max for audio/image files
  },
  fileFilter: (req, file, cb) => {
    console.log('[UPLOAD FILTER] Field name:', file.fieldname, 'mimetype:', file.mimetype, 'name:', file.originalname);
    const allowedAudioTypes = ['audio/wav', 'audio/flac', 'audio/x-wav', 'audio/x-flac'];
    const allowedImageTypes = ['image/jpeg', 'image/png', 'image/jpg'];
    
    if (allowedAudioTypes.includes(file.mimetype) || allowedImageTypes.includes(file.mimetype)) {
      console.log('[UPLOAD FILTER] File accepted');
      cb(null, true);
    } else {
      console.log('[UPLOAD FILTER] File rejected - invalid type');
      cb(new Error('Invalid file type. Allowed: WAV, FLAC, JPG, PNG'));
    }
  }
});

// Legacy upload config for reports (XLS files, 10MB limit)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit for XLS files
  },
});

// Configure multer for video uploads (5GB limit for video files)
const videoUpload = multer({
  storage: multer.diskStorage({
    destination: UPLOAD_DIR,
    filename: (req, file, cb) => {
      const uniqueName = `${Date.now()}-${crypto.randomBytes(8).toString('hex')}-${file.originalname}`;
      cb(null, uniqueName);
    }
  }),
  limits: {
    fileSize: 5 * 1024 * 1024 * 1024, // 5GB max for video files
  },
  fileFilter: (req, file, cb) => {
    console.log('[VIDEO UPLOAD FILTER] Field name:', file.fieldname, 'mimetype:', file.mimetype, 'name:', file.originalname);
    const allowedVideoTypes = ['video/mp4', 'video/quicktime', 'video/x-quicktime'];
    
    if (allowedVideoTypes.includes(file.mimetype)) {
      console.log('[VIDEO UPLOAD FILTER] Video file accepted');
      cb(null, true);
    } else {
      console.log('[VIDEO UPLOAD FILTER] File rejected - invalid type');
      cb(new Error('Invalid file type. Allowed: MP4, MOV'));
    }
  }
});

// Configure multer for chunked uploads (accepts binary chunks, 15MB limit per chunk)
const chunkUpload = multer({
  storage: multer.diskStorage({
    destination: UPLOAD_DIR,
    filename: (req, file, cb) => {
      const uniqueName = `chunk-${Date.now()}-${crypto.randomBytes(8).toString('hex')}`;
      cb(null, uniqueName);
    }
  }),
  limits: {
    fileSize: 15 * 1024 * 1024, // 15MB max per chunk (10MB + buffer)
  },
  fileFilter: (req, file, cb) => {
    console.log('[CHUNK UPLOAD FILTER] Field name:', file.fieldname, 'mimetype:', file.mimetype);
    // Accept any binary data for chunks
    cb(null, true);
  }
});

// Configure multer for animated artwork uploads (MP4/MOV, 250MB limit)
const animatedArtworkUpload = multer({
  storage: multer.diskStorage({
    destination: UPLOAD_DIR,
    filename: (req, file, cb) => {
      const uniqueName = `${Date.now()}-${crypto.randomBytes(8).toString('hex')}-${file.originalname}`;
      cb(null, uniqueName);
    }
  }),
  limits: {
    fileSize: 250 * 1024 * 1024, // 250MB max for animated artwork
  },
  fileFilter: (req, file, cb) => {
    console.log('[ANIMATED ARTWORK UPLOAD] Field name:', file.fieldname, 'mimetype:', file.mimetype, 'name:', file.originalname);
    const allowedVideoTypes = ['video/mp4', 'video/quicktime', 'video/x-quicktime'];
    
    if (allowedVideoTypes.includes(file.mimetype)) {
      console.log('[ANIMATED ARTWORK UPLOAD] File accepted');
      cb(null, true);
    } else {
      console.log('[ANIMATED ARTWORK UPLOAD] File rejected - invalid type');
      cb(new Error('Invalid file type. Allowed: MP4, MOV'));
    }
  }
});

// Configure multer for news media uploads (images + PDF, 20MB limit)
const newsMediaUpload = multer({
  storage: multer.diskStorage({
    destination: UPLOAD_DIR,
    filename: (req, file, cb) => {
      const uniqueName = `${Date.now()}-${crypto.randomBytes(8).toString('hex')}-${file.originalname}`;
      cb(null, uniqueName);
    }
  }),
  limits: {
    fileSize: 20 * 1024 * 1024, // 20MB max for news media
  },
  fileFilter: (req, file, cb) => {
    console.log('[NEWS MEDIA UPLOAD] Field name:', file.fieldname, 'mimetype:', file.mimetype, 'name:', file.originalname);
    const allowedImageTypes = ['image/jpeg', 'image/png', 'image/jpg', 'image/webp'];
    const allowedDocTypes = ['application/pdf'];
    
    if (allowedImageTypes.includes(file.mimetype) || allowedDocTypes.includes(file.mimetype)) {
      console.log('[NEWS MEDIA UPLOAD] File accepted');
      cb(null, true);
    } else {
      console.log('[NEWS MEDIA UPLOAD] File rejected - invalid type');
      cb(new Error('Invalid file type. Allowed: JPG, PNG, WEBP, PDF'));
    }
  }
});

// Google Drive folder ID for platform news media
const NEWS_MEDIA_FOLDER_ID = '1q_UhJlKVTEVoSD7v5TkWdBGgHoc7-RUa';

// Helper function to read file from disk and auto-cleanup
async function readAndCleanupFile(filePath: string): Promise<Buffer> {
  try {
    const buffer = await fs.readFile(filePath);
    return buffer;
  } finally {
    // Always cleanup temp file, even if read fails
    try {
      await fs.unlink(filePath);
    } catch (err) {
      console.error('[CLEANUP] Failed to delete temp file:', filePath, err);
    }
  }
}

// Auth user types
interface ReplitAuthUser {
  claims: {
    sub: string;
    email?: string;
    [key: string]: any;
  };
  access_token: string;
  refresh_token?: string;
  expires_at?: number;
}

interface GoogleAuthUser extends User {
  id: string;
}

type AuthenticatedUser = ReplitAuthUser | GoogleAuthUser;

// Helper function to extract user ID from either auth type
function getUserId(user: AuthenticatedUser): string {
  if ('claims' in user) {
    // Replit Auth user
    return user.claims.sub;
  } else {
    // Google OAuth user
    return user.id;
  }
}

// Type for track metadata
interface TrackMetadata {
  title: string;
  isrc?: string;
  isrcRequested?: boolean;
  explicitContent?: string;
  aiGenerated?: boolean;
  primaryGenre?: string;
  secondaryGenre?: string;
  lyrics?: string;
  version?: string;
  contributors?: any[];
  audioFileUrl?: string;
  tiktokClipStart?: number;
}

export async function registerRoutes(app: Express): Promise<Server> {
  console.log("❤️ ROUTES SETUP STARTED - THIS SHOULD APPEAR IN LOGS");
  
  if (process.env.NODE_ENV === "production") {
    setTimeout(() => initializeBinaries(), 2000);
  }
  
  // Add EARLY middleware to log ALL requests - DEBUGGING
  // Skip health check endpoints for faster response
  app.use((req, res, next) => {
    if (req.path === '/health' || (req.path === '/' && req.method === 'GET')) {
      return next();
    }
    console.log("❤️ REQUEST:", req.method, req.path);
    next();
  });
  
  // Body parsers - but skip for upload routes
  const bodyParser = await import('express');
  app.use((req, res, next) => {
    if (req.path === '/api/upload' || req.path.includes('/audio') || req.path.includes('/upload-video')) {
      return next();
    }
    bodyParser.default.json({ limit: '550mb' })(req, res, next);
  });
  
  app.use((req, res, next) => {
    if (req.path === '/api/upload' || req.path.includes('/audio') || req.path.includes('/upload-video')) {
      return next();
    }
    bodyParser.default.urlencoded({ extended: false, limit: '550mb' })(req, res, next);
  });

  // Auth middleware
  await setupAuth(app);
  
  // Universal passport serialization for both auth types
  passport.serializeUser((user: any, done) => {
    // Store only user ID in session
    done(null, user.id);
  });

  passport.deserializeUser(async (userId: string, done) => {
    try {
      // Fetch fresh user data from database
      const user = await storage.getUser(userId);
      if (!user) {
        return done(null, false);
      }
      // Remove sensitive fields before returning
      const { passwordHash, ...safeUser } = user;
      done(null, safeUser);
    } catch (error) {
      done(error, null);
    }
  });
  
  // Local Auth setup (email/password)
  setupLocalAuthRoutes(app);

  // User activity tracking middleware for DAU and session duration
  // Skip health check endpoints for faster response
  app.use(async (req: any, res, next) => {
    // Skip health checks - they should be fast
    if (req.path === '/health' || (req.path === '/' && req.method === 'GET')) {
      return next();
    }
    try {
      if (req.isAuthenticated && req.isAuthenticated() && req.user) {
        const userId = getUserId(req.user);
        if (userId) {
          const now = new Date();
          const dateStr = now.toISOString().split('T')[0];
          
          // Upsert activity record (update lastActivity if exists, or create new)
          await db.insert(userActivity)
            .values({
              userId,
              date: dateStr,
              sessionStart: now,
              lastActivity: now,
              requestCount: 1,
            })
            .onConflictDoUpdate({
              target: [userActivity.userId, userActivity.date],
              set: {
                lastActivity: now,
                requestCount: sql`${userActivity.requestCount} + 1`,
              },
            });
        }
      }
    } catch (error) {
      // Silent fail - don't block requests if tracking fails
      console.error('[Activity Tracking] Error:', error);
    }
    next();
  });

  // Set password endpoint
  // Change password (requires current password verification)
  app.post("/api/auth/change-password", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as User;
      const { currentPassword, newPassword } = req.body;

      // Validate inputs
      if (!currentPassword || typeof currentPassword !== 'string') {
        return res.status(400).json({ message: "Current password is required" });
      }
      if (!newPassword || typeof newPassword !== 'string') {
        return res.status(400).json({ message: "New password is required" });
      }

      if (newPassword.length < 8 || newPassword.length > 32) {
        return res.status(400).json({ message: "Password must be 8-32 characters long" });
      }

      // Check for at least one digit and one letter
      const hasDigit = /\d/.test(newPassword);
      const hasLetter = /[a-zA-Z]/.test(newPassword);

      if (!hasDigit || !hasLetter) {
        return res.status(400).json({ message: "Password must contain at least one letter and one digit" });
      }

      // Get user's current password hash
      const dbUser = await storage.getUser(user.id);
      if (!dbUser || !dbUser.passwordHash) {
        return res.status(400).json({ message: "User not found or no password set" });
      }

      // Verify current password
      const isValidPassword = await bcrypt.compare(currentPassword, dbUser.passwordHash);
      if (!isValidPassword) {
        return res.status(400).json({ message: "Current password is incorrect" });
      }

      // Hash new password
      const salt = await bcrypt.genSalt(10);
      const passwordHash = await bcrypt.hash(newPassword, salt);

      // Save to database
      await storage.setUserPassword(user.id, passwordHash);

      res.json({ success: true, message: "Password changed successfully" });
    } catch (error) {
      console.error("Error changing password:", error);
      res.status(500).json({ message: "Failed to change password" });
    }
  });

  app.post("/api/auth/set-password", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as User;
      const { password } = req.body;

      // Validate password
      if (!password || typeof password !== 'string') {
        return res.status(400).json({ message: "Password is required" });
      }

      if (password.length < 8 || password.length > 32) {
        return res.status(400).json({ message: "Password must be 8-32 characters long" });
      }

      // Check for at least one digit and one letter
      const hasDigit = /\d/.test(password);
      const hasLetter = /[a-zA-Z]/.test(password);

      if (!hasDigit || !hasLetter) {
        return res.status(400).json({ message: "Password must contain at least one letter and one digit" });
      }

      // Hash password
      const salt = await bcrypt.genSalt(10);
      const passwordHash = await bcrypt.hash(password, salt);

      // Save to database
      await storage.setUserPassword(user.id, passwordHash);

      res.json({ success: true, message: "Password set successfully" });
    } catch (error) {
      console.error("Error setting password:", error);
      res.status(500).json({ message: "Failed to set password" });
    }
  });

  // Helper function for UPC generation
  const generateValidUPC = (): string => {
    // For music industry, common prefixes are 0-9
    const prefix = Math.floor(Math.random() * 10).toString();
    
    // Generate 10 random digits for the main part
    let mainPart = '';
    for (let i = 0; i < 10; i++) {
      mainPart += Math.floor(Math.random() * 10).toString();
    }
    
    // Calculate check digit using UPC algorithm
    const digits = prefix + mainPart;
    let oddSum = 0;
    let evenSum = 0;
    
    for (let i = 0; i < 11; i++) {
      const digit = parseInt(digits[i]);
      if (i % 2 === 0) {
        oddSum += digit;
      } else {
        evenSum += digit;
      }
    }
    
    const checkDigit = (10 - ((oddSum * 3 + evenSum) % 10)) % 10;
    return digits + checkDigit.toString();
  };

  // Generate UPC code
  app.post("/api/generate-upc", isAuthenticated, async (req, res) => {
    try {
      const upc = generateValidUPC();
      res.json({ upc });
    } catch (error) {
      console.error("Error generating UPC:", error);
      res.status(500).json({ error: "Failed to generate UPC" });
    }
  });

  // Helper function for ISRC generation
  const generateValidISRC = (): string => {
    // Use UA for Ukraine as country code
    const countryCode = "UA";
    
    // Generate 3-character registrant code (alphanumeric)
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    let registrantCode = "";
    for (let i = 0; i < 3; i++) {
      registrantCode += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    
    // Use current year (last 2 digits)
    const year = new Date().getFullYear().toString().slice(-2);
    
    // Generate 5-digit designation code
    const designationCode = Math.floor(Math.random() * 100000).toString().padStart(5, '0');
    
    return `${countryCode}-${registrantCode}-${year}-${designationCode}`;
  };

  // Generate ISRC code
  app.post("/api/generate-isrc", isAuthenticated, async (req, res) => {
    try {
      const isrc = generateValidISRC();
      res.json({ isrc });
    } catch (error) {
      console.error("Error generating ISRC:", error);
      res.status(500).json({ error: "Failed to generate ISRC" });
    }
  });

  // ==================== RELEASE DRAFTS API ====================

  // Get all drafts for user's organization
  app.get("/api/drafts", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req.user as AuthenticatedUser);
      if (!userId) {
        return res.status(401).json({ error: "User not authenticated" });
      }

      const type = req.query.type as "RELEASE" | "VIDEO" | undefined;
      const targetOrgId = req.query.targetOrgId as string | undefined;
      const currentUser = await storage.getUser(userId);
      const isPlatformAdminUser = isPlatformAdmin(currentUser);

      // Admin mode: get drafts for specific target organization
      if (targetOrgId && isPlatformAdminUser) {
        const drafts = await storage.getReleaseDraftsByOrg(targetOrgId, type);
        return res.json(drafts);
      }

      // Normal mode: get drafts for current user's organization
      const userOrgs = await storage.getUserActiveOrganizations(userId);

      if (userOrgs.length === 0) {
        return res.json([]);
      }

      // Get drafts for user's first organization
      const orgId = userOrgs[0].id;
      const drafts = await storage.getReleaseDraftsByOrg(orgId, type);
      
      // Filter by access: user can see their own drafts or if they are org OWNER/ADMIN
      const orgMember = await storage.getOrgMember(orgId, userId);
      const canSeeAll = orgMember?.role === "OWNER" || orgMember?.role === "ADMIN" || isPlatformAdminUser;
      
      const visibleDrafts = canSeeAll 
        ? drafts 
        : drafts.filter(d => d.createdByUserId === userId);

      res.json(visibleDrafts);
    } catch (error) {
      console.error("Error fetching drafts:", error);
      res.status(500).json({ error: "Failed to fetch drafts" });
    }
  });

  // Get single draft by ID
  app.get("/api/drafts/:id", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req.user as AuthenticatedUser);
      if (!userId) {
        return res.status(401).json({ error: "User not authenticated" });
      }

      const draft = await storage.getReleaseDraft(req.params.id);
      if (!draft) {
        return res.status(404).json({ error: "Draft not found" });
      }

      // Check access
      const currentUser = await storage.getUser(userId);
      const orgMember = await storage.getOrgMember(draft.orgId, userId);
      const isCreator = draft.createdByUserId === userId;
      const isOrgAdmin = orgMember?.role === "OWNER" || orgMember?.role === "ADMIN";
      const isPlatformAdminUser = isPlatformAdmin(currentUser);

      if (!isCreator && !isOrgAdmin && !isPlatformAdminUser) {
        return res.status(403).json({ error: "Access denied" });
      }

      res.json(draft);
    } catch (error) {
      console.error("Error fetching draft:", error);
      res.status(500).json({ error: "Failed to fetch draft" });
    }
  });

  // Create new draft
  app.post("/api/drafts", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req.user as AuthenticatedUser);
      if (!userId) {
        return res.status(401).json({ error: "User not authenticated" });
      }

      const userOrgs = await storage.getUserActiveOrganizations(userId);
      if (userOrgs.length === 0) {
        return res.status(400).json({ error: "No organization found" });
      }

      const { type = "RELEASE", payload, title, currentStep = 0 } = req.body;
      
      // Validate payload size (max 1MB)
      const payloadStr = JSON.stringify(payload || {});
      if (payloadStr.length > 1024 * 1024) {
        return res.status(400).json({ error: "Payload too large (max 1MB)" });
      }

      const draft = await storage.createReleaseDraft({
        orgId: userOrgs[0].id,
        createdByUserId: userId,
        type,
        title: title || null,
        currentStep,
        payload: payload || {},
      });

      res.status(201).json(draft);
    } catch (error) {
      console.error("Error creating draft:", error);
      res.status(500).json({ error: "Failed to create draft" });
    }
  });

  // Update draft (with optimistic locking)
  app.patch("/api/drafts/:id", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req.user as AuthenticatedUser);
      if (!userId) {
        return res.status(401).json({ error: "User not authenticated" });
      }

      const draft = await storage.getReleaseDraft(req.params.id);
      if (!draft) {
        return res.status(404).json({ error: "Draft not found" });
      }

      // Check access
      const currentUser = await storage.getUser(userId);
      const orgMember = await storage.getOrgMember(draft.orgId, userId);
      const isCreator = draft.createdByUserId === userId;
      const isOrgAdmin = orgMember?.role === "OWNER" || orgMember?.role === "ADMIN";

      if (!isCreator && !isOrgAdmin) {
        return res.status(403).json({ error: "Access denied" });
      }

      const { payload, title, currentStep, version } = req.body;
      
      // Version is required for optimistic locking
      if (typeof version !== "number") {
        return res.status(400).json({ error: "Version is required" });
      }

      // Validate payload size (max 1MB)
      if (payload) {
        const payloadStr = JSON.stringify(payload);
        if (payloadStr.length > 1024 * 1024) {
          return res.status(400).json({ error: "Payload too large (max 1MB)" });
        }
      }

      const result = await storage.updateReleaseDraft(
        req.params.id,
        {
          ...(payload !== undefined && { payload }),
          ...(title !== undefined && { title }),
          ...(currentStep !== undefined && { currentStep }),
          updatedByUserId: userId,
        },
        version
      );

      if (result.conflict) {
        return res.status(409).json({ 
          error: "Conflict: draft was modified by another user",
          currentDraft: result.currentDraft
        });
      }

      if (!result.draft) {
        return res.status(404).json({ error: "Draft not found" });
      }

      res.json(result.draft);
    } catch (error) {
      console.error("Error updating draft:", error);
      res.status(500).json({ error: "Failed to update draft" });
    }
  });

  // Archive draft (soft delete)
  app.post("/api/drafts/:id/archive", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req.user as AuthenticatedUser);
      if (!userId) {
        return res.status(401).json({ error: "User not authenticated" });
      }

      const draft = await storage.getReleaseDraft(req.params.id);
      if (!draft) {
        return res.status(404).json({ error: "Draft not found" });
      }

      // Check access
      const currentUser = await storage.getUser(userId);
      const orgMember = await storage.getOrgMember(draft.orgId, userId);
      const isCreator = draft.createdByUserId === userId;
      const isOrgAdmin = orgMember?.role === "OWNER" || orgMember?.role === "ADMIN";
      const isPlatformAdminUser = isPlatformAdmin(currentUser);

      if (!isCreator && !isOrgAdmin && !isPlatformAdminUser) {
        return res.status(403).json({ error: "Access denied" });
      }

      await storage.archiveReleaseDraft(req.params.id);
      res.json({ success: true });
    } catch (error) {
      console.error("Error archiving draft:", error);
      res.status(500).json({ error: "Failed to archive draft" });
    }
  });

  // Delete draft permanently
  app.delete("/api/drafts/:id", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req.user as AuthenticatedUser);
      if (!userId) {
        return res.status(401).json({ error: "User not authenticated" });
      }

      const draft = await storage.getReleaseDraft(req.params.id);
      if (!draft) {
        return res.status(404).json({ error: "Draft not found" });
      }

      // Only creator or platform admin can permanently delete
      const currentUser = await storage.getUser(userId);
      const isCreator = draft.createdByUserId === userId;
      const isPlatformAdminUser = isPlatformAdmin(currentUser);

      if (!isCreator && !isPlatformAdminUser) {
        return res.status(403).json({ error: "Only the creator can delete this draft" });
      }

      await storage.deleteReleaseDraft(req.params.id);
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting draft:", error);
      res.status(500).json({ error: "Failed to delete draft" });
    }
  });

  // ==================== END RELEASE DRAFTS API ====================

  // Create release endpoint
  app.post("/api/releases", isAuthenticated, async (req, res) => {
    console.log("🚀 POST /api/releases called");
    console.log("📦 Request body:", JSON.stringify(req.body, null, 2));
    
    try {
      const userId = getUserId(req.user as AuthenticatedUser);
      console.log("👤 User ID:", userId);
      if (!userId) {
        console.log("❌ User not authenticated");
        return res.status(401).json({ error: "User not authenticated" });
      }

      // New simplified payload path
      if (!req.body.releaseMetadata) {
        let { orgId, artistId, ...rest } = req.body;

        // Determine organization with security checks
        const currentUser = await storage.getUser(userId);
        let userOrgs = await storage.getUserOrganizations(userId);
        
        if (!orgId) {
          // No orgId provided - use user's organization or create default
          if (userOrgs.length === 0) {
            const org = await storage.createOrganization({
              name: "My Music",
              type: "ARTIST_ORG",
            });
            await storage.addOrgMember(org.id, userId, "OWNER");
            orgId = org.id;
            userOrgs = [org];
          } else {
            orgId = userOrgs[0].id;
          }
        } else {
          // orgId provided - verify user is Admin OR member of that organization
          if (!isPlatformAdmin(currentUser)) {
            const isMember = userOrgs.some(org => org.id === orgId);
            if (!isMember) {
              console.log("❌ Security violation: Non-admin user tried to create release for another organization");
              return res.status(403).json({ 
                error: "Access denied. You can only create releases for your own organization." 
              });
            }
          } else {
            console.log("✅ Admin creating release for organization:", orgId);
          }
        }

        // Determine artist with validation - with safe fallback
        // Priority: 1) rest.performers[0] 2) rest.tracksMetadata[0].performers (main_performer) 3) rest.tracksMetadata[0].contributors (main_performer)
        let performerName = rest.performers?.[0]?.name?.trim();
        
        if (!performerName && rest.tracksMetadata?.[0]) {
          // Fallback to first track's performers
          const firstTrackPerformers = rest.tracksMetadata[0].performers || [];
          const mainPerformer = firstTrackPerformers.find((p: any) => p.role === 'main_performer');
          performerName = mainPerformer?.name?.trim() || firstTrackPerformers[0]?.name?.trim();
          
          // Also check contributors array
          if (!performerName) {
            const firstTrackContributors = rest.tracksMetadata[0].contributors || [];
            const mainContributor = firstTrackContributors.find((c: any) => c.role === 'main_performer');
            performerName = mainContributor?.name?.trim() || '';
          }
        }
        
        // Validate performer name
        if (!performerName) {
          console.log("❌ Missing performer name in release data (old path)");
          return res.status(400).json({ 
            error: "Основний виконавець обов'язковий. Будь ласка, вкажіть ім'я виконавця.",
            code: "MISSING_PERFORMER"
          });
        }
        
        console.log("🎤 Determined performer name (old path):", performerName);
        let artists = await storage.getArtists(orgId);
        
        // Get organization to check type
        const org = await storage.getOrganization(orgId);
        
        // For ARTIST_ORG: ALWAYS create/use artist based on performer name, ignore any provided artistId
        if (org?.type === "ARTIST_ORG") {
          if (artists.length > 0) {
            // Existing ARTIST_ORG: validate performer matches original artist
            // UNLESS user is Platform Admin (admins can create releases for any artist)
            const firstArtist = artists[0];
            const isAdmin = isPlatformAdmin(currentUser);
            
            if (!isAdmin && performerName !== firstArtist.name) {
              return res.status(400).json({ 
                error: "Для рівня доступу Artist перший виконавець має бути " + firstArtist.name,
                expectedArtist: firstArtist.name,
                providedArtist: performerName
              });
            }
            
            // For Platform Admin: allow creating new artist if performer name differs
            if (isAdmin && performerName !== firstArtist.name) {
              const existingArtist = artists.find(a => a.name === performerName);
              if (existingArtist) {
                artistId = existingArtist.id;
              } else {
                const artist = await storage.createArtist({
                  orgId,
                  name: performerName,
                });
                artistId = artist.id;
              }
            } else {
              artistId = firstArtist.id;
            }
          } else {
            // First release for ARTIST_ORG: create artist from performer name
            const artist = await storage.createArtist({
              orgId,
              name: performerName,
            });
            artistId = artist.id;
          }
        } else if (!artistId) {
          // For LABEL/TEAM/ADMIN without artistId: find or create based on performer name
          let artist = artists.find(a => a.name === performerName);
          
          if (!artist) {
            artist = await storage.createArtist({
              orgId,
              name: performerName,
            });
          }
          
          artistId = artist.id;
        }
        // If artistId provided and LABEL/TEAM/ADMIN, use it as is

        // Determine payment status: Platform Admins and orgs with freeReleases get auto-paid
        const organization = await storage.getOrganization(orgId);
        const skipPayment = isPlatformAdmin(currentUser) || (organization?.freeReleases === true);
        const paymentStatus = skipPayment ? 'PAID' as const : 'PENDING' as const;

        const releaseData = insertReleaseSchema.parse({
          ...rest,
          orgId,
          artistId,
          paymentStatus,
          releaseDate: rest.releaseDate ? new Date(rest.releaseDate) : null,
          originalReleaseDate: rest.originalReleaseDate ? new Date(rest.originalReleaseDate) : null,
        });

        const release = await storage.createRelease(releaseData);
        
        // Sync artist profile URLs to organization settings (if provided and org doesn't have them yet)
        if (rest.spotifyArtistUrl || rest.appleMusicArtistUrl) {
          const updateOrgData: Record<string, string> = {};
          if (rest.spotifyArtistUrl && !organization?.spotifyUrl) {
            updateOrgData.spotifyUrl = rest.spotifyArtistUrl;
          }
          if (rest.appleMusicArtistUrl && !organization?.appleMusicUrl) {
            updateOrgData.appleMusicUrl = rest.appleMusicArtistUrl;
          }
          if (Object.keys(updateOrgData).length > 0) {
            await storage.updateOrganization(orgId, updateOrgData);
            console.log("✅ Synced artist profile URLs to organization settings:", updateOrgData);
          }
        }
        
        // Find all admins and notify them about new release (organization already fetched above)
        const { db: database } = await import("./db");
        const { users: usersTable } = await import("@shared/schema");
        const { eq: eqFn } = await import("drizzle-orm");
        
        const admins = await database.select().from(usersTable).where(eqFn(usersTable.role, "ADMIN"));
        const notificationTitle = "Новий реліз створено";
        const notificationMessage = `${organization?.name || "Організація"}, ${release.title}`;
        
        for (const admin of admins) {
          await storage.createNotification({
            userId: admin.id,
            releaseId: release.id,
            pitchingId: null,
            relatedEntityType: null,
            relatedEntityId: null,
            title: notificationTitle,
            message: notificationMessage,
            type: "RELEASE_CREATED",
            changedFields: null,
            isRead: false,
          });
        }
        
        // Send email notification to admin (fire and forget - non-blocking)
        const { sendNotificationEmail } = await import("./googleMail");
        void sendNotificationEmail(notificationTitle, notificationMessage, "RELEASE_CREATED").catch(err => {
          console.error('[EMAIL] Failed to send notification email:', err);
        });
        
        // Send Telegram notification to admin (fire and forget - non-blocking)
        const { sendTelegramNotification } = await import("./telegram");
        void sendTelegramNotification(notificationTitle, notificationMessage).catch(err => {
          console.error('[TELEGRAM] Failed to send notification:', err);
        });
        
        return res.json(release);
      }

      // Legacy payload path
      
      const { releaseMetadata, tracksMetadata, selectedTerritories, orgId: requestOrgId } = req.body;
      console.log("📄 Extracted data:", { releaseMetadata, tracksMetadata, selectedTerritories, orgId: requestOrgId });

      if (!releaseMetadata || !tracksMetadata || !selectedTerritories) {
        return res.status(400).json({ error: "Missing required data" });
      }

      // Determine organization with security checks
      const currentUser = await storage.getUser(userId);
      let userOrgs = await storage.getUserOrganizations(userId);
      let orgId: string;
      
      if (requestOrgId) {
        // orgId provided - verify user is Admin OR member of that organization
        if (!isPlatformAdmin(currentUser)) {
          const isMember = userOrgs.some(org => org.id === requestOrgId);
          if (!isMember) {
            console.log("❌ Security violation: Non-admin user tried to create release for another organization");
            return res.status(403).json({ 
              error: "Access denied. You can only create releases for your own organization." 
            });
          }
          orgId = requestOrgId;
        } else {
          console.log("✅ Admin creating release for organization:", requestOrgId);
          orgId = requestOrgId;
        }
      } else {
        // No orgId provided - use user's organization or create default
        if (userOrgs.length === 0) {
          // Create a default organization for the user
          const org = await storage.createOrganization({
            name: "My Music",
            type: "ARTIST_ORG",
          });
          await storage.addOrgMember(org.id, userId, "OWNER");
          orgId = org.id;
        } else {
          orgId = userOrgs[0].id;
        }
      }

      // Get or create artist - with safe fallback to first track's main performer
      // Priority: 1) releaseMetadata.performers[0] 2) tracksMetadata[0].performers (main_performer role) 3) tracksMetadata[0].contributors (main_performer role)
      let performerName = releaseMetadata.performers?.[0]?.name?.trim();
      
      if (!performerName && tracksMetadata?.[0]) {
        // Fallback to first track's performers (look for main_performer role first)
        const firstTrackPerformers = tracksMetadata[0].performers || [];
        const mainPerformer = firstTrackPerformers.find((p: any) => p.role === 'main_performer');
        performerName = mainPerformer?.name?.trim() || firstTrackPerformers[0]?.name?.trim();
        
        // Also check contributors array (performers might be merged into contributors)
        if (!performerName) {
          const firstTrackContributors = tracksMetadata[0].contributors || [];
          const mainContributor = firstTrackContributors.find((c: any) => c.role === 'main_performer');
          performerName = mainContributor?.name?.trim() || '';
        }
      }
      
      // Validate that we have a valid performer name
      if (!performerName) {
        console.log("❌ Missing performer name in release data");
        return res.status(400).json({ 
          error: "Основний виконавець обов'язковий. Будь ласка, вкажіть ім'я виконавця.",
          code: "MISSING_PERFORMER"
        });
      }
      
      console.log("🎤 Determined performer name:", performerName);
      let artists = await storage.getArtists(orgId);
      
      // Get organization to check type
      const org = await storage.getOrganization(orgId);
      
      let artistId: string;
      
      // For ARTIST_ORG: first main performer MUST match the original artist
      // UNLESS user is Platform Admin (admins can create releases for any artist)
      if (org?.type === "ARTIST_ORG" && artists.length > 0) {
        const firstArtist = artists[0];
        const isAdmin = isPlatformAdmin(currentUser);
        
        if (!isAdmin && performerName !== firstArtist.name) {
          return res.status(400).json({ 
            error: "Для рівня доступу Artist перший виконавець має бути " + firstArtist.name,
            expectedArtist: firstArtist.name,
            providedArtist: performerName
          });
        }
        
        // For Platform Admin: allow creating new artist if performer name differs
        if (isAdmin && performerName !== firstArtist.name) {
          const existingArtist = artists.find(a => a.name === performerName);
          if (existingArtist) {
            artistId = existingArtist.id;
          } else {
            const artist = await storage.createArtist({
              orgId,
              name: performerName,
            });
            artistId = artist.id;
          }
        } else {
          artistId = firstArtist.id;
        }
      } else {
        // For LABEL/TEAM/ADMIN or first release: allow any artist name
        // Try to find artist with matching name
        let artist = artists.find(a => a.name === performerName);
        
        if (!artist) {
          // Create new artist if no match found
          artist = await storage.createArtist({
            orgId,
            name: performerName,
          });
        }
        
        artistId = artist.id;
      }

      // Determine payment status: Platform Admins and orgs with freeReleases get auto-paid
      const organization = await storage.getOrganization(orgId);
      const skipPayment = isPlatformAdmin(currentUser) || (organization?.freeReleases === true);
      const paymentStatus = skipPayment ? 'PAID' as const : 'PENDING' as const;

      // Calculate animated artwork fee based on organization type
      // Check both new format (3x4/1x1) and legacy format
      let animatedArtworkFee = 0;
      const hasAnimatedArtwork = releaseMetadata.animatedArtwork3x4FileId || releaseMetadata.animatedArtwork1x1FileId || releaseMetadata.animatedArtworkFileId;
      if (hasAnimatedArtwork) {
        if (organization?.freeReleases) {
          animatedArtworkFee = 0; // Free for orgs with freeReleases
        } else if (organization?.type === 'AMBASSADOR') {
          animatedArtworkFee = 10000; // 100 UAH in cents for ambassadors
        } else {
          animatedArtworkFee = 25000; // 250 UAH in cents for regular orgs
        }
      }

      // Prepare release data
      const releaseData = {
        orgId,
        artistId,
        type: (tracksMetadata.length === 1
          ? "SINGLE"
          : tracksMetadata.length <= 6
          ? "EP"
          : "ALBUM") as "SINGLE" | "EP" | "ALBUM",
        title: releaseMetadata.title,
        upc: releaseMetadata.upc,
        upcRequested: releaseMetadata.upcRequested || false,
        primaryGenre: releaseMetadata.primaryGenre,
        secondaryGenre: releaseMetadata.secondaryGenre,
        language: releaseMetadata.language,
        albumVersion: releaseMetadata.albumVersion,
        originalReleaseDate: releaseMetadata.originalReleaseDate
          ? new Date(releaseMetadata.originalReleaseDate)
          : null,
        releaseDate: releaseMetadata.releaseDate
          ? new Date(releaseMetadata.releaseDate)
          : null,
        subLabel: releaseMetadata.subLabel,
        territories: selectedTerritories,
        performers: releaseMetadata.performers,
        artworkUrl: releaseMetadata.artworkUrl || null,
        artworkFileId: releaseMetadata.artworkFileId || (releaseMetadata.artworkUrl ? extractFileIdFromUrl(releaseMetadata.artworkUrl) : null),
        // Animated artwork for Apple Music - new two-file format (3x4 and 1x1)
        animatedArtwork3x4FileId: releaseMetadata.animatedArtwork3x4FileId || null,
        animatedArtwork3x4FileName: releaseMetadata.animatedArtwork3x4FileName || null,
        animatedArtwork3x4Size: releaseMetadata.animatedArtwork3x4Size || null,
        animatedArtwork1x1FileId: releaseMetadata.animatedArtwork1x1FileId || null,
        animatedArtwork1x1FileName: releaseMetadata.animatedArtwork1x1FileName || null,
        animatedArtwork1x1Size: releaseMetadata.animatedArtwork1x1Size || null,
        // Legacy fields (for backwards compatibility)
        animatedArtworkFileId: releaseMetadata.animatedArtworkFileId || null,
        animatedArtworkFileName: releaseMetadata.animatedArtworkFileName || null,
        animatedArtworkSize: releaseMetadata.animatedArtworkSize || null,
        animatedArtworkFeeApplied: animatedArtworkFee > 0 ? animatedArtworkFee : null,
        status: "DRAFT" as const,
        paymentStatus,
        // Track debut release status
        isDebut: releaseMetadata.isDebut ?? null,
      };

      // Create release
      const release = await storage.createRelease(releaseData);
      
      // Create tracks
      const tracksToCreate = tracksMetadata.map(
        (track: TrackMetadata, index: number) => ({
          releaseId: release.id,
          title: track.title,
          isrc: track.isrc,
          isrcRequested: track.isrcRequested || false,
          trackIndex: index + 1,
          explicit: track.explicitContent === "yes",
          aiGenerated: track.aiGenerated || false,
          primaryGenre: track.primaryGenre,
          secondaryGenre: track.secondaryGenre,
          lyrics: track.lyrics,
          version: track.version,
          participants: track.contributors,
          audioUrl: track.audioFileUrl || null,
          tiktokClipStart: track.tiktokClipStart || null,
          tiktokPreviewDate: track.tiktokPreviewDate ? new Date(track.tiktokPreviewDate) : null,
        })
      );

      // Create all tracks
      const tracks = await Promise.all(
        tracksToCreate.map((track: typeof tracksToCreate[0]) =>
          storage.createTrack(track)
        )
      );
      
      // Sync artist profile URLs to organization settings (if provided and org doesn't have them yet)
      if (releaseMetadata.spotifyArtistUrl || releaseMetadata.appleMusicArtistUrl) {
        const updateOrgData: Record<string, string> = {};
        if (releaseMetadata.spotifyArtistUrl && !organization?.spotifyUrl) {
          updateOrgData.spotifyUrl = releaseMetadata.spotifyArtistUrl;
        }
        if (releaseMetadata.appleMusicArtistUrl && !organization?.appleMusicUrl) {
          updateOrgData.appleMusicUrl = releaseMetadata.appleMusicArtistUrl;
        }
        if (Object.keys(updateOrgData).length > 0) {
          await storage.updateOrganization(orgId, updateOrgData);
          console.log("✅ Synced artist profile URLs to organization settings:", updateOrgData);
        }
      }

      // Find all admins and notify them about new release (organization already fetched above)
      const { db: database } = await import("./db");
      const { users: usersTable } = await import("@shared/schema");
      const { eq: eqFn } = await import("drizzle-orm");
      
      const admins = await database.select().from(usersTable).where(eqFn(usersTable.role, "ADMIN"));
      const notificationTitle = "Новий реліз створено";
      const notificationMessage = `${organization?.name || "Організація"}, ${release.title}`;
      
      for (const admin of admins) {
        await storage.createNotification({
          userId: admin.id,
          releaseId: release.id,
          pitchingId: null,
          relatedEntityType: null,
          relatedEntityId: null,
          title: notificationTitle,
          message: notificationMessage,
          type: "RELEASE_CREATED",
          changedFields: null,
          isRead: false,
        });
      }
      
      // Send email notification to admin (fire and forget - non-blocking)
      const { sendNotificationEmail } = await import("./googleMail");
      void sendNotificationEmail(notificationTitle, notificationMessage, "RELEASE_CREATED").catch(err => {
        console.error('[EMAIL] Failed to send notification email:', err);
      });
      
      // Send Telegram notification to admin (fire and forget - non-blocking)
      const { sendTelegramNotification } = await import("./telegram");
      void sendTelegramNotification(notificationTitle, notificationMessage).catch(err => {
        console.error('[TELEGRAM] Failed to send notification:', err);
      });

      res.json({ release, tracks });
    } catch (error) {
      console.error("Error creating release:", error);
      res.status(500).json({ error: "Failed to create release" });
    }
  });

  // Get releases endpoint
  app.get("/api/releases", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req.user as AuthenticatedUser);
      if (!userId) {
        return res.status(401).json({ error: "User not authenticated" });
      }

      // Check if user is admin
      const user = await storage.getUser(userId);
      
      // If user is admin, return ALL releases with pagination
      if (user && isPlatformAdmin(user)) {
        const page = req.query.page ? parseInt(req.query.page as string) : 1;
        const limit = req.query.limit ? parseInt(req.query.limit as string) : 50;
        const search = req.query.search as string | undefined;
        const status = req.query.status as string | undefined;
        const paymentStatus = req.query.paymentStatus as string | undefined;

        const result = await storage.getAllReleases({
          page,
          limit,
          search,
          status,
          paymentStatus,
        });
        
        // Add tracks to each release for payment calculation
        const releasesWithTracks = await Promise.all(
          result.releases.map(async (release) => {
            const tracks = await storage.getTracks(release.id);
            return { ...release, tracks };
          })
        );
        
        return res.json({
          releases: releasesWithTracks,
          total: result.total,
          page: result.page,
          totalPages: result.totalPages,
        });
      }

      // For regular users, return only their organization's releases with pagination
      const page = req.query.page ? parseInt(req.query.page as string) : 1;
      const limit = req.query.limit ? parseInt(req.query.limit as string) : 50;
      const search = req.query.search as string | undefined;
      const status = req.query.status as string | undefined;
      const paymentStatus = req.query.paymentStatus as string | undefined;

      const result = await storage.getUserReleases(userId, {
        page,
        limit,
        search,
        status,
        paymentStatus,
      });

      // Add tracks to each release for payment calculation
      const releasesWithTracks = await Promise.all(
        result.releases.map(async (release) => {
          const tracks = await storage.getTracks(release.id);
          return { ...release, tracks };
        })
      );

      res.json({
        releases: releasesWithTracks,
        total: result.total,
        page: result.page,
        totalPages: result.totalPages,
      });
    } catch (error) {
      console.error("Error fetching releases:", error);
      res.status(500).json({ error: "Failed to fetch releases" });
    }
  });

  // Check if organization has at least one paid release
  app.get("/api/releases/has-paid", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req.user as AuthenticatedUser);
      if (!userId) {
        return res.status(401).json({ error: "User not authenticated" });
      }

      const user = await storage.getUser(userId);
      const userOrgs = await getAccessibleOrganizations(user, userId, storage);
      if (userOrgs.length === 0) {
        return res.json({ hasPaidRelease: false });
      }

      const { db: database } = await import("./db");
      const { releases: releasesTable } = await import("@shared/schema");
      const { eq: eqFn, and: andFn, inArray: inArrayFn } = await import("drizzle-orm");

      const orgIds = userOrgs.map(org => org.id);
      
      const paidRelease = await database
        .select({ id: releasesTable.id })
        .from(releasesTable)
        .where(
          andFn(
            inArrayFn(releasesTable.orgId, orgIds),
            eqFn(releasesTable.paymentStatus, "PAID")
          )
        )
        .limit(1);

      res.json({ hasPaidRelease: paidRelease.length > 0 });
    } catch (error) {
      console.error("Error checking paid release:", error);
      res.status(500).json({ error: "Failed to check paid release" });
    }
  });

  // Get paid releases for transaction history
  app.get("/api/releases/paid/history", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req.user as AuthenticatedUser);
      if (!userId) {
        return res.status(401).json({ error: "User not authenticated" });
      }

      // Get user's organizations (considers frozen status)
      const user = await storage.getUser(userId);
      const userOrgs = await getAccessibleOrganizations(user, userId, storage);
      if (userOrgs.length === 0) {
        return res.json([]);
      }

      // Get all PAID releases for user's organizations
      const { db: database } = await import("./db");
      const { releases: releasesTable, artists: artistsTable } = await import("@shared/schema");
      const { eq: eqFn, and: andFn, inArray: inArrayFn, desc: descFn } = await import("drizzle-orm");

      const orgIds = userOrgs.map(org => org.id);
      
      const paidReleases = await database
        .select({
          id: releasesTable.id,
          title: releasesTable.title,
          upc: releasesTable.upc,
          type: releasesTable.type,
          artistId: releasesTable.artistId,
          paymentAmount: releasesTable.paymentAmount,
          paidAt: releasesTable.paidAt,
          paymentOrderReference: releasesTable.paymentOrderReference,
        })
        .from(releasesTable)
        .where(
          andFn(
            inArrayFn(releasesTable.orgId, orgIds),
            eqFn(releasesTable.paymentStatus, "PAID")
          )
        )
        .orderBy(descFn(releasesTable.paidAt));

      // Get artist names for each release
      const releasesWithArtists = await Promise.all(
        paidReleases.map(async (release) => {
          const artist = await storage.getArtist(release.artistId);
          return {
            ...release,
            artistName: artist?.name || "Unknown Artist",
          };
        })
      );

      res.json(releasesWithArtists);
    } catch (error) {
      console.error("Error fetching paid releases:", error);
      res.status(500).json({ error: "Failed to fetch transaction history" });
    }
  });

  // Update release (for users)
  app.put("/api/releases/:id", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req.user as AuthenticatedUser);
      if (!userId) {
        return res.status(401).json({ error: "User not authenticated" });
      }

      const { id } = req.params;
      const release = await storage.getRelease(id);
      
      if (!release) {
        return res.status(404).json({ error: "Release not found" });
      }

      // Check if user owns the release (considers frozen organizations)
      const user = await storage.getUser(userId);
      if (!await hasOrgAccess(user, release.orgId, storage)) {
        return res.status(403).json({ error: "Access denied" });
      }

      // Update release first
      const updatedRelease = await storage.updateRelease(id, req.body);

      // Track changes and notify admins (only if user is not admin)
      if (!isPlatformAdmin(user)) {
        const { compareReleaseFields } = await import("./diffUtils");
        const changedFieldsText = compareReleaseFields(release, updatedRelease);
        
        // Only send notifications if there were actual changes
        if (changedFieldsText) {
          const organization = await storage.getOrganization(release.orgId);
          const upcInfo = updatedRelease.upc ? `UPC: ${updatedRelease.upc}` : '';
          
          const notificationTitle = "Реліз відредаговано користувачем";
          const notificationMessage = `${organization?.name || "Організація"} відредагувала реліз "${updatedRelease.title}"${upcInfo ? ` (${upcInfo})` : ''}\n\nЗміни:\n${changedFieldsText}`;
          
          // Find all admins and notify them  
          const { db: database } = await import("./db");
          const { users: usersTable } = await import("@shared/schema");
          const { eq: eqFn } = await import("drizzle-orm");
          
          const admins = await database.select().from(usersTable).where(eqFn(usersTable.role, "ADMIN"));
          for (const admin of admins) {
            await storage.createNotification({
              userId: admin.id,
              releaseId: id,
              pitchingId: null,
              relatedEntityType: null,
              relatedEntityId: null,
              title: notificationTitle,
              message: notificationMessage,
              type: "RELEASE_UPDATED_BY_USER",
              changedFields: changedFieldsText,
              isRead: false,
            });
          }
          
          // Send email notification to admin (fire and forget - non-blocking)
          const { sendNotificationEmail } = await import("./googleMail");
          void sendNotificationEmail(notificationTitle, notificationMessage, "RELEASE_STATUS_CHANGED").catch(err => {
            console.error('[EMAIL] Failed to send notification email:', err);
          });
          
          // Send Telegram notification to admin (fire and forget - non-blocking)
          const { sendTelegramNotification } = await import("./telegram");
          void sendTelegramNotification(notificationTitle, notificationMessage).catch(err => {
            console.error('[TELEGRAM] Failed to send notification:', err);
          });
        }
      }

      res.json(updatedRelease);
    } catch (error) {
      console.error("Error updating release:", error);
      res.status(500).json({ error: "Failed to update release" });
    }
  });

  // Get release status history
  app.get("/api/releases/:id/status-history", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req.user as AuthenticatedUser);
      if (!userId) {
        return res.status(401).json({ error: "User not authenticated" });
      }

      const { id } = req.params;
      const release = await storage.getRelease(id);
      
      if (!release) {
        return res.status(404).json({ error: "Release not found" });
      }

      const user = await storage.getUser(userId);
      if (!await hasOrgAccess(user, release.orgId, storage)) {
        return res.status(403).json({ error: "Access denied" });
      }

      const history = await storage.getReleaseStatusHistory(id);
      res.json(history);
    } catch (error) {
      console.error("Error fetching release status history:", error);
      res.status(500).json({ error: "Failed to fetch status history" });
    }
  });

  // Get single release details (for users and admins)
  app.get("/api/releases/:id", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req.user as AuthenticatedUser);
      if (!userId) {
        return res.status(401).json({ error: "User not authenticated" });
      }

      const { id } = req.params;
      const release = await storage.getReleaseDetails(id);
      
      if (!release) {
        return res.status(404).json({ error: "Release not found" });
      }

      // Check if user is admin or owns the release (considers frozen organizations)
      const user = await storage.getUser(userId);
      if (!await hasOrgAccess(user, release.orgId, storage)) {
        return res.status(403).json({ error: "Access denied" });
      }
      
      res.json(release);
    } catch (error) {
      console.error("Error fetching release details:", error);
      res.status(500).json({ error: "Failed to fetch release details" });
    }
  });

  // Update track (for users who own the release)
  app.put("/api/tracks/:id", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req.user as AuthenticatedUser);
      if (!userId) {
        return res.status(401).json({ error: "User not authenticated" });
      }

      const { id } = req.params;
      
      // Get track to find its release
      const { db: database } = await import("./db");
      const { tracks } = await import("@shared/schema");
      const { eq: eqFn } = await import("drizzle-orm");
      
      const trackResult = await database.select().from(tracks).where(eqFn(tracks.id, id)).limit(1);
      const track = trackResult[0];
      
      if (!track) {
        return res.status(404).json({ error: "Track not found" });
      }

      // Check if user owns the release
      const release = await storage.getRelease(track.releaseId);
      if (!release) {
        return res.status(404).json({ error: "Release not found" });
      }

      const user = await storage.getUser(userId);
      if (!await hasOrgAccess(user, release.orgId, storage)) {
        return res.status(403).json({ error: "Access denied" });
      }

      // Update track
      const updatedData: any = {};
      if (req.body.title !== undefined) updatedData.title = req.body.title;
      if (req.body.version !== undefined) updatedData.version = req.body.version;
      if (req.body.isrc !== undefined) updatedData.isrc = req.body.isrc;
      if (req.body.explicit !== undefined) updatedData.explicit = req.body.explicit;
      if (req.body.aiGenerated !== undefined) updatedData.aiGenerated = req.body.aiGenerated;
      if (req.body.primaryGenre !== undefined) updatedData.primaryGenre = req.body.primaryGenre;
      if (req.body.secondaryGenre !== undefined) updatedData.secondaryGenre = req.body.secondaryGenre;
      if (req.body.lyrics !== undefined) updatedData.lyrics = req.body.lyrics;
      if (req.body.audioUrl !== undefined) updatedData.audioUrl = req.body.audioUrl;
      if (req.body.audioOriginalName !== undefined) updatedData.audioOriginalName = req.body.audioOriginalName;
      if (req.body.participants !== undefined) updatedData.participants = req.body.participants;

      const [updatedTrack] = await database.update(tracks)
        .set({ ...updatedData, updatedAt: new Date() })
        .where(eqFn(tracks.id, id))
        .returning();

      res.json(updatedTrack);
    } catch (error) {
      console.error("Error updating track:", error);
      res.status(500).json({ error: "Failed to update track" });
    }
  });

  // Get ALL releases endpoint (Admin only) with pagination and search
  app.get("/api/admin/releases", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req.user as AuthenticatedUser);
      if (!userId) {
        return res.status(401).json({ error: "User not authenticated" });
      }

      // Check if user is admin
      const user = await storage.getUser(userId);
      if (!user || !isPlatformAdmin(user)) {
        return res.status(403).json({ error: "Admin access required" });
      }

      // Parse query parameters
      const page = req.query.page ? parseInt(req.query.page as string) : 1;
      const limit = req.query.limit ? parseInt(req.query.limit as string) : 50;
      const search = req.query.search as string | undefined;
      const status = req.query.status as string | undefined;
      const paymentStatus = req.query.paymentStatus as string | undefined;

      // Get paginated and filtered releases
      const result = await storage.getAllReleases({
        page,
        limit,
        search,
        status,
        paymentStatus,
      });

      res.json(result);
    } catch (error) {
      console.error("Error fetching admin releases:", error);
      res.status(500).json({ error: "Failed to fetch admin releases" });
    }
  });

  // Get admin stats (total counts by status)
  app.get("/api/admin/stats", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req.user as AuthenticatedUser);
      if (!userId) {
        return res.status(401).json({ error: "User not authenticated" });
      }

      // Check if user is admin
      const user = await storage.getUser(userId);
      if (!user || !isPlatformAdmin(user)) {
        return res.status(403).json({ error: "Admin access required" });
      }

      // Get counts for releases and music videos
      const [releasesStats, videosStats] = await Promise.all([
        storage.getReleasesCountByStatus(),
        storage.getMusicVideosCountByStatus(),
      ]);

      res.json({
        releases: releasesStats,
        videos: videosStats,
      });
    } catch (error) {
      console.error("Error fetching admin stats:", error);
      res.status(500).json({ error: "Failed to fetch admin stats" });
    }
  });

  // Get online users count (Admin only) - users active in last 5 minutes
  app.get("/api/admin/online-users", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req.user as AuthenticatedUser);
      if (!userId) {
        return res.status(401).json({ error: "User not authenticated" });
      }

      // Check if user is admin
      const user = await storage.getUser(userId);
      if (!user || !isPlatformAdmin(user)) {
        return res.status(403).json({ error: "Admin access required" });
      }

      // Get users active in last 5 minutes
      const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
      
      // Get active user IDs from userActivity table
      const activeUsers = await db.select({
        userId: userActivity.userId,
        lastActivity: userActivity.lastActivity,
      })
        .from(userActivity)
        .where(gte(userActivity.lastActivity, fiveMinutesAgo));

      // Get organization details for each active user
      const userOrgs = await Promise.all(
        activeUsers.map(async (activity) => {
          // Get user's organization memberships
          const memberships = await db.select({
            orgId: orgMembers.orgId,
            orgName: organizations.name,
            orgType: organizations.type,
          })
            .from(orgMembers)
            .innerJoin(organizations, eq(orgMembers.orgId, organizations.id))
            .where(eq(orgMembers.userId, activity.userId));
          
          return {
            userId: activity.userId,
            lastActivity: activity.lastActivity,
            organizations: memberships.map(m => ({
              id: m.orgId,
              name: m.orgName,
              type: m.orgType,
            })),
          };
        })
      );

      // Aggregate organizations (unique by org ID)
      const orgMap = new Map<string, { name: string; type: string; userCount: number }>();
      userOrgs.forEach(uo => {
        uo.organizations.forEach(org => {
          const existing = orgMap.get(org.id);
          if (existing) {
            existing.userCount++;
          } else {
            orgMap.set(org.id, { name: org.name, type: org.type || 'ARTIST_ORG', userCount: 1 });
          }
        });
      });

      const organizationsList = Array.from(orgMap.entries()).map(([id, data]) => ({
        id,
        name: data.name,
        type: data.type,
        userCount: data.userCount,
      })).sort((a, b) => b.userCount - a.userCount);

      res.json({
        count: activeUsers.length,
        organizations: organizationsList,
      });
    } catch (error) {
      console.error("Error fetching online users:", error);
      res.status(500).json({ error: "Failed to fetch online users" });
    }
  });

  // Get ALL drafts endpoint (Admin only)
  app.get("/api/admin/drafts", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req.user as AuthenticatedUser);
      if (!userId) {
        return res.status(401).json({ error: "User not authenticated" });
      }

      // Security check: Only platform admins can access all drafts
      const user = await storage.getUser(userId);
      if (!user || !isPlatformAdmin(user)) {
        return res.status(403).json({ error: "Admin access required" });
      }

      // Get all drafts (RELEASE type only for this view)
      const drafts = await storage.getAllReleaseDrafts("RELEASE");

      // Enrich drafts with user and organization info
      const enrichedDrafts = await Promise.all(
        drafts.map(async (draft) => {
          const [creatorUser, org] = await Promise.all([
            draft.createdByUserId ? storage.getUser(draft.createdByUserId) : null,
            draft.orgId ? storage.getOrganization(draft.orgId) : null,
          ]);
          return {
            ...draft,
            creatorEmail: creatorUser?.email || null,
            creatorName: creatorUser?.firstName && creatorUser?.lastName 
              ? `${creatorUser.firstName} ${creatorUser.lastName}` 
              : creatorUser?.email || null,
            organizationName: org?.name || null,
          };
        })
      );

      res.json(enrichedDrafts);
    } catch (error) {
      console.error("Error fetching admin drafts:", error);
      res.status(500).json({ error: "Failed to fetch admin drafts" });
    }
  });

  // Music Videos endpoints
  // Get music videos (for users - their videos, for admins - all videos)
  app.get("/api/music-videos", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req.user as AuthenticatedUser);
      if (!userId) {
        return res.status(401).json({ error: "User not authenticated" });
      }

      const user = await storage.getUser(userId);
      
      if (isPlatformAdmin(user)) {
        // Admin sees all videos with pagination and search
        const page = req.query.page ? parseInt(req.query.page as string) : 1;
        const limit = req.query.limit ? parseInt(req.query.limit as string) : 50;
        const search = req.query.search as string | undefined;
        const status = req.query.status as string | undefined;
        const paymentStatus = req.query.paymentStatus as string | undefined;

        const result = await storage.getAllMusicVideos({
          page,
          limit,
          search,
          status,
          paymentStatus,
        });
        return res.json(result);
      }

      // Regular users see their organization's videos with pagination
      const page = req.query.page ? parseInt(req.query.page as string) : 1;
      const limit = req.query.limit ? parseInt(req.query.limit as string) : 50;
      const search = req.query.search as string | undefined;
      const status = req.query.status as string | undefined;
      const paymentStatus = req.query.paymentStatus as string | undefined;

      const result = await storage.getUserMusicVideos(userId, {
        page,
        limit,
        search,
        status,
        paymentStatus,
      });

      res.json(result);
    } catch (error) {
      console.error("Error fetching music videos:", error);
      res.status(500).json({ error: "Failed to fetch music videos" });
    }
  });

  // Get single music video
  app.get("/api/music-videos/:id", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req.user as AuthenticatedUser);
      if (!userId) {
        return res.status(401).json({ error: "User not authenticated" });
      }

      const { id } = req.params;
      const video = await storage.getMusicVideo(id);
      
      if (!video) {
        return res.status(404).json({ error: "Music video not found" });
      }

      // Check access (considers frozen organizations)
      const user = await storage.getUser(userId);
      if (!await hasOrgAccess(user, video.orgId, storage)) {
        return res.status(403).json({ error: "Access denied" });
      }

      res.json(video);
    } catch (error) {
      console.error("Error fetching music video:", error);
      res.status(500).json({ error: "Failed to fetch music video" });
    }
  });

  // Delete music video (Admin only)
  app.delete("/api/music-videos/:id", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req.user as AuthenticatedUser);
      if (!userId) {
        return res.status(401).json({ error: "User not authenticated" });
      }

      const user = await storage.getUser(userId);
      if (!isPlatformAdmin(user)) {
        return res.status(403).json({ error: "Admin access required" });
      }

      const { id } = req.params;
      await storage.deleteMusicVideo(id);

      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting music video:", error);
      res.status(500).json({ error: "Failed to delete music video" });
    }
  });

  // In-memory store for pending upload sessions (legacy direct upload)
  // Sessions expire after 1 hour
  // After upload completes, client registers the fileId which gets bound to the session
  const pendingUploadSessions = new Map<string, { 
    uploadUrl: string; 
    userId: string; 
    sessionToken: string; 
    createdAt: number; 
    expiresAt: number;
    registeredFileId?: string; // Set when client registers the uploaded file
  }>();

  // In-memory store for chunked upload sessions
  // Stores the Google Drive resumable URL and tracks upload progress
  interface ChunkedUploadSession {
    uploadUrl: string;
    userId: string;
    sessionToken: string;
    fileName: string;
    mimeType: string;
    totalSize: number;
    uploadedBytes: number;
    createdAt: number;
    expiresAt: number;
    fileId?: string; // Set when upload completes
  }
  const chunkedUploadSessions = new Map<string, ChunkedUploadSession>();

  // Cleanup expired chunked sessions every 10 minutes
  setInterval(() => {
    const now = Date.now();
    for (const [key, session] of chunkedUploadSessions.entries()) {
      if (session.expiresAt < now) {
        console.log('[CHUNKED UPLOAD] Cleaning expired session:', key.slice(0, 20));
        chunkedUploadSessions.delete(key);
      }
    }
  }, 10 * 60 * 1000);
  
  // Cleanup expired sessions every 10 minutes
  setInterval(() => {
    const now = Date.now();
    for (const [key, session] of pendingUploadSessions.entries()) {
      if (session.expiresAt < now) {
        pendingUploadSessions.delete(key);
      }
    }
  }, 10 * 60 * 1000);

  // Initialize direct upload to Google Drive (returns resumable upload URL)
  app.post("/api/music-videos/init-upload", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req.user as AuthenticatedUser);
      if (!userId) {
        return res.status(401).json({ error: "User not authenticated" });
      }

      const { fileName, mimeType, fileSize } = req.body;

      if (!fileName || !mimeType || !fileSize) {
        return res.status(400).json({ error: "Missing required fields: fileName, mimeType, fileSize" });
      }

      // Validate file type
      const allowedTypes = ['video/mp4', 'video/quicktime', 'video/x-msvideo', 'video/webm', 'video/x-matroska'];
      if (!allowedTypes.includes(mimeType)) {
        return res.status(400).json({ error: "Invalid video format. Allowed: MP4, MOV, AVI, WebM, MKV" });
      }

      // Validate file size (5GB max)
      const maxSize = 5 * 1024 * 1024 * 1024;
      if (fileSize > maxSize) {
        return res.status(400).json({ error: "File too large. Maximum size: 5GB" });
      }

      console.log('[DIRECT UPLOAD] Initializing upload for:', fileName, 'size:', fileSize, 'user:', userId);

      // Generate a cryptographically secure session token
      const sessionToken = crypto.randomBytes(32).toString('hex');

      const { uploadUrl, fileId } = await googleDriveStorage.generateResumableUploadUrl(
        fileName,
        mimeType,
        fileSize
      );

      // Store session with 1 hour expiry (keyed by uploadUrl hash for lookup during confirm)
      const sessionKey = Buffer.from(uploadUrl).toString('base64').slice(0, 64);
      const now = Date.now();
      pendingUploadSessions.set(sessionKey, {
        uploadUrl,
        userId,
        sessionToken, // Store token for verification
        createdAt: now, // When session was created (for file creation time validation)
        expiresAt: now + 60 * 60 * 1000 // 1 hour
      });

      console.log('[DIRECT UPLOAD] Session created successfully, sessionKey:', sessionKey.slice(0, 20) + '...');

      res.json({
        uploadUrl,
        uploadId: fileId,
        sessionKey // Return session key for confirm step
      });
    } catch (error: any) {
      console.error('[DIRECT UPLOAD] Init error:', error);
      res.status(500).json({ error: error.message || "Failed to initialize upload" });
    }
  });

  // Register the uploaded file ID with the session (called immediately after upload completes)
  // This binds the fileId to the session atomically before confirmation
  app.post("/api/music-videos/register-upload", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req.user as AuthenticatedUser);
      if (!userId) {
        return res.status(401).json({ error: "User not authenticated" });
      }

      const { fileId, sessionKey } = req.body;

      if (!fileId || !sessionKey) {
        return res.status(400).json({ error: "Missing fileId or sessionKey" });
      }

      console.log('[DIRECT UPLOAD] Registering fileId:', fileId, 'to session:', sessionKey.slice(0, 20) + '...');

      const session = pendingUploadSessions.get(sessionKey);
      if (!session) {
        return res.status(403).json({ error: "Invalid or expired upload session" });
      }

      if (session.userId !== userId) {
        return res.status(403).json({ error: "Session does not belong to this user" });
      }

      if (session.expiresAt < Date.now()) {
        pendingUploadSessions.delete(sessionKey);
        return res.status(403).json({ error: "Upload session expired" });
      }

      // Atomic binding - first registration wins
      if (session.registeredFileId) {
        if (session.registeredFileId !== fileId) {
          console.error('[DIRECT UPLOAD] Security: Session already bound to different fileId');
          return res.status(403).json({ error: "Session already used for a different file" });
        }
        // Already registered with same fileId, that's fine
      } else {
        // First registration - verify file exists in our folder and is not claimed
        const verification = await googleDriveStorage.verifyFileForRegistration(fileId);
        if (!verification.isValid) {
          console.error('[DIRECT UPLOAD] Security: fileId not in our folder:', fileId);
          return res.status(403).json({ error: "Invalid file: not found in authorized folder" });
        }
        if (verification.hasExistingClaim) {
          console.error('[DIRECT UPLOAD] Security: file already registered by another session:', fileId);
          return res.status(403).json({ error: "File already registered by another session" });
        }

        // Atomically register file to this session via appProperties
        const registered = await googleDriveStorage.registerFileToSession(fileId, session.sessionToken);
        if (!registered) {
          console.error('[DIRECT UPLOAD] Security: Failed to register file (race condition?):', fileId);
          return res.status(403).json({ error: "Failed to register file - it may have been claimed by another session" });
        }

        // Bind fileId to session in memory
        session.registeredFileId = fileId;
        console.log('[DIRECT UPLOAD] FileId registered successfully with appProperties binding');
      }

      res.json({ success: true, fileId });
    } catch (error: any) {
      console.error('[DIRECT UPLOAD] Register error:', error);
      res.status(500).json({ error: error.message || "Failed to register upload" });
    }
  });

  // Confirm upload completion and set file permissions
  app.post("/api/music-videos/confirm-upload", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req.user as AuthenticatedUser);
      if (!userId) {
        return res.status(401).json({ error: "User not authenticated" });
      }

      const { fileId, fileName, sessionKey } = req.body;

      if (!fileId) {
        return res.status(400).json({ error: "Missing fileId" });
      }

      if (!sessionKey) {
        return res.status(400).json({ error: "Missing sessionKey" });
      }

      console.log('[DIRECT UPLOAD] Confirming upload for fileId:', fileId, 'sessionKey:', sessionKey.slice(0, 20) + '...');

      // Security: Validate session ownership
      const session = pendingUploadSessions.get(sessionKey);
      if (!session) {
        console.error('[DIRECT UPLOAD] Security: Invalid or expired session key');
        return res.status(403).json({ error: "Invalid or expired upload session" });
      }

      if (session.userId !== userId) {
        console.error('[DIRECT UPLOAD] Security: Session belongs to different user');
        return res.status(403).json({ error: "Session does not belong to this user" });
      }

      if (session.expiresAt < Date.now()) {
        pendingUploadSessions.delete(sessionKey);
        console.error('[DIRECT UPLOAD] Security: Session expired');
        return res.status(403).json({ error: "Upload session expired" });
      }

      // Security: Require fileId to be registered before confirmation
      // This ensures the session is bound to a specific file before claiming
      if (!session.registeredFileId) {
        console.error('[DIRECT UPLOAD] Security: FileId not registered to session');
        return res.status(403).json({ error: "File must be registered before confirmation" });
      }
      
      if (session.registeredFileId !== fileId) {
        console.error('[DIRECT UPLOAD] Security: fileId mismatch with registered file');
        return res.status(403).json({ error: "FileId does not match registered file" });
      }

      // Security: Verify the file's appProperties.registeredBySession matches our session token
      // This is the cryptographic binding that prevents hijacking
      const isValidRegistration = await googleDriveStorage.verifyFileRegistration(fileId, session.sessionToken);
      if (!isValidRegistration) {
        console.error('[DIRECT UPLOAD] Security: File registration token mismatch:', fileId);
        return res.status(403).json({ error: "File registration mismatch - security violation" });
      }

      // Set file to public
      await googleDriveStorage.setFilePublic(fileId);

      // Remove used session to prevent replay
      pendingUploadSessions.delete(sessionKey);

      console.log('[DIRECT UPLOAD] Upload confirmed, file is now public');

      res.json({
        success: true,
        fileId,
        fileName
      });
    } catch (error: any) {
      console.error('[DIRECT UPLOAD] Confirm error:', error);
      res.status(500).json({ error: error.message || "Failed to confirm upload" });
    }
  });

  // ============================================
  // CHUNKED UPLOAD ENDPOINTS (for large files)
  // ============================================

  // Initialize chunked upload session
  app.post("/api/music-videos/init-chunked-upload", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req.user as AuthenticatedUser);
      if (!userId) {
        return res.status(401).json({ error: "User not authenticated" });
      }

      const { fileName, mimeType, fileSize } = req.body;

      if (!fileName || !mimeType || !fileSize) {
        return res.status(400).json({ error: "Missing required fields: fileName, mimeType, fileSize" });
      }

      const allowedTypes = ['video/mp4', 'video/quicktime', 'video/x-msvideo', 'video/webm', 'video/x-matroska'];
      if (!allowedTypes.includes(mimeType)) {
        return res.status(400).json({ error: "Invalid video format. Allowed: MP4, MOV, AVI, WebM, MKV" });
      }

      const maxSize = 5 * 1024 * 1024 * 1024; // 5GB
      if (fileSize > maxSize) {
        return res.status(400).json({ error: "File too large. Maximum size: 5GB" });
      }

      console.log('[CHUNKED UPLOAD] Initializing for:', fileName, 'size:', fileSize, 'user:', userId);

      const sessionToken = crypto.randomBytes(32).toString('hex');

      const { uploadUrl } = await googleDriveStorage.generateResumableUploadUrl(
        fileName,
        mimeType,
        fileSize
      );

      const sessionKey = sessionToken; // Use token as key for simplicity
      const now = Date.now();
      
      chunkedUploadSessions.set(sessionKey, {
        uploadUrl,
        userId,
        sessionToken,
        fileName,
        mimeType,
        totalSize: fileSize,
        uploadedBytes: 0,
        createdAt: now,
        expiresAt: now + 2 * 60 * 60 * 1000 // 2 hours for large uploads
      });

      console.log('[CHUNKED UPLOAD] Session created:', sessionKey.slice(0, 20) + '...');

      res.json({
        sessionKey,
        totalSize: fileSize,
        chunkSize: 10 * 1024 * 1024 // Recommend 10MB chunks
      });
    } catch (error: any) {
      console.error('[CHUNKED UPLOAD] Init error:', error);
      res.status(500).json({ error: error.message || "Failed to initialize chunked upload" });
    }
  });

  // Upload a single chunk
  app.post("/api/music-videos/upload-chunk", isAuthenticated, chunkUpload.single('chunk'), async (req: any, res) => {
    try {
      const userId = getUserId(req.user as AuthenticatedUser);
      if (!userId) {
        return res.status(401).json({ error: "User not authenticated" });
      }

      const { sessionKey, chunkIndex, startByte, endByte } = req.body;

      if (!sessionKey || chunkIndex === undefined || startByte === undefined || endByte === undefined) {
        return res.status(400).json({ error: "Missing required fields" });
      }

      if (!req.file) {
        return res.status(400).json({ error: "No chunk data received" });
      }

      const session = chunkedUploadSessions.get(sessionKey);
      if (!session) {
        return res.status(403).json({ error: "Invalid or expired upload session" });
      }

      if (session.userId !== userId) {
        return res.status(403).json({ error: "Session belongs to different user" });
      }

      if (session.expiresAt < Date.now()) {
        chunkedUploadSessions.delete(sessionKey);
        return res.status(403).json({ error: "Upload session expired" });
      }

      console.log('[CHUNKED UPLOAD] Receiving chunk', chunkIndex, 'bytes', startByte, '-', endByte);

      const chunkBuffer = await readAndCleanupFile(req.file.path);

      const result = await googleDriveStorage.uploadChunkToResumable(
        session.uploadUrl,
        chunkBuffer,
        parseInt(startByte),
        parseInt(endByte),
        session.totalSize
      );

      if (result.status === 'error') {
        console.error('[CHUNKED UPLOAD] Chunk upload failed:', result.error);
        return res.status(500).json({ error: result.error });
      }

      session.uploadedBytes = parseInt(endByte) + 1;

      if (result.status === 'complete') {
        session.fileId = result.fileId;
        console.log('[CHUNKED UPLOAD] Upload complete, fileId:', result.fileId);
      }

      res.json({
        status: result.status,
        uploadedBytes: session.uploadedBytes,
        totalSize: session.totalSize,
        fileId: result.fileId,
        nextByte: result.nextByte
      });
    } catch (error: any) {
      console.error('[CHUNKED UPLOAD] Chunk error:', error);
      res.status(500).json({ error: error.message || "Failed to upload chunk" });
    }
  });

  // Complete chunked upload and finalize
  app.post("/api/music-videos/complete-chunked-upload", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req.user as AuthenticatedUser);
      if (!userId) {
        return res.status(401).json({ error: "User not authenticated" });
      }

      const { sessionKey } = req.body;

      if (!sessionKey) {
        return res.status(400).json({ error: "Missing sessionKey" });
      }

      const session = chunkedUploadSessions.get(sessionKey);
      if (!session) {
        return res.status(403).json({ error: "Invalid or expired upload session" });
      }

      if (session.userId !== userId) {
        return res.status(403).json({ error: "Session belongs to different user" });
      }

      if (!session.fileId) {
        return res.status(400).json({ error: "Upload not complete - no fileId" });
      }

      console.log('[CHUNKED UPLOAD] Completing upload, fileId:', session.fileId);

      await googleDriveStorage.setFilePublic(session.fileId);

      chunkedUploadSessions.delete(sessionKey);

      console.log('[CHUNKED UPLOAD] Upload finalized successfully');

      res.json({
        success: true,
        fileId: session.fileId,
        fileName: session.fileName
      });
    } catch (error: any) {
      console.error('[CHUNKED UPLOAD] Complete error:', error);
      res.status(500).json({ error: error.message || "Failed to complete upload" });
    }
  });

  // Get upload progress (for resume after disconnect)
  app.get("/api/music-videos/upload-progress/:sessionKey", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req.user as AuthenticatedUser);
      if (!userId) {
        return res.status(401).json({ error: "User not authenticated" });
      }

      const { sessionKey } = req.params;

      const session = chunkedUploadSessions.get(sessionKey);
      if (!session) {
        return res.status(404).json({ error: "Session not found" });
      }

      if (session.userId !== userId) {
        return res.status(403).json({ error: "Session belongs to different user" });
      }

      const nextByte = await googleDriveStorage.queryUploadProgress(session.uploadUrl, session.totalSize);

      res.json({
        uploadedBytes: nextByte === -1 ? session.totalSize : nextByte,
        totalSize: session.totalSize,
        complete: nextByte === -1,
        fileId: session.fileId
      });
    } catch (error: any) {
      console.error('[CHUNKED UPLOAD] Progress error:', error);
      res.status(500).json({ error: error.message || "Failed to get progress" });
    }
  });

  // Upload music video file (legacy - for smaller files)
  app.post("/api/music-videos/upload-video", isAuthenticated, videoUpload.single('video'), async (req: any, res) => {
    try {
      const userId = getUserId(req.user as AuthenticatedUser);
      if (!userId) {
        return res.status(401).json({ error: "User not authenticated" });
      }

      if (!req.file) {
        return res.status(400).json({ error: "No video file uploaded" });
      }

      console.log('[VIDEO UPLOAD] Processing video file:', req.file.originalname, 'size:', req.file.size);

      // Read file from disk and upload to Google Drive
      const fileBuffer = await readAndCleanupFile(req.file.path);
      
      const uploadResult = await googleDriveStorage.uploadFile(
        fileBuffer,
        req.file.originalname,
        req.file.mimetype
      );

      console.log('[VIDEO UPLOAD] Upload successful, fileId:', uploadResult.fileId);

      res.json({
        fileId: uploadResult.fileId,
        fileName: req.file.originalname,
        fileSize: req.file.size,
      });
    } catch (error: any) {
      console.error('[VIDEO UPLOAD] Error:', error);
      res.status(500).json({ error: error.message || "Failed to upload video" });
    }
  });

  // Create or update music video (save before payment)
  app.post("/api/music-videos", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req.user as AuthenticatedUser);
      if (!userId) {
        return res.status(401).json({ error: "User not authenticated" });
      }

      // Get current user to check if Platform Admin
      const currentUser = await storage.getUser(userId);
      const videoData = req.body;

      // Determine organization ID
      let orgId: string;
      
      if (isPlatformAdmin(currentUser)) {
        // Platform admin MUST provide organizationId
        if (!videoData.organizationId) {
          return res.status(400).json({ error: "Platform admin must select an organization" });
        }
        
        // Validate the organization exists
        const selectedOrg = await storage.getOrganization(videoData.organizationId);
        if (!selectedOrg) {
          return res.status(403).json({ error: "Selected organization not found" });
        }
        orgId = videoData.organizationId;
      } else {
        // Regular user - use their first organization
        const userOrgs = await getAccessibleOrganizations(currentUser, userId, storage);
        if (userOrgs.length === 0) {
          return res.status(400).json({ error: "User has no organization" });
        }
        orgId = userOrgs[0].id;
      }

      // Validate required fields
      if (!videoData.title || !videoData.videoFileId) {
        return res.status(400).json({ error: "Missing required fields: title, videoFileId" });
      }

      // Use first performer as artist name if not provided
      const artistName = videoData.artist || 
                        (videoData.performers && videoData.performers[0]?.name) || 
                        "Unknown Artist";

      // Create or find artist
      const existingArtists = await storage.getArtists(orgId);
      let artist = existingArtists.find(a => a.name === artistName);
      
      if (!artist) {
        artist = await storage.createArtist({
          orgId,
          name: artistName,
        });
      }

      // Determine payment status: Platform Admins and orgs with freeReleases get auto-paid
      const organization = await storage.getOrganization(orgId);
      const skipPayment = isPlatformAdmin(currentUser) || (organization?.freeReleases === true);
      const paymentStatus = skipPayment ? 'PAID' as const : 'PENDING' as const;

      // Prepare music video data
      const musicVideoData = {
        orgId,
        artistId: artist.id,
        releaseId: videoData.releaseId || null,
        title: videoData.title,
        isrc: videoData.isrc || null,
        isrcRequested: videoData.isrcRequested || false,
        upc: videoData.upc || null,
        upcRequested: videoData.upcRequested || false,
        primaryGenre: videoData.primaryGenre || null,
        secondaryGenre: videoData.secondaryGenre || null,
        language: videoData.contentLanguage || null,
        metadataLanguage: videoData.metadataLanguage || 'en',
        firstReleaseDate: videoData.firstReleaseDate ? new Date(videoData.firstReleaseDate) : null,
        releaseDate: videoData.publicationDate ? new Date(videoData.publicationDate) : null,
        status: 'DRAFT' as const,
        territories: videoData.territories || [],
        platforms: videoData.platforms || [],
        explicit: videoData.explicitContent || false,
        aiGenerated: videoData.aiGenerated || false,
        videoFileId: videoData.videoFileId,
        videoOriginalName: videoData.videoFileName || null,
        videoSize: videoData.videoSize || null,
        artworkFileId: videoData.coverArtFileId || null,
        artworkUrl: videoData.coverArtUrl || null,
        artworkOriginalName: videoData.coverArtFileName || null,
        performers: videoData.performers || [],
        credits: videoData.contributors || [],
        paymentStatus,
        paymentAmount: 100000, // 1000 UAH in cents
        previewStart: videoData.previewStart || null,
        thumbnailTime: videoData.thumbnailTime || null,
      };

      const createdVideo = await storage.createMusicVideo(musicVideoData);

      console.log('[VIDEO CREATE] Music video created:', createdVideo.id);

      // Notify all admins about new music video (organization already fetched above)
      const { db: database } = await import("./db");
      const { users: usersTable } = await import("@shared/schema");
      const { eq: eqFn } = await import("drizzle-orm");
      
      const admins = await database.select().from(usersTable).where(eqFn(usersTable.role, "ADMIN"));
      const notificationTitle = "Нове музичне відео створено";
      const notificationMessage = `${organization?.name || "Організація"}, ${createdVideo.title}`;
      
      for (const admin of admins) {
        await storage.createNotification({
          userId: admin.id,
          releaseId: null,
          pitchingId: null,
          relatedEntityType: "musicVideo",
          relatedEntityId: createdVideo.id,
          title: notificationTitle,
          message: notificationMessage,
          type: "MUSIC_VIDEO_CREATED",
          changedFields: null,
          isRead: false,
        });
      }
      
      // Send email notification to admin (fire and forget - non-blocking)
      const { sendNotificationEmail } = await import("./googleMail");
      void sendNotificationEmail(notificationTitle, notificationMessage, "MUSIC_VIDEO_CREATED").catch(err => {
        console.error('[EMAIL] Failed to send notification email:', err);
      });
      
      // Send Telegram notification to admin (fire and forget - non-blocking)
      const { sendTelegramNotification } = await import("./telegram");
      void sendTelegramNotification(notificationTitle, notificationMessage).catch(err => {
        console.error('[TELEGRAM] Failed to send notification:', err);
      });

      res.json(createdVideo);
    } catch (error: any) {
      console.error('[VIDEO CREATE] Error:', error);
      res.status(500).json({ error: error.message || "Failed to create music video" });
    }
  });

  // Update music video metadata
  app.patch("/api/music-videos/:id", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req.user as AuthenticatedUser);
      if (!userId) {
        return res.status(401).json({ error: "User not authenticated" });
      }

      const { id } = req.params;
      const video = await storage.getMusicVideo(id);

      if (!video) {
        return res.status(404).json({ error: "Music video not found" });
      }

      // Check access (considers frozen organizations)
      const user = await storage.getUser(userId);
      if (!await hasOrgAccess(user, video.orgId, storage)) {
        return res.status(403).json({ error: "Access denied" });
      }

      // Extract editable fields from request
      const updateData: any = {};
      
      if (req.body.title) updateData.title = req.body.title;
      if (req.body.primaryGenre) updateData.primaryGenre = req.body.primaryGenre;
      if (req.body.secondaryGenre !== undefined) updateData.secondaryGenre = req.body.secondaryGenre;
      if (req.body.language) updateData.language = req.body.language;
      if (req.body.metadataLanguage !== undefined) updateData.metadataLanguage = req.body.metadataLanguage;
      if (req.body.firstReleaseDate) updateData.firstReleaseDate = new Date(req.body.firstReleaseDate);
      if (req.body.releaseDate) updateData.releaseDate = new Date(req.body.releaseDate);
      if (req.body.explicit !== undefined) updateData.explicit = req.body.explicit;
      if (req.body.aiGenerated !== undefined) updateData.aiGenerated = req.body.aiGenerated;
      if (req.body.upc !== undefined) updateData.upc = req.body.upc;
      if (req.body.isrc !== undefined) updateData.isrc = req.body.isrc;
      if (req.body.performers !== undefined) updateData.performers = req.body.performers;
      if (req.body.credits !== undefined) updateData.credits = req.body.credits;
      if (req.body.territories !== undefined) updateData.territories = req.body.territories;
      if (req.body.platforms !== undefined) updateData.platforms = req.body.platforms;
      if (req.body.previewStart !== undefined) updateData.previewStart = req.body.previewStart;
      if (req.body.thumbnailTime !== undefined) updateData.thumbnailTime = req.body.thumbnailTime;

      const updatedVideo = await storage.updateMusicVideo(id, updateData);

      if (!updatedVideo) {
        return res.status(404).json({ error: "Music video not found" });
      }

      console.log('[VIDEO UPDATE] Music video updated:', id);

      // Track changes and notify admins about user edits
      const { compareVideoFields } = await import("./diffUtils");
      const changedFieldsText = compareVideoFields(video, updatedVideo);
      
      if (changedFieldsText) {
        const { db: database } = await import("./db");
        const { users: usersTable } = await import("@shared/schema");
        const { eq: eqFn } = await import("drizzle-orm");
        
        const organization = await storage.getOrganization(video.orgId);
        const upcInfo = updatedVideo.upc ? `UPC: ${updatedVideo.upc}` : '';
        
        const notificationTitle = "Музичне відео відредаговано користувачем";
        const notificationMessage = `${organization?.name || "Організація"} відредагувала музичне відео "${updatedVideo.title}"${upcInfo ? ` (${upcInfo})` : ''}\n\nЗміни:\n${changedFieldsText}`;
        
        const admins = await database.select().from(usersTable).where(eqFn(usersTable.role, "ADMIN"));
        
        for (const admin of admins) {
          await storage.createNotification({
            userId: admin.id,
            releaseId: null,
            pitchingId: null,
            relatedEntityType: "musicVideo",
            relatedEntityId: id,
            title: notificationTitle,
            message: notificationMessage,
            type: "VIDEO_UPDATED_BY_USER",
            changedFields: changedFieldsText,
            isRead: false,
          });
        }
        
        // Send email notification to admin (fire and forget - non-blocking)
        const { sendNotificationEmail } = await import("./googleMail");
        void sendNotificationEmail(notificationTitle, notificationMessage, "MUSIC_VIDEO_UPDATED").catch(err => {
          console.error('[EMAIL] Failed to send notification email:', err);
        });
        
        // Send Telegram notification to admin (fire and forget - non-blocking)
        const { sendTelegramNotification } = await import("./telegram");
        void sendTelegramNotification(notificationTitle, notificationMessage).catch(err => {
          console.error('[TELEGRAM] Failed to send notification:', err);
        });
      }

      res.json(updatedVideo);
    } catch (error: any) {
      console.error('[VIDEO UPDATE] Error:', error);
      res.status(500).json({ error: error.message || "Failed to update music video" });
    }
  });

  // Generate payment order reference for release
  app.post("/api/releases/:id/payment", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req.user as AuthenticatedUser);
      if (!userId) {
        return res.status(401).json({ error: "User not authenticated" });
      }

      const { id } = req.params;
      const release = await storage.getRelease(id);

      if (!release) {
        return res.status(404).json({ error: "Release not found" });
      }

      // Get user for country information and access check
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(401).json({ error: "User not found" });
      }

      // Check access (considers frozen organizations)
      if (!await hasOrgAccess(user, release.orgId, storage)) {
        return res.status(403).json({ error: "Access denied" });
      }

      // Get organization directly from storage (not from userOrgs) to ensure correct pricing
      // This is important because admins may process payments for different organizations
      const organization = await storage.getOrganization(release.orgId);
      if (!organization) {
        return res.status(500).json({ error: "Organization not found" });
      }

      // Verify this is a client organization (ARTIST_ORG or LABEL)
      // Only client organizations can have STANDARD/AMBASSADOR pricing
      const isClientOrg = organization.type === "ARTIST_ORG" || organization.type === "LABEL";
      if (!isClientOrg) {
        return res.status(403).json({ error: "Payment not available for this organization type" });
      }

      // Generate order reference on server (prevent client forgery)
      const orderReference = `release_${id}_${Date.now()}`;

      // Update release with payment order reference
      await storage.updateRelease(id, { 
        paymentOrderReference: orderReference 
      });

      console.log('[RELEASE PAYMENT] Order reference generated:', orderReference);

      // Determine payment URL based on release type, organization status and user country
      const tracks = await storage.getTracks(id);
      const trackCount = tracks.length;
      
      // Determine product type based on track count (SINGLE for 1 track, ALBUM for 2+)
      // EP is treated as ALBUM for payment purposes
      const productType: ProductType = trackCount === 1 ? "SINGLE" : "ALBUM";
      
      // Only ARTIST_ORG and LABEL organizations can have AMBASSADOR status
      // Default to STANDARD for safety
      const organizationStatus = (organization.status || "STANDARD") as OrganizationStatus;
      const userCountry = user.country || "OTHER";
      const paymentUrl = getPaymentUrl(productType, organizationStatus, userCountry);

      console.log('[RELEASE PAYMENT] Selected URL for:', { 
        productType, 
        trackCount,
        organizationStatus, 
        userCountry, 
        paymentUrl 
      });

      res.json({ 
        orderReference,
        releaseId: id,
        paymentUrl,
      });
    } catch (error: any) {
      console.error('[RELEASE PAYMENT] Error:', error);
      res.status(500).json({ error: error.message || "Failed to generate payment order" });
    }
  });

  // Generate Wayforpay widget payment data for release (new widget-based flow)
  app.post("/api/releases/:id/widget-payment", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req.user as AuthenticatedUser);
      if (!userId) {
        return res.status(401).json({ error: "User not authenticated" });
      }

      const { id } = req.params;
      const release = await storage.getRelease(id);

      if (!release) {
        return res.status(404).json({ error: "Release not found" });
      }

      // Get user for access check
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(401).json({ error: "User not found" });
      }

      // Check access (considers frozen organizations)
      if (!await hasOrgAccess(user, release.orgId, storage)) {
        return res.status(403).json({ error: "Access denied" });
      }

      // Don't allow payment if already paid
      if (release.paymentStatus === "PAID") {
        return res.status(400).json({ error: "Release has already been paid" });
      }

      // Get organization for pricing
      const organization = await storage.getOrganization(release.orgId);
      if (!organization) {
        return res.status(500).json({ error: "Organization not found" });
      }

      // Verify this is a client organization
      const isClientOrg = organization.type === "ARTIST_ORG" || organization.type === "LABEL";
      if (!isClientOrg) {
        return res.status(403).json({ error: "Payment not available for this organization type" });
      }

      // Get Wayforpay credentials
      const merchantAccount = process.env.WAYFORPAY_MERCHANT_ACCOUNT;
      const secretKey = process.env.WAYFORPAY_SECRET_KEY;
      
      if (!merchantAccount || !secretKey) {
        console.error('[RELEASE WIDGET PAYMENT] Wayforpay credentials not configured');
        return res.status(500).json({ error: "Payment system not configured" });
      }

      // Generate order reference
      const orderReference = `release_${id}_${Date.now()}`;
      const orderDate = Math.floor(Date.now() / 1000);

      // Update release with payment order reference
      await storage.updateRelease(id, { 
        paymentOrderReference: orderReference 
      });

      // Determine product type and price
      const tracks = await storage.getTracks(id);
      const trackCount = tracks.length;
      const productType: ProductType = trackCount === 1 ? "SINGLE" : "ALBUM";
      const organizationStatus = (organization.status || "STANDARD") as OrganizationStatus;
      
      // Calculate animated artwork fee in UAH (stored in cents, convert to UAH)
      const animatedArtworkFeeUAH = release.animatedArtworkFeeApplied 
        ? Math.round(release.animatedArtworkFeeApplied / 100) 
        : 0;
      
      // TEST RELEASE: UPC "123" or specific test organization gets 1 UAH price for payment testing
      // TEST ORG: Марія-Олександра (f9483517-be64-476c-bf3f-68e9c834b715) - TEMPORARY for webhook testing
      const TEST_ORG_ID = "f9483517-be64-476c-bf3f-68e9c834b715";
      const isTestRelease = release.upc === "123" || release.orgId === TEST_ORG_ID;
      const baseAmountUAH = isTestRelease ? 1 : getProductPrice(productType, organizationStatus);
      const amountUAH = baseAmountUAH + animatedArtworkFeeUAH;
      
      if (isTestRelease) {
        console.log(`[RELEASE WIDGET PAYMENT] ⚠️ TEST MODE: Using 1 UAH price (orgId: ${release.orgId}, upc: ${release.upc})`);
      }
      
      if (animatedArtworkFeeUAH > 0) {
        console.log(`[RELEASE WIDGET PAYMENT] 🎨 Animated artwork fee: ${animatedArtworkFeeUAH} UAH`);
      }

      // Generate HMAC_MD5 signature
      const crypto = await import('crypto');
      const productName = [trackCount === 1 ? "Дистрибуція сингла" : "Дистрибуція альбому/EP"];
      const productCount = [1];
      const productPrice = [amountUAH];
      const currency = "UAH";
      const merchantDomainName = "muzika.ua";

      const signString = [
        merchantAccount,
        merchantDomainName,
        orderReference,
        orderDate,
        amountUAH,
        currency,
        ...productName,
        ...productCount.map(String),
        ...productPrice.map(String),
      ].join(';');

      const merchantSignature = crypto.createHmac('md5', secretKey).update(signString).digest('hex');

      // Webhook URL for Wayforpay to send payment confirmation
      const baseUrl = process.env.WAYFORPAY_SERVICE_URL || "https://muzika-dist.com";
      const serviceUrl = `${baseUrl}/api/webhooks/wayforpay`;

      console.log('[RELEASE WIDGET PAYMENT] Created payment data:', {
        releaseId: id,
        orderReference,
        amountUAH,
        productType,
        organizationStatus,
        signString,
        serviceUrl,
      });

      res.json({
        merchantAccount,
        merchantDomainName,
        merchantSignature,
        orderReference,
        orderDate,
        amount: amountUAH,
        currency,
        productName,
        productCount,
        productPrice,
        clientFirstName: user?.firstName || "",
        clientLastName: user?.lastName || "",
        clientEmail: user?.email || "",
        clientPhone: "",
        language: "UA",
        serviceUrl,
      });
    } catch (error: any) {
      console.error('[RELEASE WIDGET PAYMENT] Error:', error);
      res.status(500).json({ error: error.message || "Failed to generate payment data" });
    }
  });

  // Generate payment order reference for music video
  app.post("/api/music-videos/:id/payment", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req.user as AuthenticatedUser);
      if (!userId) {
        return res.status(401).json({ error: "User not authenticated" });
      }

      const { id } = req.params;
      const video = await storage.getMusicVideo(id);

      if (!video) {
        return res.status(404).json({ error: "Music video not found" });
      }

      // Get user for country information and access check
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(401).json({ error: "User not found" });
      }

      // Check access (considers frozen organizations)
      if (!await hasOrgAccess(user, video.orgId, storage)) {
        return res.status(403).json({ error: "Access denied" });
      }

      // Get organization directly from storage (not from userOrgs) to ensure correct pricing
      // This is important because admins may process payments for different organizations
      const organization = await storage.getOrganization(video.orgId);
      if (!organization) {
        return res.status(500).json({ error: "Organization not found" });
      }

      // Verify this is a client organization (ARTIST_ORG or LABEL)
      // Only client organizations can have STANDARD/AMBASSADOR pricing
      const isClientOrg = organization.type === "ARTIST_ORG" || organization.type === "LABEL";
      if (!isClientOrg) {
        return res.status(403).json({ error: "Payment not available for this organization type" });
      }

      // Generate order reference on server (prevent client forgery)
      const orderReference = `video_${id}_${Date.now()}`;

      // Only allow updating paymentOrderReference - protect sensitive fields
      const updatedVideo = await storage.updateMusicVideo(id, { 
        paymentOrderReference: orderReference 
      });

      console.log('[VIDEO PAYMENT] Order reference generated:', orderReference);

      // Determine payment URL based on organization status and user country
      // Only ARTIST_ORG and LABEL organizations can have AMBASSADOR status
      // Default to STANDARD for safety
      const organizationStatus = (organization.status || "STANDARD") as OrganizationStatus;
      const userCountry = user.country || "OTHER";
      const paymentUrl = getPaymentUrl("VIDEO", organizationStatus, userCountry);

      console.log('[VIDEO PAYMENT] Selected URL for:', { 
        productType: "VIDEO", 
        organizationStatus, 
        userCountry, 
        paymentUrl 
      });

      res.json({ 
        orderReference,
        videoId: id,
        paymentUrl,
      });
    } catch (error: any) {
      console.error('[VIDEO PAYMENT] Error:', error);
      res.status(500).json({ error: error.message || "Failed to generate payment order" });
    }
  });

  // Generate Wayforpay widget payment data for music video (new widget-based flow)
  app.post("/api/music-videos/:id/widget-payment", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req.user as AuthenticatedUser);
      if (!userId) {
        return res.status(401).json({ error: "User not authenticated" });
      }

      const { id } = req.params;
      const video = await storage.getMusicVideo(id);

      if (!video) {
        return res.status(404).json({ error: "Music video not found" });
      }

      // Get user for access check
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(401).json({ error: "User not found" });
      }

      // Check access (considers frozen organizations)
      if (!await hasOrgAccess(user, video.orgId, storage)) {
        return res.status(403).json({ error: "Access denied" });
      }

      // Don't allow payment if already paid
      if (video.paymentStatus === "PAID") {
        return res.status(400).json({ error: "Video has already been paid" });
      }

      // Get organization for pricing
      const organization = await storage.getOrganization(video.orgId);
      if (!organization) {
        return res.status(500).json({ error: "Organization not found" });
      }

      // Verify this is a client organization
      const isClientOrg = organization.type === "ARTIST_ORG" || organization.type === "LABEL";
      if (!isClientOrg) {
        return res.status(403).json({ error: "Payment not available for this organization type" });
      }

      // Get Wayforpay credentials
      const merchantAccount = process.env.WAYFORPAY_MERCHANT_ACCOUNT;
      const secretKey = process.env.WAYFORPAY_SECRET_KEY;
      
      if (!merchantAccount || !secretKey) {
        console.error('[VIDEO WIDGET PAYMENT] Wayforpay credentials not configured');
        return res.status(500).json({ error: "Payment system not configured" });
      }

      // Generate order reference
      const orderReference = `video_${id}_${Date.now()}`;
      const orderDate = Math.floor(Date.now() / 1000);

      // Update video with payment order reference
      await storage.updateMusicVideo(id, { 
        paymentOrderReference: orderReference 
      });

      // Determine price based on organization status
      const organizationStatus = (organization.status || "STANDARD") as OrganizationStatus;
      const amountUAH = getProductPrice("VIDEO", organizationStatus);

      // Generate HMAC_MD5 signature
      const crypto = await import('crypto');
      const productName = ["Дистрибуція музичного відео"];
      const productCount = [1];
      const productPrice = [amountUAH];
      const currency = "UAH";
      const merchantDomainName = "muzika.ua";

      const signString = [
        merchantAccount,
        merchantDomainName,
        orderReference,
        orderDate,
        amountUAH,
        currency,
        ...productName,
        ...productCount.map(String),
        ...productPrice.map(String),
      ].join(';');

      const merchantSignature = crypto.createHmac('md5', secretKey).update(signString).digest('hex');

      // Webhook URL for Wayforpay to send payment confirmation
      const baseUrl = process.env.WAYFORPAY_SERVICE_URL || "https://muzika-dist.com";
      const serviceUrl = `${baseUrl}/api/webhooks/wayforpay`;

      console.log('[VIDEO WIDGET PAYMENT] Created payment data:', {
        videoId: id,
        orderReference,
        amountUAH,
        organizationStatus,
        signString,
        serviceUrl,
      });

      res.json({
        merchantAccount,
        merchantDomainName,
        merchantSignature,
        orderReference,
        orderDate,
        amount: amountUAH,
        currency,
        productName,
        productCount,
        productPrice,
        clientFirstName: user?.firstName || "",
        clientLastName: user?.lastName || "",
        clientEmail: user?.email || "",
        clientPhone: "",
        language: "UA",
        serviceUrl,
      });
    } catch (error: any) {
      console.error('[VIDEO WIDGET PAYMENT] Error:', error);
      res.status(500).json({ error: error.message || "Failed to generate payment data" });
    }
  });

  // Get detailed release info for admin
  app.get("/api/admin/releases/:releaseId", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req.user as AuthenticatedUser);
      if (!userId) {
        return res.status(401).json({ error: "User not authenticated" });
      }

      // Check if user is admin
      const user = await storage.getUser(userId);
      if (!user || !isPlatformAdmin(user)) {
        return res.status(403).json({ error: "Admin access required" });
      }

      const { releaseId } = req.params;
      const release = await storage.getReleaseDetails(releaseId);
      
      if (!release) {
        return res.status(404).json({ error: "Release not found" });
      }
      
      res.json(release);
    } catch (error) {
      console.error("Error fetching release details:", error);
      res.status(500).json({ error: "Failed to fetch release details" });
    }
  });

  // User Management (Admin only)
  
  // Get all users
  app.get("/api/admin/users", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req.user as AuthenticatedUser);
      if (!userId) {
        return res.status(401).json({ error: "User not authenticated" });
      }

      const user = await storage.getUser(userId);
      if (!user || !isPlatformAdmin(user)) {
        return res.status(403).json({ error: "Admin access required" });
      }

      const users = await storage.getAllUsers();
      // Remove passwordHash from response
      const sanitizedUsers = users.map(({ passwordHash, ...user }) => user);
      res.json(sanitizedUsers);
    } catch (error) {
      console.error("Error fetching users:", error);
      res.status(500).json({ error: "Failed to fetch users" });
    }
  });

  // Get all organizations (Admin only) - with member info for admin panel
  app.get("/api/admin/organizations", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req.user as AuthenticatedUser);
      if (!userId) {
        return res.status(401).json({ error: "User not authenticated" });
      }

      const user = await storage.getUser(userId);
      if (!user || !isPlatformAdmin(user)) {
        return res.status(403).json({ error: "Admin access required" });
      }

      // Return all organizations with member count and orphan info
      const organizations = await storage.getAllOrganizationsWithMemberInfo();
      res.json(organizations);
    } catch (error) {
      console.error("Error fetching organizations:", error);
      res.status(500).json({ error: "Failed to fetch organizations" });
    }
  });

  // Get organization members (Admin only)
  app.get("/api/admin/organizations/:orgId/members", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req.user as AuthenticatedUser);
      if (!userId) {
        return res.status(401).json({ error: "User not authenticated" });
      }

      const user = await storage.getUser(userId);
      if (!user || !isPlatformAdmin(user)) {
        return res.status(403).json({ error: "Admin access required" });
      }

      const { orgId } = req.params;
      const members = await storage.getOrgMembers(orgId);
      res.json(members);
    } catch (error) {
      console.error("Error fetching organization members:", error);
      res.status(500).json({ error: "Failed to fetch organization members" });
    }
  });

  // Add organization member (Admin only)
  app.post("/api/admin/organizations/:orgId/members", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req.user as AuthenticatedUser);
      if (!userId) {
        return res.status(401).json({ error: "User not authenticated" });
      }

      const user = await storage.getUser(userId);
      if (!user || !isPlatformAdmin(user)) {
        return res.status(403).json({ error: "Admin access required" });
      }

      const { orgId } = req.params;
      const { userId: newUserId, role } = req.body;

      if (!newUserId || !role) {
        return res.status(400).json({ error: "userId and role are required" });
      }

      if (!["OWNER", "ADMIN", "MEMBER"].includes(role)) {
        return res.status(400).json({ error: "Invalid role. Must be OWNER, ADMIN, or MEMBER" });
      }

      const member = await storage.addOrgMember(orgId, newUserId, role);
      res.json(member);
    } catch (error: any) {
      console.error("Error adding organization member:", error);
      if (error.code === '23505') {
        return res.status(409).json({ error: "User is already a member of this organization" });
      }
      res.status(500).json({ error: "Failed to add organization member" });
    }
  });

  // Update organization member role (Admin only)
  app.patch("/api/admin/organizations/:orgId/members/:memberId", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req.user as AuthenticatedUser);
      if (!userId) {
        return res.status(401).json({ error: "User not authenticated" });
      }

      const user = await storage.getUser(userId);
      if (!user || !isPlatformAdmin(user)) {
        return res.status(403).json({ error: "Admin access required" });
      }

      const { memberId } = req.params;
      const { role } = req.body;

      if (!role) {
        return res.status(400).json({ error: "role is required" });
      }

      if (!["OWNER", "ADMIN", "MEMBER"].includes(role)) {
        return res.status(400).json({ error: "Invalid role. Must be OWNER, ADMIN, or MEMBER" });
      }

      const updated = await storage.updateOrgMemberRole(memberId, role);
      if (!updated) {
        return res.status(404).json({ error: "Organization member not found" });
      }

      res.json(updated);
    } catch (error: any) {
      console.error("Error updating organization member:", error);
      if (error.message && error.message.includes("last owner")) {
        return res.status(400).json({ error: error.message });
      }
      res.status(500).json({ error: "Failed to update organization member" });
    }
  });

  // Create new member and add to organization (Admin only)
  app.post("/api/admin/organizations/:orgId/create-member", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req.user as AuthenticatedUser);
      if (!userId) {
        return res.status(401).json({ error: "User not authenticated" });
      }

      const user = await storage.getUser(userId);
      if (!user || !isPlatformAdmin(user)) {
        return res.status(403).json({ error: "Admin access required" });
      }

      const { orgId } = req.params;
      const { email, firstName, lastName, country, role } = req.body;

      if (!email) {
        return res.status(400).json({ error: "Email is required" });
      }

      if (!role || !["ADMIN", "MEMBER"].includes(role)) {
        return res.status(400).json({ error: "Invalid role. Must be ADMIN or MEMBER" });
      }

      // Check if user with this email already exists
      const existingUser = await storage.getUserByEmail(email.toLowerCase());
      if (existingUser) {
        // Check if this user is already a member of this organization
        const isAlreadyMember = await storage.isOrgMember(existingUser.id, orgId);
        if (isAlreadyMember) {
          return res.status(409).json({ error: "This user is already a member of this organization" });
        }
        
        // User exists but not in this org - we can add them
        const member = await storage.addOrgMember(orgId, existingUser.id, role);
        return res.json({
          member,
          message: "Existing user added to organization successfully",
        });
      }

      // Generate temporary password
      const tempPassword = crypto.randomBytes(9).toString('base64').slice(0, 12);
      const passwordHash = await bcrypt.hash(tempPassword, 10);

      // Create user without organization
      const newUserId = await storage.createUser({
        email: email.toLowerCase(),
        firstName: firstName || "User",
        lastName: lastName || "",
        passwordHash,
        country: country || "UA",
        role: "ARTIST", // Default role for user record
      });

      // Add user as member to the organization
      const member = await storage.addOrgMember(orgId, newUserId, role);

      res.json({
        member,
        tempPassword,
        message: `User created successfully. Temporary password: ${tempPassword}`,
      });
    } catch (error: any) {
      console.error("Error creating organization member:", error);
      if (error.code === '23505') {
        return res.status(409).json({ error: "A user with this email already exists" });
      }
      res.status(500).json({ error: "Failed to create organization member" });
    }
  });

  // Remove organization member (Admin only)
  app.delete("/api/admin/organizations/:orgId/members/:memberId", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req.user as AuthenticatedUser);
      if (!userId) {
        return res.status(401).json({ error: "User not authenticated" });
      }

      const user = await storage.getUser(userId);
      if (!user || !isPlatformAdmin(user)) {
        return res.status(403).json({ error: "Admin access required" });
      }

      const { memberId } = req.params;
      await storage.removeOrgMember(memberId);
      res.json({ success: true });
    } catch (error: any) {
      console.error("Error removing organization member:", error);
      if (error.message && error.message.includes("last owner")) {
        return res.status(400).json({ error: error.message });
      }
      res.status(500).json({ error: "Failed to remove organization member" });
    }
  });

  // Update organization (Admin only)
  app.put("/api/admin/organizations/:orgId", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req.user as AuthenticatedUser);
      if (!userId) {
        return res.status(401).json({ error: "User not authenticated" });
      }

      const user = await storage.getUser(userId);
      if (!user || !isPlatformAdmin(user)) {
        return res.status(403).json({ error: "Admin access required" });
      }

      const { orgId } = req.params;
      const { name, type, status, isFrozen, freeReleases } = req.body;

      if (!name || !name.trim()) {
        return res.status(400).json({ error: "Organization name is required" });
      }

      if (!type || !["ARTIST_ORG", "LABEL"].includes(type)) {
        return res.status(400).json({ error: "Invalid organization type" });
      }

      // Prepare update data
      const updateData: Partial<Organization> = {
        name: name.trim(),
        type,
      };

      // Only update status for ARTIST_ORG, and only if provided
      if ((type === "ARTIST_ORG" || type === "LABEL") && status) {
        updateData.status = status;
      }

      // Handle freeze status toggle (explicit boolean check)
      if (typeof isFrozen === "boolean") {
        updateData.isFrozen = isFrozen;
      }

      // Handle free releases toggle (explicit boolean check)
      if (typeof freeReleases === "boolean") {
        updateData.freeReleases = freeReleases;
      }

      // Update organization
      const updatedOrg = await storage.updateOrganization(orgId, updateData);

      await storage.logAction({
        userId,
        orgId,
        action: "UPDATE_ORGANIZATION",
        entity: "organization",
        entityId: orgId,
        data: { name, type, status, isFrozen, freeReleases },
      });

      res.json(updatedOrg);
    } catch (error: any) {
      console.error("Error updating organization:", error);
      res.status(500).json({ error: "Failed to update organization" });
    }
  });

  // Delete organization (Admin only)
  app.delete("/api/admin/organizations/:orgId", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req.user as AuthenticatedUser);
      if (!userId) {
        return res.status(401).json({ error: "User not authenticated" });
      }

      const user = await storage.getUser(userId);
      if (!user || !isPlatformAdmin(user)) {
        return res.status(403).json({ error: "Admin access required" });
      }

      const { orgId } = req.params;
      
      // Delete organization (this will cascade delete all related data)
      await storage.deleteOrganization(orgId);
      
      await storage.logAction({
        userId,
        orgId,
        action: "DELETE_ORGANIZATION",
        entity: "organization",
        entityId: orgId,
        data: { message: "Deleted organization and all associated data" },
      });
      
      res.json({ success: true });
    } catch (error: any) {
      console.error("Error deleting organization:", error);
      res.status(500).json({ error: "Failed to delete organization" });
    }
  });

  // ========================================
  // Label-Artist Links (Admin only)
  // ========================================

  // Get all label-artist links
  app.get("/api/admin/label-links", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req.user as AuthenticatedUser);
      if (!userId) {
        return res.status(401).json({ error: "User not authenticated" });
      }

      const user = await storage.getUser(userId);
      if (!user || !isPlatformAdmin(user)) {
        return res.status(403).json({ error: "Admin access required" });
      }

      const links = await storage.getLabelArtistLinks();
      res.json(links);
    } catch (error: any) {
      console.error("Error fetching label-artist links:", error);
      res.status(500).json({ error: "Failed to fetch label-artist links" });
    }
  });

  // Get links for a specific label
  app.get("/api/admin/label-links/by-label/:labelOrgId", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req.user as AuthenticatedUser);
      if (!userId) {
        return res.status(401).json({ error: "User not authenticated" });
      }

      const user = await storage.getUser(userId);
      if (!user || !isPlatformAdmin(user)) {
        return res.status(403).json({ error: "Admin access required" });
      }

      const { labelOrgId } = req.params;
      const links = await storage.getLabelArtistLinksByLabel(labelOrgId);
      res.json(links);
    } catch (error: any) {
      console.error("Error fetching label-artist links by label:", error);
      res.status(500).json({ error: "Failed to fetch label-artist links" });
    }
  });

  // Get links for a specific artist
  app.get("/api/admin/label-links/by-artist/:artistOrgId", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req.user as AuthenticatedUser);
      if (!userId) {
        return res.status(401).json({ error: "User not authenticated" });
      }

      const user = await storage.getUser(userId);
      if (!user || !isPlatformAdmin(user)) {
        return res.status(403).json({ error: "Admin access required" });
      }

      const { artistOrgId } = req.params;
      const links = await storage.getLabelArtistLinksByArtist(artistOrgId);
      res.json(links);
    } catch (error: any) {
      console.error("Error fetching label-artist links by artist:", error);
      res.status(500).json({ error: "Failed to fetch label-artist links" });
    }
  });

  // Create label-artist link
  app.post("/api/admin/label-links", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req.user as AuthenticatedUser);
      if (!userId) {
        return res.status(401).json({ error: "User not authenticated" });
      }

      const user = await storage.getUser(userId);
      if (!user || !isPlatformAdmin(user)) {
        return res.status(403).json({ error: "Admin access required" });
      }

      const { 
        labelOrgId, 
        artistOrgId, 
        revenueSharePercent = 0, 
        labelPaysReleases = true,
        fixedReleaseFee,
        notes 
      } = req.body;

      if (!labelOrgId || !artistOrgId) {
        return res.status(400).json({ error: "labelOrgId and artistOrgId are required" });
      }

      // Validate that labelOrgId is a LABEL organization
      const labelOrg = await storage.getOrganization(labelOrgId);
      if (!labelOrg || labelOrg.type !== "LABEL") {
        return res.status(400).json({ error: "labelOrgId must be a LABEL organization" });
      }

      // Validate that artistOrgId is an ARTIST_ORG organization
      const artistOrg = await storage.getOrganization(artistOrgId);
      if (!artistOrg || artistOrg.type !== "ARTIST_ORG") {
        return res.status(400).json({ error: "artistOrgId must be an ARTIST_ORG organization" });
      }

      // Validate revenue share percent
      if (revenueSharePercent < 0 || revenueSharePercent > 100) {
        return res.status(400).json({ error: "revenueSharePercent must be between 0 and 100" });
      }

      const link = await storage.createLabelArtistLink({
        labelOrgId,
        artistOrgId,
        revenueSharePercent,
        labelPaysReleases,
        fixedReleaseFee: fixedReleaseFee || null,
        notes: notes || null,
      });

      await storage.logAction({
        userId,
        orgId: labelOrgId,
        action: "CREATE_LABEL_ARTIST_LINK",
        entity: "label_artist_link",
        entityId: link.id,
        data: { labelOrgId, artistOrgId, revenueSharePercent, labelPaysReleases },
      });

      res.status(201).json(link);
    } catch (error: any) {
      console.error("Error creating label-artist link:", error);
      res.status(500).json({ error: "Failed to create label-artist link" });
    }
  });

  // Update label-artist link
  app.put("/api/admin/label-links/:id", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req.user as AuthenticatedUser);
      if (!userId) {
        return res.status(401).json({ error: "User not authenticated" });
      }

      const user = await storage.getUser(userId);
      if (!user || !isPlatformAdmin(user)) {
        return res.status(403).json({ error: "Admin access required" });
      }

      const { id } = req.params;
      const { 
        revenueSharePercent, 
        labelPaysReleases, 
        fixedReleaseFee,
        status,
        notes 
      } = req.body;

      // Validate revenue share percent if provided
      if (revenueSharePercent !== undefined && (revenueSharePercent < 0 || revenueSharePercent > 100)) {
        return res.status(400).json({ error: "revenueSharePercent must be between 0 and 100" });
      }

      const updates: any = {};
      if (revenueSharePercent !== undefined) updates.revenueSharePercent = revenueSharePercent;
      if (labelPaysReleases !== undefined) updates.labelPaysReleases = labelPaysReleases;
      if (fixedReleaseFee !== undefined) updates.fixedReleaseFee = fixedReleaseFee;
      if (status !== undefined) updates.status = status;
      if (notes !== undefined) updates.notes = notes;

      const updated = await storage.updateLabelArtistLink(id, updates);
      
      if (!updated) {
        return res.status(404).json({ error: "Label-artist link not found" });
      }

      await storage.logAction({
        userId,
        orgId: updated.labelOrgId,
        action: "UPDATE_LABEL_ARTIST_LINK",
        entity: "label_artist_link",
        entityId: id,
        data: updates,
      });

      res.json(updated);
    } catch (error: any) {
      console.error("Error updating label-artist link:", error);
      res.status(500).json({ error: "Failed to update label-artist link" });
    }
  });

  // Delete label-artist link
  app.delete("/api/admin/label-links/:id", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req.user as AuthenticatedUser);
      if (!userId) {
        return res.status(401).json({ error: "User not authenticated" });
      }

      const user = await storage.getUser(userId);
      if (!user || !isPlatformAdmin(user)) {
        return res.status(403).json({ error: "Admin access required" });
      }

      const { id } = req.params;
      
      // Get link before deletion for logging
      const link = await storage.getLabelArtistLink(id);
      if (!link) {
        return res.status(404).json({ error: "Label-artist link not found" });
      }

      await storage.deleteLabelArtistLink(id);

      await storage.logAction({
        userId,
        orgId: link.labelOrgId,
        action: "DELETE_LABEL_ARTIST_LINK",
        entity: "label_artist_link",
        entityId: id,
        data: { labelOrgId: link.labelOrgId, artistOrgId: link.artistOrgId },
      });

      res.json({ success: true });
    } catch (error: any) {
      console.error("Error deleting label-artist link:", error);
      res.status(500).json({ error: "Failed to delete label-artist link" });
    }
  });

  // Create new user with temporary password
  app.post("/api/admin/users", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req.user as AuthenticatedUser);
      if (!userId) {
        return res.status(401).json({ error: "User not authenticated" });
      }

      const user = await storage.getUser(userId);
      if (!user || !isPlatformAdmin(user)) {
        return res.status(403).json({ error: "Admin access required" });
      }

      const { 
        email, 
        role, 
        firstName, 
        lastName, 
        organizationName, 
        country,
        platformRole,
        organizationType,
        organizationStatus 
      } = req.body;
      
      if (!email) {
        return res.status(400).json({ error: "Email is required" });
      }

      // If platform admin, don't require organization
      if (!platformRole && !organizationName) {
        return res.status(400).json({ error: "Organization name is required for non-platform users" });
      }

      // Generate cryptographically secure temporary password (12 chars)
      const tempPassword = crypto.randomBytes(9).toString('base64').slice(0, 12);
      
      // Hash password
      const passwordHash = await bcrypt.hash(tempPassword, 10);

      // Create user, organization, and link them atomically
      let newUserId: string;
      try {
        if (platformRole) {
          // Create platform admin user without organization
          newUserId = await storage.createPlatformAdminUser({
            email: email.toLowerCase(),
            firstName: firstName || "User",
            lastName: lastName || "",
            platformRole,
            passwordHash,
            country: country || "UA",
          });
        } else {
          // Create regular user with organization
          const finalOrgType = organizationType || (role === "LABEL" ? "LABEL" : "ARTIST_ORG");
          newUserId = await storage.createUserWithOrganization({
            email: email.toLowerCase(),
            firstName: firstName || "User",
            lastName: lastName || "",
            role: role || "ARTIST",
            passwordHash,
            organizationName,
            organizationType: finalOrgType,
            organizationStatus: ((finalOrgType === "ARTIST_ORG" || finalOrgType === "LABEL") && organizationStatus) ? organizationStatus : "STANDARD",
            country: country || "UA",
          });
        }
      } catch (error: any) {
        if (error.code === '23505') {
          return res.status(409).json({ error: "Email already exists" });
        }
        throw error;
      }

      // Get updated user with organizations
      const updatedUser = await storage.getUser(newUserId);
      if (!updatedUser) {
        return res.status(500).json({ error: "Failed to retrieve created user" });
      }

      // Remove passwordHash from user object before sending
      const { passwordHash: _, ...sanitizedUser } = updatedUser;
      
      // Return user data with temporary password (only this once!)
      res.json({
        user: sanitizedUser,
        temporaryPassword: tempPassword,
      });
    } catch (error: any) {
      console.error("Error creating user:", error);
      if (error.code === '23505') {
        return res.status(409).json({ error: "Email already exists" });
      }
      res.status(500).json({ error: "Failed to create user" });
    }
  });

  // Get all pitching submissions (Admin only)
  app.get("/api/admin/pitching", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req.user as AuthenticatedUser);
      if (!userId) {
        return res.status(401).json({ error: "User not authenticated" });
      }

      const user = await storage.getUser(userId);
      if (!user || !isPlatformAdmin(user)) {
        return res.status(403).json({ error: "Admin access required" });
      }

      const submissions = await storage.getAllPitchingSubmissions();
      res.json(submissions);
    } catch (error) {
      console.error("Error fetching pitching submissions:", error);
      res.status(500).json({ error: "Failed to fetch pitching submissions" });
    }
  });

  // Update pitching submission (Admin only)
  app.patch("/api/admin/pitching/:id", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req.user as AuthenticatedUser);
      if (!userId) {
        return res.status(401).json({ error: "User not authenticated" });
      }

      const user = await storage.getUser(userId);
      if (!user || !isPlatformAdmin(user)) {
        return res.status(403).json({ error: "Admin access required" });
      }

      const { id } = req.params;
      const updates = req.body;

      // Get old pitching data to check status change
      const oldPitching = await storage.getPitchingSubmission(id);
      
      const updated = await storage.updatePitchingSubmission(id, updates);
      if (!updated) {
        return res.status(404).json({ error: "Pitching submission not found" });
      }

      // Create notification if status changed to SUBMITTED
      if (oldPitching && updates.status === "SUBMITTED" && oldPitching.status !== "SUBMITTED") {
        const release = await storage.getReleaseDetails(updated.releaseId);
        if (release) {
          await storage.createNotification({
            userId: updated.userId,
            releaseId: updated.releaseId,
            pitchingId: updated.id,
            relatedEntityType: null,
            relatedEntityId: null,
            title: "Пітчинг відправлено",
            message: `${release.artist.name}, ${release.title} - ваш пітчинг успішно відправлено на розгляд`,
            type: "PITCHING_SUBMITTED",
            changedFields: null,
            isRead: false,
          });
        }
      }

      res.json(updated);
    } catch (error) {
      console.error("Error updating pitching submission:", error);
      res.status(500).json({ error: "Failed to update pitching submission" });
    }
  });

  // Update user (admin only)
  app.patch("/api/admin/users/:id", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req.user as AuthenticatedUser);
      if (!userId) {
        return res.status(401).json({ error: "User not authenticated" });
      }

      const user = await storage.getUser(userId);
      if (!user || !isPlatformAdmin(user)) {
        return res.status(403).json({ error: "Admin access required" });
      }

      const { id } = req.params;
      const { role, firstName, lastName, organizationName } = req.body;

      // Validate role if provided
      if (role && !["ARTIST", "LABEL", "TEAM", "ADMIN"].includes(role)) {
        return res.status(400).json({ error: "Invalid role" });
      }

      // Update user fields
      const userUpdates: any = {};
      if (role) userUpdates.role = role;
      if (firstName !== undefined) userUpdates.firstName = firstName;
      if (lastName !== undefined) userUpdates.lastName = lastName;

      if (Object.keys(userUpdates).length > 0) {
        const updated = await storage.updateUser(id, userUpdates);
        if (!updated) {
          return res.status(404).json({ error: "User not found" });
        }
      }

      // Update or create organization
      const userOrgs = await storage.getUserOrganizations(id);
      
      if (userOrgs.length > 0) {
        // Update existing organization
        const orgUpdates: any = {};
        
        if (organizationName !== undefined) {
          orgUpdates.name = organizationName;
        }
        
        if (role) {
          // Map role to organization type
          switch (role) {
            case "LABEL":
              orgUpdates.type = "LABEL";
              break;
            case "TEAM":
              orgUpdates.type = "TEAM";
              break;
            case "ADMIN":
              orgUpdates.type = "ADMIN";
              break;
            default:
              orgUpdates.type = "ARTIST_ORG";
          }
        }
        
        if (Object.keys(orgUpdates).length > 0) {
          await storage.updateOrganization(userOrgs[0].id, orgUpdates);
        }
      } else if (organizationName) {
        // Create organization if it doesn't exist and organizationName is provided
        let orgType: string;
        const userRole = role || userUpdates.role;
        
        switch (userRole) {
          case "LABEL":
            orgType = "LABEL";
            break;
          case "TEAM":
            orgType = "TEAM";
            break;
          case "ADMIN":
            orgType = "ADMIN";
            break;
          default:
            orgType = "ARTIST_ORG";
        }
        
        const newOrg = await storage.createOrganization({
          name: organizationName,
          type: orgType,
        });
        
        // Link user to the new organization as OWNER
        await storage.addOrgMember(newOrg.id, id, "OWNER");
      }

      // Get updated user with organizations
      const updatedUser = await storage.getUser(id);
      if (!updatedUser) {
        return res.status(404).json({ error: "User not found" });
      }
      
      // Remove passwordHash from user object before sending
      const { passwordHash: _, ...sanitizedUser } = updatedUser;
      res.json(sanitizedUser);
    } catch (error) {
      console.error("Error updating user:", error);
      res.status(500).json({ error: "Failed to update user" });
    }
  });

  // Delete user
  app.delete("/api/admin/users/:id", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req.user as AuthenticatedUser);
      if (!userId) {
        return res.status(401).json({ error: "User not authenticated" });
      }

      const user = await storage.getUser(userId);
      if (!user || !isPlatformAdmin(user)) {
        return res.status(403).json({ error: "Admin access required" });
      }

      const { id } = req.params;
      
      // Prevent self-deletion
      if (id === userId) {
        return res.status(400).json({ error: "Cannot delete your own account" });
      }

      await storage.deleteUser(id);
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting user:", error);
      res.status(500).json({ error: "Failed to delete user" });
    }
  });

  // Update user with organization and password (admin only)
  app.put("/api/admin/users/:id", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req.user as AuthenticatedUser);
      if (!userId) {
        return res.status(401).json({ error: "User not authenticated" });
      }

      const adminUser = await storage.getUser(userId);
      if (!adminUser || !isPlatformAdmin(adminUser)) {
        return res.status(403).json({ error: "Admin access required" });
      }

      const { id } = req.params;
      const { firstName, lastName, country, organizationId, orgRole, password, email } = req.body;

      // Validate required fields
      if (!firstName || !lastName || !country || !organizationId || !orgRole) {
        return res.status(400).json({ error: "Missing required fields" });
      }

      // Normalize email once - trim and lowercase for consistent handling
      const normalizedEmail = email ? email.trim().toLowerCase() : undefined;

      // Validate email - it's required and must be valid format
      if (email !== undefined) {
        // Check for empty or whitespace-only email
        if (!normalizedEmail) {
          return res.status(400).json({ error: "Email cannot be empty" });
        }
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(normalizedEmail)) {
          return res.status(400).json({ error: "Invalid email format" });
        }
      }

      if (!["OWNER", "ADMIN", "MEMBER"].includes(orgRole)) {
        return res.status(400).json({ error: "Invalid organization role" });
      }

      // Validate password if provided
      if (password && password.length < 8) {
        return res.status(400).json({ error: "Password must be at least 8 characters" });
      }

      // Get current user
      const targetUser = await storage.getUser(id);
      if (!targetUser) {
        return res.status(404).json({ error: "User not found" });
      }

      // Check email uniqueness if email is being changed (using normalized value)
      if (normalizedEmail && normalizedEmail !== targetUser.email.toLowerCase()) {
        const existingUser = await storage.getUserByEmail(normalizedEmail);
        if (existingUser) {
          return res.status(409).json({ error: "A user with this email already exists" });
        }
      }

      // Update basic user fields
      const userUpdates: any = {
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        country,
      };

      // Add email to updates if provided and changed (using normalized value)
      if (normalizedEmail && normalizedEmail !== targetUser.email.toLowerCase()) {
        userUpdates.email = normalizedEmail;
      }

      // Hash and update password if provided
      if (password) {
        const bcrypt = await import("bcrypt");
        const passwordHash = await bcrypt.hash(password, 10);
        userUpdates.passwordHash = passwordHash;
      }

      const updatedUser = await storage.updateUser(id, userUpdates);
      if (!updatedUser) {
        return res.status(404).json({ error: "User not found" });
      }

      // Handle organization membership change
      const currentOrgs = await storage.getUserOrganizations(id);
      const currentOrgId = currentOrgs.length > 0 ? currentOrgs[0].id : null;

      if (currentOrgId !== organizationId) {
        // Remove from old organization(s)
        for (const org of currentOrgs) {
          const members = await storage.getOrgMembers(org.id);
          const member = members.find(m => m.user.id === id);
          if (member) {
            await storage.removeOrgMember(member.id);
          }
        }

        // Add to new organization with specified role
        await storage.addOrgMember(organizationId, id, orgRole);
      } else if (currentOrgId) {
        // Same organization - just update role if changed
        const members = await storage.getOrgMembers(currentOrgId);
        const member = members.find(m => m.user.id === id);
        
        if (member && member.role !== orgRole) {
          await storage.updateOrgMemberRole(member.id, orgRole);
        }
      }

      // Get updated user with organizations
      const finalUser = await storage.getUser(id);
      if (!finalUser) {
        return res.status(404).json({ error: "User not found" });
      }

      // Remove passwordHash from user object before sending
      const { passwordHash: _, ...sanitizedUser } = finalUser;
      res.json(sanitizedUser);
    } catch (error) {
      console.error("Error updating user:", error);
      res.status(500).json({ error: "Failed to update user" });
    }
  });

  // Update release (admin only)
  app.put("/api/admin/releases/:releaseId", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req.user as AuthenticatedUser);
      if (!userId) {
        return res.status(401).json({ error: "User not authenticated" });
      }

      // Check if user is admin
      const user = await storage.getUser(userId);
      if (!user || !isPlatformAdmin(user)) {
        return res.status(403).json({ error: "Admin access required" });
      }

      const { releaseId } = req.params;
      
      // Validate and sanitize update data with admin schema
      const updateData = adminUpdateReleaseSchema.parse(req.body);

      // Get old release data BEFORE update to track changes
      const oldRelease = await storage.getRelease(releaseId);
      if (!oldRelease) {
        return res.status(404).json({ error: "Release not found" });
      }

      // Track if UPC is being added for the first time (for codesAssignedAt)
      const isFirstTimeUpcAssignment = updateData.upc && !oldRelease.upc && !oldRelease.codesAssignedAt;
      
      // If this is the first time UPC is assigned, set codesAssignedAt
      const finalUpdateData = isFirstTimeUpcAssignment 
        ? { ...updateData, codesAssignedAt: new Date() }
        : updateData;
      
      const updatedRelease = await storage.updateRelease(releaseId, finalUpdateData);
      
      if (!updatedRelease) {
        return res.status(404).json({ error: "Release not found" });
      }
      
      // Record status change event if status changed
      if (updateData.status && oldRelease.status !== updateData.status) {
        await storage.createReleaseStatusEvent({
          releaseId,
          fromStatus: oldRelease.status,
          toStatus: updateData.status,
          triggeredBy: userId,
        });
      }

      // Log the action
      await storage.logAction({
        userId,
        orgId: updatedRelease.orgId,
        action: "UPDATE_RELEASE",
        entity: "release",
        entityId: releaseId,
        data: { message: `Updated release: ${updatedRelease.title}` },
      });

      // Create notification for release owner if admin made changes
      const release = await storage.getReleaseDetails(releaseId);
      if (release) {
        // Track important field changes
        const importantChanges: string[] = [];
        
        if (oldRelease) {
          if (updateData.status && oldRelease.status !== updateData.status) {
            const statusLabels: { [key: string]: string } = {
              "DRAFT": "Чернетка",
              "IN_REVIEW": "На перевірці",
              "APPROVED": "Схвалено",
              "DELIVERING": "Доставляється",
              "DELIVERED": "Доставлено",
              "ACTIVE": "Активний",
              "DELETED": "Видалено"
            };
            importantChanges.push(`Статус: ${statusLabels[updateData.status] || updateData.status}`);
            
            // Create Google Calendar event when status changes to DELIVERING
            console.log(`📅 Checking calendar event creation conditions:`, {
              status: updateData.status,
              hasOriginalReleaseDate: !!release.originalReleaseDate,
              originalReleaseDate: release.originalReleaseDate,
              artistName: release.artist.name,
              releaseTitle: updatedRelease.title
            });
            
            if (updateData.status === "DELIVERING" && release.originalReleaseDate) {
              console.log(`📅 Creating calendar event for: ${updatedRelease.title}`);
              try {
                await createReleaseCalendarEvent({
                  releaseDate: new Date(release.originalReleaseDate),
                  artistName: release.artist.name,
                  releaseTitle: updatedRelease.title,
                  calendarEmail: "muzika.ua.info@gmail.com"
                });
                console.log(`✅ Calendar event created for release: ${updatedRelease.title}`);
              } catch (calendarError) {
                console.error('❌ Failed to create calendar event:', calendarError);
                console.error('❌ Calendar error details:', {
                  name: (calendarError as Error).name,
                  message: (calendarError as Error).message,
                  stack: (calendarError as Error).stack
                });
                // Don't fail the request if calendar event creation fails
              }
            } else {
              console.log(`⚠️ Calendar event NOT created. Reason:`, {
                statusIsDelivering: updateData.status === "DELIVERING",
                hasReleaseDate: !!release.originalReleaseDate
              });
            }
          }
          
          if (updateData.paymentStatus && oldRelease.paymentStatus !== updateData.paymentStatus) {
            importantChanges.push(`Оплата: ${updateData.paymentStatus === 'PAID' ? 'Оплачено' : 'Не оплачено'}`);
          }
          
          if (updateData.upc && oldRelease.upc !== updateData.upc) {
            importantChanges.push(`UPC: ${updateData.upc}`);
          }
        }
        
        // Notify organization members
        const orgMembers = await storage.getOrgMembers(release.orgId);
        for (const member of orgMembers) {
          if (member.userId !== userId) {
            const changeText = importantChanges.length > 0 
              ? ` (${importantChanges.join(", ")})`
              : "";
            
            await storage.createNotification({
              userId: member.userId,
              releaseId: releaseId,
              pitchingId: null,
              relatedEntityType: null,
              relatedEntityId: null,
              title: "Реліз оновлено адміністратором",
              message: `${release.artist.name}, ${updatedRelease.title}${changeText}`,
              type: "ADMIN_CHANGED",
              changedFields: importantChanges.join(", "),
              isRead: false,
            });
          }
        }
        
        // === MILESTONE NOTIFICATIONS (Platform + Telegram) ===
        const { sendOrgTelegramNotification } = await import("./telegram");
        
        // 1. UPC/ISRC assigned for the first time
        if (isFirstTimeUpcAssignment) {
          const upcNotificationTitle = "Коди присвоєно";
          const upcNotificationMessage = `Вашому релізу "${updatedRelease.title}" (${release.artist.name}) присвоєно UPC: ${updateData.upc}`;
          
          // Platform notification to all org members
          for (const member of orgMembers) {
            await storage.createNotification({
              userId: member.userId,
              releaseId: releaseId,
              pitchingId: null,
              relatedEntityType: null,
              relatedEntityId: null,
              title: upcNotificationTitle,
              message: upcNotificationMessage,
              type: "RELEASE_UPDATE",
              changedFields: "UPC",
              isRead: false,
            });
          }
          
          // Telegram notification to org
          void sendOrgTelegramNotification(
            storage,
            release.orgId,
            upcNotificationTitle,
            upcNotificationMessage
          ).catch(err => console.error('[TELEGRAM] UPC notification error:', err));
          
          console.log(`📢 UPC/ISRC notification sent for release: ${updatedRelease.title}`);
        }
        
        // 2. Pre-save link added (multilink with id.ffm.to domain)
        const isPresaveLink = updateData.multilink && updateData.multilink.includes('id.ffm.to');
        const multilinkChanged = updateData.multilink && oldRelease.multilink !== updateData.multilink;
        
        if (isPresaveLink && multilinkChanged) {
          const presaveNotificationTitle = "Pre-save доступний";
          const presaveNotificationMessage = `Pre-save для релізу "${updatedRelease.title}" (${release.artist.name}) тепер доступний:\n${updateData.multilink}`;
          
          // Platform notification to all org members
          for (const member of orgMembers) {
            await storage.createNotification({
              userId: member.userId,
              releaseId: releaseId,
              pitchingId: null,
              relatedEntityType: null,
              relatedEntityId: null,
              title: presaveNotificationTitle,
              message: presaveNotificationMessage,
              type: "RELEASE_UPDATE",
              changedFields: "Pre-save",
              isRead: false,
            });
          }
          
          // Telegram notification to org
          void sendOrgTelegramNotification(
            storage,
            release.orgId,
            presaveNotificationTitle,
            presaveNotificationMessage
          ).catch(err => console.error('[TELEGRAM] Pre-save notification error:', err));
          
          console.log(`📢 Pre-save notification sent for release: ${updatedRelease.title}`);
        }
        
        // 3. Status changed to DELIVERED (release is live on all platforms)
        const statusChangedToDelivered = updateData.status === "DELIVERED" && oldRelease.status !== "DELIVERED";
        
        if (statusChangedToDelivered) {
          const multilinkUrl = updatedRelease.multilink || updateData.multilink;
          const deliveredNotificationTitle = "Реліз на платформах";
          const deliveredNotificationMessage = multilinkUrl
            ? `Ваш реліз "${updatedRelease.title}" (${release.artist.name}) тепер доступний на всіх стрімінгових платформах!\n\n🎧 Слухати: ${multilinkUrl}`
            : `Ваш реліз "${updatedRelease.title}" (${release.artist.name}) тепер доступний на всіх стрімінгових платформах!`;
          
          // Platform notification to all org members
          for (const member of orgMembers) {
            await storage.createNotification({
              userId: member.userId,
              releaseId: releaseId,
              pitchingId: null,
              relatedEntityType: null,
              relatedEntityId: null,
              title: deliveredNotificationTitle,
              message: deliveredNotificationMessage,
              type: "RELEASE_UPDATE",
              changedFields: "Status",
              isRead: false,
            });
          }
          
          // Telegram notification to org
          void sendOrgTelegramNotification(
            storage,
            release.orgId,
            deliveredNotificationTitle,
            deliveredNotificationMessage
          ).catch(err => console.error('[TELEGRAM] Delivered notification error:', err));
          
          console.log(`📢 Delivered notification sent for release: ${updatedRelease.title}`);
        }
      }
      
      res.json(updatedRelease);
    } catch (error) {
      console.error("Error updating release:", error);
      
      // Handle validation errors properly
      if (error instanceof z.ZodError) {
        return res.status(400).json({ 
          error: "Validation failed",
          details: error.issues 
        });
      }
      
      res.status(500).json({ error: "Failed to update release" });
    }
  });

  // Admin delete music video
  app.delete("/api/admin/music-videos/:id", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req.user as AuthenticatedUser);
      if (!userId) {
        return res.status(401).json({ error: "User not authenticated" });
      }

      const user = await storage.getUser(userId);
      if (!isPlatformAdmin(user)) {
        return res.status(403).json({ error: "Admin access required" });
      }

      const { id } = req.params;
      
      // Check if video exists
      const video = await storage.getMusicVideo(id);
      if (!video) {
        return res.status(404).json({ error: "Music video not found" });
      }

      await storage.deleteMusicVideo(id);

      res.json({ success: true, message: "Music video deleted successfully" });
    } catch (error) {
      console.error("Error deleting music video:", error);
      res.status(500).json({ error: "Failed to delete music video" });
    }
  });

  // Admin update music video metadata
  app.put("/api/admin/music-videos/:id", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req.user as AuthenticatedUser);
      if (!userId) {
        return res.status(401).json({ error: "User not authenticated" });
      }

      // Check if user is admin
      const user = await storage.getUser(userId);
      if (!user || !isPlatformAdmin(user)) {
        return res.status(403).json({ error: "Admin access required" });
      }

      const { id } = req.params;
      
      // Validate and sanitize update data with admin schema
      const updateData = adminUpdateMusicVideoSchema.parse(req.body);

      // Get old music video data BEFORE update to track changes
      const oldVideo = await storage.getMusicVideo(id);
      if (!oldVideo) {
        return res.status(404).json({ error: "Music video not found" });
      }

      const updatedVideo = await storage.updateMusicVideo(id, updateData);
      
      if (!updatedVideo) {
        return res.status(404).json({ error: "Music video not found" });
      }

      // Log the action
      await storage.logAction({
        userId,
        orgId: updatedVideo.orgId,
        action: "UPDATE_MUSIC_VIDEO",
        entity: "musicVideo",
        entityId: id,
        data: { message: `Updated music video: ${updatedVideo.title}` },
      });

      // Create notification for video owner if admin made changes
      const importantChanges: string[] = [];
      
      if (updateData.status && oldVideo.status !== updateData.status) {
        const statusLabels: { [key: string]: string } = {
          "DRAFT": "Чернетка",
          "IN_REVIEW": "На перевірці",
          "APPROVED": "Схвалено",
          "DELIVERING": "Доставляється",
          "DELIVERED": "Доставлено",
          "ACTIVE": "Активний",
          "DELETED": "Видалено"
        };
        importantChanges.push(`Статус: ${statusLabels[updateData.status] || updateData.status}`);
      }
      
      if (updateData.paymentStatus && oldVideo.paymentStatus !== updateData.paymentStatus) {
        const paymentLabels: { [key: string]: string } = {
          "PENDING": "Очікує оплати",
          "PROCESSING": "Обробляється",
          "PAID": "Оплачено",
          "FAILED": "Помилка оплати"
        };
        importantChanges.push(`Оплата: ${paymentLabels[updateData.paymentStatus] || updateData.paymentStatus}`);
      }

      // Notify organization members if there are important changes
      if (importantChanges.length > 0 && oldVideo.organization) {
        const orgMembers = await storage.getOrgMembers(updatedVideo.orgId);
        
        for (const member of orgMembers) {
          await storage.createNotification({
            userId: member.userId,
            releaseId: null,
            pitchingId: null,
            type: "MUSIC_VIDEO_UPDATE",
            title: "Оновлення відео",
            message: `Відео "${updatedVideo.title}" оновлено адміністратором:\n${importantChanges.join('\n')}`,
            relatedEntityType: "musicVideo",
            relatedEntityId: id,
            changedFields: null,
            isRead: false,
          });
        }
      }

      res.json(updatedVideo);
    } catch (error: any) {
      console.error('[MUSIC VIDEO UPDATE ERROR]:', error);
      
      if (error instanceof z.ZodError) {
        return res.status(400).json({ 
          error: "Validation failed",
          details: error.issues 
        });
      }
      
      res.status(500).json({ error: error.message || "Failed to update music video" });
    }
  });

  // Auth routes
  app.get('/api/auth/user', isAuthenticated, async (req: any, res) => {
    try {
      // Handle both Replit Auth and Google OAuth users
      const userId = getUserId(req.user as AuthenticatedUser);
      
      const user = await storage.getUser(userId);
      
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      
      // Platform admins are never frozen - they see all organizations
      if (isPlatformAdmin(user)) {
        const organizations = await storage.getUserOrganizations(userId);
        const { passwordHash, ...safeUser } = user;
        return res.json({
          ...safeUser,
          organizations,
          isOrganizationFrozen: false,
        });
      }
      
      // For regular users: check if their organization is frozen
      // First get ALL organizations (including frozen) to check if user has any
      const allOrganizations = await storage.getUserOrganizations(userId);
      // Then get only active (non-frozen) organizations
      const activeOrganizations = await storage.getUserActiveOrganizations(userId);
      
      // User is frozen out if they have organizations but all are frozen
      const isOrganizationFrozen = allOrganizations.length > 0 && activeOrganizations.length === 0;
      
      // Remove sensitive fields before sending to client
      const { passwordHash, ...safeUser } = user;
      
      res.json({
        ...safeUser,
        organizations: activeOrganizations,
        isOrganizationFrozen,
      });
    } catch (error) {
      console.error("Error fetching user:", error);
      res.status(500).json({ message: "Failed to fetch user" });
    }
  });

  // Update user profile
  app.put('/api/user/profile', isAuthenticated, async (req: any, res) => {
    try {
      const userId = getUserId(req.user as AuthenticatedUser);
      
      const updateSchema = z.object({
        firstName: z.string().min(1).optional(),
        lastName: z.string().min(1).optional(),
        country: z.string().optional(),
        preferredLanguage: z.string().optional(),
        address: z.string().optional(),
        city: z.string().optional(),
        postalCode: z.string().optional(),
        agreementAccepted: z.boolean().optional(),
      });

      const updateData = updateSchema.parse(req.body);
      
      // Get current user to check if agreement is already accepted
      const currentUser = await storage.getUser(userId);
      
      // Only set timestamp on first acceptance (transition from false/null to true)
      if (updateData.agreementAccepted && !currentUser?.agreementAccepted) {
        (updateData as any).agreementAcceptedAt = new Date();
      }
      
      const updatedUser = await storage.updateUser(userId, updateData);
      
      if (!updatedUser) {
        return res.status(404).json({ message: "User not found" });
      }
      
      res.json(updatedUser);
    } catch (error) {
      console.error("Error updating user profile:", error);
      
      if (error instanceof z.ZodError) {
        return res.status(400).json({ 
          error: "Validation failed",
          details: error.issues 
        });
      }
      
      res.status(500).json({ message: "Failed to update profile" });
    }
  });

  // Update user profile image by fileId
  app.patch('/api/users/profile-image', isAuthenticated, async (req: any, res) => {
    try {
      const userId = getUserId(req.user as AuthenticatedUser);
      const { profileImageFileId } = req.body;

      if (!profileImageFileId) {
        return res.status(400).json({ error: "profileImageFileId is required" });
      }

      const updatedUser = await storage.updateUser(userId, { profileImageFileId });

      if (!updatedUser) {
        return res.status(404).json({ message: "User not found" });
      }

      res.json({ success: true, profileImageFileId });
    } catch (error) {
      console.error("Error updating profile image:", error);
      res.status(500).json({ message: "Failed to update profile image" });
    }
  });

  // Upload user avatar
  app.post('/api/user/avatar', isAuthenticated, fileUpload.single('file'), async (req: any, res) => {
    try {
      const userId = getUserId(req.user as AuthenticatedUser);
      
      if (!req.file) {
        return res.status(400).json({ message: "No file uploaded" });
      }

      console.log(`[AVATAR UPLOAD] Uploading avatar for user ${userId}, file: ${req.file.originalname}`);

      // Read file from disk and upload to Google Drive
      const fileBuffer = await readAndCleanupFile(req.file.path);
      
      // Generate unique filename
      const { randomUUID } = await import('crypto');
      const fileExtension = req.file.originalname.split('.').pop();
      const uniqueFilename = `avatar_${randomUUID()}.${fileExtension}`;

      // Upload to Google Drive
      const result = await googleDriveStorage.uploadFile(
        fileBuffer,
        uniqueFilename,
        req.file.mimetype
      );

      const downloadUrl = googleDriveStorage.getDirectDownloadLink(result.fileId);

      console.log(`[AVATAR UPLOAD] Uploaded to Google Drive, fileId: ${result.fileId}`);
      
      // Update user profile with new avatar
      const updatedUser = await storage.updateUser(userId, {
        profileImageUrl: downloadUrl,
        profileImageFileId: result.fileId,
        profileImageOriginalName: req.file.originalname,
      });
      
      if (!updatedUser) {
        return res.status(404).json({ message: "User not found" });
      }
      
      res.json({ 
        avatarUrl: downloadUrl,
        fileId: result.fileId
      });
    } catch (error) {
      console.error("Error uploading avatar:", error);
      res.status(500).json({ message: "Failed to upload avatar" });
    }
  });

  // Update user onboarding status
  app.patch('/api/user/onboarding', isAuthenticated, async (req: any, res) => {
    try {
      const userId = getUserId(req.user as AuthenticatedUser);
      
      const { hasSeenOnboarding } = req.body;
      
      if (typeof hasSeenOnboarding !== 'boolean') {
        return res.status(400).json({ message: "hasSeenOnboarding must be a boolean" });
      }
      
      const updatedUser = await storage.updateUser(userId, {
        hasSeenOnboarding,
      });
      
      if (!updatedUser) {
        return res.status(404).json({ message: "User not found" });
      }
      
      res.json({ success: true, hasSeenOnboarding: updatedUser.hasSeenOnboarding });
    } catch (error) {
      console.error("Error updating onboarding status:", error);
      res.status(500).json({ message: "Failed to update onboarding status" });
    }
  });

  // ===== SUPPORT CHAT ENDPOINTS =====
  
  // User: Get all support messages
  app.get('/api/support/messages', isAuthenticated, async (req: any, res) => {
    try {
      const userId = getUserId(req.user as AuthenticatedUser);
      const messages = await storage.getSupportMessagesByUser(userId);
      
      // Mark admin messages as read when user fetches them
      await storage.markSupportMessagesAsRead(userId, 'ADMIN');
      
      res.json(messages);
    } catch (error) {
      console.error("Error fetching support messages:", error);
      res.status(500).json({ message: "Failed to fetch messages" });
    }
  });

  // User: Send message to support (saves to DB + sends email/telegram to admins)
  app.post('/api/support/send', isAuthenticated, async (req: any, res) => {
    try {
      const userId = getUserId(req.user as AuthenticatedUser);
      const { message } = req.body;
      
      if (!message || typeof message !== 'string') {
        return res.status(400).json({ message: "Message is required" });
      }
      
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      
      const organizations = await storage.getUserOrganizations(userId);
      const orgName = organizations?.[0]?.name || "Unknown";
      
      // Save message to database
      const savedMessage = await storage.createSupportMessage({
        userId,
        message,
        senderType: 'USER',
        isRead: false,
      });
      
      // Send Telegram notification to admin (fire and forget)
      const { sendTelegramNotification } = await import("./telegram");
      void sendTelegramNotification(
        `Нове повідомлення в підтримку`,
        `Від: ${orgName} (${user.email})\n\n${message}`
      ).catch(err => {
        console.error('[TELEGRAM] Failed to send support notification:', err);
      });
      
      res.json(savedMessage);
    } catch (error) {
      console.error("Error sending support message:", error);
      res.status(500).json({ message: "Failed to send message" });
    }
  });

  // User: Get unread message count
  app.get('/api/support/unread-count', isAuthenticated, async (req: any, res) => {
    try {
      const userId = getUserId(req.user as AuthenticatedUser);
      const count = await storage.getUnreadSupportMessagesCount(userId);
      res.json({ count });
    } catch (error) {
      console.error("Error fetching unread count:", error);
      res.status(500).json({ message: "Failed to fetch unread count" });
    }
  });

  // Admin: Get total unread message count across all users
  app.get('/api/admin/support/unread-count', isAuthenticated, async (req: any, res) => {
    try {
      const currentUserId = getUserId(req.user as AuthenticatedUser);
      const currentUser = await storage.getUser(currentUserId);
      
      if (!currentUser || !isPlatformAdmin(currentUser)) {
        return res.status(403).json({ message: "Admin access required" });
      }
      
      const count = await storage.getAdminUnreadSupportMessagesCount();
      res.json({ count });
    } catch (error) {
      console.error("Error fetching admin unread count:", error);
      res.status(500).json({ message: "Failed to fetch unread count" });
    }
  });

  // Admin: Get all conversations
  app.get('/api/admin/support/conversations', isAuthenticated, async (req: any, res) => {
    try {
      const currentUserId = getUserId(req.user as AuthenticatedUser);
      const currentUser = await storage.getUser(currentUserId);
      
      if (!currentUser || !isPlatformAdmin(currentUser)) {
        return res.status(403).json({ message: "Admin access required" });
      }
      
      const conversations = await storage.getAllSupportConversations();
      
      // Enrich with organization info
      const enrichedConversations = await Promise.all(
        conversations.map(async (conv) => {
          const orgs = await storage.getUserOrganizations(conv.userId);
          return {
            ...conv,
            organizationName: orgs?.[0]?.name || "Unknown",
          };
        })
      );
      
      res.json(enrichedConversations);
    } catch (error) {
      console.error("Error fetching support conversations:", error);
      res.status(500).json({ message: "Failed to fetch conversations" });
    }
  });

  // Admin: Get messages for specific user
  app.get('/api/admin/support/messages/:userId', isAuthenticated, async (req: any, res) => {
    try {
      const currentUserId = getUserId(req.user as AuthenticatedUser);
      const currentUser = await storage.getUser(currentUserId);
      
      if (!currentUser || !isPlatformAdmin(currentUser)) {
        return res.status(403).json({ message: "Admin access required" });
      }
      
      const { userId } = req.params;
      const messages = await storage.getSupportMessagesByUser(userId);
      
      // Mark user messages as read when admin fetches them
      await storage.markSupportMessagesAsRead(userId, 'USER');
      
      res.json(messages);
    } catch (error) {
      console.error("Error fetching user messages:", error);
      res.status(500).json({ message: "Failed to fetch messages" });
    }
  });

  // Admin: Reply to user
  app.post('/api/admin/support/reply', isAuthenticated, async (req: any, res) => {
    try {
      const currentUserId = getUserId(req.user as AuthenticatedUser);
      const currentUser = await storage.getUser(currentUserId);
      
      if (!currentUser || !isPlatformAdmin(currentUser)) {
        return res.status(403).json({ message: "Admin access required" });
      }
      
      const { userId, message } = req.body;
      
      if (!userId || !message) {
        return res.status(400).json({ message: "userId and message are required" });
      }
      
      const targetUser = await storage.getUser(userId);
      if (!targetUser) {
        return res.status(404).json({ message: "Target user not found" });
      }
      
      // Save message to database
      const savedMessage = await storage.createSupportMessage({
        userId,
        message,
        senderType: 'ADMIN',
        adminId: currentUserId,
        isRead: false,
      });
      
      // Send email notification to user (fire and forget)
      if (targetUser.email) {
        void sendAdminToUserEmail(targetUser.email, message).catch(err => {
          console.error('[EMAIL] Failed to send admin reply:', err);
        });
      }
      
      // Create notification for user
      await storage.createNotification({
        userId,
        releaseId: null,
        pitchingId: null,
        relatedEntityType: "supportMessage",
        relatedEntityId: savedMessage.id,
        title: "Нова відповідь від підтримки",
        message: message.substring(0, 100) + (message.length > 100 ? '...' : ''),
        type: "SUPPORT_REPLY",
        changedFields: null,
        isRead: false,
      });
      
      res.json(savedMessage);
    } catch (error) {
      console.error("Error sending admin reply:", error);
      res.status(500).json({ message: "Failed to send reply" });
    }
  });

  // ===== CURATOR CHAT ENDPOINTS =====

  // Artist: Get messages for a specific application
  app.get('/api/curator-messages/:applicationId', isAuthenticated, async (req: any, res) => {
    try {
      const userId = getUserId(req.user as AuthenticatedUser);
      const { applicationId } = req.params;
      
      // Verify the user owns this application
      const application = await db.select().from(pitchingApplications).where(eq(pitchingApplications.id, applicationId)).limit(1);
      if (!application.length) {
        return res.status(404).json({ message: "Application not found" });
      }
      
      // Check if user is the applicant or the curator
      const userOrgs = await storage.getUserOrganizations(userId);
      const userOrgIds = userOrgs.map(o => o.id);
      
      const isApplicant = userOrgIds.length > 0 && userOrgIds.includes(application[0].orgId!);
      let isCurator: any[] = [];
      if (application[0].playlistId && userOrgIds.length > 0) {
        isCurator = await db.select().from(organizations)
          .innerJoin(localPlaylists, eq(localPlaylists.curatorOrgId, organizations.id))
          .where(and(
            eq(localPlaylists.id, application[0].playlistId!),
            inArray(organizations.id, userOrgIds)
          ))
          .limit(1);
      }
      
      if (!isApplicant && isCurator.length === 0) {
        return res.status(403).json({ message: "Access denied" });
      }
      
      const messages = await db.select().from(curatorMessages)
        .where(eq(curatorMessages.applicationId, applicationId))
        .orderBy(curatorMessages.createdAt);
      
      // Mark messages as read for the reader
      const senderTypeToMark = isApplicant ? 'CURATOR' : 'ARTIST';
      await db.update(curatorMessages)
        .set({ isRead: true })
        .where(and(
          eq(curatorMessages.applicationId, applicationId),
          eq(curatorMessages.senderType, senderTypeToMark)
        ));
      
      res.json(messages);
    } catch (error) {
      console.error("Error fetching curator messages:", error);
      res.status(500).json({ message: "Failed to fetch messages" });
    }
  });

  // Artist/Curator: Send a message
  app.post('/api/curator-messages/:applicationId', isAuthenticated, async (req: any, res) => {
    try {
      const userId = getUserId(req.user as AuthenticatedUser);
      const { applicationId } = req.params;
      const { message } = req.body;
      
      if (!message || typeof message !== 'string') {
        return res.status(400).json({ message: "Message is required" });
      }
      
      // Verify the user has access to this application
      const application = await db.select().from(pitchingApplications).where(eq(pitchingApplications.id, applicationId)).limit(1);
      if (!application.length) {
        return res.status(404).json({ message: "Application not found" });
      }
      
      const userOrgs = await storage.getUserOrganizations(userId);
      const userOrgIds = userOrgs.map(o => o.id);
      
      const isApplicant = userOrgIds.length > 0 && userOrgIds.includes(application[0].orgId!);
      
      // Check if user is curator
      let isCurator = false;
      let curatorOrg = null;
      if (application[0].playlistId && userOrgIds.length > 0) {
        const curatorCheck = await db.select({ org: organizations }).from(organizations)
          .innerJoin(localPlaylists, eq(localPlaylists.curatorOrgId, organizations.id))
          .where(and(
            eq(localPlaylists.id, application[0].playlistId!),
            inArray(organizations.id, userOrgIds)
          ))
          .limit(1);
        isCurator = curatorCheck.length > 0;
        curatorOrg = curatorCheck[0]?.org;
      }
      
      if (!isApplicant && !isCurator) {
        return res.status(403).json({ message: "Access denied" });
      }
      
      const senderType = isCurator ? 'CURATOR' : 'ARTIST';
      
      const [newMessage] = await db.insert(curatorMessages).values({
        applicationId,
        senderId: userId,
        senderType,
        message,
        isRead: false,
      }).returning();
      
      // Send notification to the other party
      const { sendOrgTelegramNotification } = await import("./telegram");
      const truncatedMessage = message.substring(0, 100) + (message.length > 100 ? '...' : '');
      
      if (isCurator) {
        // Notify artist (in-app + Telegram)
        const applicantOrg = await db.select().from(organizations).where(eq(organizations.id, application[0].orgId!)).limit(1);
        if (applicantOrg.length) {
          const applicantMembers = await db.select().from(orgMembers).where(eq(orgMembers.orgId, applicantOrg[0].id));
          for (const member of applicantMembers) {
            await storage.createNotification({
              userId: member.userId,
              releaseId: null,
              pitchingId: null,
              relatedEntityType: "curatorMessage",
              relatedEntityId: applicationId,
              title: "Нове повідомлення від куратора",
              message: truncatedMessage,
              type: "CURATOR_MESSAGE",
              changedFields: null,
              isRead: false,
            });
          }
          // Send Telegram notification to artist organization
          try {
            await sendOrgTelegramNotification(
              storage,
              applicantOrg[0].id,
              "💬 Нове повідомлення від куратора",
              `Куратор написав вам у чаті щодо заявки на плейлист:\n\n"${truncatedMessage}"\n\nПерейдіть у розділ "Мої заявки" щоб відповісти.`
            );
          } catch (telegramError) {
            console.error('Error sending Telegram notification to artist:', telegramError);
          }
        }
      } else {
        // Notify curator (in-app + Telegram)
        if (application[0].playlistId) {
          const playlist = await db.select().from(localPlaylists).where(eq(localPlaylists.id, application[0].playlistId!)).limit(1);
          if (playlist.length && playlist[0].curatorOrgId) {
            const curatorOrgMembersList = await db.select().from(orgMembers).where(eq(orgMembers.orgId, playlist[0].curatorOrgId));
            for (const member of curatorOrgMembersList) {
              await storage.createNotification({
                userId: member.userId,
                releaseId: null,
                pitchingId: null,
                relatedEntityType: "curatorMessage",
                relatedEntityId: applicationId,
                title: "Нове повідомлення від артиста",
                message: truncatedMessage,
                type: "CURATOR_MESSAGE",
                changedFields: null,
                isRead: false,
              });
            }
            // Send Telegram notification to curator organization
            try {
              await sendOrgTelegramNotification(
                storage,
                playlist[0].curatorOrgId,
                "💬 Нове повідомлення від артиста",
                `Артист написав вам у чаті щодо заявки на плейлист:\n\n"${truncatedMessage}"\n\nПерейдіть у розділ "Заявки" щоб відповісти.`
              );
            } catch (telegramError) {
              console.error('Error sending Telegram notification to curator:', telegramError);
            }
          }
        }
      }
      
      res.json(newMessage);
    } catch (error) {
      console.error("Error sending curator message:", error);
      res.status(500).json({ message: "Failed to send message" });
    }
  });

  // Get unread message count for an application
  app.get('/api/curator-messages/:applicationId/unread-count', isAuthenticated, async (req: any, res) => {
    try {
      const userId = getUserId(req.user as AuthenticatedUser);
      const { applicationId } = req.params;
      
      const application = await db.select().from(pitchingApplications).where(eq(pitchingApplications.id, applicationId)).limit(1);
      if (!application.length) {
        return res.status(404).json({ message: "Application not found" });
      }
      
      const userOrgs = await storage.getUserOrganizations(userId);
      const userOrgIds = userOrgs.map(o => o.id);
      
      const isApplicant = userOrgIds.includes(application[0].orgId!);
      
      // Check if user is curator
      let isCurator = false;
      if (application[0].playlistId) {
        const curatorCheck = await db.select().from(organizations)
          .innerJoin(localPlaylists, eq(localPlaylists.curatorOrgId, organizations.id))
          .where(and(
            eq(localPlaylists.id, application[0].playlistId!),
            inArray(organizations.id, userOrgIds)
          ))
          .limit(1);
        isCurator = curatorCheck.length > 0;
      }
      
      if (!isApplicant && !isCurator) {
        return res.status(403).json({ message: "Access denied" });
      }
      
      const senderTypeToCount = isApplicant ? 'CURATOR' : 'ARTIST';
      const [{ count }] = await db.select({ count: sql<number>`count(*)` })
        .from(curatorMessages)
        .where(and(
          eq(curatorMessages.applicationId, applicationId),
          eq(curatorMessages.senderType, senderTypeToCount),
          eq(curatorMessages.isRead, false)
        ));
      
      res.json({ count: Number(count) });
    } catch (error) {
      console.error("Error fetching unread count:", error);
      res.status(500).json({ message: "Failed to fetch unread count" });
    }
  });

  // Get curator online status
  app.get('/api/curator-presence/:applicationId', isAuthenticated, async (req: any, res) => {
    try {
      const { applicationId } = req.params;
      const userId = getUserId(req.user as AuthenticatedUser);
      
      const application = await db.select().from(pitchingApplications).where(eq(pitchingApplications.id, applicationId)).limit(1);
      if (!application.length || !application[0].playlistId) {
        return res.status(404).json({ message: "Application not found" });
      }
      
      const playlist = await db.select().from(localPlaylists).where(eq(localPlaylists.id, application[0].playlistId!)).limit(1);
      if (!playlist.length || !playlist[0].curatorOrgId) {
        return res.json({ isOnline: false, curatorName: null });
      }
      
      // Check if the caller is the curator (member of curator org)
      const userCuratorMembership = await db.select()
        .from(orgMembers)
        .where(and(
          eq(orgMembers.userId, userId),
          eq(orgMembers.orgId, playlist[0].curatorOrgId)
        ))
        .limit(1);
      
      const isCurator = userCuratorMembership.length > 0;
      
      if (isCurator) {
        // Curator is viewing - return artist presence
        const artistOrgMembers = await db.select({ userId: orgMembers.userId })
          .from(orgMembers)
          .where(eq(orgMembers.orgId, application[0].orgId));
        
        if (!artistOrgMembers.length) {
          const artistOrg = await db.select().from(organizations).where(eq(organizations.id, application[0].orgId)).limit(1);
          return res.json({ isOnline: false, curatorName: artistOrg[0]?.name || 'Artist' });
        }
        
        // Check if any artist member was active in the last 5 minutes
        const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
        const activeMembers = await db.select().from(users)
          .where(and(
            inArray(users.id, artistOrgMembers.map(m => m.userId)),
            sql`${users.lastActiveAt} > ${fiveMinutesAgo}`
          ))
          .limit(1);
        
        const artistOrg = await db.select().from(organizations).where(eq(organizations.id, application[0].orgId)).limit(1);
        
        return res.json({ 
          isOnline: activeMembers.length > 0, 
          curatorName: artistOrg[0]?.name || 'Artist'
        });
      }
      
      // Artist is viewing - return curator presence
      const curatorOrgMembers = await db.select({ userId: orgMembers.userId })
        .from(orgMembers)
        .where(eq(orgMembers.orgId, playlist[0].curatorOrgId));
      
      if (!curatorOrgMembers.length) {
        return res.json({ isOnline: false, curatorName: playlist[0].curatorOrgId });
      }
      
      // Check if any curator member was active in the last 5 minutes
      const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
      const activeMembers = await db.select().from(users)
        .where(and(
          inArray(users.id, curatorOrgMembers.map(m => m.userId)),
          sql`${users.lastActiveAt} > ${fiveMinutesAgo}`
        ))
        .limit(1);
      
      const curatorOrg = await db.select().from(organizations).where(eq(organizations.id, playlist[0].curatorOrgId)).limit(1);
      
      res.json({ 
        isOnline: activeMembers.length > 0, 
        curatorName: curatorOrg[0]?.name || 'Curator'
      });
    } catch (error) {
      console.error("Error fetching curator presence:", error);
      res.status(500).json({ message: "Failed to fetch presence" });
    }
  });

  // Update user presence (called on frontend activity)
  app.post('/api/presence/heartbeat', isAuthenticated, async (req: any, res) => {
    try {
      const userId = getUserId(req.user as AuthenticatedUser);
      await db.update(users).set({ lastActiveAt: new Date() }).where(eq(users.id, userId));
      res.json({ success: true });
    } catch (error) {
      console.error("Error updating presence:", error);
      res.status(500).json({ message: "Failed to update presence" });
    }
  });

  // Legacy endpoint - redirects to new support system
  app.post('/api/user/send-email', isAuthenticated, async (req: any, res) => {
    try {
      const userId = getUserId(req.user as AuthenticatedUser);
      const { message } = req.body;
      
      if (!message || typeof message !== 'string') {
        return res.status(400).json({ message: "Message is required" });
      }
      
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      
      const organizations = await storage.getUserOrganizations(userId);
      const orgName = organizations?.[0]?.name || "Unknown";
      
      // Save to new support system
      await storage.createSupportMessage({
        userId,
        message,
        senderType: 'USER',
        isRead: false,
      });
      
      // Also send email for backward compatibility
      if (user.email) {
        await sendUserToAdminEmail(orgName, user.email, message);
      }
      
      res.json({ success: true, message: "Email sent successfully" });
    } catch (error) {
      console.error("Error sending email to admin:", error);
      res.status(500).json({ message: "Failed to send email" });
    }
  });

  // Admin sends email to user (legacy - now also saves to support chat)
  app.post('/api/admin/send-email', isAuthenticated, async (req: any, res) => {
    try {
      const currentUserId = getUserId(req.user as AuthenticatedUser);
      const currentUser = await storage.getUser(currentUserId);
      
      if (!currentUser || !isPlatformAdmin(currentUser)) {
        return res.status(403).json({ message: "Admin access required" });
      }
      
      const { userId, message } = req.body;
      
      if (!userId || !message) {
        return res.status(400).json({ message: "userId and message are required" });
      }
      
      const targetUser = await storage.getUser(userId);
      if (!targetUser) {
        return res.status(404).json({ message: "Target user not found" });
      }
      
      if (!targetUser.email) {
        return res.status(400).json({ message: "User email not found" });
      }
      
      // Save to support chat
      await storage.createSupportMessage({
        userId,
        message,
        senderType: 'ADMIN',
        adminId: currentUserId,
        isRead: false,
      });
      
      await sendAdminToUserEmail(targetUser.email, message);
      
      res.json({ success: true, message: "Email sent successfully" });
    } catch (error) {
      console.error("Error sending email to user:", error);
      res.status(500).json({ message: "Failed to send email" });
    }
  });

  // Organization routes
  app.post('/api/organizations', isAuthenticated, async (req: any, res) => {
    try {
      const userId = getUserId(req.user as AuthenticatedUser);
      const orgData = insertOrganizationSchema.parse(req.body);
      
      const organization = await storage.createOrganization(orgData);
      await storage.addOrgMember(organization.id, userId, "OWNER");
      
      await storage.logAction({
        userId,
        orgId: organization.id,
        action: "CREATE_ORGANIZATION",
        entity: "organization",
        entityId: organization.id,
        data: { name: organization.name, type: organization.type },
      });
      
      res.json(organization);
    } catch (error) {
      console.error("Error creating organization:", error);
      res.status(500).json({ message: "Failed to create organization" });
    }
  });

  app.get('/api/organizations', isAuthenticated, async (req: any, res) => {
    try {
      const userId = getUserId(req.user as AuthenticatedUser);
      if (!userId) {
        return res.status(401).json({ error: "User not authenticated" });
      }

      const organizations = await storage.getUserOrganizations(userId);
      res.json(organizations);
    } catch (error) {
      console.error("Error fetching user organizations:", error);
      res.status(500).json({ message: "Failed to fetch organizations" });
    }
  });

  // GET /api/organizations/current - Get current user's curator organization
  // IMPORTANT: This route MUST be defined BEFORE /api/organizations/:id to prevent "current" being parsed as an :id parameter
  app.get('/api/organizations/current', isAuthenticated, async (req: any, res) => {
    try {
      const userId = getUserId(req.user as AuthenticatedUser);
      const userOrgs = await storage.getUserOrganizations(userId);
      const curatorOrg = userOrgs.find(o => o.type === 'PLAYLIST_CURATOR');

      if (!curatorOrg) {
        return res.status(404).json({ message: "Organization not found" });
      }

      res.json(curatorOrg);
    } catch (error) {
      console.error("Error fetching current organization:", error);
      res.status(500).json({ error: "Failed to fetch organization" });
    }
  });

  // PATCH /api/organizations/current/curator-profile - Update curator profile settings
  app.patch('/api/organizations/current/curator-profile', isAuthenticated, async (req: any, res) => {
    try {
      const userId = getUserId(req.user as AuthenticatedUser);
      const userOrgs = await storage.getUserOrganizations(userId);
      const curatorOrg = userOrgs.find(o => o.type === 'PLAYLIST_CURATOR');

      if (!curatorOrg) {
        return res.status(403).json({ error: "Curator organization not found" });
      }

      const {
        name,
        curatorBio,
        curatorAboutMe,
        curatorBannerUrl,
        curatorCoverImageUrl,
        curatorGenres,
        curatorLanguages,
        curatorVideoUrl,
        curatorAchievements,
        curatorFaqItems,
        spotifyUrl,
        instagramUrl,
        youtubeUrl,
        tiktokUrl,
      } = req.body;

      const updateData: any = {};
      
      const ensureJsonString = (val: any): string | null => {
        if (val === undefined || val === null) return null;
        if (typeof val === 'string') return val;
        if (Array.isArray(val)) return JSON.stringify(val);
        return null;
      };
      
      if (name !== undefined && typeof name === 'string') updateData.name = name.trim();
      if (curatorBio !== undefined && typeof curatorBio === 'string') updateData.curatorBio = curatorBio;
      if (curatorAboutMe !== undefined && typeof curatorAboutMe === 'string') updateData.curatorAboutMe = curatorAboutMe;
      if (curatorBannerUrl !== undefined && typeof curatorBannerUrl === 'string') updateData.curatorBannerUrl = curatorBannerUrl;
      if (curatorCoverImageUrl !== undefined && typeof curatorCoverImageUrl === 'string') updateData.curatorCoverImageUrl = curatorCoverImageUrl;
      if (curatorGenres !== undefined) updateData.curatorGenres = ensureJsonString(curatorGenres);
      if (curatorLanguages !== undefined) updateData.curatorLanguages = ensureJsonString(curatorLanguages);
      if (curatorVideoUrl !== undefined && typeof curatorVideoUrl === 'string') updateData.curatorVideoUrl = curatorVideoUrl;
      if (curatorAchievements !== undefined) updateData.curatorAchievements = ensureJsonString(curatorAchievements);
      
      if (curatorFaqItems !== undefined) {
        let faqArray: any[] = [];
        if (typeof curatorFaqItems === 'string') {
          try {
            faqArray = JSON.parse(curatorFaqItems);
          } catch {
            faqArray = [];
          }
        } else if (Array.isArray(curatorFaqItems)) {
          faqArray = curatorFaqItems;
        }
        
        if (Array.isArray(faqArray)) {
          const validatedFaq = faqArray
            .slice(0, 10)
            .filter((item: any) => 
              item && 
              typeof item.question === 'string' && 
              typeof item.answer === 'string' &&
              item.question.trim().length > 0 &&
              item.answer.trim().length > 0
            )
            .map((item: any) => ({
              question: item.question.trim().substring(0, 500),
              answer: item.answer.trim().substring(0, 2000)
            }));
          updateData.curatorFaqItems = JSON.stringify(validatedFaq);
        }
      }
      
      if (spotifyUrl !== undefined && typeof spotifyUrl === 'string') updateData.spotifyUrl = spotifyUrl;
      if (instagramUrl !== undefined && typeof instagramUrl === 'string') updateData.instagramUrl = instagramUrl;
      if (youtubeUrl !== undefined && typeof youtubeUrl === 'string') updateData.youtubeUrl = youtubeUrl;
      if (tiktokUrl !== undefined && typeof tiktokUrl === 'string') updateData.tiktokUrl = tiktokUrl;

      updateData.updatedAt = new Date();

      await db
        .update(organizations)
        .set(updateData)
        .where(eq(organizations.id, curatorOrg.id));

      res.json({ success: true });
    } catch (error: any) {
      console.error("Error updating curator profile:", error);
      res.status(500).json({ error: "Failed to update curator profile" });
    }
  });

  app.get('/api/organizations/:id', isAuthenticated, async (req: any, res) => {
    try {
      const { id } = req.params;
      const organization = await storage.getOrganization(id);
      
      if (!organization) {
        return res.status(404).json({ message: "Organization not found" });
      }
      
      res.json(organization);
    } catch (error) {
      console.error("Error fetching organization:", error);
      res.status(500).json({ message: "Failed to fetch organization" });
    }
  });

  app.put('/api/organizations/:id', isAuthenticated, async (req: any, res) => {
    try {
      const userId = getUserId(req.user as AuthenticatedUser);
      if (!userId) {
        return res.status(401).json({ error: "User not authenticated" });
      }

      const { id } = req.params;
      const updateData = req.body;
      
      // Check if user has permission to update this organization
      const isMember = await storage.isOrgMember(userId, id);
      if (!isMember) {
        return res.status(403).json({ error: "Not authorized to update this organization" });
      }

      // Get current user to check if admin
      const currentUser = await storage.getUser(userId);
      
      // Regular users (non-admins) cannot update name or type - only admins can
      let filteredUpdateData = { ...updateData };
      if (!isPlatformAdmin(currentUser)) {
        // Remove restricted fields for non-admin users
        delete filteredUpdateData.name;
        delete filteredUpdateData.type;
      }
      
      const updatedOrg = await storage.updateOrganization(id, filteredUpdateData);
      
      if (!updatedOrg) {
        return res.status(404).json({ message: "Organization not found" });
      }
      
      await storage.logAction({
        userId,
        orgId: id,
        action: "UPDATE_ORGANIZATION",
        entity: "organization",
        entityId: id,
        data: { message: "Updated organization settings" },
      });
      
      res.json(updatedOrg);
    } catch (error) {
      console.error("Error updating organization:", error);
      res.status(500).json({ message: "Failed to update organization" });
    }
  });

  // Telegram Integration - Generate verification code
  app.post('/api/organizations/:id/telegram/generate-code', isAuthenticated, async (req: any, res) => {
    try {
      const userId = getUserId(req.user as AuthenticatedUser);
      if (!userId) {
        return res.status(401).json({ error: "User not authenticated" });
      }

      const { id: orgId } = req.params;
      
      // Check if user has permission
      const isMember = await storage.isOrgMember(userId, orgId);
      if (!isMember) {
        return res.status(403).json({ error: "Not authorized" });
      }

      // Delete any existing pending codes for this org
      await storage.deleteTelegramVerificationCodesForOrg(orgId);

      // Generate new code
      const { generateVerificationCode } = await import("./telegram");
      const code = generateVerificationCode();
      const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes

      await storage.createTelegramVerificationCode({
        orgId,
        code,
        expiresAt,
      });

      res.json({ code, expiresAt });
    } catch (error) {
      console.error("Error generating Telegram code:", error);
      res.status(500).json({ message: "Failed to generate code" });
    }
  });

  // Telegram Integration - Get status
  app.get('/api/organizations/:id/telegram/status', isAuthenticated, async (req: any, res) => {
    try {
      const userId = getUserId(req.user as AuthenticatedUser);
      if (!userId) {
        return res.status(401).json({ error: "User not authenticated" });
      }

      const { id: orgId } = req.params;
      
      // Check if user has permission
      const isMember = await storage.isOrgMember(userId, orgId);
      if (!isMember) {
        return res.status(403).json({ error: "Not authorized" });
      }

      const org = await storage.getOrganization(orgId);
      
      res.json({ 
        connected: !!org?.telegramChatId,
        chatId: org?.telegramChatId || null
      });
    } catch (error) {
      console.error("Error getting Telegram status:", error);
      res.status(500).json({ message: "Failed to get status" });
    }
  });

  // Telegram Integration - Disconnect
  app.delete('/api/organizations/:id/telegram', isAuthenticated, async (req: any, res) => {
    try {
      const userId = getUserId(req.user as AuthenticatedUser);
      if (!userId) {
        return res.status(401).json({ error: "User not authenticated" });
      }

      const { id: orgId } = req.params;
      
      // Check if user has permission
      const isMember = await storage.isOrgMember(userId, orgId);
      if (!isMember) {
        return res.status(403).json({ error: "Not authorized" });
      }

      await storage.updateOrganization(orgId, { telegramChatId: null });
      await storage.deleteTelegramVerificationCodesForOrg(orgId);

      await storage.logAction({
        userId,
        orgId,
        action: "DISCONNECT_TELEGRAM",
        entity: "organization",
        entityId: orgId,
        data: { message: "Disconnected Telegram integration" },
      });

      res.json({ success: true });
    } catch (error) {
      console.error("Error disconnecting Telegram:", error);
      res.status(500).json({ message: "Failed to disconnect" });
    }
  });

  // Telegram Webhook (public - no auth required)
  app.post('/api/telegram/webhook', async (req, res) => {
    try {
      const { handleTelegramWebhook } = await import("./telegram");
      const result = await handleTelegramWebhook(storage, req.body);
      res.json(result);
    } catch (error) {
      console.error("Telegram webhook error:", error);
      res.status(500).json({ success: false });
    }
  });

  // Artist routes
  app.post('/api/artists', isAuthenticated, async (req: any, res) => {
    try {
      const userId = getUserId(req.user as AuthenticatedUser);
      const artistData = insertArtistSchema.parse(req.body);
      
      const artist = await storage.createArtist(artistData);
      
      await storage.logAction({
        userId,
        orgId: artistData.orgId,
        action: "CREATE_ARTIST",
        entity: "artist",
        entityId: artist.id,
        data: { name: artist.name },
      });
      
      res.json(artist);
    } catch (error) {
      console.error("Error creating artist:", error);
      res.status(500).json({ message: "Failed to create artist" });
    }
  });

  app.get('/api/organizations/:orgId/artists', isAuthenticated, async (req: any, res) => {
    try {
      const { orgId } = req.params;
      const artists = await storage.getArtists(orgId);
      res.json(artists);
    } catch (error) {
      console.error("Error fetching artists:", error);
      res.status(500).json({ message: "Failed to fetch artists" });
    }
  });

  // Release routes

  app.get('/api/organizations/:orgId/releases', isAuthenticated, async (req: any, res) => {
    try {
      const { orgId } = req.params;
      const releases = await storage.getReleases(orgId);
      res.json(releases);
    } catch (error) {
      console.error("Error fetching releases:", error);
      res.status(500).json({ message: "Failed to fetch releases" });
    }
  });

  app.get('/api/releases/:id', isAuthenticated, async (req: any, res) => {
    try {
      const { id } = req.params;
      const release = await storage.getRelease(id);
      
      if (!release) {
        return res.status(404).json({ message: "Release not found" });
      }
      
      const tracks = await storage.getTracks(id);
      const qcItems = await storage.getQCItems(id);
      const deliveryJobs = await storage.getDeliveryJobs(id);
      
      res.json({
        ...release,
        tracks,
        qcItems,
        deliveryJobs,
      });
    } catch (error) {
      console.error("Error fetching release:", error);
      res.status(500).json({ message: "Failed to fetch release" });
    }
  });

  app.patch('/api/releases/:id', isAuthenticated, async (req: any, res) => {
    try {
      const userId = getUserId(req.user as AuthenticatedUser);
      const { id } = req.params;
      const updates = req.body;
      
      const release = await storage.updateRelease(id, updates);
      
      await storage.logAction({
        userId,
        orgId: release.orgId,
        action: "UPDATE_RELEASE",
        entity: "release",
        entityId: id,
        data: updates,
      });
      
      res.json(release);
    } catch (error) {
      console.error("Error updating release:", error);
      res.status(500).json({ message: "Failed to update release" });
    }
  });


  app.post('/api/releases/:id/submit', isAuthenticated, async (req: any, res) => {
    try {
      const userId = getUserId(req.user as AuthenticatedUser);
      const { id } = req.params;
      
      // Check if release is paid
      const currentRelease = await storage.getRelease(id);
      if (!currentRelease) {
        return res.status(404).json({ error: "Release not found" });
      }
      
      if (currentRelease.paymentStatus !== "PAID") {
        return res.status(400).json({ 
          error: "Release must be paid before submission",
          message: "Будь ласка, оплатіть реліз перед відправкою на перевірку"
        });
      }
      
      // Update release status to IN_REVIEW
      const release = await storage.updateRelease(id, { status: "IN_REVIEW" });
      
      // Record status change event
      await storage.createReleaseStatusEvent({
        releaseId: id,
        fromStatus: currentRelease.status,
        toStatus: "IN_REVIEW",
        triggeredBy: userId,
      });
      
      // Create QC validation tasks
      await storage.createQCItem({
        releaseId: id,
        trackId: null,
        severity: "INFO",
        message: "Release submitted for quality control review",
        resolved: false,
      });
      
      await storage.logAction({
        userId,
        orgId: release.orgId,
        action: "SUBMIT_RELEASE",
        entity: "release",
        entityId: id,
        data: { status: "IN_REVIEW" },
      });
      
      res.json(release);
    } catch (error) {
      console.error("Error submitting release:", error);
      res.status(500).json({ message: "Failed to submit release" });
    }
  });

  // Track routes
  app.post('/api/tracks', isAuthenticated, async (req: any, res) => {
    try {
      const userId = getUserId(req.user as AuthenticatedUser);
      const trackData = insertTrackSchema.parse(req.body);
      
      // Generate ISRC if not provided
      if (!trackData.isrc) {
        trackData.isrc = `ISRC${Date.now()}${Math.random().toString(36).substring(2, 5).toUpperCase()}`;
      }
      
      const track = await storage.createTrack(trackData);
      
      const release = await storage.getRelease(track.releaseId);
      await storage.logAction({
        userId,
        orgId: release?.orgId || null,
        action: "CREATE_TRACK",
        entity: "track",
        entityId: track.id,
        data: { title: track.title, releaseId: track.releaseId },
      });
      
      res.json(track);
    } catch (error) {
      console.error("Error creating track:", error);
      res.status(500).json({ message: "Failed to create track" });
    }
  });

  app.get('/api/releases/:releaseId/tracks', isAuthenticated, async (req: any, res) => {
    try {
      const { releaseId } = req.params;
      const tracks = await storage.getTracks(releaseId);
      res.json(tracks);
    } catch (error) {
      console.error("Error fetching tracks:", error);
      res.status(500).json({ message: "Failed to fetch tracks" });
    }
  });

  // Split share routes
  app.post('/api/splits', isAuthenticated, async (req: any, res) => {
    try {
      const splitData = insertSplitShareSchema.parse(req.body);
      const split = await storage.createSplitShare(splitData);
      res.json(split);
    } catch (error) {
      console.error("Error creating split share:", error);
      res.status(500).json({ message: "Failed to create split share" });
    }
  });

  // File upload routes - Upload to Google Drive
  // Separate endpoints for audio and artwork to avoid field name conflicts
  const handleFileUpload = async (req: any, res: Response) => {
    try {
      console.log('[UPLOAD] Starting file upload process');
      
      if (!req.file) {
        console.error("[UPLOAD] No file in request");
        return res.status(400).json({ message: "No file provided" });
      }
      
      console.log('[UPLOAD] File received:', {
        name: req.file.originalname,
        size: req.file.size,
        mimetype: req.file.mimetype,
        path: req.file.path
      });
      
      // Generate unique filename
      const { randomUUID } = await import('crypto');
      const fileExtension = req.file.originalname.split('.').pop();
      const uniqueFilename = `${randomUUID()}.${fileExtension}`;
      
      console.log('[UPLOAD] Uploading to Google Drive:', uniqueFilename);
      
      // Read file from disk and upload to Google Drive (auto-cleanup temp file)
      const fileBuffer = await readAndCleanupFile(req.file.path);
      const result = await googleDriveStorage.uploadFile(
        fileBuffer,
        uniqueFilename,
        req.file.mimetype
      );
      
      console.log('[UPLOAD] Upload successful, fileId:', result.fileId);
      
      // Return the Google Drive file ID and download URL
      res.json({
        fileId: result.fileId,
        downloadUrl: googleDriveStorage.getDirectDownloadLink(result.fileId),
        webViewLink: result.webViewLink,
        metadata: {
          originalFilename: req.file.originalname,
          size: req.file.size,
          contentType: req.file.mimetype,
        }
      });
    } catch (error) {
      console.error("[UPLOAD] Error uploading file:", error);
      res.status(500).json({ message: "Failed to upload file" });
    }
  };
  
  app.post('/api/upload/audio', isAuthenticated, fileUpload.single('audio'), handleFileUpload);
  app.post('/api/upload/artwork', isAuthenticated, fileUpload.single('artwork'), handleFileUpload);
  app.post('/api/upload/animated-artwork', isAuthenticated, animatedArtworkUpload.single('animated-artwork'), handleFileUpload);
  app.post('/api/upload/image', isAuthenticated, fileUpload.single('file'), handleFileUpload);
  
  // Legacy endpoint for backward compatibility - accepts any field name (audio or artwork)
  app.post('/api/upload', isAuthenticated, (req: any, res: Response, next: any) => {
    // Accept any single file field (audio or artwork)
    fileUpload.any()(req, res, (err) => {
      if (err) return next(err);
      // Move first file to req.file for compatibility with handleFileUpload
      if (req.files && req.files.length > 0) {
        req.file = req.files[0];
      }
      handleFileUpload(req, res);
    });
  });

  // Chunked upload endpoints - for files >50MB
  // Temporary storage for chunks
  const uploadChunks = new Map<string, { chunks: Buffer[], metadata: any }>();

  // Upload individual chunk
  app.post('/api/upload/chunk', isAuthenticated, fileUpload.single('chunk'), async (req: any, res) => {
    try {
      const { uploadId, chunkIndex, totalChunks, fileName, mimeType } = req.body;
      
      console.log(`[CHUNK UPLOAD] Received chunk ${chunkIndex}/${totalChunks} for upload ${uploadId}`);
      
      if (!req.file) {
        return res.status(400).json({ message: "No chunk provided" });
      }

      // Initialize upload storage if needed
      if (!uploadChunks.has(uploadId)) {
        uploadChunks.set(uploadId, { 
          chunks: [], 
          metadata: { fileName, mimeType, totalChunks: parseInt(totalChunks) }
        });
      }

      const upload = uploadChunks.get(uploadId)!;
      // Read chunk from disk (auto-cleanup temp file)
      const chunkBuffer = await readAndCleanupFile(req.file.path);
      upload.chunks[parseInt(chunkIndex)] = chunkBuffer;

      res.json({ 
        success: true, 
        chunkIndex: parseInt(chunkIndex),
        received: upload.chunks.filter(c => c).length,
        total: parseInt(totalChunks)
      });
    } catch (error) {
      console.error("[CHUNK UPLOAD] Error:", error);
      res.status(500).json({ message: "Failed to upload chunk" });
    }
  });

  // Complete upload and merge chunks
  app.post('/api/upload/complete', isAuthenticated, async (req: any, res) => {
    try {
      const { uploadId } = req.body;
      
      console.log(`[CHUNK UPLOAD] Completing upload ${uploadId}`);

      const upload = uploadChunks.get(uploadId);
      if (!upload) {
        return res.status(400).json({ message: "Upload not found" });
      }

      // Check all chunks received
      const receivedChunks = upload.chunks.filter(c => c).length;
      if (receivedChunks !== upload.metadata.totalChunks) {
        return res.status(400).json({ 
          message: `Missing chunks: ${receivedChunks}/${upload.metadata.totalChunks}` 
        });
      }

      // Merge chunks
      const completeFile = Buffer.concat(upload.chunks);
      console.log(`[CHUNK UPLOAD] Merged ${upload.chunks.length} chunks, total size: ${completeFile.length} bytes`);

      // Generate unique filename
      const { randomUUID } = await import('crypto');
      const fileExtension = upload.metadata.fileName.split('.').pop();
      const uniqueFilename = `${randomUUID()}.${fileExtension}`;

      // Upload to Google Drive
      const result = await googleDriveStorage.uploadFile(
        completeFile,
        uniqueFilename,
        upload.metadata.mimeType
      );

      // Clean up
      uploadChunks.delete(uploadId);

      console.log(`[CHUNK UPLOAD] Upload successful, fileId: ${result.fileId}`);

      res.json({
        fileId: result.fileId,
        downloadUrl: googleDriveStorage.getDirectDownloadLink(result.fileId),
        webViewLink: result.webViewLink,
        metadata: {
          originalFilename: upload.metadata.fileName,
          size: completeFile.length,
          contentType: upload.metadata.mimeType,
        }
      });
    } catch (error) {
      console.error("[CHUNK UPLOAD] Error completing upload:", error);
      res.status(500).json({ message: "Failed to complete upload" });
    }
  });




  // Reporting routes
  app.get('/api/organizations/:orgId/reports', isAuthenticated, async (req: any, res) => {
    try {
      const { orgId } = req.params;
      const { period } = req.query;
      
      const reportRows = await storage.getReportRows(orgId, period as string);
      const summary = await storage.getRevenueSummary(orgId);
      
      res.json({
        reportRows,
        summary,
      });
    } catch (error) {
      console.error("Error fetching reports:", error);
      res.status(500).json({ message: "Failed to fetch reports" });
    }
  });

  // Statistics routes
  app.get('/api/organizations/:orgId/stats', isAuthenticated, async (req: any, res) => {
    try {
      const { orgId } = req.params;
      const stats = await storage.getOrgStats(orgId);
      res.json(stats);
    } catch (error) {
      console.error("Error fetching stats:", error);
      res.status(500).json({ message: "Failed to fetch stats" });
    }
  });

  app.get('/api/organizations/:orgId/recent-releases', isAuthenticated, async (req: any, res) => {
    try {
      const { orgId } = req.params;
      const { limit = 5 } = req.query;
      const recentReleases = await storage.getRecentReleases(orgId, Number(limit));
      res.json(recentReleases);
    } catch (error) {
      console.error("Error fetching recent releases:", error);
      res.status(500).json({ message: "Failed to fetch recent releases" });
    }
  });

  // Upcoming releases - releases with releaseDate in the future
  app.get('/api/organizations/:orgId/upcoming-releases', isAuthenticated, async (req: any, res) => {
    try {
      const { orgId } = req.params;
      const { limit = 3 } = req.query;
      
      const upcomingReleases = await db
        .select()
        .from(releases)
        .where(and(
          eq(releases.orgId, orgId),
          gte(releases.releaseDate, new Date()),
          inArray(releases.status, ["APPROVED", "DELIVERING", "DELIVERED"])
        ))
        .orderBy(asc(releases.releaseDate))
        .limit(Number(limit));
      
      res.json(upcomingReleases);
    } catch (error) {
      console.error("Error fetching upcoming releases:", error);
      res.status(500).json({ message: "Failed to fetch upcoming releases" });
    }
  });

  // Check if organization has any existing releases (for debut release detection)
  app.get('/api/organizations/:orgId/has-releases', isAuthenticated, async (req: any, res) => {
    try {
      const { orgId } = req.params;
      
      const existingReleases = await db
        .select({ id: releases.id })
        .from(releases)
        .where(eq(releases.orgId, orgId))
        .limit(1);
      
      res.json({ hasReleases: existingReleases.length > 0 });
    } catch (error) {
      console.error("Error checking releases:", error);
      res.status(500).json({ message: "Failed to check releases" });
    }
  });

  // Onboarding status - check which steps user has completed
  app.get('/api/organizations/:orgId/onboarding-status', isAuthenticated, async (req: any, res) => {
    try {
      const { orgId } = req.params;
      const userId = getUserId(req.user as AuthenticatedUser);
      
      if (!userId) {
        return res.status(401).json({ error: "User not authenticated" });
      }

      // Get user info for agreement check
      const [user] = await db
        .select()
        .from(users)
        .where(eq(users.id, userId));

      // Get organization info for social links check
      const [org] = await db
        .select()
        .from(organizations)
        .where(eq(organizations.id, orgId));

      // Check if user has any releases
      const userReleases = await db
        .select({ id: releases.id })
        .from(releases)
        .where(eq(releases.orgId, orgId))
        .limit(1);

      // Check if user has any pitching submissions
      const userPitching = await db
        .select({ id: pitchingSubmissions.id })
        .from(pitchingSubmissions)
        .where(eq(pitchingSubmissions.orgId, orgId))
        .limit(1);

      // Check if user has any completed withdrawals
      const userWithdrawals = await db
        .select({ id: withdrawals.id })
        .from(withdrawals)
        .where(and(
          eq(withdrawals.orgId, orgId),
          eq(withdrawals.status, "COMPLETED")
        ))
        .limit(1);

      // Check for social links (at least YouTube, Spotify, or Apple Music)
      const hasSocialLinks = !!(org?.youtubeUrl || org?.spotifyUrl || org?.appleMusicUrl);

      const onboardingStatus = {
        agreementAccepted: user?.agreementAccepted || false,
        socialLinksAdded: hasSocialLinks,
        firstReleaseShipped: userReleases.length > 0,
        pitchingSubmitted: userPitching.length > 0,
        firstWithdrawal: userWithdrawals.length > 0,
      };

      res.json(onboardingStatus);
    } catch (error) {
      console.error("Error fetching onboarding status:", error);
      res.status(500).json({ message: "Failed to fetch onboarding status" });
    }
  });

  // Get total streams for organization
  app.get('/api/organizations/:orgId/total-streams', isAuthenticated, async (req: any, res) => {
    try {
      const { orgId } = req.params;
      const totalStreams = await storage.getTotalStreams(orgId);
      res.json({ totalStreams });
    } catch (error) {
      console.error("Error fetching total streams:", error);
      res.status(500).json({ message: "Failed to fetch total streams" });
    }
  });

  // Platform News - public endpoint for user dashboard
  app.get('/api/platform-news', isAuthenticated, async (req: any, res) => {
    try {
      const { limit = 5 } = req.query;
      
      const news = await db
        .select()
        .from(platformNews)
        .where(and(
          eq(platformNews.isPublished, true),
          or(
            eq(platformNews.targetAudience, 'ALL'),
            eq(platformNews.targetAudience, 'ARTIST'),
            isNull(platformNews.targetAudience)
          )
        ))
        .orderBy(desc(platformNews.publishedAt))
        .limit(Number(limit));
      
      res.json(news);
    } catch (error) {
      console.error("Error fetching platform news:", error);
      res.status(500).json({ message: "Failed to fetch platform news" });
    }
  });

  // Curator platform news (filtered by CURATOR or ALL audience)
  app.get('/api/curator/platform-news', isAuthenticated, async (req: any, res) => {
    try {
      const curatorOrgId = await getCuratorOrgId(req.user as AuthenticatedUser);
      if (!curatorOrgId) {
        return res.status(403).json({ error: "Curator access required" });
      }

      const { limit = 5 } = req.query;
      
      const news = await db
        .select()
        .from(platformNews)
        .where(and(
          eq(platformNews.isPublished, true),
          or(
            eq(platformNews.targetAudience, 'ALL'),
            eq(platformNews.targetAudience, 'CURATOR'),
            isNull(platformNews.targetAudience)
          )
        ))
        .orderBy(desc(platformNews.publishedAt))
        .limit(Number(limit));
      
      res.json(news);
    } catch (error) {
      console.error("Error fetching curator platform news:", error);
      res.status(500).json({ message: "Failed to fetch platform news" });
    }
  });

  // Admin: Get royalties summary
  app.get('/api/admin/royalties/summary', isAuthenticated, async (req: any, res) => {
    try {
      if (!isPlatformAdmin(req.user as AuthenticatedUser)) {
        return res.status(403).json({ error: "Access denied" });
      }

      const { startPeriod, endPeriod } = req.query as { startPeriod?: string; endPeriod?: string };

      // Get exchange rates from streaming reports grouped by period/month
      const exchangeRatesQuery = db
        .select({
          period: streamingReports.period,
          eurToUahRate: streamingReports.eurToUahRate,
        })
        .from(streamingReports)
        .where(sql`${streamingReports.eurToUahRate} IS NOT NULL`);
      
      const exchangeRates = await exchangeRatesQuery;
      
      // Build period-to-rate map (use last non-null rate for each period)
      const rateMap = new Map<string, number>();
      for (const r of exchangeRates) {
        if (r.period && r.eurToUahRate) {
          rateMap.set(r.period, parseFloat(r.eurToUahRate));
        }
      }
      
      // Default rate if no rate found (latest Wayforpay rate ~44)
      const defaultRate = 44;
      const getRate = (period: string) => rateMap.get(period) || defaultRate;

      // Build period filter conditions
      const periodConditions = [];
      if (startPeriod) {
        periodConditions.push(sql`${reportRoyaltySummaries.reportMonth} >= ${startPeriod}`);
      }
      if (endPeriod) {
        periodConditions.push(sql`${reportRoyaltySummaries.reportMonth} <= ${endPeriod}`);
      }

      // Get all report royalty summaries (filtered by period if specified)
      const summariesQuery = db
        .select({
          id: reportRoyaltySummaries.id,
          orgId: reportRoyaltySummaries.orgId,
          reportMonth: reportRoyaltySummaries.reportMonth,
          totalGrossNano: reportRoyaltySummaries.totalGrossNano,
          orgName: organizations.name,
          orgType: organizations.type,
        })
        .from(reportRoyaltySummaries)
        .leftJoin(organizations, eq(reportRoyaltySummaries.orgId, organizations.id))
        .orderBy(desc(reportRoyaltySummaries.reportMonth));
      
      const summaries = periodConditions.length > 0
        ? await summariesQuery.where(and(...periodConditions))
        : await summariesQuery;

      // Build withdrawal period filter (based on requestedAt date matching period range)
      const withdrawalConditions = [];
      if (startPeriod) {
        const startDate = new Date(startPeriod + '-01');
        withdrawalConditions.push(sql`${withdrawals.requestedAt} >= ${startDate}`);
      }
      if (endPeriod) {
        const endDate = new Date(endPeriod + '-01');
        endDate.setMonth(endDate.getMonth() + 1);
        withdrawalConditions.push(sql`${withdrawals.requestedAt} < ${endDate}`);
      }

      // Get all withdrawals (filtered by period if specified) with organization names
      const withdrawalsQuery = db
        .select({
          id: withdrawals.id,
          orgId: withdrawals.orgId,
          orgName: organizations.name,
          amount: withdrawals.amount,
          status: withdrawals.status,
          requestedAt: withdrawals.requestedAt,
        })
        .from(withdrawals)
        .leftJoin(organizations, eq(withdrawals.orgId, organizations.id));
      
      const allWithdrawals = withdrawalConditions.length > 0
        ? await withdrawalsQuery.where(and(...withdrawalConditions))
        : await withdrawalsQuery;

      // Get platform stats (RPM - Revenue Per Mille = revenue per 1000 streams)
      // Note: Period in DB is MM-YYYY format, convert startPeriod/endPeriod from YYYY-MM
      const convertPeriod = (period: string) => {
        const [year, month] = period.split('-');
        return `${month}-${year}`;
      };

      const platformConditions = [];
      if (startPeriod) {
        const dbPeriod = convertPeriod(startPeriod);
        // Compare as dates by converting to comparable format
        platformConditions.push(sql`CONCAT(SUBSTRING(${streamingReportRows.period}, 4, 4), '-', SUBSTRING(${streamingReportRows.period}, 1, 2)) >= ${startPeriod}`);
      }
      if (endPeriod) {
        platformConditions.push(sql`CONCAT(SUBSTRING(${streamingReportRows.period}, 4, 4), '-', SUBSTRING(${streamingReportRows.period}, 1, 2)) <= ${endPeriod}`);
      }

      const platformStatsQuery = db
        .select({
          partner: streamingReportRows.partner,
          totalStreams: sql<string>`SUM(${streamingReportRows.streams})`.as('total_streams'),
          totalRevenue: sql<string>`SUM(${streamingReportRows.netRevenue})`.as('total_revenue'),
        })
        .from(streamingReportRows)
        .groupBy(streamingReportRows.partner);

      const platformStats = platformConditions.length > 0
        ? await platformStatsQuery.where(and(...platformConditions))
        : await platformStatsQuery;

      // Calculate RPM per platform (normalized partner names)
      const platformNameMap: Record<string, string> = {
        'Spotify': 'Spotify',
        'Apple Music': 'Apple Music',
        'YouTube': 'YouTube',
        'YouTube Music': 'YouTube',
        'You Tube': 'YouTube',
        'Shazam': 'Shazam',
        'TikTok': 'TikTok',
        'Deezer': 'Deezer',
        'Tidal': 'Tidal',
        'TIDAL': 'Tidal',
        'Amazon': 'Amazon',
        'Amazon Music': 'Amazon',
        'Amazon Music Unlimited': 'Amazon',
      };

      const platformRpmMap: Record<string, { streams: number; revenue: number }> = {};
      const targetPlatforms = ['Spotify', 'Apple Music', 'YouTube', 'Shazam', 'TikTok', 'Deezer', 'Tidal', 'Amazon'];
      
      for (const platform of targetPlatforms) {
        platformRpmMap[platform] = { streams: 0, revenue: 0 };
      }

      let totalStreams = 0;
      for (const stat of platformStats) {
        const normalizedName = platformNameMap[stat.partner] || stat.partner;
        const streams = parseInt(stat.totalStreams || '0');
        const revenue = parseFloat(stat.totalRevenue || '0');
        
        totalStreams += streams;
        
        if (platformRpmMap[normalizedName]) {
          platformRpmMap[normalizedName].streams += streams;
          platformRpmMap[normalizedName].revenue += revenue;
        }
      }

      // Calculate RPM (revenue per 1000 streams) for each platform with dual currency
      const platformRpm = targetPlatforms.map(platform => {
        const data = platformRpmMap[platform];
        const rpmEur = data.streams > 0 ? (data.revenue / data.streams) * 1000 : 0;
        const rpmUah = rpmEur * defaultRate;
        return {
          platform,
          streams: data.streams,
          revenue: Math.round(data.revenue * 100), // cents EUR
          revenueUah: Math.round(data.revenue * 100 * defaultRate), // cents UAH
          rpm: Math.round(rpmEur * 100), // cents per 1000 streams EUR
          rpmUah: Math.round(rpmUah * 100), // cents per 1000 streams UAH
        };
      });

      const now = new Date();
      let totalRevenueNano = BigInt(0);
      let totalRevenueNanoUah = BigInt(0);
      let availableNano = BigInt(0);
      let availableNanoUah = BigInt(0);
      let frozenNano = BigInt(0);
      let frozenNanoUah = BigInt(0);
      let paidCents = 0;
      let paidCentsUah = 0;

      // Aggregate by organization
      const orgMap = new Map<string, {
        orgId: string;
        orgName: string;
        orgType: string;
        totalNano: bigint;
        totalNanoUah: bigint;
        availableNano: bigint;
        availableNanoUah: bigint;
        frozenNano: bigint;
        frozenNanoUah: bigint;
        paidCents: number;
        paidCentsUah: number;
        pendingCents: number;
      }>();

      for (const summary of summaries) {
        const revenueNano = BigInt(summary.totalGrossNano || '0');
        const rate = getRate(summary.reportMonth);
        const revenueNanoUah = BigInt(Math.round(Number(revenueNano) * rate));
        
        totalRevenueNano += revenueNano;
        totalRevenueNanoUah += revenueNanoUah;
        
        // Calculate holdUntil as reportMonth + 3 months (standard holding period)
        const [year, month] = summary.reportMonth.split('-').map(Number);
        const holdUntilDate = new Date(year, month - 1 + 3, 1); // 3 months after report month
        const isFrozen = holdUntilDate > now;
        
        if (isFrozen) {
          frozenNano += revenueNano;
          frozenNanoUah += revenueNanoUah;
        } else {
          availableNano += revenueNano;
          availableNanoUah += revenueNanoUah;
        }

        // Group by org
        const existing = orgMap.get(summary.orgId) || {
          orgId: summary.orgId,
          orgName: summary.orgName || 'Unknown',
          orgType: summary.orgType || 'ARTIST_ORG',
          totalNano: BigInt(0),
          totalNanoUah: BigInt(0),
          availableNano: BigInt(0),
          availableNanoUah: BigInt(0),
          frozenNano: BigInt(0),
          frozenNanoUah: BigInt(0),
          paidCents: 0,
          paidCentsUah: 0,
          pendingCents: 0,
        };
        
        existing.totalNano += revenueNano;
        existing.totalNanoUah += revenueNanoUah;
        if (isFrozen) {
          existing.frozenNano += revenueNano;
          existing.frozenNanoUah += revenueNanoUah;
        } else {
          existing.availableNano += revenueNano;
          existing.availableNanoUah += revenueNanoUah;
        }
        
        orgMap.set(summary.orgId, existing);
      }

      // Add withdrawal data (withdrawals are in cents)
      for (const w of allWithdrawals) {
        if (w.status === 'COMPLETED') {
          const amount = w.amount || 0;
          paidCents += amount;
          // Use default rate for withdrawals since they don't have period context
          paidCentsUah += Math.round(amount * defaultRate);
          
          const org = orgMap.get(w.orgId);
          if (org) {
            org.paidCents += amount;
            org.paidCentsUah += Math.round(amount * defaultRate);
          }
        } else if (w.status === 'PENDING' || w.status === 'APPROVED') {
          const org = orgMap.get(w.orgId);
          if (org) {
            org.pendingCents += w.amount || 0;
          }
        }
      }

      // Convert nano to cents for response
      const nanoToCents = (nano: bigint) => Number(nano / BigInt(10000000));
      
      // Calculate monthly data for chart with both currencies
      const monthlyMap = new Map<string, { nano: bigint; nanoUah: bigint }>();
      for (const summary of summaries) {
        const month = summary.reportMonth;
        const revenueNano = BigInt(summary.totalGrossNano || '0');
        const rate = getRate(month);
        const revenueNanoUah = BigInt(Math.round(Number(revenueNano) * rate));
        
        const current = monthlyMap.get(month) || { nano: BigInt(0), nanoUah: BigInt(0) };
        current.nano += revenueNano;
        current.nanoUah += revenueNanoUah;
        monthlyMap.set(month, current);
      }
      
      const monthlyData = Array.from(monthlyMap.entries())
        .map(([month, data]) => ({
          month,
          revenue: nanoToCents(data.nano),
          revenueUah: nanoToCents(data.nanoUah),
        }))
        .sort((a, b) => a.month.localeCompare(b.month));

      // Organizations list with dual currency
      const organizationsList = Array.from(orgMap.values())
        .map(org => {
          const totalEur = nanoToCents(org.totalNano);
          const totalUah = nanoToCents(org.totalNanoUah);
          return {
            orgId: org.orgId,
            orgName: org.orgName,
            orgType: org.orgType,
            totalRevenue: totalEur,
            totalRevenueUah: totalUah,
            availableBalance: nanoToCents(org.availableNano),
            availableBalanceUah: nanoToCents(org.availableNanoUah),
            frozenBalance: nanoToCents(org.frozenNano),
            frozenBalanceUah: nanoToCents(org.frozenNanoUah),
            paidAmount: org.paidCents,
            paidAmountUah: org.paidCentsUah,
            pendingAmount: org.pendingCents,
            taxFop7: Math.round(totalEur * 0.07),
            taxFop7Uah: Math.round(totalUah * 0.07),
            taxAgent23: Math.round(totalEur * 0.23),
            taxAgent23Uah: Math.round(totalUah * 0.23),
          };
        })
        .sort((a, b) => b.totalRevenue - a.totalRevenue);

      const totalEur = nanoToCents(totalRevenueNano);
      const totalUah = nanoToCents(totalRevenueNanoUah);

      // Calculate withdrawal statistics
      const completedWithdrawals = allWithdrawals.filter(w => w.status === 'COMPLETED');
      const pendingWithdrawals = allWithdrawals.filter(w => w.status === 'PENDING');
      const approvedWithdrawals = allWithdrawals.filter(w => w.status === 'APPROVED');
      
      const totalWithdrawalsCount = allWithdrawals.length;
      const completedWithdrawalsCount = completedWithdrawals.length;
      const pendingWithdrawalsCount = pendingWithdrawals.length;
      const approvedWithdrawalsCount = approvedWithdrawals.length;
      
      const totalWithdrawnAmount = completedWithdrawals.reduce((sum, w) => sum + (w.amount || 0), 0);
      const averageWithdrawalAmount = completedWithdrawalsCount > 0 
        ? Math.round(totalWithdrawnAmount / completedWithdrawalsCount) 
        : 0;
      
      res.json({
        summary: {
          totalRevenue: totalEur,
          totalRevenueUah: totalUah,
          totalStreams,
          availableBalance: nanoToCents(availableNano),
          availableBalanceUah: nanoToCents(availableNanoUah),
          frozenBalance: nanoToCents(frozenNano),
          frozenBalanceUah: nanoToCents(frozenNanoUah),
          paidAmount: paidCents,
          paidAmountUah: paidCentsUah,
          taxFop7: Math.round(totalEur * 0.07),
          taxFop7Uah: Math.round(totalUah * 0.07),
          taxAgent23: Math.round(totalEur * 0.23),
          taxAgent23Uah: Math.round(totalUah * 0.23),
        },
        platformRpm,
        withdrawalStats: {
          totalCount: totalWithdrawalsCount,
          completedCount: completedWithdrawalsCount,
          pendingCount: pendingWithdrawalsCount,
          approvedCount: approvedWithdrawalsCount,
          totalWithdrawn: totalWithdrawnAmount,
          totalWithdrawnUah: Math.round(totalWithdrawnAmount * defaultRate),
          averageAmount: averageWithdrawalAmount,
          averageAmountUah: Math.round(averageWithdrawalAmount * defaultRate),
          requests: allWithdrawals.map(w => ({
            id: w.id,
            orgName: w.orgName || 'Unknown',
            amount: w.amount || 0,
            amountUah: Math.round((w.amount || 0) * defaultRate),
            status: w.status,
            requestedAt: w.requestedAt,
          })).sort((a, b) => new Date(b.requestedAt || 0).getTime() - new Date(a.requestedAt || 0).getTime()),
        },
        monthlyData,
        organizations: organizationsList,
      });
    } catch (error) {
      console.error("Error fetching royalties summary:", error);
      res.status(500).json({ message: "Failed to fetch royalties summary" });
    }
  });

  // Admin: Get all platform news
  app.get('/api/admin/platform-news', isAuthenticated, async (req: any, res) => {
    try {
      if (!isPlatformAdmin(req.user as AuthenticatedUser)) {
        return res.status(403).json({ error: "Access denied" });
      }

      const news = await db
        .select()
        .from(platformNews)
        .orderBy(desc(platformNews.createdAt));
      
      res.json(news);
    } catch (error) {
      console.error("Error fetching admin platform news:", error);
      res.status(500).json({ message: "Failed to fetch platform news" });
    }
  });

  // Admin: Create platform news
  app.post('/api/admin/platform-news', isAuthenticated, async (req: any, res) => {
    try {
      if (!isPlatformAdmin(req.user as AuthenticatedUser)) {
        return res.status(403).json({ error: "Access denied" });
      }

      const userId = getUserId(req.user as AuthenticatedUser);
      const { 
        titleEn, titleUk, titlePl, 
        contentEn, contentUk, contentPl, 
        images, youtubeUrl, pdfFileId,
        targetAudience = "ALL",
        isPublished = true 
      } = req.body;

      const [newNews] = await db
        .insert(platformNews)
        .values({
          titleEn,
          titleUk,
          titlePl,
          contentEn,
          contentUk,
          contentPl,
          images: images || [],
          youtubeUrl: youtubeUrl || null,
          pdfFileId: pdfFileId || null,
          targetAudience,
          isPublished,
          createdBy: userId!,
          publishedAt: isPublished ? new Date() : null,
        })
        .returning();
      
      res.json(newNews);
    } catch (error) {
      console.error("Error creating platform news:", error);
      res.status(500).json({ message: "Failed to create platform news" });
    }
  });

  // Admin: Update platform news
  app.patch('/api/admin/platform-news/:id', isAuthenticated, async (req: any, res) => {
    try {
      if (!isPlatformAdmin(req.user as AuthenticatedUser)) {
        return res.status(403).json({ error: "Access denied" });
      }

      const { id } = req.params;
      const { 
        titleEn, titleUk, titlePl, 
        contentEn, contentUk, contentPl, 
        images, youtubeUrl, pdfFileId,
        targetAudience,
        isPublished 
      } = req.body;

      const updateData: any = { updatedAt: new Date() };
      if (titleEn !== undefined) updateData.titleEn = titleEn;
      if (titleUk !== undefined) updateData.titleUk = titleUk;
      if (titlePl !== undefined) updateData.titlePl = titlePl;
      if (contentEn !== undefined) updateData.contentEn = contentEn;
      if (contentUk !== undefined) updateData.contentUk = contentUk;
      if (contentPl !== undefined) updateData.contentPl = contentPl;
      if (images !== undefined) updateData.images = images;
      if (youtubeUrl !== undefined) updateData.youtubeUrl = youtubeUrl;
      if (pdfFileId !== undefined) updateData.pdfFileId = pdfFileId;
      if (targetAudience !== undefined) updateData.targetAudience = targetAudience;
      if (isPublished !== undefined) {
        updateData.isPublished = isPublished;
        if (isPublished) updateData.publishedAt = new Date();
      }

      const [updated] = await db
        .update(platformNews)
        .set(updateData)
        .where(eq(platformNews.id, id))
        .returning();
      
      res.json(updated);
    } catch (error) {
      console.error("Error updating platform news:", error);
      res.status(500).json({ message: "Failed to update platform news" });
    }
  });

  // Admin: Delete platform news
  app.delete('/api/admin/platform-news/:id', isAuthenticated, async (req: any, res) => {
    try {
      if (!isPlatformAdmin(req.user as AuthenticatedUser)) {
        return res.status(403).json({ error: "Access denied" });
      }

      const { id } = req.params;

      await db
        .delete(platformNews)
        .where(eq(platformNews.id, id));
      
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting platform news:", error);
      res.status(500).json({ message: "Failed to delete platform news" });
    }
  });

  // Admin: Upload news media (images or PDF) to Google Drive
  app.post('/api/admin/platform-news/upload', isAuthenticated, newsMediaUpload.single('file'), async (req: any, res) => {
    try {
      if (!isPlatformAdmin(req.user as AuthenticatedUser)) {
        return res.status(403).json({ error: "Access denied" });
      }

      if (!req.file) {
        return res.status(400).json({ message: "No file provided" });
      }

      console.log('[NEWS MEDIA] Uploading file:', {
        name: req.file.originalname,
        size: req.file.size,
        mimetype: req.file.mimetype
      });

      // Generate unique filename
      const { randomUUID } = await import('crypto');
      const fileExtension = req.file.originalname.split('.').pop();
      const uniqueFilename = `news-${randomUUID()}.${fileExtension}`;

      // Read file and upload to Google Drive in news folder
      const fileBuffer = await readAndCleanupFile(req.file.path);
      const result = await googleDriveStorage.uploadFile(
        fileBuffer,
        uniqueFilename,
        req.file.mimetype,
        NEWS_MEDIA_FOLDER_ID
      );

      console.log('[NEWS MEDIA] Upload successful, fileId:', result.fileId);

      res.json({
        fileId: result.fileId,
        downloadUrl: googleDriveStorage.getDirectDownloadLink(result.fileId),
        webViewLink: result.webViewLink,
        metadata: {
          originalFilename: req.file.originalname,
          size: req.file.size,
          contentType: req.file.mimetype,
        }
      });
    } catch (error) {
      console.error("[NEWS MEDIA] Error uploading file:", error);
      res.status(500).json({ message: "Failed to upload file" });
    }
  });

  // Public: Get active promotional banners (filtered by user's country)
  app.get('/api/promotional-banners', isAuthenticated, async (req: any, res) => {
    try {
      const userId = getUserId(req.user as AuthenticatedUser);
      let userCountry = "UA";
      
      if (userId) {
        const user = await storage.getUser(userId);
        if (user?.country) {
          userCountry = user.country;
        }
      }

      const banners = await db
        .select()
        .from(promotionalBanners)
        .where(and(
          eq(promotionalBanners.isActive, true),
          or(
            eq(promotionalBanners.targetCountry, "ALL"),
            eq(promotionalBanners.targetCountry, userCountry)
          )
        ))
        .orderBy(asc(promotionalBanners.displayOrder));
      
      res.json(banners);
    } catch (error) {
      console.error("Error fetching promotional banners:", error);
      res.status(500).json({ message: "Failed to fetch promotional banners" });
    }
  });

  // Admin: Get all promotional banners
  app.get('/api/admin/promotional-banners', isAuthenticated, async (req: any, res) => {
    try {
      if (!isPlatformAdmin(req.user as AuthenticatedUser)) {
        return res.status(403).json({ error: "Access denied" });
      }

      const banners = await db
        .select()
        .from(promotionalBanners)
        .orderBy(asc(promotionalBanners.displayOrder));
      
      res.json(banners);
    } catch (error) {
      console.error("Error fetching admin promotional banners:", error);
      res.status(500).json({ message: "Failed to fetch promotional banners" });
    }
  });

  // Admin: Create promotional banner
  app.post('/api/admin/promotional-banners', isAuthenticated, async (req: any, res) => {
    try {
      if (!isPlatformAdmin(req.user as AuthenticatedUser)) {
        return res.status(403).json({ error: "Access denied" });
      }

      const userId = getUserId(req.user as AuthenticatedUser);
      const { textEn, textUk, textPl, linkUrl, linkTarget, targetCountry, displayOrder, isActive } = req.body;

      const [newBanner] = await db
        .insert(promotionalBanners)
        .values({
          textEn,
          textUk,
          textPl,
          linkUrl,
          linkTarget: linkTarget || "_self",
          targetCountry: targetCountry || "UA",
          displayOrder: displayOrder || 0,
          isActive: isActive !== false,
          createdBy: userId!,
        })
        .returning();

      res.status(201).json(newBanner);
    } catch (error) {
      console.error("Error creating promotional banner:", error);
      res.status(500).json({ message: "Failed to create promotional banner" });
    }
  });

  // Admin: Update promotional banner
  app.patch('/api/admin/promotional-banners/:id', isAuthenticated, async (req: any, res) => {
    try {
      if (!isPlatformAdmin(req.user as AuthenticatedUser)) {
        return res.status(403).json({ error: "Access denied" });
      }

      const { id } = req.params;
      const { textEn, textUk, textPl, linkUrl, linkTarget, targetCountry, displayOrder, isActive } = req.body;

      const updateData: any = { updatedAt: new Date() };
      if (textEn !== undefined) updateData.textEn = textEn;
      if (textUk !== undefined) updateData.textUk = textUk;
      if (textPl !== undefined) updateData.textPl = textPl;
      if (linkUrl !== undefined) updateData.linkUrl = linkUrl;
      if (linkTarget !== undefined) updateData.linkTarget = linkTarget;
      if (targetCountry !== undefined) updateData.targetCountry = targetCountry;
      if (displayOrder !== undefined) updateData.displayOrder = displayOrder;
      if (isActive !== undefined) updateData.isActive = isActive;

      const [updated] = await db
        .update(promotionalBanners)
        .set(updateData)
        .where(eq(promotionalBanners.id, id))
        .returning();

      res.json(updated);
    } catch (error) {
      console.error("Error updating promotional banner:", error);
      res.status(500).json({ message: "Failed to update promotional banner" });
    }
  });

  // Admin: Delete promotional banner
  app.delete('/api/admin/promotional-banners/:id', isAuthenticated, async (req: any, res) => {
    try {
      if (!isPlatformAdmin(req.user as AuthenticatedUser)) {
        return res.status(403).json({ error: "Access denied" });
      }

      const { id } = req.params;

      await db
        .delete(promotionalBanners)
        .where(eq(promotionalBanners.id, id));
      
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting promotional banner:", error);
      res.status(500).json({ message: "Failed to delete promotional banner" });
    }
  });

  // Notification routes
  app.get('/api/notifications', isAuthenticated, async (req: any, res) => {
    try {
      const userId = getUserId(req.user as AuthenticatedUser);
      if (!userId) {
        return res.status(401).json({ error: "User not authenticated" });
      }

      const { limit = 50 } = req.query;
      const userNotifications = await storage.getUserNotifications(userId, Number(limit));
      res.json(userNotifications);
    } catch (error) {
      console.error("Error fetching notifications:", error);
      res.status(500).json({ message: "Failed to fetch notifications" });
    }
  });

  app.get('/api/notifications/unread-count', isAuthenticated, async (req: any, res) => {
    try {
      const userId = getUserId(req.user as AuthenticatedUser);
      if (!userId) {
        return res.status(401).json({ error: "User not authenticated" });
      }

      const count = await storage.getUnreadNotificationCount(userId);
      res.json({ count });
    } catch (error) {
      console.error("Error fetching unread count:", error);
      res.status(500).json({ message: "Failed to fetch unread count" });
    }
  });

  app.put('/api/notifications/:id/read', isAuthenticated, async (req: any, res) => {
    try {
      const userId = getUserId(req.user as AuthenticatedUser);
      if (!userId) {
        return res.status(401).json({ error: "User not authenticated" });
      }

      const { id } = req.params;
      const updated = await storage.markNotificationAsRead(id);
      res.json(updated);
    } catch (error) {
      console.error("Error marking notification as read:", error);
      res.status(500).json({ message: "Failed to mark notification as read" });
    }
  });

  app.put('/api/notifications/mark-all-read', isAuthenticated, async (req: any, res) => {
    try {
      const userId = getUserId(req.user as AuthenticatedUser);
      if (!userId) {
        return res.status(401).json({ error: "User not authenticated" });
      }

      await storage.markAllNotificationsAsRead(userId);
      res.json({ success: true });
    } catch (error) {
      console.error("Error marking all notifications as read:", error);
      res.status(500).json({ message: "Failed to mark all notifications as read" });
    }
  });

  // Pitching routes
  app.get('/api/pitching/releases', isAuthenticated, async (req: any, res) => {
    try {
      const userId = getUserId(req.user as AuthenticatedUser);
      if (!userId) {
        return res.status(401).json({ error: "User not authenticated" });
      }

      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(401).json({ error: "User not found" });
      }

      const userOrgs = await getAccessibleOrganizations(user, userId, storage);
      if (userOrgs.length === 0) {
        return res.json([]);
      }

      // Admin can see releases from all organizations
      if (isPlatformAdmin(user)) {
        const allOrgs = await storage.getAllOrganizations();
        const allReleases = await Promise.all(
          allOrgs.map(org => storage.getRecentReleasesForPitching(org.id))
        );
        const flatReleases = allReleases.flat();
        res.json(flatReleases);
      } else {
        // Regular users see only their organization's releases
        const releases = await storage.getRecentReleasesForPitching(userOrgs[0].id);
        res.json(releases);
      }
    } catch (error) {
      console.error("Error fetching pitching releases:", error);
      res.status(500).json({ message: "Failed to fetch pitching releases" });
    }
  });

  app.post('/api/pitching', isAuthenticated, async (req: any, res) => {
    try {
      const userId = getUserId(req.user as AuthenticatedUser);
      if (!userId) {
        return res.status(401).json({ error: "User not authenticated" });
      }

      const user = await storage.getUser(userId);
      const userOrgs = await getAccessibleOrganizations(user, userId, storage);
      if (userOrgs.length === 0) {
        return res.status(400).json({ error: "No organization found" });
      }

      const submissionData = {
        ...req.body,
        userId,
        orgId: userOrgs[0].id,
      };

      const submission = await storage.createPitchingSubmission(submissionData);

      await storage.logAction({
        userId,
        orgId: userOrgs[0].id,
        action: "CREATE_PITCHING",
        entity: "pitching_submission",
        entityId: submission.id,
        data: { releaseId: submission.releaseId },
      });

      // Create notification for admins about new pitching submission
      const release = await storage.getRelease(submission.releaseId);
      if (release) {
        const allUsers = await storage.getAllUsers();
        const adminUsers = allUsers.filter(u => isPlatformAdmin(u));
        
        const organization = userOrgs[0];
        const notificationTitle = "Новий пітчинг";
        const notificationMessage = `${organization.name}, ${release.title}`;
        
        for (const admin of adminUsers) {
          await storage.createNotification({
            userId: admin.id,
            releaseId: submission.releaseId,
            pitchingId: submission.id,
            relatedEntityType: null,
            relatedEntityId: null,
            title: notificationTitle,
            message: notificationMessage,
            type: "PITCHING_SUBMITTED",
            isRead: false,
            changedFields: null,
          });
        }
        
        // Send email notification to admin (fire and forget - non-blocking)
        const { sendNotificationEmail } = await import("./googleMail");
        void sendNotificationEmail(notificationTitle, notificationMessage, "PITCHING_SUBMITTED").catch(err => {
          console.error('[EMAIL] Failed to send notification email:', err);
        });
        
        // Send Telegram notification to admin (fire and forget - non-blocking)
        const { sendTelegramNotification } = await import("./telegram");
        void sendTelegramNotification(notificationTitle, notificationMessage).catch(err => {
          console.error('[TELEGRAM] Failed to send notification:', err);
        });
      }

      res.json(submission);
    } catch (error) {
      console.error("Error creating pitching submission:", error);
      res.status(500).json({ message: "Failed to create pitching submission" });
    }
  });

  app.get('/api/pitching/submissions', isAuthenticated, async (req: any, res) => {
    try {
      const userId = getUserId(req.user as AuthenticatedUser);
      if (!userId) {
        return res.status(401).json({ error: "User not authenticated" });
      }

      const submissions = await storage.getPitchingSubmissions(userId);
      res.json(submissions);
    } catch (error) {
      console.error("Error fetching pitching submissions:", error);
      res.status(500).json({ message: "Failed to fetch pitching submissions" });
    }
  });

  app.get('/api/pitching/playlist-recommendations/:releaseId', isAuthenticated, async (req: any, res) => {
    try {
      const userId = getUserId(req.user as AuthenticatedUser);
      if (!userId) {
        return res.status(401).json({ error: "User not authenticated" });
      }

      const { releaseId } = req.params;
      const release = await storage.getRelease(releaseId);
      
      if (!release) {
        return res.status(404).json({ message: "Release not found" });
      }

      const tracks = await storage.getTracks(releaseId);
      if (!tracks || tracks.length === 0) {
        return res.status(404).json({ message: "No tracks found for this release" });
      }

      const focusTrack = tracks[0];
      const artist = await storage.getArtist(release.artistId);
      
      if (!artist) {
        return res.status(404).json({ message: "Artist not found" });
      }

      // Get organization's Spotify URL if available
      const organization = await storage.getOrganization(release.orgId);
      const spotifyUrl = organization?.spotifyUrl || undefined;

      const { getPlaylistRecommendations } = await import('./spotify');
      const recommendations = await getPlaylistRecommendations(focusTrack.title, artist.name, spotifyUrl);
      
      res.json({
        track: {
          title: focusTrack.title,
          artist: artist.name,
        },
        recommendations,
      });
    } catch (error: any) {
      console.error("Error getting playlist recommendations:", error);
      
      if (error.message === 'Track not found on Spotify') {
        return res.status(404).json({ 
          message: "Трек не знайдено на Spotify. Переконайтеся, що він вже опублікований на платформі.",
          error: error.message 
        });
      }
      
      res.status(500).json({ 
        message: "Не вдалося отримати рекомендації плейлистів",
        error: error.message 
      });
    }
  });

  // ========== YouTube Ads Routes ==========
  
  // Create a new YouTube ad campaign
  app.post('/api/ads/youtube', isAuthenticated, async (req: any, res) => {
    try {
      const userId = getUserId(req.user as AuthenticatedUser);
      if (!userId) {
        return res.status(401).json({ error: "User not authenticated" });
      }

      const user = await storage.getUser(userId);
      const { 
        videoUrl, videoId, budget, inStreamPercent, discoveryPercent, duration, 
        countries, cities, audience, orgId: requestedOrgId,
        // Calculated amounts in cents
        launchFee, adBudget, wayforpayFee, taxFee, youtubeTax, inStreamBudget, discoveryBudget
      } = req.body;
      
      // Determine organization ID
      let targetOrgId: string;
      
      if (isPlatformAdmin(user) && requestedOrgId) {
        // Platform admin can specify any organization - verify it exists
        const requestedOrg = await storage.getOrganization(requestedOrgId);
        if (!requestedOrg) {
          return res.status(400).json({ error: "Selected organization not found" });
        }
        targetOrgId = requestedOrgId;
      } else {
        // Regular users use their first organization
        const userOrgs = await getAccessibleOrganizations(user, userId, storage);
        if (userOrgs.length === 0) {
          return res.status(400).json({ error: "No organization found" });
        }
        targetOrgId = userOrgs[0].id;
      }

      if (!videoUrl || !videoId || !budget || !duration || !countries || countries.length === 0) {
        return res.status(400).json({ error: "Missing required fields" });
      }

      // Get Wayforpay credentials for payment
      const merchantAccount = process.env.WAYFORPAY_MERCHANT_ACCOUNT;
      const secretKey = process.env.WAYFORPAY_SECRET_KEY;
      
      if (!merchantAccount || !secretKey) {
        console.error('[YOUTUBE ADS] Wayforpay credentials not configured');
        return res.status(500).json({ error: "Payment system not configured" });
      }

      // Generate payment data first
      const orderReference = `ytads_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const orderDate = Math.floor(Date.now() / 1000);

      // Calculate amount in UAH
      const USD_TO_UAH_RATE = 41.5;
      const amountUAH = Math.round(budget * USD_TO_UAH_RATE * 100) / 100;

      // Create campaign with PENDING_PAYMENT status and payment reference
      const campaign = await storage.createYoutubeAdCampaign({
        userId,
        orgId: targetOrgId,
        videoUrl,
        videoId,
        budget,
        inStreamPercent: inStreamPercent || 50,
        discoveryPercent: discoveryPercent || 50,
        duration,
        countries,
        cities: cities || null,
        audience: audience || null,
        // Calculated amounts in cents (use ?? to preserve 0 values)
        launchFee: launchFee ?? null,
        adBudget: adBudget ?? null,
        wayforpayFee: wayforpayFee ?? null,
        taxFee: taxFee ?? null,
        youtubeTax: youtubeTax ?? null,
        inStreamBudget: inStreamBudget ?? null,
        discoveryBudget: discoveryBudget ?? null,
        status: "PENDING_PAYMENT",
        paymentStatus: "PENDING",
        paymentReference: orderReference,
      });

      // Generate HMAC_MD5 signature
      const crypto = await import('crypto');
      const productName = [`YouTube Ads Campaign - ${duration} days`];
      const productCount = [1];
      const productPrice = [amountUAH];
      const currency = "UAH";
      const merchantDomainName = "muzika.ua";

      const signString = [
        merchantAccount,
        merchantDomainName,
        orderReference,
        orderDate,
        amountUAH,
        currency,
        ...productName,
        ...productCount.map(String),
        ...productPrice.map(String),
      ].join(';');

      const merchantSignature = crypto.createHmac('md5', secretKey).update(signString).digest('hex');

      // Webhook URL for Wayforpay to send payment confirmation
      const baseUrl = process.env.WAYFORPAY_SERVICE_URL || "https://muzika-dist.com";
      const serviceUrl = `${baseUrl}/api/webhooks/wayforpay`;

      console.log('[YOUTUBE ADS] Created campaign with payment data:', {
        campaignId: campaign.id,
        orderReference,
        amountUAH,
        budget,
        signString,
        serviceUrl,
      });

      await storage.logAction({
        userId,
        orgId: targetOrgId,
        action: "CREATE_YOUTUBE_AD",
        entity: "youtube_ad_campaign",
        entityId: campaign.id,
        data: { videoUrl, budget },
      });

      // Return campaign with payment data (don't notify admins until payment is complete)
      res.json({
        campaign,
        paymentData: {
          merchantAccount,
          merchantDomainName,
          merchantSignature,
          orderReference,
          orderDate,
          amount: amountUAH,
          currency,
          productName,
          productCount,
          productPrice,
          clientFirstName: user?.firstName || "",
          clientLastName: user?.lastName || "",
          clientEmail: user?.email || "",
          clientPhone: "",
          language: "UA",
          serviceUrl,
        },
      });
    } catch (error) {
      console.error("Error creating YouTube ad campaign:", error);
      res.status(500).json({ message: "Failed to create YouTube ad campaign" });
    }
  });

  // Get user's YouTube ad campaigns
  app.get('/api/ads/youtube', isAuthenticated, async (req: any, res) => {
    try {
      const userId = getUserId(req.user as AuthenticatedUser);
      if (!userId) {
        return res.status(401).json({ error: "User not authenticated" });
      }

      const user = await storage.getUser(userId);
      const userOrgs = await getAccessibleOrganizations(user, userId, storage);
      
      if (isPlatformAdmin(user)) {
        // Admin can see all campaigns
        const campaigns = await storage.getAllYoutubeAdCampaigns();
        return res.json(campaigns);
      }

      if (userOrgs.length === 0) {
        return res.json([]);
      }

      const campaigns = await storage.getYoutubeAdCampaignsByOrg(userOrgs[0].id);
      res.json(campaigns);
    } catch (error) {
      console.error("Error fetching YouTube ad campaigns:", error);
      res.status(500).json({ message: "Failed to fetch YouTube ad campaigns" });
    }
  });

  // Admin: Update YouTube Ad campaign status
  app.patch('/api/admin/ads/youtube/:id', isAuthenticated, async (req: any, res) => {
    try {
      const userId = getUserId(req.user as AuthenticatedUser);
      if (!userId) {
        return res.status(401).json({ error: "User not authenticated" });
      }

      const user = await storage.getUser(userId);
      if (!user || !isPlatformAdmin(user)) {
        return res.status(403).json({ error: "Admin access required" });
      }

      const { id } = req.params;
      const { status, adminNotes } = req.body;

      const oldCampaign = await storage.getYoutubeAdCampaign(id);
      if (!oldCampaign) {
        return res.status(404).json({ error: "Campaign not found" });
      }

      const updates: { status?: string; adminNotes?: string } = {};
      if (status) updates.status = status;
      if (adminNotes !== undefined) updates.adminNotes = adminNotes;

      const updated = await storage.updateYoutubeAdCampaign(id, updates);

      // Create notification for user about status change
      if (status && oldCampaign.status !== status) {
        const statusMessages: Record<string, string> = {
          APPROVED: "Вашу YouTube рекламну кампанію схвалено",
          REJECTED: "Вашу YouTube рекламну кампанію відхилено",
          ACTIVE: "Вашу YouTube рекламну кампанію активовано",
          COMPLETED: "Вашу YouTube рекламну кампанію завершено",
        };

        if (statusMessages[status]) {
          await storage.createNotification({
            userId: oldCampaign.userId,
            releaseId: null,
            pitchingId: null,
            relatedEntityType: "youtubeAdCampaign",
            relatedEntityId: id,
            title: "YouTube Ads",
            message: statusMessages[status],
            type: `YOUTUBE_AD_${status}`,
            isRead: false,
            changedFields: null,
          });
        }
      }

      await storage.logAction({
        userId,
        orgId: oldCampaign.orgId,
        action: "UPDATE_YOUTUBE_AD_STATUS",
        entity: "youtube_ad_campaign",
        entityId: id,
        data: { oldStatus: oldCampaign.status, newStatus: status, adminNotes },
      });

      res.json(updated);
    } catch (error) {
      console.error("Error updating YouTube ad campaign:", error);
      res.status(500).json({ error: "Failed to update campaign" });
    }
  });

  // Admin: Delete YouTube Ad campaign
  app.delete('/api/admin/ads/youtube/:id', isAuthenticated, async (req: any, res) => {
    try {
      const userId = getUserId(req.user as AuthenticatedUser);
      if (!userId) {
        return res.status(401).json({ error: "User not authenticated" });
      }

      const user = await storage.getUser(userId);
      if (!user || !isPlatformAdmin(user)) {
        return res.status(403).json({ error: "Admin access required" });
      }

      const { id } = req.params;

      const campaign = await storage.getYoutubeAdCampaign(id);
      if (!campaign) {
        return res.status(404).json({ error: "Campaign not found" });
      }

      await storage.deleteYoutubeAdCampaign(id);

      // Log the deletion
      await storage.logAction({
        userId,
        orgId: campaign.orgId,
        action: "DELETE_YOUTUBE_AD_CAMPAIGN",
        entity: "youtube_ad_campaign",
        entityId: id,
        data: { videoUrl: campaign.videoUrl, budget: campaign.budget },
      });

      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting YouTube ad campaign:", error);
      res.status(500).json({ error: "Failed to delete campaign" });
    }
  });

  // Admin: Upload YouTube Ad campaign report CSV (combined file with both In-Stream and Discovery)
  app.post('/api/admin/ads/youtube/:id/report', isAuthenticated, upload.single('report'), async (req: any, res) => {
    try {
      const userId = getUserId(req.user as AuthenticatedUser);
      if (!userId) {
        return res.status(401).json({ error: "User not authenticated" });
      }

      const user = await storage.getUser(userId);
      if (!user || !isPlatformAdmin(user)) {
        return res.status(403).json({ error: "Admin access required" });
      }

      const { id } = req.params;
      
      const campaign = await storage.getYoutubeAdCampaign(id);
      if (!campaign) {
        return res.status(404).json({ error: "Campaign not found" });
      }

      if (!req.file) {
        return res.status(400).json({ error: "No file uploaded" });
      }

      // Parse CSV file (handle UTF-16LE encoding from Google Ads)
      let csvContent: string;
      const fileBuffer = req.file.buffer;
      
      // Check for BOM to detect encoding
      if (fileBuffer[0] === 0xFF && fileBuffer[1] === 0xFE) {
        // UTF-16LE with BOM
        csvContent = fileBuffer.toString('utf16le').slice(1); // Remove BOM
      } else if (fileBuffer[0] === 0xFE && fileBuffer[1] === 0xFF) {
        // UTF-16BE with BOM
        csvContent = Buffer.from(fileBuffer).swap16().toString('utf16le').slice(1);
      } else {
        // Try UTF-8 first, then fall back to UTF-16LE
        csvContent = fileBuffer.toString('utf8');
        // If content looks like garbled text, try UTF-16LE
        if (csvContent.includes('\u0000')) {
          csvContent = fileBuffer.toString('utf16le');
        }
      }

      // Parse CSV/TSV content
      const lines = csvContent.split('\n').filter(line => line.trim());
      
      // Find header row (starts with column names)
      let headerIndex = -1;
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].includes('Статус') || lines[i].includes('Status') || lines[i].includes('Кампанія') || lines[i].includes('Campaign')) {
          headerIndex = i;
          break;
        }
      }

      if (headerIndex === -1) {
        return res.status(400).json({ error: "Could not find header row in CSV" });
      }

      // Parse header and data rows (tab-separated)
      const separator = lines[headerIndex].includes('\t') ? '\t' : ',';
      const headers = lines[headerIndex].split(separator).map(h => h.trim().replace(/^"(.+)"$/, '$1'));
      
      // Map Ukrainian column names to English keys
      const columnMapping: Record<string, string> = {
        'Статус кампанії': 'campaignStatus',
        'Campaign status': 'campaignStatus',
        'Кампанія': 'campaignName',
        'Campaign': 'campaignName',
        'Бюджет': 'budget',
        'Budget': 'budget',
        'Покази': 'impressions',
        'Impressions': 'impressions',
        'Impr.': 'impressions',
        'Перегляди TrueView': 'views',
        'Views': 'views',
        'TrueView views': 'views',
        'Код валюти': 'currency',
        'Currency': 'currency',
        'Currency code': 'currency',
        'Сер. ціна за тисячу показів': 'cpm',
        'CPM': 'cpm',
        'Avg. CPM': 'cpm',
        'TrueView: середня ціна за перегляд': 'cpv',
        'TrueView: avg. CPV': 'cpv',
        'Avg. CPV': 'cpv',
        'Вартість': 'cost',
        'Cost': 'cost',
        'Коефіц. конверсії': 'conversionRate',
        'Conv. rate': 'conversionRate',
        'Conversion rate': 'conversionRate',
        'Конверсії': 'conversions',
        'Conversions': 'conversions',
        'Вартість / конв.': 'costPerConversion',
        'Cost / conv.': 'costPerConversion',
        'Статус': 'status',
        'Status': 'status',
      };

      // Helper function to parse a single data row
      const parseDataRow = (row: string[]): Record<string, any> => {
        const reportData: Record<string, any> = {};
        headers.forEach((header, index) => {
          const key = columnMapping[header] || header.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();
          let value = row[index] || '';
          
          // Parse numeric values (handle comma as decimal separator and space as thousand separator)
          const numericKeys = ['impressions', 'views', 'cpm', 'cpv', 'cost', 'conversions', 'costPerConversion', 'budget'];
          if (numericKeys.includes(key)) {
            // Remove quotes, spaces, and convert comma to dot for decimals
            value = value.replace(/"/g, '').replace(/\s/g, '').replace(',', '.');
            const numValue = parseFloat(value);
            reportData[key] = isNaN(numValue) ? 0 : numValue;
          } else if (key === 'conversionRate') {
            // Handle percentage values
            value = value.replace(/"/g, '').replace('%', '').replace(',', '.');
            const numValue = parseFloat(value);
            reportData[key] = isNaN(numValue) ? 0 : numValue;
          } else {
            reportData[key] = value.replace(/"/g, '');
          }
        });
        reportData.uploadedAt = new Date().toISOString();
        reportData.rawHeaders = headers;
        return reportData;
      };

      // Collect all data rows (excluding summary rows)
      const dataRows: { row: string[], campaignName: string }[] = [];
      const campaignNameIndex = headers.findIndex(h => 
        h === 'Кампанія' || h === 'Campaign' || columnMapping[h] === 'campaignName'
      );
      
      for (let i = headerIndex + 1; i < lines.length; i++) {
        const row = lines[i].split(separator).map(c => c.trim().replace(/^"(.+)"$/, '$1'));
        // Skip summary rows (Усього:, Total:)
        if (!row[0]?.includes('Усього') && !row[0]?.includes('Total') && row.length >= headers.length / 2) {
          const campaignName = campaignNameIndex >= 0 ? row[campaignNameIndex] || '' : '';
          dataRows.push({ row, campaignName });
        }
      }

      if (dataRows.length === 0) {
        return res.status(400).json({ error: "Could not find campaign data in CSV" });
      }

      // Identify In-Stream and Discovery rows by campaign name patterns
      let inStreamRow: string[] | null = null;
      let discoveryRow: string[] | null = null;

      for (const { row, campaignName } of dataRows) {
        const nameLower = campaignName.toLowerCase();
        // Check for In-Stream indicators
        if (nameLower.includes('in-stream') || nameLower.includes('instream') || nameLower.includes('in stream') || nameLower.includes('trueview')) {
          inStreamRow = row;
        }
        // Check for Discovery indicators  
        if (nameLower.includes('discovery') || nameLower.includes('video discovery') || nameLower.includes('in-feed') || nameLower.includes('infeed')) {
          discoveryRow = row;
        }
      }

      // If only one row found, use it for the appropriate type based on campaign configuration
      if (dataRows.length === 1) {
        const singleRow = dataRows[0].row;
        if (campaign.inStreamPercent > 0 && campaign.discoveryPercent === 0) {
          inStreamRow = singleRow;
        } else if (campaign.discoveryPercent > 0 && campaign.inStreamPercent === 0) {
          discoveryRow = singleRow;
        } else {
          // Both types enabled but only one row - assign to both
          inStreamRow = singleRow;
          discoveryRow = singleRow;
        }
      }

      // Build update payload
      const updatePayload: Record<string, any> = {};
      const uploadedReportTypes: string[] = [];
      
      if (inStreamRow && campaign.inStreamPercent > 0) {
        updatePayload.inStreamReportData = parseDataRow(inStreamRow);
        updatePayload.inStreamReportUploadedAt = new Date();
        uploadedReportTypes.push('In-Stream');
      }
      
      if (discoveryRow && campaign.discoveryPercent > 0) {
        updatePayload.discoveryReportData = parseDataRow(discoveryRow);
        updatePayload.discoveryReportUploadedAt = new Date();
        uploadedReportTypes.push('Discovery');
      }

      if (Object.keys(updatePayload).length === 0) {
        return res.status(400).json({ error: "Could not match report data to campaign ad types" });
      }

      // Update campaign with report data
      const updated = await storage.updateYoutubeAdCampaign(id, updatePayload);

      // Create notification for user about report upload
      const typesLabel = uploadedReportTypes.join(' та ');
      await storage.createNotification({
        userId: campaign.userId,
        releaseId: null,
        pitchingId: null,
        relatedEntityType: "youtubeAdCampaign",
        relatedEntityId: id,
        title: "YouTube Ads",
        message: `Звіт ${typesLabel} по вашій YouTube рекламній кампанії завантажено`,
        type: "YOUTUBE_AD_REPORT_UPLOADED",
        isRead: false,
        changedFields: null,
      });

      await storage.logAction({
        userId,
        orgId: campaign.orgId,
        action: "UPLOAD_YOUTUBE_AD_REPORT",
        entity: "youtube_ad_campaign",
        entityId: id,
        data: { uploadedTypes: uploadedReportTypes, rowCount: dataRows.length },
      });

      res.json(updated);
    } catch (error) {
      console.error("Error uploading YouTube ad report:", error);
      res.status(500).json({ error: "Failed to upload report" });
    }
  });

  // Generate Wayforpay payment data for YouTube ad campaign
  app.post('/api/ads/youtube/:id/payment', isAuthenticated, async (req: any, res) => {
    try {
      const userId = getUserId(req.user as AuthenticatedUser);
      if (!userId) {
        return res.status(401).json({ error: "User not authenticated" });
      }

      const { id } = req.params;
      const campaign = await storage.getYoutubeAdCampaign(id);

      if (!campaign) {
        return res.status(404).json({ error: "Campaign not found" });
      }

      // Check access
      const user = await storage.getUser(userId);
      const userOrgs = await getAccessibleOrganizations(user, userId, storage);
      const hasAccess = userOrgs.some(org => org.id === campaign.orgId);
      
      if (!hasAccess) {
        return res.status(403).json({ error: "Access denied" });
      }

      // Only allow payment for approved campaigns that haven't been paid
      if (campaign.status !== "APPROVED") {
        return res.status(400).json({ error: "Campaign must be approved before payment" });
      }

      if (campaign.paymentStatus === "PAID") {
        return res.status(400).json({ error: "Campaign has already been paid" });
      }

      // Get Wayforpay credentials from environment
      const merchantAccount = process.env.WAYFORPAY_MERCHANT_ACCOUNT;
      const secretKey = process.env.WAYFORPAY_SECRET_KEY;
      
      if (!merchantAccount || !secretKey) {
        console.error('[YOUTUBE ADS PAYMENT] Wayforpay credentials not configured');
        return res.status(500).json({ error: "Payment system not configured" });
      }

      // Generate unique order reference
      const orderReference = `ytads_${id}_${Date.now()}`;
      const orderDate = Math.floor(Date.now() / 1000);

      // Calculate amount in UAH (using approximate exchange rate of 41.5 UAH per USD)
      const USD_TO_UAH_RATE = 41.5;
      const amountUAH = Math.round(campaign.budget * USD_TO_UAH_RATE * 100) / 100;

      // Product details for Wayforpay
      const productName = [`YouTube Ads Campaign - ${campaign.duration} days`];
      const productCount = [1];
      const productPrice = [amountUAH];
      const currency = "UAH";
      const merchantDomainName = "muzika.ua";

      // Generate HMAC_MD5 signature
      // Format: merchantAccount;merchantDomainName;orderReference;orderDate;amount;currency;productName[0];...;productCount[0];...;productPrice[0];...
      const crypto = await import('crypto');
      const signString = [
        merchantAccount,
        merchantDomainName,
        orderReference,
        orderDate,
        amountUAH,
        currency,
        ...productName,
        ...productCount.map(String),
        ...productPrice.map(String),
      ].join(';');

      const merchantSignature = crypto.createHmac('md5', secretKey).update(signString).digest('hex');

      // Save payment reference to campaign
      await storage.updateYoutubeAdCampaign(id, {
        paymentReference: orderReference,
      });

      // Webhook URL for Wayforpay to send payment confirmation
      const baseUrl = process.env.WAYFORPAY_SERVICE_URL || "https://muzika-dist.com";
      const serviceUrl = `${baseUrl}/api/webhooks/wayforpay`;

      console.log('[YOUTUBE ADS PAYMENT] Generated payment data:', {
        campaignId: id,
        orderReference,
        orderDate,
        amountUAH,
        budget: campaign.budget,
        signString,
        merchantSignature,
        serviceUrl,
      });

      // Return payment widget data
      res.json({
        merchantAccount,
        merchantDomainName,
        merchantSignature,
        orderReference,
        orderDate,
        amount: amountUAH,
        currency,
        productName,
        productCount,
        productPrice,
        clientFirstName: user?.firstName || "",
        clientLastName: user?.lastName || "",
        clientEmail: user?.email || "",
        clientPhone: "",
        language: "UA",
        serviceUrl,
      });

    } catch (error: any) {
      console.error('[YOUTUBE ADS PAYMENT] Error:', error);
      res.status(500).json({ error: error.message || "Failed to generate payment data" });
    }
  });

  // Admin routes
  app.get('/api/admin/qc-queue', isAuthenticated, async (req: any, res) => {
    try {
      const user = await storage.getUser(getUserId(req.user as AuthenticatedUser));
      if (!isPlatformAdmin(user)) {
        return res.status(403).json({ message: "Admin access required" });
      }
      
      const pendingReleases = await storage.getPendingQCReleases();
      res.json(pendingReleases);
    } catch (error) {
      console.error("Error fetching QC queue:", error);
      res.status(500).json({ message: "Failed to fetch QC queue" });
    }
  });

  app.post('/api/admin/releases/:id/approve', isAuthenticated, async (req: any, res) => {
    try {
      const user = await storage.getUser(getUserId(req.user as AuthenticatedUser));
      if (!isPlatformAdmin(user)) {
        return res.status(403).json({ message: "Admin access required" });
      }
      
      const { id } = req.params;
      const currentRelease = await storage.getRelease(id);
      const release = await storage.updateRelease(id, { status: "APPROVED" });
      
      // Record status change event
      await storage.createReleaseStatusEvent({
        releaseId: id,
        fromStatus: currentRelease?.status || null,
        toStatus: "APPROVED",
        triggeredBy: getUserId(req.user as AuthenticatedUser),
      });
      
      // Create delivery jobs for approved release
      const deliveryTargets = ["SPOTIFY", "APPLE", "YT_MUSIC"];
      for (const target of deliveryTargets) {
        await storage.createDeliveryJob({
          releaseId: id,
          target,
          status: "PENDING",
          payload: { releaseId: id, target },
          response: null,
        });
      }
      
      await storage.logAction({
        userId: getUserId(req.user as AuthenticatedUser),
        orgId: release.orgId,
        action: "APPROVE_RELEASE",
        entity: "release",
        entityId: id,
        data: { status: "APPROVED" },
      });
      
      res.json(release);
    } catch (error) {
      console.error("Error approving release:", error);
      res.status(500).json({ message: "Failed to approve release" });
    }
  });

  app.post('/api/admin/releases/:id/reject', isAuthenticated, async (req: any, res) => {
    try {
      const user = await storage.getUser(getUserId(req.user as AuthenticatedUser));
      if (!isPlatformAdmin(user)) {
        return res.status(403).json({ message: "Admin access required" });
      }
      
      const { id } = req.params;
      const { reason } = req.body;
      
      const currentRelease = await storage.getRelease(id);
      const release = await storage.updateRelease(id, { status: "REJECTED" });
      
      // Record status change event
      await storage.createReleaseStatusEvent({
        releaseId: id,
        fromStatus: currentRelease?.status || null,
        toStatus: "REJECTED",
        triggeredBy: getUserId(req.user as AuthenticatedUser),
        metadata: reason ? { reason } : null,
      });
      
      await storage.createQCItem({
        releaseId: id,
        trackId: null,
        severity: "ERROR",
        message: reason || "Release rejected by admin",
        resolved: false,
      });
      
      await storage.logAction({
        userId: getUserId(req.user as AuthenticatedUser),
        orgId: release.orgId,
        action: "REJECT_RELEASE",
        entity: "release",
        entityId: id,
        data: { status: "REJECTED", reason },
      });
      
      res.json(release);
    } catch (error) {
      console.error("Error rejecting release:", error);
      res.status(500).json({ message: "Failed to reject release" });
    }
  });

  // Upload new artwork for release (admin only)
  app.post('/api/admin/releases/:releaseId/artwork', isAuthenticated, async (req: any, res) => {
    try {
      const user = await storage.getUser(getUserId(req.user as AuthenticatedUser));
      if (!isPlatformAdmin(user)) {
        return res.status(403).json({ message: "Admin access required" });
      }

      const { releaseId } = req.params;
      const multerLib = (await import('multer')).default;
      
      // Configure multer with file filter for security
      const uploadHandler = multerLib({ 
        storage: multerLib.memoryStorage(),
        fileFilter: (req, file, cb) => {
          const allowedMimeTypes = ['image/jpeg', 'image/png', 'image/jpg'];
          const allowedExtensions = ['.jpg', '.jpeg', '.png'];
          const fileExtension = file.originalname.toLowerCase().slice(file.originalname.lastIndexOf('.'));
          
          if (allowedMimeTypes.includes(file.mimetype) && allowedExtensions.includes(fileExtension)) {
            cb(null, true);
          } else {
            cb(new Error('Invalid file type. Only JPG and PNG images are allowed'));
          }
        },
        limits: {
          fileSize: 10 * 1024 * 1024, // 10MB max
        }
      });
      
      uploadHandler.single('artwork')(req, res, async (err) => {
        if (err) {
          console.error("Multer error:", err);
          return res.status(400).json({ message: err.message || "File upload error" });
        }
        
        if (!req.file) {
          return res.status(400).json({ message: "No file provided" });
        }

        // Double-check MIME type as extra security layer
        const allowedTypes = ['image/jpeg', 'image/png', 'image/jpg'];
        if (!allowedTypes.includes(req.file.mimetype)) {
          return res.status(400).json({ message: "Invalid file type. Only JPG and PNG are allowed" });
        }

        // Generate unique filename
        const { randomUUID } = await import('crypto');
        const fileExtension = req.file.originalname.split('.').pop();
        const uniqueFilename = `${randomUUID()}.${fileExtension}`;
        
        // Upload to Google Drive
        const result = await googleDriveStorage.uploadFile(
          req.file.buffer,
          uniqueFilename,
          req.file.mimetype
        );

        const artworkUrl = googleDriveStorage.getDirectDownloadLink(result.fileId);
        
        // Update release with new artwork
        await storage.updateRelease(releaseId, {
          artworkUrl,
          artworkFileId: result.fileId,
          artworkOriginalName: req.file.originalname,
          artworkSize: req.file.size,
        });

        // Log action
        await storage.logAction({
          userId: getUserId(req.user as AuthenticatedUser),
          orgId: null,
          action: "UPLOAD_ARTWORK",
          entity: "release",
          entityId: releaseId,
          data: { filename: req.file.originalname },
        });

        res.json({
          artworkUrl,
          fileId: result.fileId,
          originalName: req.file.originalname,
          size: req.file.size,
        });
      });
    } catch (error) {
      console.error("Error uploading artwork:", error);
      res.status(500).json({ message: "Failed to upload artwork" });
    }
  });

  // Upload new audio for track (admin only) - supports both direct upload and chunked upload result
  app.post('/api/admin/releases/:releaseId/tracks/:trackId/audio', isAuthenticated, async (req: any, res) => {
    try {
      const user = await storage.getUser(getUserId(req.user as AuthenticatedUser));
      if (!isPlatformAdmin(user)) {
        return res.status(403).json({ message: "Admin access required" });
      }

      const { releaseId, trackId } = req.params;
      
      // Check if this is a JSON request with downloadUrl (from chunked upload)
      const contentType = req.get('content-type') || '';
      if (contentType.includes('application/json') && req.body.downloadUrl) {
        console.log('[ADMIN AUDIO] Using chunked upload result:', req.body.downloadUrl);
        
        // Extract fileId from downloadUrl (Google Drive format)
        const fileIdMatch = req.body.downloadUrl.match(/[?&]id=([^&]+)/);
        const fileId = fileIdMatch ? fileIdMatch[1] : null;
        
        // Update track with the already-uploaded audio URL
        await storage.updateTrack(trackId, {
          audioUrl: req.body.downloadUrl,
          audioFileId: fileId,
          audioOriginalName: 'chunked-upload.wav',
          audioSize: 0, // Size not available from chunked upload
        });

        // Log action
        await storage.logAction({
          userId: getUserId(req.user as AuthenticatedUser),
          orgId: null,
          action: "UPLOAD_AUDIO",
          entity: "track",
          entityId: trackId,
          data: { chunked: true, releaseId },
        });

        return res.json({
          audioUrl: req.body.downloadUrl,
          fileId,
          originalName: 'chunked-upload.wav',
          size: 0,
        });
      }

      // Regular FormData upload for smaller files
      fileUpload.single('audio')(req, res, async (err) => {
        if (err) {
          console.error("Multer error:", err);
          return res.status(400).json({ message: err.message || "File upload error" });
        }
        
        if (!req.file) {
          return res.status(400).json({ message: "No file provided" });
        }

        // Double-check MIME type as extra security layer
        const allowedTypes = ['audio/wav', 'audio/flac', 'audio/x-wav', 'audio/x-flac'];
        if (!allowedTypes.includes(req.file.mimetype)) {
          return res.status(400).json({ message: "Invalid file type. Only WAV and FLAC are allowed" });
        }

        // Generate unique filename
        const { randomUUID } = await import('crypto');
        const fileExtension = req.file.originalname.split('.').pop();
        const uniqueFilename = `${randomUUID()}.${fileExtension}`;
        
        // Upload to Google Drive
        const result = await googleDriveStorage.uploadFile(
          req.file.buffer,
          uniqueFilename,
          req.file.mimetype
        );

        const audioUrl = googleDriveStorage.getDirectDownloadLink(result.fileId);
        
        // Update track with new audio
        await storage.updateTrack(trackId, {
          audioUrl,
          audioFileId: result.fileId,
          audioOriginalName: req.file.originalname,
          audioSize: req.file.size,
        });

        // Log action
        await storage.logAction({
          userId: getUserId(req.user as AuthenticatedUser),
          orgId: null,
          action: "UPLOAD_AUDIO",
          entity: "track",
          entityId: trackId,
          data: { filename: req.file.originalname, releaseId },
        });

        res.json({
          audioUrl,
          fileId: result.fileId,
          originalName: req.file.originalname,
          size: req.file.size,
        });
      });
    } catch (error) {
      console.error("Error uploading audio:", error);
      res.status(500).json({ message: "Failed to upload audio" });
    }
  });


  // Update track metadata (admin only) - Direct track endpoint
  app.put('/api/admin/tracks/:trackId', isAuthenticated, async (req: any, res) => {
    try {
      const user = await storage.getUser(getUserId(req.user as AuthenticatedUser));
      if (!isPlatformAdmin(user)) {
        return res.status(403).json({ message: "Admin access required" });
      }

      const { trackId } = req.params;
      const updates = req.body;

      // Whitelist allowed fields for update (including ISRC)
      const allowedFields = ['title', 'version', 'lyrics', 'participants', 'explicit', 'aiGenerated', 'primaryGenre', 'secondaryGenre', 'isrc', 'tiktokClipStart'];
      const filteredUpdates: any = {};
      
      for (const field of allowedFields) {
        if (updates[field] !== undefined) {
          filteredUpdates[field] = updates[field];
        }
      }

      if (Object.keys(filteredUpdates).length === 0) {
        return res.status(400).json({ message: "No valid fields to update" });
      }

      // Update track
      const updatedTrack = await storage.updateTrack(trackId, filteredUpdates);

      // Log action
      await storage.logAction({
        userId: getUserId(req.user as AuthenticatedUser),
        orgId: null,
        action: "UPDATE_TRACK_METADATA",
        entity: "track",
        entityId: trackId,
        data: { fields: Object.keys(filteredUpdates) },
      });

      res.json({ success: true, track: updatedTrack });
    } catch (error) {
      console.error("Error updating track metadata:", error);
      res.status(500).json({ message: "Failed to update track metadata" });
    }
  });

  // Update track metadata (admin only) - Release-specific endpoint
  app.put('/api/admin/releases/:releaseId/tracks/:trackId', isAuthenticated, async (req: any, res) => {
    try {
      const user = await storage.getUser(getUserId(req.user as AuthenticatedUser));
      if (!isPlatformAdmin(user)) {
        return res.status(403).json({ message: "Admin access required" });
      }

      const { releaseId, trackId } = req.params;
      const updates = req.body;

      // Whitelist allowed fields for update (including ISRC)
      const allowedFields = ['title', 'version', 'lyrics', 'participants', 'explicit', 'aiGenerated', 'primaryGenre', 'secondaryGenre', 'isrc', 'tiktokClipStart'];
      const filteredUpdates: any = {};
      
      for (const field of allowedFields) {
        if (updates[field] !== undefined) {
          filteredUpdates[field] = updates[field];
        }
      }

      if (Object.keys(filteredUpdates).length === 0) {
        return res.status(400).json({ message: "No valid fields to update" });
      }

      // Update track
      await storage.updateTrack(trackId, filteredUpdates);

      // Log action
      await storage.logAction({
        userId: getUserId(req.user as AuthenticatedUser),
        orgId: null,
        action: "UPDATE_TRACK_METADATA",
        entity: "track",
        entityId: trackId,
        data: { releaseId, fields: Object.keys(filteredUpdates) },
      });

      res.json({ success: true });
    } catch (error) {
      console.error("Error updating track metadata:", error);
      res.status(500).json({ message: "Failed to update track metadata" });
    }
  });

  // Update track metadata (admin only) - Simpler endpoint without releaseId
  app.put('/api/admin/tracks/:trackId', isAuthenticated, async (req: any, res) => {
    try {
      const user = await storage.getUser(getUserId(req.user as AuthenticatedUser));
      if (!isPlatformAdmin(user)) {
        return res.status(403).json({ message: "Admin access required" });
      }

      const { trackId } = req.params;
      const updates = req.body;

      // Whitelist allowed fields for update (including ISRC)
      const allowedFields = ['title', 'version', 'lyrics', 'participants', 'explicit', 'aiGenerated', 'primaryGenre', 'secondaryGenre', 'isrc', 'tiktokClipStart', 'duration'];
      const filteredUpdates: any = {};
      
      for (const field of allowedFields) {
        if (updates[field] !== undefined) {
          filteredUpdates[field] = updates[field];
        }
      }

      if (Object.keys(filteredUpdates).length === 0) {
        return res.status(400).json({ message: "No valid fields to update" });
      }

      // Update track
      const updatedTrack = await storage.updateTrack(trackId, filteredUpdates);

      // Log action
      await storage.logAction({
        userId: getUserId(req.user as AuthenticatedUser),
        orgId: null,
        action: "UPDATE_TRACK_METADATA",
        entity: "track",
        entityId: trackId,
        data: { fields: Object.keys(filteredUpdates) },
      });

      res.json(updatedTrack);
    } catch (error) {
      console.error("Error updating track metadata:", error);
      res.status(500).json({ message: "Failed to update track metadata" });
    }
  });

  // Fix missing paidAt dates for PAID releases (admin only)
  app.post('/api/admin/releases/fix-paid-dates', isAuthenticated, async (req: any, res) => {
    try {
      const user = await storage.getUser(getUserId(req.user as AuthenticatedUser));
      if (!isPlatformAdmin(user)) {
        return res.status(403).json({ message: "Admin access required" });
      }

      const { db: database } = await import("./db");
      const { releases: releasesTable } = await import("@shared/schema");
      const { eq: eqFn, and: andFn, isNull: isNullFn } = await import("drizzle-orm");

      // Find all PAID releases without paidAt
      const paidReleasesWithoutDate = await database
        .select()
        .from(releasesTable)
        .where(
          andFn(
            eqFn(releasesTable.paymentStatus, "PAID"),
            isNullFn(releasesTable.paidAt)
          )
        );

      // Update each release with current timestamp
      const fixedCount = paidReleasesWithoutDate.length;
      for (const release of paidReleasesWithoutDate) {
        await storage.updateRelease(release.id, {
          paidAt: new Date()
        });
      }

      // Log action
      await storage.logAction({
        userId: getUserId(req.user as AuthenticatedUser),
        orgId: null,
        action: "FIX_PAID_DATES",
        entity: "release",
        entityId: null,
        data: { fixedCount },
      });

      res.json({ 
        success: true, 
        message: `Fixed ${fixedCount} releases with missing payment dates`,
        fixedCount 
      });
    } catch (error) {
      console.error("Error fixing paid dates:", error);
      res.status(500).json({ message: "Failed to fix paid dates" });
    }
  });

  // Update release payment status (admin only)
  app.put('/api/admin/releases/:releaseId/payment-status', isAuthenticated, async (req: any, res) => {
    try {
      const user = await storage.getUser(getUserId(req.user as AuthenticatedUser));
      if (!isPlatformAdmin(user)) {
        return res.status(403).json({ message: "Admin access required" });
      }

      const { releaseId } = req.params;
      const { paymentStatus } = req.body;

      // Validate payment status
      const validStatuses = ["PENDING", "PROCESSING", "PAID", "FAILED"];
      if (!validStatuses.includes(paymentStatus)) {
        return res.status(400).json({ message: "Invalid payment status" });
      }

      // Get current release to check if paidAt is already set
      const currentRelease = await storage.getRelease(releaseId);
      if (!currentRelease) {
        return res.status(404).json({ message: "Release not found" });
      }

      // Update release payment status
      // Set paidAt only if changing to PAID and paidAt is not already set
      await storage.updateRelease(releaseId, {
        paymentStatus,
        ...(paymentStatus === "PAID" && !currentRelease.paidAt ? { paidAt: new Date() } : {}),
      });

      // Log action
      await storage.logAction({
        userId: getUserId(req.user as AuthenticatedUser),
        orgId: null,
        action: "UPDATE_PAYMENT_STATUS",
        entity: "release",
        entityId: releaseId,
        data: { paymentStatus },
      });

      res.json({ success: true, paymentStatus });
    } catch (error) {
      console.error("Error updating payment status:", error);
      res.status(500).json({ message: "Failed to update payment status" });
    }
  });

  // Activate release (change status from DRAFT to ACTIVE) (admin only)
  app.put('/api/admin/releases/:releaseId/activate', isAuthenticated, async (req: any, res) => {
    try {
      const user = await storage.getUser(getUserId(req.user as AuthenticatedUser));
      if (!isPlatformAdmin(user)) {
        return res.status(403).json({ message: "Admin access required" });
      }

      const { releaseId } = req.params;

      // Get current release
      const release = await storage.getRelease(releaseId);
      if (!release) {
        return res.status(404).json({ message: "Release not found" });
      }

      // Update release status to ACTIVE
      await storage.updateRelease(releaseId, {
        status: "ACTIVE",
      });
      
      // Record status change event
      await storage.createReleaseStatusEvent({
        releaseId,
        fromStatus: release.status,
        toStatus: "ACTIVE",
        triggeredBy: getUserId(req.user as AuthenticatedUser),
      });

      // Log action
      await storage.logAction({
        userId: getUserId(req.user as AuthenticatedUser),
        orgId: null,
        action: "ACTIVATE_RELEASE",
        entity: "release",
        entityId: releaseId,
        data: { previousStatus: release.status, newStatus: "ACTIVE" },
      });

      res.json({ success: true, status: "ACTIVE" });
    } catch (error) {
      console.error("Error activating release:", error);
      res.status(500).json({ message: "Failed to activate release" });
    }
  });

  // Delete release permanently (admin only)
  app.delete('/api/admin/releases/:releaseId', isAuthenticated, async (req: any, res) => {
    try {
      const user = await storage.getUser(getUserId(req.user as AuthenticatedUser));
      if (!isPlatformAdmin(user)) {
        return res.status(403).json({ message: "Admin access required" });
      }

      const { releaseId } = req.params;

      // Get release and tracks
      const release = await storage.getRelease(releaseId);
      if (!release) {
        return res.status(404).json({ message: "Release not found" });
      }

      const tracks = await storage.getTracks(releaseId);

      // Delete files from Google Drive
      const filesToDelete: string[] = [];

      // Add artwork file ID
      if (release.artworkFileId) {
        filesToDelete.push(release.artworkFileId);
      }

      // Add audio file IDs from tracks
      for (const track of tracks) {
        if (track.audioFileId) {
          filesToDelete.push(track.audioFileId);
        }
      }

      // Delete all files from Google Drive
      for (const fileId of filesToDelete) {
        try {
          await googleDriveStorage.deleteFile(fileId);
          console.log(`Deleted file from Google Drive: ${fileId}`);
        } catch (error) {
          console.error(`Failed to delete file ${fileId} from Google Drive:`, error);
          // Continue with other files even if one fails
        }
      }

      // Delete tracks from database
      await storage.deleteTracks(releaseId);

      // Delete release from database
      await storage.deleteRelease(releaseId);

      // Log action
      await storage.logAction({
        userId: getUserId(req.user as AuthenticatedUser),
        orgId: release.orgId,
        action: "DELETE_RELEASE",
        entity: "release",
        entityId: releaseId,
        data: { 
          title: release.title,
          deletedFiles: filesToDelete.length,
          deletedTracks: tracks.length
        },
      });

      res.json({ 
        success: true, 
        message: "Release deleted successfully",
        deletedFiles: filesToDelete.length,
        deletedTracks: tracks.length
      });
    } catch (error) {
      console.error("Error deleting release:", error);
      res.status(500).json({ message: "Failed to delete release" });
    }
  });

  // Download file from Google Drive (admin only)
  app.get('/api/admin/download/:fileId', isAuthenticated, async (req: any, res) => {
    try {
      const user = await storage.getUser(getUserId(req.user as AuthenticatedUser));
      if (!isPlatformAdmin(user)) {
        return res.status(403).json({ message: "Admin access required" });
      }

      const { fileId } = req.params;
      const { filename } = req.query;

      // Download file from Google Drive
      const fileBuffer = await googleDriveStorage.downloadFile(fileId);
      const fileMetadata = await googleDriveStorage.getFile(fileId);

      // Set headers for download
      res.setHeader('Content-Type', fileMetadata.mimeType || 'application/octet-stream');
      res.setHeader('Content-Disposition', `attachment; filename="${filename || fileMetadata.name || 'download'}"`);
      res.setHeader('Content-Length', fileBuffer.length);

      res.send(fileBuffer);
    } catch (error) {
      console.error("Error downloading file:", error);
      res.status(500).json({ message: "Failed to download file" });
    }
  });

  // Helper to extract fileId from Google Drive URL (fallback for legacy data)
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

  // Helper to encode filename for Content-Disposition header (supports non-ASCII characters)
  function encodeFilenameForHeader(filename: string): string {
    // Use RFC 5987 encoding for non-ASCII characters
    const encodedFilename = encodeURIComponent(filename);
    return `attachment; filename="${filename.replace(/[^\x00-\x7F]/g, '_')}"; filename*=UTF-8''${encodedFilename}`;
  }

  // Helper to send file with Range request support (for audio/video seek) - legacy buffer version
  function sendFileWithRangeSupport(req: any, res: any, fileBuffer: Buffer, mimeType: string, filename: string) {
    const total = fileBuffer.length;
    const range = req.headers.range;

    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Content-Type', mimeType);

    if (range) {
      const parts = range.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : total - 1;
      const chunkSize = end - start + 1;

      res.status(206);
      res.setHeader('Content-Range', `bytes ${start}-${end}/${total}`);
      res.setHeader('Content-Length', chunkSize);
      res.send(fileBuffer.slice(start, end + 1));
    } else {
      res.setHeader('Content-Disposition', encodeFilenameForHeader(filename));
      res.setHeader('Content-Length', total);
      res.send(fileBuffer);
    }
  }

  // Helper to stream file from Google Drive with Range support (efficient for large audio/video files)
  async function streamFileFromDrive(req: any, res: any, fileId: string, mimeType: string, filename: string, fileSize: number) {
    const range = req.headers.range;
    const isAudioFile = mimeType.startsWith('audio/');

    console.log(`[STREAM] File: ${fileId}, size: ${fileSize}, mimeType: ${mimeType}, range: ${range || 'none'}, isAudio: ${isAudioFile}`);

    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Content-Type', mimeType);

    if (isAudioFile) {
      try {
        console.log(`[STREAM] Downloading audio file to buffer: ${fileId}`);
        const fileBuffer = await googleDriveStorage.downloadFile(fileId);
        const totalSize = fileBuffer.length;
        console.log(`[STREAM] Audio buffer ready, size: ${totalSize}`);
        res.setHeader('Content-Disposition', encodeFilenameForHeader(filename));

        if (range) {
          const rangeMatch = range.match(/bytes=(\d*)-(\d*)/);
          if (!rangeMatch) {
            res.status(416).setHeader('Content-Range', `bytes */${totalSize}`);
            return res.end();
          }

          let start: number;
          let end: number;

          if (rangeMatch[1] === '' && rangeMatch[2] !== '') {
            const suffixLength = parseInt(rangeMatch[2], 10);
            start = Math.max(0, totalSize - suffixLength);
            end = totalSize - 1;
          } else if (rangeMatch[1] !== '' && rangeMatch[2] === '') {
            start = parseInt(rangeMatch[1], 10);
            end = totalSize - 1;
          } else {
            start = parseInt(rangeMatch[1], 10);
            end = parseInt(rangeMatch[2], 10);
          }

          if (isNaN(start) || isNaN(end) || start < 0 || start >= totalSize || end < start) {
            res.status(416).setHeader('Content-Range', `bytes */${totalSize}`);
            return res.end();
          }

          end = Math.min(end, totalSize - 1);
          const chunkSize = end - start + 1;

          res.status(206);
          res.setHeader('Content-Range', `bytes ${start}-${end}/${totalSize}`);
          res.setHeader('Content-Length', chunkSize);
          return res.send(fileBuffer.subarray(start, end + 1));
        }

        res.setHeader('Content-Length', totalSize);
        return res.send(fileBuffer);
      } catch (downloadError) {
        console.error('Audio download error:', downloadError);
        if (!res.headersSent) {
          return res.status(500).json({ message: 'Failed to download audio file' });
        }
      }
      return;
    }

    if (range && fileSize > 0) {
      // Parse range header according to RFC 7233
      const rangeMatch = range.match(/bytes=(\d*)-(\d*)/);
      if (!rangeMatch) {
        res.status(416).setHeader('Content-Range', `bytes */${fileSize}`);
        return res.end();
      }

      let start: number;
      let end: number;

      if (rangeMatch[1] === '' && rangeMatch[2] !== '') {
        // Suffix range: bytes=-500 (last 500 bytes)
        const suffixLength = parseInt(rangeMatch[2], 10);
        start = Math.max(0, fileSize - suffixLength);
        end = fileSize - 1;
      } else if (rangeMatch[1] !== '' && rangeMatch[2] === '') {
        // Open-ended range: bytes=500- (from 500 to end)
        start = parseInt(rangeMatch[1], 10);
        end = fileSize - 1;
      } else {
        // Normal range: bytes=500-999
        start = parseInt(rangeMatch[1], 10);
        end = parseInt(rangeMatch[2], 10);
      }

      // Validate range
      if (isNaN(start) || isNaN(end) || start < 0 || start >= fileSize || end < start) {
        res.status(416).setHeader('Content-Range', `bytes */${fileSize}`);
        return res.end();
      }

      // Clamp end to file size
      end = Math.min(end, fileSize - 1);

      try {
        // Get stream from Google Drive with actual range response
        const result = await googleDriveStorage.streamFile(fileId, { start, end });
        
        if (result.isPartial && result.actualRange) {
          // Use actual range from Google Drive response
          const actualStart = result.actualRange.start;
          const actualEnd = result.actualRange.end;
          const actualTotal = result.actualRange.total;
          const chunkSize = actualEnd - actualStart + 1;
          
          res.status(206);
          res.setHeader('Content-Range', `bytes ${actualStart}-${actualEnd}/${actualTotal}`);
          res.setHeader('Content-Length', chunkSize);
          console.log(`[STREAM] Sending partial content: bytes ${actualStart}-${actualEnd}/${actualTotal}`);
        } else {
          // Fallback to requested range
          const chunkSize = end - start + 1;
          res.status(206);
          res.setHeader('Content-Range', `bytes ${start}-${end}/${fileSize}`);
          res.setHeader('Content-Length', chunkSize);
        }
        
        result.stream.pipe(res);
      } catch (streamError) {
        console.error('Stream error:', streamError);
        if (!res.headersSent) {
          res.status(500).json({ message: 'Failed to stream file' });
        }
      }
    } else {
      res.setHeader('Content-Disposition', encodeFilenameForHeader(filename));
      res.setHeader('Content-Length', fileSize);

      try {
        const result = await googleDriveStorage.streamFile(fileId);
        result.stream.pipe(res);
      } catch (streamError) {
        console.error('Stream error:', streamError);
        if (!res.headersSent) {
          res.status(500).json({ message: 'Failed to stream file' });
        }
      }
    }
  }

  // Upload generic file to Google Drive (photos for pitching applications, etc.)
  app.post('/api/files/upload', isAuthenticated, fileUpload.single('file'), async (req: any, res) => {
    try {
      const userId = req.user.id;
      const file = req.file;
      const fileType = req.body.type || 'general';

      if (!file) {
        return res.status(400).json({ error: 'No file provided' });
      }

      // Get user's organization for file storage
      const userOrgs = await db
        .select({ id: organizations.id })
        .from(organizations)
        .innerJoin(orgMembers, eq(organizations.id, orgMembers.orgId))
        .where(eq(orgMembers.userId, userId))
        .limit(1);

      if (userOrgs.length === 0) {
        return res.status(400).json({ error: 'No organization found' });
      }

      const orgId = userOrgs[0].id;

      // Read file from disk (fileUpload uses diskStorage)
      const fileBuffer = await fs.readFile(file.path);

      // Upload to Google Drive (use default folder - don't pass custom folderId)
      // The file will be stored in the main music distribution folder
      const result = await googleDriveStorage.uploadFile(
        fileBuffer,
        `pitching_${orgId}_${Date.now()}_${file.originalname}`,
        file.mimetype
        // No folderId - uses default GOOGLE_DRIVE_FOLDER_ID
      );

      // Cleanup temp file
      await fs.unlink(file.path).catch(() => {});

      res.json({
        success: true,
        fileId: result.fileId,
        fileName: file.originalname,
      });
    } catch (error: any) {
      console.error('File upload error:', error);
      // Cleanup temp file on error
      if (req.file?.path) {
        await fs.unlink(req.file.path).catch(() => {});
      }
      res.status(500).json({ error: 'Failed to upload file' });
    }
  });

  // Download file from Google Drive (authenticated users - with access control)
  app.get('/api/files/download/:fileId', isAuthenticated, async (req: any, res) => {
    try {
      const userId = getUserId(req.user as AuthenticatedUser);
      const user = await storage.getUser(userId);
      
      const { fileId } = req.params;
      const { filename } = req.query;

      // Admin can download any file (regardless of organization membership)
      if (isPlatformAdmin(user)) {
        try {
          const fileMetadata = await googleDriveStorage.getFile(fileId);
          
          const downloadFilename = (filename || fileMetadata.name || 'download') as string;
          const mimeType = fileMetadata.mimeType || 'application/octet-stream';
          const fileSize = parseInt(fileMetadata.size || '0', 10);
          
          return streamFileFromDrive(req, res, fileId, mimeType, downloadFilename, fileSize);
        } catch (driveError: any) {
          console.error(`❌ Admin download failed for fileId: ${fileId}`, driveError);
          if (driveError.code === 404 || driveError.message?.includes('not found')) {
            return res.status(404).json({ message: "File not found" });
          }
          throw driveError;
        }
      }

      // Check if this is the user's own profile image
      if (user?.profileImageFileId === fileId) {
        try {
          const fileMetadata = await googleDriveStorage.getFile(fileId);
          const downloadFilename = (filename || fileMetadata.name || 'profile-image') as string;
          const mimeType = fileMetadata.mimeType || 'application/octet-stream';
          const fileSize = parseInt(fileMetadata.size || '0', 10);
          return streamFileFromDrive(req, res, fileId, mimeType, downloadFilename, fileSize);
        } catch (driveError: any) {
          console.error(`❌ Profile image download failed for fileId: ${fileId}`, driveError);
          if (driveError.code === 404 || driveError.message?.includes('not found')) {
            return res.status(404).json({ message: "File not found" });
          }
          throw driveError;
        }
      }

      // Regular users must belong to at least one organization (considers frozen status)
      const userOrgs = await getAccessibleOrganizations(user, userId, storage);
      
      if (userOrgs.length === 0) {
        return res.status(403).json({ message: "No organization found" });
      }

      // Check access across ALL user organizations
      let hasAccess = false;
      
      for (const org of userOrgs) {
        // Check releases for artwork
        const releases = await storage.getReleases(org.id);
        
        // Check by fileId first
        let releaseWithFile = releases.find(r => r.artworkFileId === fileId);
        
        // Fallback: check by extracting fileId from URL (for legacy data)
        if (!releaseWithFile) {
          releaseWithFile = releases.find(r => {
            const urlFileId = extractFileIdFromUrl(r.artworkUrl);
            return urlFileId === fileId;
          });
        }
        
        if (releaseWithFile) {
          hasAccess = true;
          break;
        }
        
        // Batch check all tracks for audio files
        const allTracks = (await Promise.all(
          releases.map(release => storage.getTracks(release.id))
        )).flat();
        
        // Check by fileId first
        let trackWithFile = allTracks.find(t => t.audioFileId === fileId);
        
        // Fallback: check by extracting fileId from URL (for legacy data)
        if (!trackWithFile) {
          trackWithFile = allTracks.find(t => {
            const urlFileId = extractFileIdFromUrl(t.audioUrl);
            return urlFileId === fileId;
          });
        }
        
        if (trackWithFile) {
          hasAccess = true;
          break;
        }

        // Check music videos for artwork and video files
        const musicVideos = await storage.getMusicVideos(org.id);
        
        // Check by fileId for video file or artwork
        let videoWithFile = musicVideos.find(v => 
          v.videoFileId === fileId || v.artworkFileId === fileId
        );
        
        // Fallback: check by extracting fileId from URL (for legacy data)
        if (!videoWithFile) {
          videoWithFile = musicVideos.find(v => {
            const videoUrlFileId = extractFileIdFromUrl(v.videoUrl);
            const artworkUrlFileId = extractFileIdFromUrl(v.artworkUrl);
            return videoUrlFileId === fileId || artworkUrlFileId === fileId;
          });
        }
        
        if (videoWithFile) {
          hasAccess = true;
          break;
        }

        // Check drafts for files (cover art and audio files during release creation)
        const drafts = await storage.getReleaseDraftsByOrg(org.id);
        for (const draft of drafts) {
          const payload = draft.payload as any;
          if (!payload) continue;
          
          // Check cover art
          const coverArtUrl = payload.coverArt?.uploadedUrl;
          if (coverArtUrl) {
            const coverFileId = extractFileIdFromUrl(coverArtUrl);
            if (coverFileId === fileId) {
              hasAccess = true;
              break;
            }
          }
          
          // Check audio files
          const audioFiles = payload.audioFiles as Array<{fileId?: string; uploadedUrl?: string}> | undefined;
          if (audioFiles) {
            const audioMatch = audioFiles.find(af => 
              af.fileId === fileId || extractFileIdFromUrl(af.uploadedUrl) === fileId
            );
            if (audioMatch) {
              hasAccess = true;
              break;
            }
          }
        }
        
        if (hasAccess) break;
      }

      // Check pitching applications files (photos and track audio for applications)
      // This covers both artists (orgId) and curators (curatorOrgId)
      if (!hasAccess) {
        for (const org of userOrgs) {
          // Check applications where user is the artist (submitter)
          const artistApplications = await db
            .select({ photos: pitchingApplications.photos, trackId: pitchingApplications.trackId })
            .from(pitchingApplications)
            .where(eq(pitchingApplications.orgId, org.id));

          // Check applications where user is the curator (receiver)
          const curatorApplications = await db
            .select({ photos: pitchingApplications.photos, trackId: pitchingApplications.trackId })
            .from(pitchingApplications)
            .where(eq(pitchingApplications.curatorOrgId, org.id));

          const allApplications = [...artistApplications, ...curatorApplications];

          for (const app of allApplications) {
            // Check photos array
            if (app.photos && Array.isArray(app.photos) && (app.photos as string[]).includes(fileId)) {
              hasAccess = true;
              break;
            }
            // Check if it's the track's audio file
            if (app.trackId) {
              const [track] = await db
                .select({ audioFileId: tracks.audioFileId, releaseId: tracks.releaseId })
                .from(tracks)
                .where(eq(tracks.id, app.trackId))
                .limit(1);
              if (track?.audioFileId === fileId) {
                hasAccess = true;
                break;
              }
              // Also check release artwork
              if (track?.releaseId) {
                const [release] = await db
                  .select({ artworkFileId: releases.artworkFileId })
                  .from(releases)
                  .where(eq(releases.id, track.releaseId))
                  .limit(1);
                if (release?.artworkFileId === fileId) {
                  hasAccess = true;
                  break;
                }
              }
            }
          }
          if (hasAccess) break;
        }
      }

      if (!hasAccess) {
        return res.status(403).json({ message: "Access denied to this file" });
      }

      // Stream file from Google Drive
      try {
        const fileMetadata = await googleDriveStorage.getFile(fileId);
        console.log(`[DOWNLOAD] fileId: ${fileId}, metadata size: ${fileMetadata.size}, name: ${fileMetadata.name}`);

        const downloadFilename = (filename || fileMetadata.name || 'download') as string;
        const mimeType = fileMetadata.mimeType || 'application/octet-stream';
        const fileSize = parseInt(fileMetadata.size || '0', 10);

        await streamFileFromDrive(req, res, fileId, mimeType, downloadFilename, fileSize);
      } catch (driveError: any) {
        console.error(`❌ Google Drive error for fileId: ${fileId}`, driveError);
        if (driveError.code === 404 || driveError.message?.includes('not found')) {
          return res.status(404).json({ message: "File not found" });
        }
        throw driveError;
      }
    } catch (error) {
      console.error("Error downloading file:", error);
      res.status(500).json({ message: "Failed to download file" });
    }
  });

  // Get video thumbnail from Google Drive
  app.get('/api/files/thumbnail/:fileId', isAuthenticated, async (req: any, res) => {
    try {
      const userId = getUserId(req.user as AuthenticatedUser);
      const user = await storage.getUser(userId);
      
      const { fileId } = req.params;
      const size = parseInt(req.query.size as string) || 200;

      // Admin can get any thumbnail
      if (isPlatformAdmin(user)) {
        try {
          const thumbnailBuffer = await googleDriveStorage.getThumbnail(fileId, size);
          
          res.setHeader('Content-Type', 'image/jpeg');
          res.setHeader('Cache-Control', 'public, max-age=86400'); // Cache for 24 hours
          
          return res.send(thumbnailBuffer);
        } catch (error: any) {
          console.error(`❌ Admin thumbnail fetch failed for fileId: ${fileId}`, error);
          return res.status(404).json({ message: "Thumbnail not found" });
        }
      }

      // Regular users must have access to the file (considers frozen status)
      const userOrgs = await getAccessibleOrganizations(user, userId, storage);
      
      if (userOrgs.length === 0) {
        return res.status(403).json({ message: "No organization found" });
      }

      // Check access to video files and release artworks
      let hasAccess = false;
      
      for (const org of userOrgs) {
        // Check music videos
        const musicVideos = await storage.getMusicVideos(org.id);
        
        // Check by fileId first
        let videoWithFile = musicVideos.find(v => v.videoFileId === fileId);
        
        // Fallback: check by extracting fileId from URL (for legacy data)
        if (!videoWithFile) {
          videoWithFile = musicVideos.find(v => {
            const urlFileId = extractFileIdFromUrl(v.videoUrl);
            return urlFileId === fileId;
          });
        }
        
        if (videoWithFile) {
          hasAccess = true;
          break;
        }
        
        // Check release artworks
        const orgReleases = await db
          .select()
          .from(releases)
          .where(eq(releases.orgId, org.id));
        
        const releaseWithArtwork = orgReleases.find(r => {
          if (r.artworkFileId === fileId) return true;
          const urlFileId = extractFileIdFromUrl(r.artworkUrl);
          return urlFileId === fileId;
        });
        
        if (releaseWithArtwork) {
          hasAccess = true;
          break;
        }
      }

      if (!hasAccess) {
        return res.status(403).json({ message: "Access denied to this thumbnail" });
      }

      // Get thumbnail
      try {
        const thumbnailBuffer = await googleDriveStorage.getThumbnail(fileId, size);
        
        res.setHeader('Content-Type', 'image/jpeg');
        res.setHeader('Cache-Control', 'public, max-age=86400'); // Cache for 24 hours
        
        res.send(thumbnailBuffer);
      } catch (error: any) {
        console.error(`❌ Thumbnail fetch error for fileId: ${fileId}`, error);
        return res.status(404).json({ message: "Thumbnail not found" });
      }
    } catch (error) {
      console.error("Error fetching thumbnail:", error);
      res.status(500).json({ message: "Failed to fetch thumbnail" });
    }
  });

  // Public endpoint: Count releases in 2026 (for landing page)
  app.get('/api/public/releases-count-2026', async (req, res) => {
    try {
      const { gte, lt, and, sql } = await import("drizzle-orm");
      
      // Count all releases with releaseDate in 2026 (>= 2026-01-01 AND < 2027-01-01)
      const startDate = new Date('2026-01-01');
      const endDate = new Date('2027-01-01');
      
      const result = await db
        .select({ count: sql<number>`count(*)` })
        .from(releases)
        .where(and(
          gte(releases.releaseDate, startDate),
          lt(releases.releaseDate, endDate)
        ));
      
      const count = Number(result[0]?.count || 0);
      
      res.json({ count, year: 2026 });
    } catch (error) {
      console.error("Error counting 2026 releases:", error);
      res.status(500).json({ error: "Failed to count releases" });
    }
  });

  // Test endpoint to check if webhook URL is accessible (supports both URL patterns)
  app.get(['/api/webhooks/wayforpay', '/api/wayforpay/webhook'], async (req, res) => {
    res.json({
      status: 'ok',
      message: 'Wayforpay webhook endpoint is accessible',
      url: `${req.protocol}://${req.get('host')}${req.originalUrl}`,
      canonical: `${req.protocol}://${req.get('host')}/api/webhooks/wayforpay`,
      timestamp: new Date().toISOString()
    });
  });

  // Wayforpay webhook endpoint (supports both URL patterns for backwards compatibility)
  app.post(['/api/webhooks/wayforpay', '/api/wayforpay/webhook'], async (req, res) => {
    try {
      console.log('🔔 ================== WAYFORPAY WEBHOOK RECEIVED ==================');
      console.log('📥 Raw webhook body:', JSON.stringify(req.body, null, 2));
      console.log('📥 Headers:', JSON.stringify(req.headers, null, 2));
      
      // Handle case where Wayforpay sends JSON with content-type application/x-www-form-urlencoded
      // Express parses this as form data where the entire JSON string becomes a key with empty value
      let parsedBody = req.body;
      
      // Check if body is an object with a single key that looks like JSON
      const bodyKeys = Object.keys(req.body);
      if (bodyKeys.length === 1 && bodyKeys[0].startsWith('{') && req.body[bodyKeys[0]] === '') {
        try {
          parsedBody = JSON.parse(bodyKeys[0]);
          console.log('📥 Parsed JSON from form key:', JSON.stringify(parsedBody, null, 2));
        } catch (parseError) {
          console.error('❌ Failed to parse JSON from form key:', parseError);
        }
      }
      
      const {
        merchantAccount,
        orderReference,
        amount,
        currency,
        authCode,
        cardPan,
        transactionStatus,
        reasonCode,
        reason,
        email,
        phone,
        merchantSignature
      } = parsedBody;

      // Log webhook for debugging
      await storage.logAction({
        userId: 'system',
        orgId: null,
        action: 'WAYFORPAY_WEBHOOK',
        entity: 'payment',
        entityId: orderReference,
        data: {
          transactionStatus,
          amount,
          currency,
          email,
          phone,
          reasonCode,
          signatureReceived: !!merchantSignature
        }
      });

      // CRITICAL: Verify signature with Wayforpay secret key
      const WAYFORPAY_SECRET_KEY = process.env.WAYFORPAY_SECRET_KEY;
      if (!WAYFORPAY_SECRET_KEY) {
        console.error('❌ WAYFORPAY_SECRET_KEY not configured in environment');
        await storage.logAction({
          userId: 'system',
          orgId: null,
          action: 'WAYFORPAY_WEBHOOK_ERROR',
          entity: 'payment',
          entityId: orderReference,
          data: {
            error: 'WAYFORPAY_SECRET_KEY not configured',
            message: 'Add WAYFORPAY_SECRET_KEY to Secrets to enable payment verification'
          }
        });
        return res.status(500).json({ 
          error: 'Payment verification not configured',
          message: 'Contact administrator to configure WAYFORPAY_SECRET_KEY'
        });
      }

      // Verify HMAC_MD5 signature
      const crypto = await import('crypto');
      const signString = `${merchantAccount};${orderReference};${amount};${currency};${authCode};${cardPan};${transactionStatus};${reasonCode}`;
      const expectedSignature = crypto.createHmac('md5', WAYFORPAY_SECRET_KEY).update(signString).digest('hex');
      
      console.log('🔐 Signature verification:');
      console.log('   Sign string:', signString);
      console.log('   Expected:', expectedSignature);
      console.log('   Received:', merchantSignature);
      console.log('   Match:', expectedSignature === merchantSignature);
      
      if (expectedSignature !== merchantSignature) {
        console.error('❌ Invalid signature from Wayforpay');
        await storage.logAction({
          userId: 'system',
          orgId: null,
          action: 'WAYFORPAY_WEBHOOK_ERROR',
          entity: 'payment',
          entityId: orderReference,
          data: {
            error: 'Invalid signature',
            expectedSignature,
            receivedSignature: merchantSignature,
            signString
          }
        });
        return res.status(403).json({ error: 'Invalid signature' });
      }
      
      console.log('✅ Wayforpay signature verified');

      // Update release payment status if transaction is approved
      if (transactionStatus === 'Approved') {
        console.log(`✅ Payment approved: ${orderReference}, amount: ${amount} ${currency}`);
        
        // Check if this is a YouTube Ads payment (format: ytads_{campaignId}_{timestamp})
        const ytadsMatch = orderReference.match(/^ytads_([^_]+)_/);
        // Check if this is a release payment (format: release_{releaseId}_{timestamp})
        const releaseMatch = orderReference.match(/^release_([^_]+)_/);
        // Check if this is a music video payment (format: video_{videoId}_{timestamp})
        const videoMatch = orderReference.match(/^video_([^_]+)_/);
        // Check if this is a pitching/playlist application payment (format: pitching_{applicationId}_{timestamp})
        const pitchingMatch = orderReference.match(/^pitching_([^_]+)_/);
        
        if (ytadsMatch) {
          // Handle YouTube Ads campaign payment
          // Find campaign by paymentReference (format: ytads_{timestamp}_{random})
          console.log(`📝 Looking for YouTube Ads campaign with paymentReference: ${orderReference}`);
          
          const campaign = await storage.getYoutubeAdCampaignByPaymentReference(orderReference);
          console.log(`📋 Campaign details:`, campaign ? {
            id: campaign.id,
            budget: campaign.budget,
            paymentStatus: campaign.paymentStatus,
            status: campaign.status,
            paymentReference: campaign.paymentReference
          } : 'NOT FOUND');
          
          if (campaign) {
            // Idempotency check: skip if already processed
            if (campaign.paymentStatus === 'PAID') {
              console.log(`⏭️ YouTube Ads campaign ${campaign.id} already processed, skipping duplicate webhook`);
            } else {
            // Update campaign payment status and change status to PENDING for admin review
            await storage.updateYoutubeAdCampaign(campaign.id, {
              paymentStatus: "PAID",
              status: "PENDING",
              paidAt: new Date()
            });
            
            await storage.logAction({
              userId: 'system',
              orgId: campaign.orgId,
              action: 'YOUTUBE_ADS_PAYMENT_CONFIRMED',
              entity: 'youtube_ad_campaign',
              entityId: campaign.id,
              data: {
                orderReference,
                budget: campaign.budget,
                wayforpayAmount: amount,
                currency
              }
            });
            
            // Create notification for user about successful payment
            await storage.createNotification({
              userId: campaign.userId,
              releaseId: null,
              pitchingId: null,
              relatedEntityType: "youtubeAdCampaign",
              relatedEntityId: campaign.id,
              title: "YouTube Ads",
              message: "Оплата за рекламну кампанію пройшла успішно",
              type: "YOUTUBE_AD_PAYMENT_SUCCESS",
              isRead: false,
              changedFields: null,
            });
            
            // Notify admins about new paid campaign for review
            const organization = await storage.getOrganization(campaign.orgId);
            const allUsers = await storage.getAllUsers();
            const adminUsers = allUsers.filter(u => isPlatformAdmin(u));
            
            const notificationTitle = "Нова YouTube реклама";
            const notificationMessage = `${organization?.name || 'Невідома організація'} - бюджет $${campaign.budget}, ${campaign.duration} днів`;
            
            for (const admin of adminUsers) {
              await storage.createNotification({
                userId: admin.id,
                releaseId: null,
                pitchingId: null,
                relatedEntityType: "youtubeAdCampaign",
                relatedEntityId: campaign.id,
                title: notificationTitle,
                message: notificationMessage,
                type: "YOUTUBE_AD_SUBMITTED",
                isRead: false,
                changedFields: null,
              });
            }
            
            // Send email notification to admin
            const { sendNotificationEmail } = await import("./googleMail");
            void sendNotificationEmail(notificationTitle, notificationMessage, "YOUTUBE_AD_SUBMITTED").catch(err => {
              console.error('[EMAIL] Failed to send notification email:', err);
            });
            
            // Send Telegram notification to admin
            const { sendTelegramNotification } = await import("./telegram");
            void sendTelegramNotification(notificationTitle, notificationMessage).catch(err => {
              console.error('[TELEGRAM] Failed to send notification:', err);
            });
            
            console.log(`✅ YouTube Ads campaign ${campaign.id} marked as PAID, status changed to PENDING for admin review`);
            }
          } else {
            console.error(`❌ Campaign not found with paymentReference: ${orderReference}`);
          }
        } else if (releaseMatch) {
          // Handle release payment
          const releaseId = releaseMatch[1];
          console.log(`📝 Extracted releaseId: ${releaseId}`);
          
          // Get release to verify orderReference matches
          const releaseDetails = await storage.getReleaseDetails(releaseId);
          console.log(`📋 Release details:`, releaseDetails ? {
            id: releaseDetails.id,
            title: releaseDetails.title,
            paymentStatus: releaseDetails.paymentStatus,
            paymentOrderReference: releaseDetails.paymentOrderReference,
            trackCount: releaseDetails.tracks?.length
          } : 'NOT FOUND');
          
          if (releaseDetails && releaseDetails.paymentOrderReference === orderReference) {
            // Idempotency check: skip if already processed
            if (releaseDetails.paymentStatus === 'PAID') {
              console.log(`⏭️ Release ${releaseId} already processed, skipping duplicate webhook`);
            } else {
              // Use actual payment amount from Wayforpay (convert UAH to kopecks)
              const wayforpayAmountKopecks = Math.round(parseFloat(amount) * 100);
              
              // Validate amount is a valid number
              if (!Number.isFinite(wayforpayAmountKopecks) || wayforpayAmountKopecks <= 0) {
                console.error(`❌ Invalid amount from Wayforpay: ${amount}`);
                await storage.logAction({
                  userId: 'system',
                  orgId: releaseDetails.orgId,
                  action: 'PAYMENT_ERROR',
                  entity: 'release',
                  entityId: releaseId,
                  data: { error: 'Invalid amount', rawAmount: amount }
                });
                return res.status(400).json({ error: 'Invalid payment amount' });
              }
              
              // Update release payment status with real payment amount and change status to In Review
              await storage.updateRelease(releaseId, {
                paymentStatus: "PAID",
                paymentAmount: wayforpayAmountKopecks,
                paidAt: new Date(),
                status: "IN_REVIEW" // Automatically submit for review after payment
              });
              
              await storage.logAction({
                userId: 'system',
                orgId: releaseDetails.orgId,
                action: 'PAYMENT_CONFIRMED',
                entity: 'release',
                entityId: releaseId,
                data: {
                  orderReference,
                  amountKopecks: wayforpayAmountKopecks,
                  amountUah: parseFloat(amount),
                  currency
                }
              });
              
              // Send notification to release owner
              const orgMembers = await storage.getOrgMembers(releaseDetails.orgId);
              const orgOwner = orgMembers.find(m => m.role === 'OWNER');
              if (orgOwner) {
                await storage.createNotification({
                  userId: orgOwner.userId,
                  releaseId: releaseId,
                  pitchingId: null,
                  relatedEntityType: "release",
                  relatedEntityId: releaseId,
                  title: "Оплату підтверджено",
                  message: `Оплата за реліз "${releaseDetails.title}" пройшла успішно`,
                  type: "RELEASE_PAYMENT_SUCCESS",
                  isRead: false,
                  changedFields: null,
                });
              }
              
              console.log(`✅ Release ${releaseId} marked as PAID`);
            }
          } else {
            console.error(`❌ Release not found or orderReference mismatch: ${releaseId}`);
          }
        } else if (videoMatch) {
          // Handle music video payment
          const videoId = videoMatch[1];
          console.log(`📝 Extracted videoId: ${videoId}`);
          
          // Get video to verify orderReference matches
          const video = await storage.getMusicVideo(videoId);
          console.log(`📋 Video details:`, video ? {
            id: video.id,
            title: video.title,
            paymentStatus: video.paymentStatus,
            paymentOrderReference: video.paymentOrderReference,
          } : 'NOT FOUND');
          
          if (video && video.paymentOrderReference === orderReference) {
            // Idempotency check: skip if already processed
            if (video.paymentStatus === 'PAID') {
              console.log(`⏭️ Music video ${videoId} already processed, skipping duplicate webhook`);
            } else {
              // Use actual payment amount from Wayforpay (convert UAH to kopecks)
              const wayforpayAmountKopecks = Math.round(parseFloat(amount) * 100);
              
              // Validate amount is a valid number
              if (!Number.isFinite(wayforpayAmountKopecks) || wayforpayAmountKopecks <= 0) {
                console.error(`❌ Invalid amount from Wayforpay: ${amount}`);
                await storage.logAction({
                  userId: 'system',
                  orgId: video.orgId,
                  action: 'PAYMENT_ERROR',
                  entity: 'music_video',
                  entityId: videoId,
                  data: { error: 'Invalid amount', rawAmount: amount }
                });
                return res.status(400).json({ error: 'Invalid payment amount' });
              }
              
              // Update video payment status with real payment amount and change status to In Review
              await storage.updateMusicVideo(videoId, {
                paymentStatus: "PAID",
                paymentAmount: wayforpayAmountKopecks,
                paidAt: new Date(),
                status: "IN_REVIEW" // Automatically submit for review after payment
              });
              
              await storage.logAction({
                userId: 'system',
                orgId: video.orgId,
                action: 'VIDEO_PAYMENT_CONFIRMED',
                entity: 'music_video',
                entityId: videoId,
                data: {
                  orderReference,
                  amountKopecks: wayforpayAmountKopecks,
                  amountUah: parseFloat(amount),
                  currency
                }
              });
              
              // Send notification to video owner
              const videoOrgMembers = await storage.getOrgMembers(video.orgId);
              const videoOrgOwner = videoOrgMembers.find(m => m.role === 'OWNER');
              if (videoOrgOwner) {
                await storage.createNotification({
                  userId: videoOrgOwner.userId,
                  releaseId: null,
                  pitchingId: null,
                  relatedEntityType: "music_video",
                  relatedEntityId: videoId,
                  title: "Оплату підтверджено",
                  message: `Оплата за музичне відео "${video.title}" пройшла успішно`,
                  type: "VIDEO_PAYMENT_SUCCESS",
                  isRead: false,
                  changedFields: null,
                });
              }
              
              console.log(`✅ Music video ${videoId} marked as PAID`);
            }
          } else {
            console.error(`❌ Video not found or orderReference mismatch: ${videoId}`);
          }
        } else if (pitchingMatch) {
          // Handle pitching/playlist application payment
          const applicationId = pitchingMatch[1];
          console.log(`📝 Extracted pitching applicationId: ${applicationId}`);
          
          // Get application to verify orderReference matches
          const [application] = await db
            .select()
            .from(pitchingApplications)
            .where(eq(pitchingApplications.id, applicationId))
            .limit(1);
            
          console.log(`📋 Pitching application details:`, application ? {
            id: application.id,
            curatorOrgId: application.curatorOrgId,
            paymentId: application.paymentId,
            paymentStatus: application.paymentStatus,
            paidAmount: application.paidAmount,
          } : 'NOT FOUND');
          
          if (application && application.paymentId === orderReference) {
            // Idempotency check: skip if already processed
            if (application.paymentStatus === 'PAID') {
              console.log(`⏭️ Pitching application ${applicationId} already processed, skipping duplicate webhook`);
            } else {
              // Convert amount to kopecks for storage
              const amountKopecks = Math.round(parseFloat(amount) * 100);
              
              // Update application payment status
              await db
                .update(pitchingApplications)
                .set({
                  paymentStatus: 'PAID',
                  paidAt: new Date(),
                  updatedAt: new Date(),
                })
                .where(eq(pitchingApplications.id, applicationId));
              
              // Calculate curator's share (81% = 100% - 2% wayforpay - 7% FOP - 10% platform)
              const CURATOR_COMMISSION_RATE = 0.81;
              const curatorAmount = Math.round(amountKopecks * CURATOR_COMMISSION_RATE);
              
              // Calculate when funds become available (next day after 10:00 AM Kyiv time)
              const now = new Date();
              const kyivOffset = 2 * 60 * 60 * 1000; // UTC+2 (simplified, not accounting for DST)
              const kyivNow = new Date(now.getTime() + kyivOffset);
              const availableAt = new Date(kyivNow);
              availableAt.setDate(availableAt.getDate() + 1);
              availableAt.setHours(10, 0, 0, 0);
              // Convert back to UTC
              const availableAtUTC = new Date(availableAt.getTime() - kyivOffset);
              
              // Create curator income transaction
              await db.insert(curatorTransactions).values({
                curatorOrgId: application.curatorOrgId,
                type: 'INCOME',
                status: 'PENDING',
                amount: curatorAmount,
                currency: 'UAH',
                applicationId: applicationId,
                description: `Оплата за розміщення треку #${application.applicationCode || applicationId.slice(0, 8)}`,
                availableAt: availableAtUTC,
              });
              
              await storage.logAction({
                userId: 'system',
                orgId: application.curatorOrgId,
                action: 'CURATOR_PAYMENT_RECEIVED',
                entity: 'pitching_application',
                entityId: applicationId,
                data: {
                  orderReference,
                  totalAmountKopecks: amountKopecks,
                  curatorAmountKopecks: curatorAmount,
                  currency,
                  availableAt: availableAtUTC.toISOString(),
                }
              });
              
              // Notify curator about incoming payment
              const curatorOrgMembers = await storage.getOrgMembers(application.curatorOrgId);
              const curatorOwner = curatorOrgMembers.find(m => m.role === 'OWNER');
              if (curatorOwner) {
                await storage.createNotification({
                  userId: curatorOwner.userId,
                  releaseId: null,
                  pitchingId: applicationId,
                  relatedEntityType: "pitching_application",
                  relatedEntityId: applicationId,
                  title: "Отримано оплату",
                  message: `Ви отримали ${(curatorAmount / 100).toFixed(2)} UAH за розміщення треку. Кошти будуть доступні завтра після 10:00.`,
                  type: "CURATOR_PAYMENT_RECEIVED",
                  link: `/curator/applications?id=${applicationId}`,
                  isRead: false,
                  changedFields: null,
                });
              }
              
              // Record platform revenue from pitching payment
              // All funds go to platform balance first, then curator payout is processed separately
              let playlistName = 'Плейлист';
              if (application.playlistId) {
                const [playlistRecord] = await db.select({ name: localPlaylists.name }).from(localPlaylists).where(eq(localPlaylists.id, application.playlistId)).limit(1);
                if (playlistRecord?.name) playlistName = playlistRecord.name;
              }
              await db.insert(platformExpenses).values({
                type: 'REVENUE',
                category: 'PLAYLIST',
                amount: amountKopecks,
                comment: `Пітчинг: ${application.applicationCode || applicationId.slice(0, 8)} - ${playlistName}`,
                organizationId: application.orgId,
                expenseDate: new Date(),
                createdBy: 'system',
              });
              
              console.log(`💰 Platform revenue recorded: ${amountKopecks / 100} UAH from pitching ${applicationId}`);
              
              console.log(`✅ Pitching application ${applicationId} marked as PAID, curator credited ${curatorAmount / 100} UAH`);
            }
          } else {
            console.error(`❌ Pitching application not found or paymentId mismatch: ${applicationId}`);
          }
        } else if (orderReference.startsWith('academy_')) {
          const academyMatch = orderReference.match(/^academy_([^_]+)_([^_]+)_/);
          if (academyMatch) {
            const courseId = academyMatch[1];
            console.log(`📝 Academy purchase for course: ${courseId}`);

            const purchase = await storage.getAcademyPurchaseByOrderRef(orderReference);
            if (purchase) {
              if (purchase.status === 'PAID') {
                console.log(`⏭️ Academy purchase ${purchase.id} already processed, skipping duplicate webhook`);
              } else {
                await storage.updateAcademyPurchase(purchase.id, {
                  status: 'PAID',
                  paidAt: new Date(),
                });

                await storage.logAction({
                  userId: 'system',
                  orgId: null,
                  action: 'ACADEMY_PAYMENT_CONFIRMED',
                  entity: 'academy_purchase',
                  entityId: purchase.id,
                  data: { orderReference, amount, currency, courseId }
                });

                console.log(`✅ Academy purchase ${purchase.id} marked as PAID`);
              }
            } else {
              console.error(`❌ Academy purchase not found with orderReference: ${orderReference}`);
            }
          }
        } else if (orderReference.startsWith('donation_')) {
          const donationMatch = orderReference.match(/^donation_([^_]+)_/);
          if (donationMatch) {
            const donationId = donationMatch[1];
            console.log(`📝 Extracted donation ID: ${donationId}`);
            
            const [donation] = await db
              .select()
              .from(curatorDonations)
              .where(eq(curatorDonations.id, donationId))
              .limit(1);
            
            if (donation && donation.orderReference === orderReference) {
              if (donation.status === 'PAID') {
                console.log(`⏭️ Donation ${donationId} already processed, skipping duplicate webhook`);
              } else {
                await db
                  .update(curatorDonations)
                  .set({
                    status: 'PAID',
                    paidAt: new Date(),
                  })
                  .where(eq(curatorDonations.id, donationId));
                
                const amountKopecks = Math.round(parseFloat(amount) * 100);
                const CURATOR_COMMISSION_RATE = 0.81;
                const curatorAmount = Math.round(amountKopecks * CURATOR_COMMISSION_RATE);
                
                const now = new Date();
                const kyivOffset = 2 * 60 * 60 * 1000;
                const kyivNow = new Date(now.getTime() + kyivOffset);
                const availableAt = new Date(kyivNow);
                availableAt.setDate(availableAt.getDate() + 1);
                availableAt.setHours(10, 0, 0, 0);
                const availableAtUTC = new Date(availableAt.getTime() - kyivOffset);
                
                await db.insert(curatorTransactions).values({
                  curatorOrgId: donation.curatorOrgId,
                  type: 'INCOME',
                  status: 'PENDING',
                  amount: curatorAmount,
                  currency: 'UAH',
                  applicationId: donation.applicationId,
                  description: `Донат від артиста за заявку #${donation.applicationId.slice(0, 8)}`,
                  availableAt: availableAtUTC,
                });
                
                await storage.logAction({
                  userId: 'system',
                  orgId: donation.curatorOrgId,
                  action: 'CURATOR_DONATION_RECEIVED',
                  entity: 'curator_donation',
                  entityId: donationId,
                  data: {
                    orderReference,
                    totalAmountKopecks: amountKopecks,
                    curatorAmountKopecks: curatorAmount,
                    currency,
                    applicationId: donation.applicationId,
                    availableAt: availableAtUTC.toISOString(),
                  }
                });
                
                const curatorOrgMembers = await storage.getOrgMembers(donation.curatorOrgId);
                const curatorOwner = curatorOrgMembers.find(m => m.role === 'OWNER');
                if (curatorOwner) {
                  await storage.createNotification({
                    userId: curatorOwner.userId,
                    releaseId: null,
                    pitchingId: donation.applicationId,
                    relatedEntityType: "curator_donation",
                    relatedEntityId: donationId,
                    title: "Отримано донат",
                    message: `Артист підтримав вас донатом ${(donation.amount)} UAH! Кошти будуть доступні завтра після 10:00.`,
                    type: "CURATOR_DONATION_RECEIVED",
                    link: `/curator/applications?id=${donation.applicationId}`,
                    isRead: false,
                    changedFields: null,
                  });
                }
                
                let playlistName = 'Плейлист';
                const [application] = await db.select().from(pitchingApplications).where(eq(pitchingApplications.id, donation.applicationId)).limit(1);
                if (application?.playlistId) {
                  const [playlistRecord] = await db.select({ name: localPlaylists.name }).from(localPlaylists).where(eq(localPlaylists.id, application.playlistId)).limit(1);
                  if (playlistRecord?.name) playlistName = playlistRecord.name;
                }
                await db.insert(platformExpenses).values({
                  type: 'REVENUE',
                  category: 'PLAYLIST',
                  amount: amountKopecks,
                  comment: `Донат куратору: ${playlistName} - ${donation.applicationId.slice(0, 8)}`,
                  organizationId: donation.artistOrgId,
                  expenseDate: new Date(),
                  createdBy: 'system',
                });
                
                console.log(`✅ Donation ${donationId} marked as PAID, curator credited ${curatorAmount / 100} UAH`);
              }
            } else {
              console.error(`❌ Donation not found or orderReference mismatch: ${donationId}`);
            }
          }
        } else {
          console.error(`❌ Could not parse entity from orderReference: ${orderReference}`);
        }
      }

      // Return proper response to Wayforpay with signature
      const time = Math.floor(Date.now() / 1000);
      
      // Generate response signature according to Wayforpay docs
      // Format: merchantAccount;orderReference;accept;time (using secret as HMAC key only)
      const responseSignString = `${merchantAccount};${orderReference};accept;${time}`;
      const responseSignature = crypto.createHmac('md5', WAYFORPAY_SECRET_KEY).update(responseSignString).digest('hex');
      
      console.log('🔐 Response signature:');
      console.log('   Sign string:', responseSignString);
      console.log('   Signature:', responseSignature);
      
      const response = {
        orderReference,
        status: 'accept',
        time,
        signature: responseSignature
      };

      console.log('✅ Sending response to Wayforpay:', response);
      res.json(response);
    } catch (error) {
      console.error('Error processing Wayforpay webhook:', error);
      res.status(500).json({ error: 'Failed to process webhook' });
    }
  });

  // Download file from Google Drive
  app.get('/api/files/:fileId', isAuthenticated, async (req: any, res) => {
    try {
      const { fileId } = req.params;
      
      // Get file metadata
      const fileMetadata = await googleDriveStorage.getFile(fileId);
      
      // Download file content
      const fileBuffer = await googleDriveStorage.downloadFile(fileId);
      
      // Set headers and send file
      res.set({
        'Content-Type': fileMetadata.mimeType || 'application/octet-stream',
        'Content-Length': fileBuffer.length,
        'Cache-Control': 'public, max-age=3600',
      });
      
      res.send(fileBuffer);
    } catch (error) {
      console.error("Error downloading file from Google Drive:", error);
      res.status(500).json({ message: "Failed to download file" });
    }
  });

  // Alias endpoint for downloads
  app.get('/api/download/:fileId', isAuthenticated, async (req: any, res) => {
    try {
      const { fileId } = req.params;
      
      // Get file metadata
      const fileMetadata = await googleDriveStorage.getFile(fileId);
      
      // Download file content
      const fileBuffer = await googleDriveStorage.downloadFile(fileId);
      
      // Set headers and send file
      res.set({
        'Content-Type': fileMetadata.mimeType || 'application/octet-stream',
        'Content-Length': fileBuffer.length,
        'Content-Disposition': `attachment; filename="${fileMetadata.name || 'file'}"`,
        'Cache-Control': 'no-cache',
      });
      
      res.send(fileBuffer);
    } catch (error) {
      console.error("Error downloading file from Google Drive:", error);
      res.status(404).json({ message: "Failed to download file" });
    }
  });

  // ==================== STREAMING REPORTS ====================

  // Get all streaming reports (admin only)
  app.get('/api/admin/streaming-reports', isAuthenticated, async (req: any, res) => {
    try {
      const user = req.user as User;
      if (!isPlatformOwner(user)) {
        return res.status(403).json({ error: "Owner access required" });
      }

      const reports = await storage.getAllStreamingReports();
      res.json(reports);
    } catch (error) {
      console.error("Error getting all streaming reports:", error);
      res.status(500).json({ message: "Failed to get streaming reports" });
    }
  });
  
  // Upload streaming report (admin only)
  app.post('/api/admin/streaming-reports', isAuthenticated, async (req: any, res) => {
    try {
      const user = req.user as User;
      if (!isPlatformOwner(user)) {
        return res.status(403).json({ error: "Owner access required" });
      }

      const multer = (await import('multer')).default;
      const upload = multer({ storage: multer.memoryStorage() });
      
      upload.single('file')(req, res, async (err) => {
        if (err) {
          console.error("Multer error:", err);
          return res.status(400).json({ message: "File upload error" });
        }
        
        if (!req.file) {
          return res.status(400).json({ message: "No file provided" });
        }

        const { orgId, period, taxDeductionType } = req.body;
        if (!orgId || !period) {
          return res.status(400).json({ message: "Organization ID and period are required" });
        }

        // Validate taxDeductionType if provided
        const validTaxTypes = ['fop_7', 'agent_23', 'both'];
        const taxType = taxDeductionType && validTaxTypes.includes(taxDeductionType) 
          ? taxDeductionType 
          : null;

        console.log('📊 Processing Excel upload:', {
          filename: req.file.originalname,
          mimetype: req.file.mimetype,
          size: req.file.buffer.length,
          orgId,
          period,
          taxDeductionType: taxType
        });
        
        try {
          // Use centralized import service
          const result = await parseAndImportStreamingReport(storage, {
            orgId,
            uploadedBy: user.id,
            fileBuffer: req.file.buffer,
            fileName: req.file.originalname,
            period,
            source: 'MANUAL_UPLOAD',
            taxDeductionType: taxType
          });

          if (!result.success) {
            return res.status(400).json({ 
              message: result.error || "Failed to import report",
              details: result.errorDetails
            });
          }

          // Notify organization members about new report
          const orgMembers = await storage.getOrgMembers(orgId);
          const organization = await storage.getOrganization(orgId);
          const notificationTitle = "Новий звіт про стрімінг";
          const notificationMessage = `${organization?.name || "Організація"} - завантажено звіт за період ${period}`;
          
          for (const member of orgMembers) {
            if (member.userId !== user.id) {
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
            }
          }

          console.log('✅ Report uploaded successfully:', result.report?.id);
          res.json({
            success: true,
            report: result.report,
            rowsCount: result.rowsCount,
          });
        } catch (parseError: any) {
          console.error("❌ Error importing report:", parseError);
          return res.status(400).json({ 
            message: "Failed to import report", 
            error: parseError.message,
            details: parseError.toString()
          });
        }
      });
    } catch (error) {
      console.error("Error uploading streaming report:", error);
      res.status(500).json({ message: "Failed to upload streaming report" });
    }
  });

  // Fix existing streaming report data without re-uploading (admin only)
  app.post('/api/admin/streaming-reports/:id/fix-data', isAuthenticated, async (req: any, res) => {
    try {
      const user = req.user as User;
      if (!isPlatformOwner(user)) {
        return res.status(403).json({ error: "Owner access required" });
      }

      const { id } = req.params;
      
      const report = await storage.getStreamingReport(id);
      if (!report) {
        return res.status(404).json({ message: "Report not found" });
      }

      const reportPeriod = normalizePeriod(report.period);
      console.log(`🔧 Fixing data for report ${id} (period: ${reportPeriod}), downloading from ${report.fileUrl}`);
      
      const fileId = report.fileUrl.match(/id=([^&]+)/)?.[1];
      if (!fileId) {
        return res.status(400).json({ message: "Invalid file URL" });
      }

      const fileBuffer = await googleDriveStorage.downloadFile(fileId);
      
      const workbook = XLSX.read(fileBuffer, { 
        type: 'buffer',
        codepage: 65001,
        cellText: false,
        cellDates: true,
        raw: true
      });
      
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      const jsonData = XLSX.utils.sheet_to_json(worksheet, { 
        raw: true,
        defval: ''
      }) as any[];

      console.log(`📊 Parsed ${jsonData.length} rows from Excel for FIX`);

      const getColumnValue = (row: any, ...possibleNames: string[]) => {
        for (const name of possibleNames) {
          if (row[name] !== undefined && row[name] !== null && row[name] !== '') {
            return row[name];
          }
        }
        return '';
      };

      const taxDeductionType = report.taxDeductionType as 'fop_7' | 'agent_23' | 'both' | null;
      
      let totalStreams = 0;
      let totalRevenue = 0;
      const periodDistribution: Record<string, number> = {};

      const newRows = jsonData.map((excelRow) => {
        const partner = getColumnValue(excelRow, 'Партнер', 'Partner');
        const service = getColumnValue(excelRow, 'Сервіс', 'Service');
        const album = getColumnValue(excelRow, 'Альбом', 'Album');
        const type = getColumnValue(excelRow, 'Тип', 'Type') || 'track';
        const artist = getColumnValue(excelRow, 'Виконавець', 'Artist');
        const trackName = getColumnValue(excelRow, 'Назва', 'Name', 'Track Name', 'Title');
        const isrc = getColumnValue(excelRow, 'ISRC') || null;
        const upc = getColumnValue(excelRow, 'UPC') || null;

        const streamsRaw = getColumnValue(excelRow, 'Кількість', 'Quantity', 'Streams');
        const pricePerUnitRaw = getColumnValue(excelRow, 'Ціна за одиницю', 'Price per unit', 'Price per Unit', 'Unit Price');
        const netRevenueRaw = getColumnValue(excelRow, 'Винагорода нетто Ліцензіара', 'Net remuneration of Licensor', 'Net Revenue', 'Revenue');

        const streams = parseInt(streamsRaw) || 0;
        const pricePerUnit = parseFloat(String(pricePerUnitRaw).replace(',', '.')) || 0;
        const netRevenueOriginal = parseFloat(String(netRevenueRaw).replace(',', '.')) || 0;
        const netRevenue = taxDeductionType ? 
          (taxDeductionType === 'fop_7' ? netRevenueOriginal * 0.93 :
           taxDeductionType === 'agent_23' ? netRevenueOriginal * 0.77 :
           taxDeductionType === 'both' ? netRevenueOriginal * 0.93 * 0.77 : netRevenueOriginal)
          : netRevenueOriginal;

        const currency = getColumnValue(excelRow, 'валюта', 'Currency') || 'EUR';
        const rawRowPeriod = getColumnValue(excelRow, 'Звітний період', 'Period') || reportPeriod;
        const rowPeriod = normalizePeriod(String(rawRowPeriod));
        const country = getColumnValue(excelRow, 'Країна', 'Country');

        periodDistribution[rowPeriod] = (periodDistribution[rowPeriod] || 0) + 1;

        if (rowPeriod === reportPeriod) {
          totalStreams += streams;
          totalRevenue += netRevenue;
        }

        return {
          reportId: id,
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
          period: rowPeriod,
          country: country || '',
        };
      });

      await storage.deleteStreamingReportRows(id);
      const insertedCount = await storage.createStreamingReportRowsBatch(newRows);
      
      await storage.updateStreamingReport(id, {
        period: reportPeriod,
        totalStreams,
        totalRevenue: totalRevenue.toFixed(2),
      });

      console.log(`✅ FIX complete: ${insertedCount} rows re-inserted, period distribution:`, periodDistribution);
      console.log(`✅ Report totals (period ${reportPeriod} only): ${totalStreams} streams, €${totalRevenue.toFixed(2)}`);
      
      res.json({ 
        success: true, 
        message: `Re-imported ${insertedCount} rows. Report totals recalculated for period ${reportPeriod} only.`,
        totalStreams,
        totalRevenue: totalRevenue.toFixed(2),
        totalRows: insertedCount,
        periodDistribution,
      });
    } catch (error) {
      console.error("Error fixing streaming report data:", error);
      res.status(500).json({ message: "Failed to fix streaming report data" });
    }
  });

  // Fix ALL streaming reports data at once (admin only)
  app.post('/api/admin/streaming-reports/fix-all-data', isAuthenticated, async (req: any, res) => {
    try {
      const user = req.user as User;
      if (!isPlatformOwner(user)) {
        return res.status(403).json({ error: "Owner access required" });
      }

      // Get all reports
      const allReports = await storage.getAllStreamingReports();
      console.log(`🔧 Fixing data for ${allReports.length} reports...`);
      
      let totalFixed = 0;
      let totalReportsFixed = 0;
      const results = [];

      for (const report of allReports) {
        try {
          console.log(`Processing report ${report.id} (${report.period})...`);
          
          // Download Excel file from Google Drive
          const fileId = report.fileUrl.match(/id=([^&]+)/)?.[1];
          if (!fileId) {
            console.log(`⚠️ Skipping report ${report.id} - invalid file URL`);
            continue;
          }

          const fileBuffer = await googleDriveStorage.downloadFile(fileId);
          
          // Parse Excel file
          const workbook = XLSX.read(fileBuffer, { 
            type: 'buffer',
            codepage: 65001,
            cellText: false,
            cellDates: true,
            raw: true
          });
          
          const sheetName = workbook.SheetNames[0];
          const worksheet = workbook.Sheets[sheetName];
          const jsonData = XLSX.utils.sheet_to_json(worksheet, { 
            raw: true,
            defval: ''
          }) as any[];

          // Helper function to get value from row
          const getColumnValue = (row: any, ...possibleNames: string[]) => {
            for (const name of possibleNames) {
              if (row[name] !== undefined && row[name] !== null && row[name] !== '') {
                return row[name];
              }
            }
            return '';
          };
          
          // Get existing rows
          const existingRows = await storage.getStreamingReportRows(report.id);
          
          // Update each row with correct data
          let updatedCount = 0;
          for (let i = 0; i < Math.min(jsonData.length, existingRows.length); i++) {
            const excelRow = jsonData[i];
            const dbRow = existingRows[i];
            
            const pricePerUnitRaw = getColumnValue(excelRow, 'Ціна за одиницю', 'Price per unit', 'Price per Unit', 'Unit Price');
            const netRevenueRaw = getColumnValue(excelRow, 'Винагорода нетто Ліцензіара', 'Net remuneration of Licensor', 'Net Revenue', 'Revenue');
            
            // Replace comma with dot for European number format
            const pricePerUnit = parseFloat(String(pricePerUnitRaw).replace(',', '.')) || 0;
            const netRevenue = parseFloat(String(netRevenueRaw).replace(',', '.')) || 0;
            
            // Only update if values changed
            if (parseFloat(dbRow.pricePerUnit) !== pricePerUnit || parseFloat(dbRow.netRevenue) !== netRevenue) {
              await storage.updateStreamingReportRow(dbRow.id, {
                pricePerUnit: pricePerUnit.toString(),
                netRevenue: netRevenue.toString()
              });
              updatedCount++;
            }
          }
          
          // Recalculate total revenue
          const allRows = await storage.getStreamingReportRows(report.id);
          const totalRevenue = allRows.reduce((sum, row) => sum + (parseFloat(row.netRevenue) || 0), 0);
          
          await storage.updateStreamingReport(report.id, {
            totalRevenue: totalRevenue.toFixed(2)
          });

          console.log(`✅ Fixed report ${report.id}: ${updatedCount} rows, revenue: ${totalRevenue.toFixed(2)}`);
          
          if (updatedCount > 0) {
            totalReportsFixed++;
          }
          totalFixed += updatedCount;
          
          results.push({
            reportId: report.id,
            period: report.period,
            rowsFixed: updatedCount,
            totalRevenue: totalRevenue.toFixed(2)
          });
        } catch (error: any) {
          console.error(`❌ Error fixing report ${report.id}:`, error.message);
          results.push({
            reportId: report.id,
            period: report.period,
            error: error.message
          });
        }
      }
      
      console.log(`🎉 Finished! Fixed ${totalFixed} rows across ${totalReportsFixed} reports`);
      
      res.json({ 
        success: true, 
        message: `Fixed ${totalFixed} rows across ${totalReportsFixed} reports`,
        totalRowsFixed: totalFixed,
        totalReportsFixed: totalReportsFixed,
        results
      });
    } catch (error) {
      console.error("Error fixing all streaming reports:", error);
      res.status(500).json({ message: "Failed to fix streaming reports" });
    }
  });

  // Delete streaming report (admin only)
  app.delete('/api/admin/streaming-reports/:id', isAuthenticated, async (req: any, res) => {
    try {
      const user = req.user as User;
      if (!isPlatformOwner(user)) {
        return res.status(403).json({ error: "Owner access required" });
      }

      const { id } = req.params;
      
      // Delete all rows first (foreign key constraint)
      await storage.deleteStreamingReportRows(id);
      
      // Delete the report
      await storage.deleteStreamingReport(id);

      res.json({ success: true, message: "Report deleted successfully" });
    } catch (error) {
      console.error("Error deleting streaming report:", error);
      res.status(500).json({ message: "Failed to delete streaming report" });
    }
  });

  // Replace streaming report (admin only)
  app.put('/api/admin/streaming-reports/:id', isAuthenticated, async (req: any, res) => {
    try {
      const user = req.user as User;
      if (!isPlatformOwner(user)) {
        return res.status(403).json({ error: "Owner access required" });
      }

      const { id } = req.params;
      const multer = (await import('multer')).default;
      const upload = multer({ storage: multer.memoryStorage() });
      
      upload.single('file')(req, res, async (err) => {
        if (err) {
          console.error("Multer error:", err);
          return res.status(400).json({ message: "File upload error" });
        }
        
        if (!req.file) {
          return res.status(400).json({ message: "No file provided" });
        }

        const { period, taxDeductionType } = req.body;
        
        try {
          // Get existing report to get orgId
          const existingReport = await storage.getStreamingReport(id);
          if (!existingReport) {
            return res.status(404).json({ message: "Report not found" });
          }

          // Validate taxDeductionType if provided
          const validTaxTypes = ['fop_7', 'agent_23', 'both'];
          const taxType = taxDeductionType && validTaxTypes.includes(taxDeductionType) 
            ? taxDeductionType 
            : null;

          console.log('🔄 Replacing streaming report:', {
            id,
            filename: req.file.originalname,
            period: period || existingReport.period,
            taxDeductionType: taxType
          });

          // Use centralized import service in replace mode
          const result = await parseAndImportStreamingReport(storage, {
            orgId: existingReport.orgId,
            uploadedBy: user.id,
            fileBuffer: req.file.buffer,
            fileName: req.file.originalname,
            period: period || existingReport.period,
            source: 'MANUAL_UPLOAD',
            taxDeductionType: taxType,
            existingReportId: id  // Replace mode
          });

          if (!result.success) {
            return res.status(400).json({ 
              message: result.error || "Failed to replace report",
              details: result.errorDetails
            });
          }

          // Notify organization members about updated report
          const orgMembers = await storage.getOrgMembers(existingReport.orgId);
          const organization = await storage.getOrganization(existingReport.orgId);
          const notificationTitle = "Звіт про стрімінг оновлено";
          const notificationMessage = `${organization?.name || "Організація"} - оновлено звіт за період ${period || existingReport.period}`;
          
          for (const member of orgMembers) {
            if (member.userId !== user.id) {
              await storage.createNotification({
                userId: member.userId,
                releaseId: null,
                pitchingId: null,
                relatedEntityType: null,
                relatedEntityId: null,
                title: notificationTitle,
                message: notificationMessage,
                type: "STREAMING_REPORT_UPDATED",
                changedFields: null,
                isRead: false,
              });
            }
          }

          res.json({
            success: true,
            report: result.report,
            rowsCount: result.rowsCount,
          });
        } catch (parseError: any) {
          console.error("Error replacing report:", parseError);
          return res.status(400).json({ message: "Failed to replace report", error: parseError.message });
        }
      });
    } catch (error) {
      console.error("Error replacing streaming report:", error);
      res.status(500).json({ message: "Failed to replace streaming report" });
    }
  });

  // Get streaming reports for organization
  app.get('/api/streaming-reports', isAuthenticated, async (req: any, res) => {
    try {
      const userId = getUserId(req.user as AuthenticatedUser);
      const currentUser = await storage.getUser(userId);
      const userOrgs = await getAccessibleOrganizations(currentUser, userId, storage);
      
      const requestedOrgId = req.query.orgId as string | undefined;
      let orgId: string;

      if (requestedOrgId) {
        if (!isPlatformOwner(currentUser)) {
          console.log("❌ Security violation: Non-admin user tried to access another organization's reports");
          return res.status(403).json({ 
            error: "Access denied. You can only view reports for your own organization." 
          });
        }
        console.log("✅ Admin requesting reports for organization:", requestedOrgId);
        orgId = requestedOrgId;
      } else {
        if (userOrgs.length === 0) {
          return res.json([]);
        }
        orgId = userOrgs[0].id;
      }

      const reports = await storage.getStreamingReports(orgId);
      
      res.json(reports.map(r => ({ ...r, rows: [] })));
    } catch (error) {
      console.error("Error getting streaming reports:", error);
      res.status(500).json({ message: "Failed to get streaming reports" });
    }
  });

  app.get('/api/streaming-reports/rows-by-period', isAuthenticated, async (req: any, res) => {
    try {
      const userId = getUserId(req.user as AuthenticatedUser);
      const currentUser = await storage.getUser(userId);
      const userOrgs = await getAccessibleOrganizations(currentUser, userId, storage);
      
      const requestedOrgId = req.query.orgId as string | undefined;
      const periodsParam = req.query.periods as string | undefined;
      
      let orgId: string;
      if (requestedOrgId) {
        if (!isPlatformOwner(currentUser)) {
          return res.status(403).json({ error: "Access denied" });
        }
        orgId = requestedOrgId;
      } else {
        if (userOrgs.length === 0) return res.json([]);
        orgId = userOrgs[0].id;
      }

      if (!periodsParam) {
        return res.status(400).json({ error: "periods query param required (comma-separated)" });
      }

      const periods = periodsParam.split(',').map(p => normalizePeriod(p.trim()));
      
      const reports = await storage.getStreamingReports(orgId);
      
      const allRows: any[] = [];
      for (const report of reports) {
        const rows = await storage.getStreamingReportRows(report.id);
        const matchingRows = rows.filter(row => {
          const normalizedRowPeriod = normalizePeriod(row.period);
          return periods.includes(normalizedRowPeriod);
        });
        allRows.push(...matchingRows);
      }
      
      res.json(allRows);
    } catch (error) {
      console.error("Error getting rows by period:", error);
      res.status(500).json({ message: "Failed to get rows by period" });
    }
  });

  app.get('/api/streaming-reports/:id/rows', isAuthenticated, async (req: any, res) => {
    try {
      const userId = getUserId(req.user as AuthenticatedUser);
      const currentUser = await storage.getUser(userId);
      const userOrgs = await getAccessibleOrganizations(currentUser, userId, storage);
      
      const { id } = req.params;
      const report = await storage.getStreamingReport(id);
      if (!report) {
        return res.status(404).json({ message: "Report not found" });
      }

      if (!isPlatformOwner(currentUser)) {
        const hasAccess = userOrgs.some(org => org.id === report.orgId);
        if (!hasAccess) {
          return res.status(403).json({ error: "Access denied" });
        }
      }

      const rows = await storage.getStreamingReportRows(id);
      res.json(rows);
    } catch (error) {
      console.error("Error getting streaming report rows:", error);
      res.status(500).json({ message: "Failed to get streaming report rows" });
    }
  });

  // Year Wrapped 2025 - aggregated stats for generating yearly summary image
  app.get('/api/reports/year-wrapped', isAuthenticated, async (req: any, res) => {
    try {
      const userId = getUserId(req.user as AuthenticatedUser);
      const currentUser = await storage.getUser(userId);
      const userOrgs = await getAccessibleOrganizations(currentUser, userId, storage);
      
      if (userOrgs.length === 0) {
        return res.status(404).json({ error: "No organization found" });
      }
      
      // Support orgId query param for users with multiple organizations
      const requestedOrgId = req.query.orgId as string | undefined;
      let orgId: string;
      let org: any;
      
      if (requestedOrgId) {
        // Verify user has access to this organization
        const hasAccess = userOrgs.some(o => o.id === requestedOrgId);
        if (!hasAccess) {
          return res.status(403).json({ error: "Access denied to this organization" });
        }
        orgId = requestedOrgId;
        org = userOrgs.find(o => o.id === requestedOrgId);
      } else {
        orgId = userOrgs[0].id;
        org = userOrgs[0];
      }
      
      // Get all 2025 reports for this organization (READ-ONLY)
      const reports = await storage.getStreamingReports(orgId);
      const reports2025 = reports.filter(r => r.period && r.period.includes('2025'));
      
      if (reports2025.length === 0) {
        return res.json({
          hasData: false,
          message: "Немає даних за 2025 рік"
        });
      }
      
      // Collect all rows from 2025 reports
      let allRows: any[] = [];
      for (const report of reports2025) {
        const rows = await storage.getStreamingReportRows(report.id);
        allRows = allRows.concat(rows);
      }
      
      // Calculate aggregated stats
      const totalStreams = allRows.reduce((sum, row) => sum + (row.streams || 0), 0);
      
      // Premium streams (service contains 'Premium')
      const premiumStreams = allRows
        .filter(row => row.service && row.service.toLowerCase().includes('premium'))
        .reduce((sum, row) => sum + (row.streams || 0), 0);
      
      // Top platform by streams
      const platformStats: Record<string, number> = {};
      allRows.forEach(row => {
        const partner = row.partner || 'Unknown';
        platformStats[partner] = (platformStats[partner] || 0) + (row.streams || 0);
      });
      const topPlatform = Object.entries(platformStats)
        .sort((a, b) => b[1] - a[1])[0];
      
      // Top track by streams
      const trackStats: Record<string, { streams: number; artist: string; trackName: string }> = {};
      allRows.forEach(row => {
        const key = `${row.trackName}||${row.artist}`;
        if (!trackStats[key]) {
          trackStats[key] = { streams: 0, artist: row.artist, trackName: row.trackName };
        }
        trackStats[key].streams += (row.streams || 0);
      });
      const topTrack = Object.values(trackStats)
        .sort((a, b) => b.streams - a.streams)[0];
      
      // TikTok top track
      const tiktokRows = allRows.filter(row => 
        row.partner && row.partner.toLowerCase().includes('tiktok')
      );
      const tiktokTrackStats: Record<string, { streams: number; artist: string; trackName: string }> = {};
      tiktokRows.forEach(row => {
        const key = `${row.trackName}||${row.artist}`;
        if (!tiktokTrackStats[key]) {
          tiktokTrackStats[key] = { streams: 0, artist: row.artist, trackName: row.trackName };
        }
        tiktokTrackStats[key].streams += (row.streams || 0);
      });
      const tiktokTopTrack = Object.values(tiktokTrackStats)
        .sort((a, b) => b.streams - a.streams)[0];
      
      // Top country by streams
      const countryStats: Record<string, number> = {};
      allRows.forEach(row => {
        const country = row.country || 'Unknown';
        countryStats[country] = (countryStats[country] || 0) + (row.streams || 0);
      });
      const topCountry = Object.entries(countryStats)
        .sort((a, b) => b[1] - a[1])[0];
      
      // Peak month by streams
      const monthStats: Record<string, number> = {};
      allRows.forEach(row => {
        const period = row.period || 'Unknown';
        monthStats[period] = (monthStats[period] || 0) + (row.streams || 0);
      });
      const peakMonth = Object.entries(monthStats)
        .sort((a, b) => b[1] - a[1])[0];
      
      // Get artist name from organization
      const artistName = org.name || 'Артист';
      
      // Count releases for 2025 (using orgId for accuracy)
      // Use COALESCE logic: originalReleaseDate > releaseDate > createdAt
      const orgReleases = await storage.getReleases(orgId);
      const releases2025Count = orgReleases.filter(r => {
        const originalDate = r.originalReleaseDate ? new Date(r.originalReleaseDate) : null;
        const releaseDate = r.releaseDate ? new Date(r.releaseDate) : null;
        const createdAt = r.createdAt ? new Date(r.createdAt) : null;
        const year = originalDate?.getFullYear() || releaseDate?.getFullYear() || createdAt?.getFullYear();
        return year === 2025;
      }).length;
      
      // Try to get avatar or latest release artwork and convert to base64
      let avatarBase64 = null;
      let topTrackArtworkBase64 = null;
      
      // Helper function to fetch image and convert to base64
      const fetchImageAsBase64 = async (url: string): Promise<string | null> => {
        try {
          const response = await fetch(url);
          if (!response.ok) return null;
          const buffer = await response.arrayBuffer();
          const base64 = Buffer.from(buffer).toString('base64');
          const contentType = response.headers.get('content-type') || 'image/jpeg';
          return `data:${contentType};base64,${base64}`;
        } catch (error) {
          console.error('Error fetching image:', error);
          return null;
        }
      };
      
      // Get latest release artwork as fallback for avatar and for top track
      const releases = await storage.getUserReleases(userId, { page: 1, limit: 10 });
      if (releases.releases && releases.releases.length > 0) {
        const latestRelease = releases.releases[0];
        if (latestRelease.artworkUrl) {
          avatarBase64 = await fetchImageAsBase64(latestRelease.artworkUrl);
        }
        
        // Find release that matches top track if possible
        if (topTrack) {
          const matchingRelease = releases.releases.find(r => 
            r.title && r.title.toLowerCase().includes(topTrack.trackName?.toLowerCase() || '')
          );
          const artworkUrl = matchingRelease?.artworkUrl || latestRelease.artworkUrl;
          if (artworkUrl) {
            topTrackArtworkBase64 = await fetchImageAsBase64(artworkUrl);
          }
        }
      }
      
      const countryCount = Object.keys(countryStats).filter(c => c !== 'Unknown').length;
      
      res.json({
        hasData: true,
        artistName,
        avatarUrl: avatarBase64,
        totalStreams,
        premiumStreams,
        releaseCount: releases2025Count,
        countryCount,
        topPlatform: topPlatform ? { name: topPlatform[0], streams: topPlatform[1] } : null,
        topTrack: topTrack ? { ...topTrack, artworkUrl: topTrackArtworkBase64 } : null,
        tiktokTopTrack: tiktokTopTrack || null,
        topCountry: topCountry ? { name: topCountry[0], streams: topCountry[1] } : null,
        peakMonth: peakMonth ? { period: peakMonth[0], streams: peakMonth[1] } : null,
      });
    } catch (error) {
      console.error("Error getting year wrapped data:", error);
      res.status(500).json({ message: "Failed to get year wrapped data" });
    }
  });

  // Get streaming report details with rows
  app.get('/api/streaming-reports/:id', isAuthenticated, async (req: any, res) => {
    try {
      const { id } = req.params;
      const userId = getUserId(req.user as AuthenticatedUser);
      const currentUser = await storage.getUser(userId);
      const userOrgs = await getAccessibleOrganizations(currentUser, userId, storage);

      const report = await storage.getStreamingReport(id);
      if (!report) {
        return res.status(404).json({ error: "Report not found" });
      }

      // Admin can access all reports, regular users only their organization's reports (frozen status respected)
      if (!isPlatformOwner(currentUser)) {
        if (userOrgs.length === 0) {
          return res.status(403).json({ error: "No organization found" });
        }
        if (report.orgId !== userOrgs[0].id) {
          return res.status(404).json({ error: "Report not found" });
        }
      }

      const rows = await storage.getStreamingReportRows(id);
      res.json({ ...report, rows });
    } catch (error) {
      console.error("Error getting streaming report details:", error);
      res.status(500).json({ message: "Failed to get streaming report details" });
    }
  });

  // ========== GOOGLE DRIVE AUTO-IMPORT ==========
  
  // Get all organization Drive folder mappings (admin only)
  app.get('/api/admin/streaming-reports/drive-folders', isAuthenticated, async (req: any, res) => {
    try {
      const userId = getUserId(req.user as AuthenticatedUser);
      const currentUser = await storage.getUser(userId);
      
      if (!isPlatformOwner(currentUser)) {
        return res.status(403).json({ error: "Owner access required" });
      }

      const folders = await storage.getAllOrganizationDriveFolders();
      res.json(folders);
    } catch (error) {
      console.error("Error getting Drive folder mappings:", error);
      res.status(500).json({ message: "Failed to get Drive folder mappings" });
    }
  });

  // Get specific organization Drive folder (admin only)
  app.get('/api/admin/streaming-reports/org/:orgId/drive-folder', isAuthenticated, async (req: any, res) => {
    try {
      const userId = getUserId(req.user as AuthenticatedUser);
      const currentUser = await storage.getUser(userId);
      
      if (!isPlatformOwner(currentUser)) {
        return res.status(403).json({ error: "Owner access required" });
      }

      const { orgId } = req.params;
      const folder = await storage.getOrganizationDriveFolder(orgId);
      
      if (!folder) {
        return res.json(null);
      }

      res.json(folder);
    } catch (error) {
      console.error("Error getting organization Drive folder:", error);
      res.status(500).json({ message: "Failed to get Drive folder" });
    }
  });

  // Validate Drive folder access and preview files (admin only)
  app.post('/api/admin/streaming-reports/validate-drive-folder', isAuthenticated, async (req: any, res) => {
    try {
      const userId = getUserId(req.user as AuthenticatedUser);
      const currentUser = await storage.getUser(userId);
      
      if (!isPlatformOwner(currentUser)) {
        return res.status(403).json({ error: "Owner access required" });
      }

      const { driveFolderInput, orgId } = req.body;

      if (!driveFolderInput) {
        return res.status(400).json({ error: "Drive folder URL or ID is required" });
      }

      // Parse folder ID from URL or use ID directly
      const { extractDriveFolderId, extractPeriodFromFilename } = await import('./driveUtils.js');
      const folderId = extractDriveFolderId(driveFolderInput);

      if (!folderId) {
        return res.status(400).json({ 
          error: "Invalid Drive folder URL or ID",
          details: "Please provide a valid Google Drive folder URL or ID" 
        });
      }

      try {
        // Test access by listing files
        const files = await googleDriveStorage.listXlsFilesInFolder(folderId);

        if (files.length === 0) {
          return res.status(400).json({
            error: "Folder is empty",
            details: "The Drive folder must contain at least one XLS/XLSX file with format: [Artist Name] MM-YYYY.xlsx"
          });
        }

        // Parse periods from filenames and check which exist
        const filesWithPeriods = await Promise.all(files.map(async (file) => {
          const period = extractPeriodFromFilename(file.name);
          let periodExists = false;
          
          if (period && orgId) {
            periodExists = await storage.checkStreamingReportExistsByPeriod(orgId, period);
          }

          return {
            name: file.name,
            id: file.id,
            period: period || 'Unknown format',
            periodExists,
            createdTime: file.createdTime
          };
        }));

        // Count stats
        const validPeriods = filesWithPeriods.filter(f => f.period !== 'Unknown format');
        const newReports = filesWithPeriods.filter(f => f.period !== 'Unknown format' && !f.periodExists);

        res.json({
          success: true,
          folderId,
          totalFiles: files.length,
          validPeriods: validPeriods.length,
          newReports: newReports.length,
          files: filesWithPeriods
        });

      } catch (driveError: any) {
        console.error("Drive access error:", driveError);
        
        if (driveError.message?.includes('File not found')) {
          return res.status(404).json({
            error: "Folder not accessible",
            details: `Cannot access Drive folder. Please share it with: ${process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || 'service account'}`,
            folderId
          });
        }

        return res.status(500).json({
          error: "Failed to access Drive folder",
          details: driveError.message
        });
      }

    } catch (error: any) {
      console.error("Error validating Drive folder:", error);
      res.status(500).json({ message: "Failed to validate Drive folder", error: error.message });
    }
  });

  // Find unlinked organizations that have matching Drive folders (admin only)
  app.get('/api/admin/streaming-reports/unlinked-drive-orgs', isAuthenticated, async (req: any, res) => {
    try {
      const userId = getUserId(req.user as AuthenticatedUser);
      const currentUser = await storage.getUser(userId);

      if (!isPlatformOwner(currentUser)) {
        return res.status(403).json({ error: "Owner access required" });
      }

      const REPORTS_ROOT_FOLDER_ID = '1lDIYBM5X1hrxnb35xJUNWHb5fLwu7TSa';

      const [driveSubfolders, allOrgs, linkedFolders] = await Promise.all([
        googleDriveStorage.listSubfoldersInFolder(REPORTS_ROOT_FOLDER_ID),
        storage.getAllOrganizations(),
        storage.getAllOrganizationDriveFolders(),
      ]);

      const linkedOrgIds = new Set(linkedFolders.map(f => f.orgId));

      const unlinkedOrgs: Array<{
        orgId: string;
        orgName: string;
        orgType: string;
        driveFolderId: string;
        driveFolderName: string;
      }> = [];

      const driveNameMap = new Map<string, { id: string; name: string }>();
      for (const folder of driveSubfolders) {
        driveNameMap.set(folder.name.trim().toLowerCase(), folder);
      }

      for (const org of allOrgs) {
        if (linkedOrgIds.has(org.id)) continue;

        const matchKey = org.name.trim().toLowerCase();
        const matchedFolder = driveNameMap.get(matchKey);

        if (matchedFolder) {
          unlinkedOrgs.push({
            orgId: org.id,
            orgName: org.name,
            orgType: org.type || 'unknown',
            driveFolderId: matchedFolder.id,
            driveFolderName: matchedFolder.name,
          });
        }
      }

      res.json({
        totalDriveFolders: driveSubfolders.length,
        totalOrganizations: allOrgs.length,
        totalLinked: linkedFolders.length,
        unlinkedMatches: unlinkedOrgs,
      });
    } catch (error: any) {
      console.error("Error finding unlinked drive orgs:", error);
      res.status(500).json({ message: "Failed to find unlinked organizations", error: error.message });
    }
  });

  // Set organization Drive folder (admin only)
  app.post('/api/admin/streaming-reports/org/:orgId/drive-folder', isAuthenticated, async (req: any, res) => {
    try {
      const userId = getUserId(req.user as AuthenticatedUser);
      const currentUser = await storage.getUser(userId);
      
      if (!isPlatformOwner(currentUser)) {
        return res.status(403).json({ error: "Owner access required" });
      }

      const { orgId } = req.params;
      const { driveFolderId: driveFolderInput, driveFolderName, taxDeductionType } = req.body;

      if (!driveFolderInput || !driveFolderName) {
        return res.status(400).json({ error: "Drive folder URL/ID and name are required" });
      }

      // Parse folder ID from URL or use ID directly
      const { extractDriveFolderId } = await import('./driveUtils.js');
      const driveFolderId = extractDriveFolderId(driveFolderInput);

      if (!driveFolderId) {
        return res.status(400).json({ 
          error: "Invalid Drive folder URL or ID",
          details: "Please provide a valid Google Drive folder URL or ID" 
        });
      }

      // Validate taxDeductionType if provided
      const validTaxTypes: ('fop_7' | 'agent_23' | 'both' | null)[] = ['fop_7', 'agent_23', 'both', null];
      const taxType = taxDeductionType && validTaxTypes.includes(taxDeductionType) 
        ? taxDeductionType 
        : null;

      const folder = await storage.setOrganizationDriveFolder({
        orgId,
        driveFolderId,
        driveFolderName,
        linkedBy: userId,
        taxDeductionType: taxType,
      });

      res.json(folder);
    } catch (error) {
      console.error("Error setting organization Drive folder:", error);
      res.status(500).json({ message: "Failed to set Drive folder" });
    }
  });

  // Remove organization Drive folder (admin only)
  app.delete('/api/admin/streaming-reports/org/:orgId/drive-folder', isAuthenticated, async (req: any, res) => {
    try {
      const userId = getUserId(req.user as AuthenticatedUser);
      const currentUser = await storage.getUser(userId);
      
      if (!isPlatformOwner(currentUser)) {
        return res.status(403).json({ error: "Owner access required" });
      }

      const { orgId } = req.params;
      await storage.removeOrganizationDriveFolder(orgId);

      res.json({ success: true, message: "Drive folder removed successfully" });
    } catch (error) {
      console.error("Error removing organization Drive folder:", error);
      res.status(500).json({ message: "Failed to remove Drive folder" });
    }
  });

  // Get streaming report import logs (admin only)
  app.get('/api/admin/streaming-reports/import-logs', isAuthenticated, async (req: any, res) => {
    try {
      const userId = getUserId(req.user as AuthenticatedUser);
      const currentUser = await storage.getUser(userId);
      
      if (!isPlatformOwner(currentUser)) {
        return res.status(403).json({ error: "Owner access required" });
      }

      const orgId = req.query.orgId as string | undefined;
      const logs = await storage.getStreamingReportImportLogs(orgId);

      res.json(logs);
    } catch (error) {
      console.error("Error getting import logs:", error);
      res.status(500).json({ message: "Failed to get import logs" });
    }
  });

  // ==================== Import Checkpoints API ====================

  // Get all import checkpoints (admin only)
  app.get('/api/admin/import-checkpoints', isAuthenticated, async (req: any, res) => {
    try {
      const userId = getUserId(req.user as AuthenticatedUser);
      const currentUser = await storage.getUser(userId);
      
      if (!isPlatformOwner(currentUser)) {
        return res.status(403).json({ error: "Owner access required" });
      }

      const checkpoints = await storage.getImportCheckpoints();
      res.json(checkpoints);
    } catch (error) {
      console.error("Error getting import checkpoints:", error);
      res.status(500).json({ message: "Failed to get import checkpoints" });
    }
  });

  // Create import checkpoint manually (admin only)
  app.post('/api/admin/import-checkpoints', isAuthenticated, async (req: any, res) => {
    try {
      const userId = getUserId(req.user as AuthenticatedUser);
      const currentUser = await storage.getUser(userId);
      
      if (!isPlatformOwner(currentUser)) {
        return res.status(403).json({ error: "Owner access required" });
      }

      const { description } = req.body;
      const checkpoint = await storage.createImportCheckpoint({
        createdBy: userId,
        description: description || 'Manual checkpoint',
      });

      res.json({ success: true, checkpoint });
    } catch (error) {
      console.error("Error creating import checkpoint:", error);
      res.status(500).json({ message: "Failed to create import checkpoint" });
    }
  });

  // Check rollback safety (admin only)
  app.get('/api/admin/import-checkpoints/:id/safety-check', isAuthenticated, async (req: any, res) => {
    try {
      const userId = getUserId(req.user as AuthenticatedUser);
      const currentUser = await storage.getUser(userId);
      
      if (!isPlatformOwner(currentUser)) {
        return res.status(403).json({ error: "Owner access required" });
      }

      const { id } = req.params;
      const checkpoint = await storage.getImportCheckpointById(id);
      
      if (!checkpoint) {
        return res.status(404).json({ error: "Checkpoint not found" });
      }

      if (checkpoint.status === 'ROLLED_BACK') {
        return res.json({ safe: false, reason: "This checkpoint has already been rolled back", affectedReports: 0 });
      }

      const safetyCheck = await storage.checkRollbackSafety(id);
      res.json(safetyCheck);
    } catch (error) {
      console.error("Error checking rollback safety:", error);
      res.status(500).json({ message: "Failed to check rollback safety" });
    }
  });

  // Execute rollback to checkpoint (admin only)
  app.post('/api/admin/import-checkpoints/:id/rollback', isAuthenticated, async (req: any, res) => {
    try {
      const userId = getUserId(req.user as AuthenticatedUser);
      const currentUser = await storage.getUser(userId);
      
      if (!isPlatformOwner(currentUser)) {
        return res.status(403).json({ error: "Owner access required" });
      }

      const { id } = req.params;
      const checkpoint = await storage.getImportCheckpointById(id);
      
      if (!checkpoint) {
        return res.status(404).json({ error: "Checkpoint not found" });
      }

      if (checkpoint.status === 'ROLLED_BACK') {
        return res.status(400).json({ error: "This checkpoint has already been rolled back" });
      }

      // Execute rollback
      const result = await storage.executeRollback(id, userId);
      
      if (!result.success) {
        return res.status(400).json({ error: result.error });
      }

      console.log(`✅ Rollback completed: ${result.deletedReports} reports deleted by user ${userId}`);
      
      res.json({ 
        success: true, 
        message: `Successfully rolled back. Deleted ${result.deletedReports} reports.`,
        deletedReports: result.deletedReports
      });
    } catch (error) {
      console.error("Error executing rollback:", error);
      res.status(500).json({ message: "Failed to execute rollback" });
    }
  });

  // Manually trigger import job (admin only, for testing) - NOW WITH CHECKPOINT
  app.post('/api/admin/streaming-reports/manual-import', isAuthenticated, async (req: any, res) => {
    try {
      const userId = getUserId(req.user as AuthenticatedUser);
      const currentUser = await storage.getUser(userId);
      
      if (!isPlatformOwner(currentUser)) {
        return res.status(403).json({ error: "Owner access required" });
      }

      // Create checkpoint before import
      const checkpoint = await storage.createImportCheckpoint({
        createdBy: userId,
        description: 'Before manual import',
      });
      console.log(`📌 Created checkpoint ${checkpoint.id} before manual import`);

      const { runStreamingReportImportJob } = await import('./streamingReportImportJob.js');
      
      // Run import job asynchronously
      runStreamingReportImportJob()
        .then(() => console.log('✅ Manual import job completed'))
        .catch((error) => console.error('❌ Manual import job failed:', error));

      res.json({ 
        success: true, 
        message: "Import job started. Check logs for progress.",
        checkpointId: checkpoint.id
      });
    } catch (error) {
      console.error("Error starting manual import:", error);
      res.status(500).json({ message: "Failed to start import job" });
    }
  });

  // Manually trigger import job for a specific organization (admin only)
  app.post('/api/admin/streaming-reports/manual-import/:orgId', isAuthenticated, async (req: any, res) => {
    try {
      const userId = getUserId(req.user as AuthenticatedUser);
      const currentUser = await storage.getUser(userId);
      const { orgId } = req.params;
      
      if (!isPlatformOwner(currentUser)) {
        return res.status(403).json({ error: "Owner access required" });
      }

      // Verify organization exists and has Drive folder mapping
      const folderMapping = await storage.getOrganizationDriveFolder(orgId);
      if (!folderMapping) {
        return res.status(404).json({ error: "Organization has no Drive folder mapped" });
      }

      const { runStreamingReportImportJob } = await import('./streamingReportImportJob.js');
      
      // Run import job for specific organization asynchronously
      runStreamingReportImportJob(orgId)
        .then(() => console.log(`✅ Manual import job for org ${orgId} completed`))
        .catch((error) => console.error(`❌ Manual import job for org ${orgId} failed:`, error));

      res.json({ 
        success: true, 
        message: `Import job started for organization. Check logs for progress.`,
        orgId
      });
    } catch (error) {
      console.error("Error starting manual import for org:", error);
      res.status(500).json({ message: "Failed to start import job" });
    }
  });

  // Get social media follower snapshots
  app.get('/api/social-followers', isAuthenticated, async (req: any, res) => {
    try {
      const userId = getUserId(req.user as AuthenticatedUser);
      const currentUser = await storage.getUser(userId);
      const userOrgs = await getAccessibleOrganizations(currentUser, userId, storage);
      
      const requestedOrgId = req.query.orgId as string | undefined;
      const platform = req.query.platform as string | undefined;
      const period = req.query.period as string | undefined;
      
      let orgId: string;
      
      if (requestedOrgId) {
        if (!isPlatformOwner(currentUser)) {
          return res.status(403).json({ 
            error: "Access denied. You can only view data for your own organization." 
          });
        }
        orgId = requestedOrgId;
      } else {
        if (userOrgs.length === 0) {
          return res.json([]);
        }
        orgId = userOrgs[0].id;
      }
      
      let daysAgo: number | undefined;
      if (period === '7d') daysAgo = 7;
      else if (period === '30d') daysAgo = 30;
      else if (period === '90d') daysAgo = 90;
      else if (period === '365d') daysAgo = 365;
      
      const snapshots = await storage.getSocialFollowerSnapshots(orgId, platform, daysAgo);
      
      const groupedByPlatform: Record<string, any> = {};
      
      for (const snapshot of snapshots) {
        if (!groupedByPlatform[snapshot.platform]) {
          groupedByPlatform[snapshot.platform] = {
            platform: snapshot.platform,
            current: snapshot.followerCount,
            history: []
          };
        }
        
        groupedByPlatform[snapshot.platform].history.push({
          date: snapshot.collectedAt,
          count: snapshot.followerCount
        });
      }
      
      const result = Object.values(groupedByPlatform).map((platformData: any) => {
        const history = platformData.history.sort((a: any, b: any) => 
          new Date(a.date).getTime() - new Date(b.date).getTime()
        );
        
        const current = history[history.length - 1]?.count || 0;
        const oneWeekAgo = history.length >= 2 ? history[history.length - 2]?.count : current;
        const change7d = current - oneWeekAgo;
        const changePercent7d = oneWeekAgo > 0 ? ((change7d / oneWeekAgo) * 100) : 0;
        
        return {
          platform: platformData.platform,
          current,
          change7d,
          changePercent7d: Math.round(changePercent7d * 10) / 10,
          history
        };
      });
      
      res.json(result);
    } catch (error) {
      console.error("Error getting social follower data:", error);
      res.status(500).json({ message: "Failed to get social follower data" });
    }
  });

  // Debug endpoint to check Spotify connector status
  app.get('/api/debug/spotify-connector', isAuthenticated, isPlatformAdmin, async (req: any, res) => {
    try {
      const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
      const xReplitToken = process.env.REPL_IDENTITY 
        ? 'repl ' + process.env.REPL_IDENTITY 
        : process.env.WEB_REPL_RENEWAL 
        ? 'depl ' + process.env.WEB_REPL_RENEWAL 
        : null;

      if (!xReplitToken) {
        return res.json({
          status: 'error',
          message: 'X_REPLIT_TOKEN not found',
          hasReplIdentity: !!process.env.REPL_IDENTITY,
          hasWebReplRenewal: !!process.env.WEB_REPL_RENEWAL
        });
      }

      const response = await fetch(
        'https://' + hostname + '/api/v2/connection?include_secrets=true&connector_names=spotify',
        {
          headers: {
            'Accept': 'application/json',
            'X_REPLIT_TOKEN': xReplitToken
          }
        }
      );

      const data = await response.json();
      
      res.json({
        status: 'success',
        hostname,
        responseStatus: response.status,
        data,
        hasItems: !!data.items,
        itemsCount: data.items?.length || 0,
        firstItem: data.items?.[0] ? {
          hasSettings: !!data.items[0].settings,
          hasOAuth: !!data.items[0].settings?.oauth,
          hasCredentials: !!data.items[0].settings?.oauth?.credentials
        } : null
      });
    } catch (error: any) {
      res.status(500).json({
        status: 'error',
        message: error.message,
        stack: error.stack
      });
    }
  });

  // Check if refresh is available (once per day limit)
  app.get('/api/social-followers/refresh-status', isAuthenticated, async (req: any, res) => {
    try {
      const userId = getUserId(req.user as AuthenticatedUser);
      const currentUser = await storage.getUser(userId);
      const userOrgs = await getAccessibleOrganizations(currentUser, userId, storage);
      
      if (userOrgs.length === 0) {
        return res.status(404).json({ error: "No organization found" });
      }
      
      const orgId = userOrgs[0].id;
      
      // Get the start of today (00:00:00) in user's timezone (we use UTC for consistency)
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      
      // Check if there's any snapshot collected today for this organization
      const todaySnapshots = await db
        .select()
        .from(socialFollowerSnapshots)
        .where(
          and(
            eq(socialFollowerSnapshots.orgId, orgId),
            gte(socialFollowerSnapshots.collectedAt, todayStart)
          )
        )
        .limit(1);
      
      const canRefresh = todaySnapshots.length === 0;
      const lastRefresh = todaySnapshots[0]?.collectedAt || null;
      
      // Calculate next available refresh time (next 00:00)
      const nextRefreshAt = new Date(todayStart);
      nextRefreshAt.setDate(nextRefreshAt.getDate() + 1);
      
      res.json({
        canRefresh,
        lastRefresh,
        nextRefreshAt: canRefresh ? null : nextRefreshAt.toISOString(),
      });
    } catch (error) {
      console.error("Error checking refresh status:", error);
      res.status(500).json({ 
        canRefresh: true,
        lastRefresh: null,
        nextRefreshAt: null,
      });
    }
  });

  // Manually refresh social media follower data (limited to once per day)
  app.post('/api/social-followers/refresh', isAuthenticated, async (req: any, res) => {
    try {
      const userId = getUserId(req.user as AuthenticatedUser);
      const currentUser = await storage.getUser(userId);
      const userOrgs = await getAccessibleOrganizations(currentUser, userId, storage);
      
      if (userOrgs.length === 0) {
        return res.status(404).json({ error: "No organization found" });
      }
      
      const orgId = userOrgs[0].id;
      
      // Check daily limit - only allow refresh once per day (after 00:00)
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      
      const todaySnapshots = await db
        .select()
        .from(socialFollowerSnapshots)
        .where(
          and(
            eq(socialFollowerSnapshots.orgId, orgId),
            gte(socialFollowerSnapshots.collectedAt, todayStart)
          )
        )
        .limit(1);
      
      if (todaySnapshots.length > 0) {
        const nextRefreshAt = new Date(todayStart);
        nextRefreshAt.setDate(nextRefreshAt.getDate() + 1);
        
        return res.status(429).json({
          success: false,
          error: "DAILY_LIMIT_REACHED",
          message: "Refresh is limited to once per day. Next refresh available after midnight.",
          lastRefresh: todaySnapshots[0].collectedAt,
          nextRefreshAt: nextRefreshAt.toISOString(),
        });
      }
      
      const { collectSocialMediaDataForOrg } = await import('./scheduledTasks');
      const result = await collectSocialMediaDataForOrg(orgId);
      
      console.log(`📊 Manual refresh completed: ${result.success} successful, ${result.errors} errors`);
      
      res.json({
        success: true,
        collected: result.success,
        errors: result.errors,
        message: `Successfully collected data for ${result.success} platform(s)`
      });
    } catch (error) {
      console.error("Error refreshing social follower data:", error);
      res.status(500).json({ 
        success: false,
        message: "Failed to refresh social follower data" 
      });
    }
  });

  // Get YouTube channel info (avatar, title, subscriber count)
  app.get('/api/youtube/channel-info', isAuthenticated, async (req: any, res) => {
    try {
      const userId = getUserId(req.user as AuthenticatedUser);
      const currentUser = await storage.getUser(userId);
      const userOrgs = await getAccessibleOrganizations(currentUser, userId, storage);
      
      if (userOrgs.length === 0) {
        return res.status(404).json({ error: "No organization found" });
      }
      
      const org = userOrgs[0];
      const youtubeUrl = org.youtubeUrl;
      
      if (!youtubeUrl) {
        return res.status(404).json({ error: "No YouTube URL configured" });
      }
      
      const { resolveYouTubeHandleToChannelId, fetchYouTubeChannelInfo } = await import('./youtubeClient');
      
      let channelId: string | null = null;
      
      // Try to extract @handle from URL
      const handleMatch = youtubeUrl.match(/@([^/]+)/);
      if (handleMatch) {
        const handle = handleMatch[0]; // includes @
        channelId = await resolveYouTubeHandleToChannelId(handle);
      }
      
      // If no handle or handle resolution failed, try to extract channel ID directly
      if (!channelId) {
        const channelIdMatch = youtubeUrl.match(/channel\/(UC[a-zA-Z0-9_-]+)/);
        if (channelIdMatch) {
          channelId = channelIdMatch[1];
        }
      }
      
      if (!channelId) {
        return res.status(400).json({ error: "Could not extract channel ID from YouTube URL" });
      }
      
      const channelInfo = await fetchYouTubeChannelInfo(channelId);
      
      if (!channelInfo) {
        return res.status(404).json({ error: "Failed to fetch YouTube channel info" });
      }
      
      res.json(channelInfo);
    } catch (error) {
      console.error("Error getting YouTube channel info:", error);
      res.status(500).json({ 
        success: false,
        message: "Failed to get YouTube channel info" 
      });
    }
  });

  // Get Spotify artist's top tracks with popularity
  app.get('/api/spotify/top-tracks', isAuthenticated, async (req: any, res) => {
    try {
      const userId = getUserId(req.user as AuthenticatedUser);
      const currentUser = await storage.getUser(userId);
      const userOrgs = await getAccessibleOrganizations(currentUser, userId, storage);
      
      if (userOrgs.length === 0) {
        return res.status(404).json({ error: "No organization found" });
      }
      
      const org = userOrgs[0];
      const spotifyUrl = org.spotifyUrl;
      
      if (!spotifyUrl) {
        return res.status(404).json({ error: "No Spotify URL configured" });
      }
      
      const { getArtistTopTracks } = await import('./spotify');
      
      // Extract artist ID from Spotify URL - support various formats
      const artistIdMatch = spotifyUrl.match(/\/artist\/([a-zA-Z0-9]+)/);
      if (!artistIdMatch) {
        return res.status(400).json({ error: "Invalid Spotify artist URL" });
      }
      
      const artistId = artistIdMatch[1];
      
      // Validate Spotify response
      const topTracks = await getArtistTopTracks(artistId);
      if (!topTracks || topTracks.length === 0) {
        return res.status(502).json({ 
          error: "Failed to fetch top tracks from Spotify",
          details: "No tracks found for this artist"
        });
      }
      
      res.json(topTracks);
    } catch (error: any) {
      console.error("Error getting Spotify top tracks:", error);
      res.status(502).json({ 
        error: "Failed to get top tracks from Spotify",
        message: error.message || "Unknown error"
      });
    }
  });

  // Get audio features for artist's top tracks
  app.get('/api/spotify/audio-features', isAuthenticated, async (req: any, res) => {
    try {
      const userId = getUserId(req.user as AuthenticatedUser);
      const currentUser = await storage.getUser(userId);
      const userOrgs = await getAccessibleOrganizations(currentUser, userId, storage);
      
      if (userOrgs.length === 0) {
        return res.status(404).json({ error: "No organization found" });
      }
      
      const org = userOrgs[0];
      const spotifyUrl = org.spotifyUrl;
      
      if (!spotifyUrl) {
        return res.status(404).json({ error: "No Spotify URL configured" });
      }
      
      const { getArtistTopTracks, getMultipleTracksAudioFeatures } = await import('./spotify');
      
      // Extract artist ID from Spotify URL - support various URL formats
      const artistIdMatch = spotifyUrl.match(/\/artist\/([a-zA-Z0-9]+)/);
      if (!artistIdMatch) {
        return res.status(400).json({ error: "Invalid Spotify artist URL" });
      }
      
      const artistId = artistIdMatch[1];
      
      // Validate Spotify responses
      const topTracks = await getArtistTopTracks(artistId);
      if (!topTracks || topTracks.length === 0) {
        return res.status(502).json({ 
          error: "Failed to fetch artist top tracks from Spotify",
          details: "No tracks found for this artist"
        });
      }
      
      // Get audio features for top 10 tracks
      const trackIds = topTracks.slice(0, 10).map(t => t.id);
      const audioFeatures = await getMultipleTracksAudioFeatures(trackIds);
      
      if (!audioFeatures || audioFeatures.length === 0) {
        return res.status(502).json({ 
          error: "Failed to fetch audio features from Spotify",
          details: "No audio features available"
        });
      }
      
      // Calculate average features
      const avgFeatures = audioFeatures.reduce((acc, curr) => ({
        danceability: acc.danceability + curr.danceability / audioFeatures.length,
        energy: acc.energy + curr.energy / audioFeatures.length,
        valence: acc.valence + curr.valence / audioFeatures.length,
        tempo: acc.tempo + curr.tempo / audioFeatures.length,
        acousticness: acc.acousticness + curr.acousticness / audioFeatures.length,
        instrumentalness: acc.instrumentalness + curr.instrumentalness / audioFeatures.length,
        speechiness: acc.speechiness + curr.speechiness / audioFeatures.length,
        liveness: acc.liveness + curr.liveness / audioFeatures.length,
        key: 0,
        mode: 0,
      }), {
        danceability: 0,
        energy: 0,
        valence: 0,
        tempo: 0,
        acousticness: 0,
        instrumentalness: 0,
        speechiness: 0,
        liveness: 0,
        key: 0,
        mode: 0,
      });
      
      res.json(avgFeatures);
    } catch (error: any) {
      console.error("Error getting Spotify audio features:", error);
      res.status(502).json({ 
        error: "Failed to get audio features from Spotify",
        message: error.message || "Unknown error"
      });
    }
  });

  // Get related artists with their metrics
  app.get('/api/spotify/related-artists', isAuthenticated, async (req: any, res) => {
    try {
      const userId = getUserId(req.user as AuthenticatedUser);
      const currentUser = await storage.getUser(userId);
      const userOrgs = await getAccessibleOrganizations(currentUser, userId, storage);
      
      if (userOrgs.length === 0) {
        return res.status(404).json({ error: "No organization found" });
      }
      
      const org = userOrgs[0];
      const spotifyUrl = org.spotifyUrl;
      
      if (!spotifyUrl) {
        return res.status(404).json({ error: "No Spotify URL configured" });
      }
      
      const { getRelatedArtists } = await import('./spotify');
      
      // Extract artist ID from Spotify URL - support various formats
      const artistIdMatch = spotifyUrl.match(/\/artist\/([a-zA-Z0-9]+)/);
      if (!artistIdMatch) {
        return res.status(400).json({ error: "Invalid Spotify artist URL" });
      }
      
      const artistId = artistIdMatch[1];
      
      // Validate Spotify response
      const relatedArtists = await getRelatedArtists(artistId);
      if (!relatedArtists || relatedArtists.length === 0) {
        return res.status(502).json({ 
          error: "Failed to fetch related artists from Spotify",
          details: "No related artists found"
        });
      }
      
      res.json(relatedArtists);
    } catch (error: any) {
      console.error("Error getting related artists:", error);
      res.status(502).json({ 
        error: "Failed to get related artists from Spotify",
        message: error.message || "Unknown error"
      });
    }
  });

  // Get similar YouTube channels
  app.get('/api/youtube/similar-channels', isAuthenticated, async (req: any, res) => {
    try {
      const userId = getUserId(req.user as AuthenticatedUser);
      const currentUser = await storage.getUser(userId);
      const userOrgs = await getAccessibleOrganizations(currentUser, userId, storage);
      
      if (userOrgs.length === 0) {
        return res.status(404).json({ error: "No organization found" });
      }
      
      const org = userOrgs[0];
      const youtubeUrl = org.youtubeUrl;
      
      if (!youtubeUrl) {
        return res.status(404).json({ error: "No YouTube URL configured" });
      }
      
      // Get organization owner's country (the artist's registered country)
      // Fallback to channel's country if owner not found
      let artistCountry: string | null = null;
      if (org.ownerId) {
        const orgOwner = await storage.getUserById(org.ownerId);
        artistCountry = orgOwner?.country || null;
      }
      
      const { getFeaturedChannels, searchSimilarChannels, resolveYouTubeHandleToChannelId } = await import('./youtubeClient');
      
      // Extract channel ID from YouTube URL
      let channelId: string | null = null;
      
      // Support various YouTube URL formats
      const channelMatch = youtubeUrl.match(/\/channel\/([a-zA-Z0-9_-]+)/);
      const handleMatch = youtubeUrl.match(/\/@([a-zA-Z0-9_-]+)/);
      
      if (channelMatch) {
        channelId = channelMatch[1];
      } else if (handleMatch) {
        channelId = await resolveYouTubeHandleToChannelId(handleMatch[1]);
      }
      
      if (!channelId) {
        return res.status(400).json({ error: "Invalid YouTube URL" });
      }
      
      // Try to get featured channels first
      let similarChannels = await getFeaturedChannels(channelId);
      
      // If no featured channels, use intelligent search with artist's country
      // Pass channel ID to allow fallback to channel's country metadata
      if (similarChannels.length === 0) {
        console.log('⚠️ No featured channels, using intelligent search');
        similarChannels = await searchSimilarChannels(channelId, artistCountry);
      }
      
      if (similarChannels.length === 0) {
        return res.status(502).json({ 
          error: "Failed to fetch similar channels",
          details: "No similar channels found"
        });
      }
      
      res.json(similarChannels);
    } catch (error: any) {
      console.error("Error getting similar YouTube channels:", error);
      res.status(502).json({ 
        error: "Failed to get similar YouTube channels",
        message: error.message || "Unknown error"
      });
    }
  });

  // Finance: Get summary (balance, total earned, total withdrawn)
  // Uses the same combined total (legacy + allocations) as allocation-summary for consistency
  app.get('/api/finance/summary', isAuthenticated, async (req: any, res) => {
    try {
      const userId = getUserId(req.user as AuthenticatedUser);
      const user = await storage.getUser(userId);
      const userOrgs = await getAccessibleOrganizations(user, userId, storage);

      if (userOrgs.length === 0) {
        return res.status(404).json({ error: "No organization found" });
      }

      const org = userOrgs[0];
      
      // Get base balance info (for totalEarned and totalWithdrawn)
      const { totalEarned, totalWithdrawn, totalEarnedUah } = await storage.getAvailableBalance(org.id);
      
      // Calculate combined available balance (legacy + allocations) - same as allocation-summary
      const { legacyAvailable } = await storage.getLegacyBalance(org.id);
      const availableAllocations = await storage.getAvailableAllocationsByOrg(org.id);
      
      // Sum allocation values in nano for precision, then convert to cents
      let totalAllocationNano = BigInt(0);
      let totalAllocationNanoUah = BigInt(0);
      for (const a of availableAllocations) {
        const nanoAmount = a.shareAmountNano 
          ? BigInt(a.shareAmountNano)
          : BigInt(Math.round(Number(a.shareAmount) * 10000000000));
        totalAllocationNano += nanoAmount;
        
        // Calculate UAH using report's exchange rate
        const eurToUahRate = a.eurToUahRate ? parseFloat(a.eurToUahRate) : 0;
        if (eurToUahRate > 0) {
          const nanoAmountUah = BigInt(Math.round(Number(nanoAmount) * eurToUahRate));
          totalAllocationNanoUah += nanoAmountUah;
        }
      }
      const allocationTotalCents = Number(totalAllocationNano / BigInt(100000000));
      const allocationTotalUah = Number(totalAllocationNanoUah / BigInt(100000000));
      
      // Combined total = legacy balance + allocations total
      const availableBalance = legacyAvailable + allocationTotalCents;
      // UAH total (legacy balance doesn't have UAH equivalent, only allocations)
      const availableBalanceUah = allocationTotalUah;
      
      res.json({
        totalEarned,
        totalEarnedUah,  // UAH equivalent calculated using per-report exchange rates
        totalWithdrawn,
        availableBalance: Math.max(0, availableBalance), // Never negative
        availableBalanceUah: Math.max(0, availableBalanceUah), // UAH equivalent
        organizationName: org.name,
      });
    } catch (error) {
      console.error("Error getting finance summary:", error);
      res.status(500).json({ message: "Failed to get finance summary" });
    }
  });

  // Finance: Get withdrawal history
  app.get('/api/finance/withdrawals', isAuthenticated, async (req: any, res) => {
    try {
      const userId = getUserId(req.user as AuthenticatedUser);
      const user = await storage.getUser(userId);
      const userOrgs = await getAccessibleOrganizations(user, userId, storage);

      if (userOrgs.length === 0) {
        return res.json([]);
      }

      const withdrawals = await storage.getWithdrawals(userOrgs[0].id);
      res.json(withdrawals);
    } catch (error) {
      console.error("Error getting withdrawals:", error);
      res.status(500).json({ message: "Failed to get withdrawals" });
    }
  });
  
  // Finance: Get royalty allocations summary
  app.get('/api/finance/allocations', isAuthenticated, async (req: any, res) => {
    try {
      const userId = getUserId(req.user as AuthenticatedUser);
      const user = await storage.getUser(userId);
      const userOrgs = await getAccessibleOrganizations(user, userId, storage);

      if (userOrgs.length === 0) {
        return res.json({ pending: [], available: [], summary: { pendingTotal: 0, availableTotal: 0 } });
      }

      const orgId = userOrgs[0].id;
      
      // Get allocations by status
      const { trackRoyaltyAllocations } = await import('@shared/schema');
      const { eq: eqFn, and: andFn } = await import('drizzle-orm');
      
      const pendingAllocations = await db
        .select()
        .from(trackRoyaltyAllocations)
        .where(andFn(
          eqFn(trackRoyaltyAllocations.orgId, orgId),
          eqFn(trackRoyaltyAllocations.status, 'PENDING')
        ));
      
      const availableAllocations = await storage.getAvailableAllocationsByOrg(orgId);
      
      // Calculate totals
      const pendingTotal = pendingAllocations.reduce((sum, a) => sum + Number(a.amount), 0);
      const availableTotal = availableAllocations.reduce((sum: number, a: any) => sum + Number(a.amount), 0);
      
      res.json({
        pending: pendingAllocations,
        available: availableAllocations,
        summary: {
          pendingTotal,
          availableTotal,
        }
      });
    } catch (error) {
      console.error("Error getting allocations:", error);
      res.status(500).json({ message: "Failed to get allocations" });
    }
  });

  // Finance: Get allocation summary grouped by participant for withdrawal
  app.get('/api/finance/allocation-summary', isAuthenticated, async (req: any, res) => {
    try {
      const userId = getUserId(req.user as AuthenticatedUser);
      const user = await storage.getUser(userId);
      const userOrgs = await getAccessibleOrganizations(user, userId, storage);

      if (userOrgs.length === 0) {
        return res.json({ participants: [], totalAvailable: 0, ownerLegacyBalance: 0, participantsTotal: 0, combinedTotal: 0 });
      }

      const orgId = userOrgs[0].id;
      const org = userOrgs[0];
      
      // Get legacy balance (revenue from rows WITHOUT allocations, older than 3 months)
      const { legacyAvailable } = await storage.getLegacyBalance(orgId);
      
      // Get owner's primary payment details to identify owner in allocations
      const ownerPaymentDetail = await storage.getPrimaryPaymentDetail(orgId);
      const ownerIban = ownerPaymentDetail?.iban || null;
      
      // Get all AVAILABLE allocations for this org
      const availableAllocations = await storage.getAvailableAllocationsByOrg(orgId);
      
      // Group by participant (using participantId when available, fallback to IBAN)
      // Also collect track details for each participant
      const participantMap = new Map<string, {
        participantId: string | null;
        participantName: string;
        participantIban: string;
        participantTaxId: string | null;
        participantBankName: string | null;
        totalAmount: number;
        allocationIds: string[];
        isOwner: boolean;
        tracks: Array<{
          trackId: string;
          trackTitle: string;
          releaseTitle: string;
          amount: number;
          allocationId: string;
        }>;
      }>();
      
      // Cache for current payment details by participantId
      const paymentDetailsCache = new Map<string, any>();
      
      // Pre-fetch participants to identify owner and build lookup map
      const orgParticipants = await storage.getParticipantsByOrg(orgId);
      const participantLookup = new Map<string, any>();
      for (const p of orgParticipants) {
        participantLookup.set(p.id, p);
      }
      
      // Work in nano-units internally for precision (EUR * 10^10)
      // Track nano totals per participant (EUR)
      const participantNanoMap = new Map<string, bigint>();
      // Track nano totals per participant (UAH) - calculated using each report's eurToUahRate
      const participantNanoUahMap = new Map<string, bigint>();
      
      // Track map for grouping by ISRC within each participant
      const participantTrackMap = new Map<string, Map<string, {
        isrc: string;
        trackId: string | null; // Original track ID from first allocation
        trackTitle: string;
        releaseTitle: string;
        amountNano: bigint;
        allocationIds: string[];
      }>>();
      
      for (const allocation of availableAllocations) {
        // Use participantId as key if available, otherwise use name+IBAN for stable legacy grouping
        const groupKey = allocation.participantId || `legacy:${allocation.participantName}:${allocation.participantIban}`;
        
        // Get current payment details if participantId exists
        let currentIban = allocation.participantIban;
        let currentBankName = allocation.participantBankName;
        
        if (allocation.participantId) {
          if (!paymentDetailsCache.has(allocation.participantId)) {
            const currentDetails = await storage.getCurrentPaymentDetails(allocation.participantId);
            paymentDetailsCache.set(allocation.participantId, currentDetails);
          }
          const cachedDetails = paymentDetailsCache.get(allocation.participantId);
          if (cachedDetails) {
            currentIban = cachedDetails.iban;
            currentBankName = cachedDetails.bankName;
          }
        }
        
        const existing = participantMap.get(groupKey);
        
        // Get allocation value in nano-units (full precision)
        const allocationNano = allocation.shareAmountNano 
          ? BigInt(allocation.shareAmountNano)
          : BigInt(Math.round(Number(allocation.shareAmount) * 10000000000));
        
        // Accumulate nano totals for later conversion (EUR)
        participantNanoMap.set(groupKey, (participantNanoMap.get(groupKey) || BigInt(0)) + allocationNano);
        
        // Calculate UAH equivalent using report's exchange rate
        const eurToUahRate = allocation.eurToUahRate ? parseFloat(allocation.eurToUahRate) : 0;
        if (eurToUahRate > 0) {
          // Multiply nano EUR by rate to get nano UAH (preserving precision)
          const allocationNanoUah = BigInt(Math.round(Number(allocationNano) * eurToUahRate));
          participantNanoUahMap.set(groupKey, (participantNanoUahMap.get(groupKey) || BigInt(0)) + allocationNanoUah);
        }
        
        // Group by ISRC within participant - aggregate amounts for same track
        const isrc = allocation.isrc || `unknown-${allocation.id}`;
        if (!participantTrackMap.has(groupKey)) {
          participantTrackMap.set(groupKey, new Map());
        }
        const trackMap = participantTrackMap.get(groupKey)!;
        const existingTrack = trackMap.get(isrc);
        if (existingTrack) {
          existingTrack.amountNano += allocationNano;
          existingTrack.allocationIds.push(allocation.id);
        } else {
          trackMap.set(isrc, {
            isrc,
            trackId: allocation.trackId || null, // Preserve original track ID
            trackTitle: allocation.trackTitle || 'Unknown Track',
            releaseTitle: allocation.releaseTitle || 'Unknown Release',
            amountNano: allocationNano,
            allocationIds: [allocation.id],
          });
        }
        
        // Check if this participant is owner - use participant's isOwner flag directly
        let isOwner = false;
        if (allocation.participantId) {
          const participant = participantLookup.get(allocation.participantId);
          isOwner = participant?.isOwner === true;
        } else {
          // Legacy allocation without participantId - check by IBAN match
          isOwner = ownerIban ? currentIban === ownerIban : false;
        }
        
        if (existing) {
          existing.allocationIds.push(allocation.id);
        } else {
          participantMap.set(groupKey, {
            participantId: allocation.participantId,
            participantName: allocation.participantName,
            participantIban: currentIban,
            participantTaxId: allocation.participantTaxId,
            participantBankName: currentBankName,
            totalAmount: 0, // Will be set from nano conversion below
            allocationIds: [allocation.id],
            isOwner,
            tracks: [], // Will be populated below from trackMap
          });
        }
      }
      
      // Populate tracks array from grouped trackMap for each participant
      for (const [groupKey, participant] of participantMap.entries()) {
        const trackMap = participantTrackMap.get(groupKey);
        if (trackMap) {
          participant.tracks = Array.from(trackMap.values()).map(t => ({
            trackId: t.trackId, // Preserve original track ID for downstream compatibility
            isrc: t.isrc, // ISRC for unique track identification
            trackTitle: t.trackTitle,
            releaseTitle: t.releaseTitle,
            amount: Number(t.amountNano / BigInt(100000000)), // Convert to cents
            allocationId: t.allocationIds[0], // Use first allocation ID for reference
            allocationIds: t.allocationIds, // Include all related allocation IDs
          }));
        }
      }
      
      // For owner: show ALL unique tracks by ISRC from streaming reports (regardless of allocations)
      // Owner receives revenue from all tracks - either via allocations or as remainder
      const ownerParticipant = Array.from(participantMap.values()).find(p => p.isOwner);
      if (ownerParticipant) {
        // Import required drizzle functions and schema tables
        const { eq: eqFnLegacy, inArray: inArrayFnLegacy } = await import('drizzle-orm');
        const { streamingReports, streamingReportRows } = await import('@shared/schema');
        
        // Get all streaming reports for this org
        const reports = await db
          .select({ id: streamingReports.id })
          .from(streamingReports)
          .where(eqFnLegacy(streamingReports.orgId, orgId));
        
        if (reports.length > 0) {
          const reportIds = reports.map(r => r.id);
          
          // Get ALL streaming report rows for this org (all tracks generating revenue)
          const allRows = await db
            .select({
              isrc: streamingReportRows.isrc,
              trackName: streamingReportRows.trackName,
              album: streamingReportRows.album,
            })
            .from(streamingReportRows)
            .where(inArrayFnLegacy(streamingReportRows.reportId, reportIds));
          
          // Group all rows by ISRC to get unique tracks
          const allTracksMap = new Map<string, {
            isrc: string;
            trackTitle: string;
            releaseTitle: string;
          }>();
          
          for (const row of allRows) {
            if (!row.isrc) continue;
            if (!allTracksMap.has(row.isrc)) {
              allTracksMap.set(row.isrc, {
                isrc: row.isrc,
                trackTitle: row.trackName || 'Unknown Track',
                releaseTitle: row.album || 'Unknown Release',
              });
            }
          }
          
          // Merge into owner's tracks (avoid duplicates by ISRC)
          const ownerIsrcs = new Set(ownerParticipant.tracks.map((t: any) => t.isrc));
          for (const [isrc, track] of allTracksMap.entries()) {
            if (!ownerIsrcs.has(isrc)) {
              ownerParticipant.tracks.push({
                trackId: null,
                isrc: track.isrc,
                trackTitle: track.trackTitle,
                releaseTitle: track.releaseTitle,
                amount: 0, // Amount already counted in legacy balance or allocations
                allocationId: null,
                allocationIds: [],
              });
            }
          }
        }
      }
      
      // Convert nano totals to cents for each participant (final conversion preserves precision)
      for (const [groupKey, nanoTotal] of participantNanoMap.entries()) {
        const participant = participantMap.get(groupKey);
        if (participant) {
          // Convert total nano to cents (rounded down to avoid over-reporting)
          participant.totalAmount = Number(nanoTotal / BigInt(100000000));
        }
      }
      
      // Separate owner's allocation share from other participants (in cents, derived from nano)
      let ownerAllocationNano = BigInt(0);
      let participantsAllocationNano = BigInt(0);
      // UAH equivalents
      let ownerAllocationNanoUah = BigInt(0);
      let participantsAllocationNanoUah = BigInt(0);
      
      for (const [groupKey, nanoTotal] of participantNanoMap.entries()) {
        const p = participantMap.get(groupKey);
        const nanoTotalUah = participantNanoUahMap.get(groupKey) || BigInt(0);
        if (p?.isOwner) {
          ownerAllocationNano += nanoTotal;
          ownerAllocationNanoUah += nanoTotalUah;
        } else {
          participantsAllocationNano += nanoTotal;
          participantsAllocationNanoUah += nanoTotalUah;
        }
      }
      
      // Convert nano totals to cents for final response (EUR)
      const ownerAllocationShare = Number(ownerAllocationNano / BigInt(100000000));
      const participantsAllocationShare = Number(participantsAllocationNano / BigInt(100000000));
      
      // Convert nano totals to kopiyky for final response (UAH)
      const ownerAllocationShareUah = Number(ownerAllocationNanoUah / BigInt(100000000));
      const participantsAllocationShareUah = Number(participantsAllocationNanoUah / BigInt(100000000));
      
      // Owner's total = legacy balance + their allocation share
      const ownerTotal = legacyAvailable + ownerAllocationShare;
      
      // Participants total = their allocation shares (non-owner)
      const participantsTotal = participantsAllocationShare;
      
      // Combined total available for withdrawal
      // Sum nano FIRST, then convert to avoid rounding loss from separate conversions
      const totalAllocationNano = ownerAllocationNano + participantsAllocationNano;
      const totalAllocationCents = Number(totalAllocationNano / BigInt(100000000));
      const combinedTotal = legacyAvailable + totalAllocationCents;
      
      // UAH totals (legacy balance doesn't have UAH equivalent yet, so only allocation shares)
      const totalAllocationNanoUah = ownerAllocationNanoUah + participantsAllocationNanoUah;
      const combinedTotalUah = Number(totalAllocationNanoUah / BigInt(100000000));
      const ownerTotalUah = ownerAllocationShareUah;
      const participantsTotalUah = participantsAllocationShareUah;
      
      // Convert to array with percentages, sort tracks by amount
      const participants = Array.from(participantMap.values()).map(p => ({
        ...p,
        tracks: p.tracks.sort((a, b) => b.amount - a.amount),
        // Percentage is relative to combined total
        percentage: combinedTotal > 0 ? (p.totalAmount / combinedTotal) * 100 : 0,
      }));
      
      // Sort by amount descending
      participants.sort((a, b) => b.totalAmount - a.totalAmount);
      
      res.json({
        participants,
        totalAvailable: combinedTotal, // For backward compatibility
        allocationsCount: availableAllocations.length,
        // New fields for dual-balance display
        ownerLegacyBalance: legacyAvailable, // Legacy balance (goes 100% to owner)
        ownerAllocationShare, // Owner's share from splits
        ownerTotal, // Total for owner (legacy + allocation share)
        participantsTotal, // Total for other split participants
        combinedTotal, // Grand total available
        ownerName: org.name,
        ownerIban,
        // UAH equivalents (calculated using each report's eurToUahRate)
        ownerTotalUah,
        participantsTotalUah,
        combinedTotalUah,
      });
    } catch (error) {
      console.error("Error getting allocation summary:", error);
      res.status(500).json({ message: "Failed to get allocation summary" });
    }
  });

  // Finance: Get report royalty summaries (simplified system)
  app.get('/api/finance/report-summaries', isAuthenticated, async (req: any, res) => {
    try {
      const userId = getUserId(req.user as AuthenticatedUser);
      const user = await storage.getUser(userId);
      const userOrgs = await getAccessibleOrganizations(user, userId, storage);

      if (userOrgs.length === 0) {
        return res.json({ summaries: [] });
      }

      const orgId = userOrgs[0].id;
      const summaries = await storage.getReportRoyaltySummariesByOrg(orgId);
      
      // Calculate availability date for each summary (report month + 3 months)
      const now = new Date();
      const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
      
      const enrichedSummaries = summaries.map((s: any) => {
        const [year, month] = s.reportMonth.split('-').map(Number);
        const availableDate = new Date(year, month + 2, 1); // +3 months from report month
        const availableMonth = `${availableDate.getFullYear()}-${String(availableDate.getMonth() + 1).padStart(2, '0')}`;
        const isAvailable = availableMonth <= currentMonth;
        
        return {
          ...s,
          totalGrossEur: Number(BigInt(s.totalGrossNano) / BigInt(100000000)) / 100,
          ownerNetEur: Number(BigInt(s.ownerNetNano) / BigInt(100000000)) / 100,
          ownerPaidEur: Number(BigInt(s.ownerPaidNano) / BigInt(100000000)) / 100,
          availableMonth,
          isAvailable,
        };
      });

      res.json({ summaries: enrichedSummaries });
    } catch (error) {
      console.error("Error getting report summaries:", error);
      res.status(500).json({ message: "Failed to get report summaries" });
    }
  });

  // Finance: Get simplified balance (new system)
  app.get('/api/finance/simplified-balance', isAuthenticated, async (req: any, res) => {
    try {
      const userId = getUserId(req.user as AuthenticatedUser);
      const user = await storage.getUser(userId);
      const userOrgs = await getAccessibleOrganizations(user, userId, storage);

      if (userOrgs.length === 0) {
        return res.json({ 
          ownerAvailable: 0, 
          participantsAvailable: 0, 
          totalAvailable: 0,
          pendingTotal: 0,
          shares: [] 
        });
      }

      const orgId = userOrgs[0].id;
      
      // Get available split shares (3+ months old, not fully paid)
      const availableShares = await storage.getAvailableReportSplitSharesByOrg(orgId);
      
      // Get all summaries to calculate pending (not yet available)
      const allSummaries = await storage.getReportRoyaltySummariesByOrg(orgId);
      
      // Calculate totals
      let ownerAvailableNano = BigInt(0);
      let participantsAvailableNano = BigInt(0);
      let pendingNano = BigInt(0);
      
      // Calculate available from shares
      const orgParticipants = await storage.getParticipantsByOrg(orgId);
      const ownerParticipant = orgParticipants.find((p: any) => p.isOwner);
      
      for (const share of availableShares) {
        const remainingNano = BigInt(share.remainingNano);
        if (share.participantId === ownerParticipant?.id) {
          ownerAvailableNano += remainingNano;
        } else {
          participantsAvailableNano += remainingNano;
        }
      }
      
      // Calculate pending from all split shares still within 3-month holding period
      const now = new Date();
      const threeMonthsAgo = new Date();
      threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
      const cutoffMonth = `${threeMonthsAgo.getFullYear()}-${String(threeMonthsAgo.getMonth() + 1).padStart(2, '0')}`;
      
      // Get ALL split shares (not just available ones) to calculate pending
      for (const summary of allSummaries) {
        if (summary.reportMonth > cutoffMonth) {
          // This summary is still in holding period - add total (owner + participants) to pending
          pendingNano += BigInt(summary.totalGrossNano);
        }
      }
      
      // Convert nano to EUR (nano / 10^10)
      const nanoToEur = (nano: bigint) => Number(nano) / 10000000000;
      
      const ownerAvailable = nanoToEur(ownerAvailableNano);
      const participantsAvailable = nanoToEur(participantsAvailableNano);
      const totalAvailable = ownerAvailable + participantsAvailable;
      const pendingTotal = nanoToEur(pendingNano);
      
      // Group shares by participant for display
      const sharesByParticipant = new Map<string, any>();
      for (const share of availableShares) {
        const key = share.participantId;
        if (!sharesByParticipant.has(key)) {
          sharesByParticipant.set(key, {
            participantId: share.participantId,
            participantName: share.participantName,
            participantIban: share.participantIban,
            participantBankName: share.participantBankName,
            participantTaxId: share.participantTaxId,
            totalAmountNano: BigInt(0),
            shares: [],
          });
        }
        const entry = sharesByParticipant.get(key);
        entry.totalAmountNano += BigInt(share.remainingNano);
        entry.shares.push({
          id: share.id,
          reportMonth: share.reportMonth,
          amountNano: share.remainingNano,
          amountEur: nanoToEur(BigInt(share.remainingNano)),
        });
      }
      
      const participants = Array.from(sharesByParticipant.values()).map(p => ({
        ...p,
        totalAmount: nanoToEur(p.totalAmountNano),
        totalAmountNano: p.totalAmountNano.toString(),
      })).sort((a, b) => b.totalAmount - a.totalAmount);

      res.json({
        ownerAvailable,
        participantsAvailable,
        totalAvailable,
        pendingTotal,
        participants,
      });
    } catch (error) {
      console.error("Error getting simplified balance:", error);
      res.status(500).json({ message: "Failed to get simplified balance" });
    }
  });

  // Payment Details: Get saved bank details
  app.get('/api/payment-details', isAuthenticated, async (req: any, res) => {
    try {
      const userId = getUserId(req.user as AuthenticatedUser);
      const user = await storage.getUser(userId);
      const userOrgs = await getAccessibleOrganizations(user, userId, storage);

      if (userOrgs.length === 0) {
        return res.status(404).json({ error: "No organization found" });
      }

      const paymentDetails = await storage.getPaymentDetails(userOrgs[0].id);
      res.json(paymentDetails);
    } catch (error) {
      console.error("Error getting payment details:", error);
      res.status(500).json({ message: "Failed to get payment details" });
    }
  });

  // Payment Details: Create new bank details
  app.post('/api/payment-details', isAuthenticated, async (req: any, res) => {
    try {
      const userId = getUserId(req.user as AuthenticatedUser);
      const user = await storage.getUser(userId);
      const userOrgs = await getAccessibleOrganizations(user, userId, storage);

      if (userOrgs.length === 0) {
        return res.status(404).json({ error: "No organization found" });
      }

      const { recipientName, iban, taxId, bankName, isPrimary } = req.body;

      if (!recipientName || !iban || !bankName) {
        return res.status(400).json({ error: "Missing required fields" });
      }

      const details = await storage.createPaymentDetails({
        orgId: userOrgs[0].id,
        recipientName,
        iban,
        taxId: taxId || undefined,
        bankName,
        isPrimary: isPrimary || false,
      });

      res.json(details);
    } catch (error) {
      console.error("Error creating payment details:", error);
      res.status(500).json({ message: "Failed to create payment details" });
    }
  });

  // Payment Details: Delete bank details
  app.delete('/api/payment-details/:id', isAuthenticated, async (req: any, res) => {
    try {
      const userId = getUserId(req.user as AuthenticatedUser);
      const user = await storage.getUser(userId);
      const userOrgs = await getAccessibleOrganizations(user, userId, storage);

      if (userOrgs.length === 0) {
        return res.status(404).json({ error: "No organization found" });
      }

      const { id } = req.params;
      
      // Verify payment details belong to user's organization
      const paymentDetails = await storage.getPaymentDetails(userOrgs[0].id);
      const detailsBelongsToOrg = paymentDetails.some((pd: any) => pd.id === id);
      
      if (!detailsBelongsToOrg) {
        return res.status(403).json({ error: "Access denied" });
      }
      
      await storage.deletePaymentDetails(id);
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting payment details:", error);
      res.status(500).json({ message: "Failed to delete payment details" });
    }
  });

  // Payment Details: Set primary bank details
  app.put('/api/payment-details/:id/primary', isAuthenticated, async (req: any, res) => {
    try {
      const userId = getUserId(req.user as AuthenticatedUser);
      const user = await storage.getUser(userId);
      const userOrgs = await getAccessibleOrganizations(user, userId, storage);

      if (userOrgs.length === 0) {
        return res.status(404).json({ error: "No organization found" });
      }

      const { id } = req.params;
      await storage.setPrimaryPaymentDetails(userOrgs[0].id, id);
      res.json({ success: true });
    } catch (error) {
      console.error("Error setting primary payment details:", error);
      res.status(500).json({ message: "Failed to set primary payment details" });
    }
  });

  // Royalty Participants: Get all participants for org
  app.get('/api/royalty-participants', isAuthenticated, async (req: any, res) => {
    try {
      const userId = getUserId(req.user as AuthenticatedUser);
      const user = await storage.getUser(userId);
      const userOrgs = await getAccessibleOrganizations(user, userId, storage);

      if (userOrgs.length === 0) {
        return res.status(404).json({ error: "No organization found" });
      }

      const participants = await storage.getParticipantsByOrg(userOrgs[0].id);
      
      // Enrich with current payment details
      const enrichedParticipants = await Promise.all(
        participants.map(async (p: any) => {
          const currentPayment = await storage.getCurrentPaymentDetails(p.id);
          return {
            ...p,
            currentPaymentDetails: currentPayment || null
          };
        })
      );
      
      res.json(enrichedParticipants);
    } catch (error) {
      console.error("Error getting royalty participants:", error);
      res.status(500).json({ message: "Failed to get participants" });
    }
  });

  // Royalty Participants: Update payment details (creates new version)
  app.put('/api/royalty-participants/:id/payment-details', isAuthenticated, async (req: any, res) => {
    try {
      const userId = getUserId(req.user as AuthenticatedUser);
      const user = await storage.getUser(userId);
      const userOrgs = await getAccessibleOrganizations(user, userId, storage);

      if (userOrgs.length === 0) {
        return res.status(404).json({ error: "No organization found" });
      }

      const { id } = req.params;
      const { iban, bankName } = req.body;

      if (!iban || !bankName) {
        return res.status(400).json({ error: "Missing required fields: iban, bankName" });
      }

      // Verify participant belongs to user's organization
      const participants = await storage.getParticipantsByOrg(userOrgs[0].id);
      const participant = participants.find((p: any) => p.id === id);
      
      if (!participant) {
        return res.status(403).json({ error: "Access denied or participant not found" });
      }

      // Create new payment details version
      const newPaymentDetails = await storage.createPaymentDetailVersion(id, iban, bankName);
      
      // Update AVAILABLE allocations with new payment details
      const updatedCount = await storage.updateAvailableAllocationsPaymentDetails(
        id, 
        newPaymentDetails.id, 
        iban, 
        bankName
      );

      res.json({ 
        success: true, 
        paymentDetails: newPaymentDetails,
        allocationsUpdated: updatedCount 
      });
    } catch (error) {
      console.error("Error updating participant payment details:", error);
      res.status(500).json({ message: "Failed to update payment details" });
    }
  });

  // Royalty Split Templates: Get saved templates
  app.get('/api/royalty-split-templates', isAuthenticated, async (req: any, res) => {
    try {
      const userId = getUserId(req.user as AuthenticatedUser);
      const user = await storage.getUser(userId);
      const userOrgs = await getAccessibleOrganizations(user, userId, storage);

      if (userOrgs.length === 0) {
        return res.status(404).json({ error: "No organization found" });
      }

      const templates = await storage.getRoyaltySplitTemplates(userOrgs[0].id);
      res.json(templates);
    } catch (error) {
      console.error("Error getting royalty split templates:", error);
      res.status(500).json({ message: "Failed to get royalty split templates" });
    }
  });

  // Royalty Split Templates: Create new template
  app.post('/api/royalty-split-templates', isAuthenticated, async (req: any, res) => {
    try {
      const userId = getUserId(req.user as AuthenticatedUser);
      const user = await storage.getUser(userId);
      const userOrgs = await getAccessibleOrganizations(user, userId, storage);

      if (userOrgs.length === 0) {
        return res.status(404).json({ error: "No organization found" });
      }

      const { name, splits } = req.body;

      if (!name || !splits || !Array.isArray(splits) || splits.length === 0) {
        return res.status(400).json({ error: "Missing required fields" });
      }

      const template = await storage.createRoyaltySplitTemplate({
        orgId: userOrgs[0].id,
        name,
        splits,
      });

      res.json(template);
    } catch (error) {
      console.error("Error creating royalty split template:", error);
      res.status(500).json({ message: "Failed to create royalty split template" });
    }
  });

  // Royalty Split Templates: Delete template
  app.delete('/api/royalty-split-templates/:id', isAuthenticated, async (req: any, res) => {
    try {
      const userId = getUserId(req.user as AuthenticatedUser);
      const user = await storage.getUser(userId);
      const userOrgs = await getAccessibleOrganizations(user, userId, storage);

      if (userOrgs.length === 0) {
        return res.status(404).json({ error: "No organization found" });
      }

      const { id } = req.params;
      
      // Verify template belongs to user's organization
      const template = await storage.getRoyaltySplitTemplateById(id);
      if (!template) {
        return res.status(404).json({ error: "Template not found" });
      }
      
      if (template.orgId !== userOrgs[0].id) {
        return res.status(403).json({ error: "Unauthorized to delete this template" });
      }
      
      await storage.deleteRoyaltySplitTemplate(id);
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting royalty split template:", error);
      res.status(500).json({ message: "Failed to delete royalty split template" });
    }
  });

  // Track Splits: Get split configuration for a track
  app.get('/api/track-splits/:trackId', isAuthenticated, async (req: any, res) => {
    try {
      const userId = getUserId(req.user as AuthenticatedUser);
      const user = await storage.getUser(userId);
      const userOrgs = await getAccessibleOrganizations(user, userId, storage);

      if (userOrgs.length === 0) {
        return res.status(404).json({ error: "No organization found" });
      }

      const { trackId } = req.params;
      
      // First verify the track exists and belongs to user's organization
      const track = await storage.getTrack(trackId);
      if (!track) {
        return res.status(404).json({ error: "Track not found" });
      }
      
      const release = await storage.getRelease(track.releaseId);
      if (!release || !userOrgs.some(org => org.id === release.orgId)) {
        return res.status(403).json({ error: "Unauthorized to view this track's split" });
      }
      
      const split = await storage.getTrackSplit(trackId);
      res.json(split || null);
    } catch (error) {
      console.error("Error getting track split:", error);
      res.status(500).json({ message: "Failed to get track split" });
    }
  });

  // Track Splits: Get all splits for a release
  app.get('/api/track-splits/release/:releaseId', isAuthenticated, async (req: any, res) => {
    try {
      const userId = getUserId(req.user as AuthenticatedUser);
      const user = await storage.getUser(userId);
      const userOrgs = await getAccessibleOrganizations(user, userId, storage);

      if (userOrgs.length === 0) {
        return res.status(404).json({ error: "No organization found" });
      }

      const { releaseId } = req.params;
      
      // Verify release belongs to user's organization
      const release = await storage.getRelease(releaseId);
      if (!release) {
        return res.status(404).json({ error: "Release not found" });
      }
      
      if (!userOrgs.some(org => org.id === release.orgId)) {
        return res.status(403).json({ error: "Unauthorized to view this release's splits" });
      }
      
      const splits = await storage.getTrackSplitsByRelease(releaseId);
      res.json(splits);
    } catch (error) {
      console.error("Error getting track splits for release:", error);
      res.status(500).json({ message: "Failed to get track splits" });
    }
  });

  // Track Splits: Create or update split configuration
  app.post('/api/track-splits', isAuthenticated, async (req: any, res) => {
    try {
      const userId = getUserId(req.user as AuthenticatedUser);
      const user = await storage.getUser(userId);
      const userOrgs = await getAccessibleOrganizations(user, userId, storage);

      if (userOrgs.length === 0) {
        return res.status(404).json({ error: "No organization found" });
      }

      const { trackId, releaseId, splits } = req.body;

      if (!trackId || !releaseId || !splits || !Array.isArray(splits)) {
        return res.status(400).json({ error: "Missing required fields" });
      }

      // Verify release exists
      const release = await storage.getRelease(releaseId);
      if (!release) {
        return res.status(404).json({ error: "Release not found" });
      }
      
      // Verify release belongs to user's organization
      if (!userOrgs.some(org => org.id === release.orgId)) {
        return res.status(403).json({ error: "Unauthorized to modify this release's splits" });
      }

      // Verify track exists and belongs to the specified release
      const track = await storage.getTrack(trackId);
      if (!track) {
        return res.status(404).json({ error: "Track not found" });
      }
      
      if (track.releaseId !== releaseId) {
        return res.status(400).json({ error: "Track does not belong to the specified release" });
      }

      // Validate splits
      if (splits.length > 10) {
        return res.status(400).json({ error: "Maximum 10 split participants allowed" });
      }

      // Validate each split participant with strict server-side validation
      for (const split of splits) {
        // Check required fields
        if (!split.name || typeof split.name !== 'string' || split.name.trim().length === 0) {
          return res.status(400).json({ error: "Each split participant requires a valid name" });
        }
        
        if (!split.iban || typeof split.iban !== 'string' || split.iban.trim().length === 0) {
          return res.status(400).json({ error: "Each split participant requires a valid IBAN" });
        }
        
        // Validate Ukrainian IBAN format (UA + 27 digits)
        const cleanIban = split.iban.replace(/\s/g, '').toUpperCase();
        if (!/^UA\d{27}$/.test(cleanIban)) {
          return res.status(400).json({ error: "Invalid IBAN format. Must be Ukrainian format (UA + 27 digits)" });
        }
        
        // Validate tax ID if provided (10 digits)
        if (split.taxId && typeof split.taxId === 'string' && split.taxId.trim().length > 0) {
          if (!/^\d{10}$/.test(split.taxId)) {
            return res.status(400).json({ error: "Invalid Tax ID format. Must be 10 digits" });
          }
        }
        
        if (!split.bankName || typeof split.bankName !== 'string' || split.bankName.trim().length === 0) {
          return res.status(400).json({ error: "Each split participant requires a valid bank name" });
        }
        
        const percentage = parseFloat(split.percentage);
        if (isNaN(percentage) || percentage <= 0 || percentage > 100) {
          return res.status(400).json({ error: "Each split percentage must be between 0 and 100" });
        }
      }

      const totalPercentage = splits.reduce((sum: number, split: any) => 
        sum + parseFloat(split.percentage || 0), 0
      );

      if (totalPercentage > 100) {
        return res.status(400).json({ error: "Total split percentage cannot exceed 100%" });
      }

      // Sanitize split data before storage
      const sanitizedSplits = splits.map((split: any) => ({
        name: split.name.trim(),
        iban: split.iban.replace(/\s/g, '').toUpperCase(),
        taxId: split.taxId ? split.taxId.trim() : '',
        bankName: split.bankName.trim(),
        percentage: parseFloat(split.percentage),
      }));

      const trackSplit = await storage.createTrackSplit({
        trackId,
        releaseId,
        orgId: release.orgId,
        splits: sanitizedSplits,
        createdBy: userId,
      });

      res.json(trackSplit);
    } catch (error) {
      console.error("Error creating track split:", error);
      res.status(500).json({ message: "Failed to create track split" });
    }
  });

  // Track Splits: Get all splits for user's organization
  app.get('/api/track-splits-by-org', isAuthenticated, async (req: any, res) => {
    try {
      const userId = getUserId(req.user as AuthenticatedUser);
      const user = await storage.getUser(userId);
      const userOrgs = await getAccessibleOrganizations(user, userId, storage);

      if (userOrgs.length === 0) {
        return res.status(404).json({ error: "No organization found" });
      }

      const splits = await storage.getTrackSplitsByOrg(userOrgs[0].id);
      res.json(splits);
    } catch (error) {
      console.error("Error getting track splits by org:", error);
      res.status(500).json({ message: "Failed to get track splits" });
    }
  });

  // Track Splits: Delete split configuration
  app.delete('/api/track-splits/:id', isAuthenticated, async (req: any, res) => {
    try {
      const userId = getUserId(req.user as AuthenticatedUser);
      const user = await storage.getUser(userId);
      const userOrgs = await getAccessibleOrganizations(user, userId, storage);

      if (userOrgs.length === 0) {
        return res.status(404).json({ error: "No organization found" });
      }

      const { id } = req.params;
      
      // Get the track split first to verify ownership
      const existingSplit = await db.select().from(trackSplits).where(eq(trackSplits.id, id)).limit(1);
      if (!existingSplit || existingSplit.length === 0) {
        return res.status(404).json({ error: "Track split not found" });
      }
      
      // Verify the split belongs to user's organization
      if (!userOrgs.some(org => org.id === existingSplit[0].orgId)) {
        return res.status(403).json({ error: "Unauthorized to delete this split" });
      }
      
      await storage.deleteTrackSplit(id);
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting track split:", error);
      res.status(500).json({ message: "Failed to delete track split" });
    }
  });

  // Finance: Request withdrawal with splits
  app.post('/api/finance/withdraw', isAuthenticated, async (req: any, res) => {
    try {
      console.log('[WITHDRAWAL DEBUG] === Starting withdrawal request ===');
      // Log only non-sensitive metadata from request (don't destructure - done below)
      console.log('[WITHDRAWAL DEBUG] Request metadata:', JSON.stringify({
        amount: req.body.amount,
        useAllocations: req.body.useAllocations,
        saveForFuture: req.body.saveForFuture,
        splitsCount: req.body.splits?.length || 0,
        hasSplits: !!req.body.splits
      }));
      
      const userId = getUserId(req.user as AuthenticatedUser);
      const user = await storage.getUser(userId);
      const userOrgs = await getAccessibleOrganizations(user, userId, storage);

      console.log('[WITHDRAWAL DEBUG] User ID:', userId, 'Orgs count:', userOrgs.length);

      if (userOrgs.length === 0) {
        console.log('[WITHDRAWAL DEBUG] REJECTED: No organization found');
        return res.status(404).json({ error: "No organization found" });
      }

      const org = userOrgs[0];
      const { amount, recipientName, iban, taxId, bankName, saveForFuture, splits, useAllocations } = req.body;

      console.log('[WITHDRAWAL DEBUG] Org ID:', org.id, 'Amount:', amount, 'useAllocations:', useAllocations);
      console.log('[WITHDRAWAL DEBUG] Splits count:', splits?.length || 0);
      if (splits && splits.length > 0) {
        console.log('[WITHDRAWAL DEBUG] Splits details:', splits.map((s: any) => ({
          name: s.recipientName,
          iban: s.iban ? `${s.iban.substring(0, 6)}...${s.iban.slice(-4)}` : 'EMPTY',
          amount: s.calculatedAmount,
          percentage: s.percentage
        })));
      }

      if (!amount || amount <= 0) {
        console.log('[WITHDRAWAL DEBUG] REJECTED: Invalid amount', amount);
        return res.status(400).json({ error: "Invalid amount" });
      }

      // Safety telemetry: log when legacy path is used while allocations exist
      // This helps identify if UI is not sending useAllocations when it should
      if (!useAllocations) {
        const availableAllocations = await storage.getAvailableAllocationsByOrg(org.id);
        if (availableAllocations.length > 0) {
          console.warn(`[WITHDRAWAL WARNING] Legacy path used for org ${org.id} but has ${availableAllocations.length} available allocations. Consider migrating to allocation-aware flow.`);
        }
      }

      // Handle allocation-based withdrawal (new flow)
      if (useAllocations && splits && splits.length > 0) {
        // Validate that all splits have required banking details (IBAN)
        const missingIbanSplits = splits.filter((s: any) => !s.iban || s.iban.trim() === '');
        if (missingIbanSplits.length > 0) {
          const names = missingIbanSplits.map((s: any) => s.recipientName || 'Unknown').join(', ');
          console.log(`[WITHDRAWAL] Rejected: Missing IBAN for participants: ${names}`);
          return res.status(400).json({ 
            error: `Відсутні банківські реквізити (IBAN) для: ${names}. Будь ласка, введіть платіжні дані.` 
          });
        }
        
        // Amount is already in cents from frontend
        console.log(`[WITHDRAWAL] Processing allocation-based withdrawal for org ${org.id}, amount: ${amount} cents`);
        
        // Get both allocation and legacy balances for validation
        const { legacyAvailable } = await storage.getLegacyBalance(org.id);
        const availableAllocations = await storage.getAvailableAllocationsByOrg(org.id);
        
        // Get participants to determine owner
        const participants = await storage.getParticipantsByOrg(org.id);
        const ownerParticipant = participants.find((p: any) => p.isOwner);
        const ownerPaymentDetails = ownerParticipant 
          ? await storage.getCurrentPaymentDetails(ownerParticipant.id) 
          : null;
        const ownerIban = ownerPaymentDetails?.iban || null;
        
        // Group allocations by participant using nano-units for precision
        const allocationsByParticipant = new Map<string, Array<{ id: string; nanoAmount: bigint }>>();
        const ownerAllocations: Array<{ id: string; nanoAmount: bigint }> = [];
        
        for (const a of availableAllocations) {
          // Use nano-units for full precision
          const nanoAmount = a.shareAmountNano 
            ? BigInt(a.shareAmountNano)
            : BigInt(Math.round(parseFloat(a.shareAmount || '0') * 10000000000));
          const allocItem = { id: a.id, nanoAmount };
          
          if (a.participantId) {
            // Check if this participant is owner
            const participant = participants.find((p: any) => p.id === a.participantId);
            if (participant?.isOwner) {
              ownerAllocations.push(allocItem);
            } else {
              const key = a.participantId;
              if (!allocationsByParticipant.has(key)) {
                allocationsByParticipant.set(key, []);
              }
              allocationsByParticipant.get(key)!.push(allocItem);
            }
          } else {
            // Legacy allocation without participantId - belongs to owner
            ownerAllocations.push(allocItem);
          }
        }
        
        // Calculate total available in nano, then convert to cents
        const ownerAllocationNano = ownerAllocations.reduce((sum, a) => sum + a.nanoAmount, BigInt(0));
        const allParticipantsNano = Array.from(allocationsByParticipant.values())
          .reduce((sum, arr) => sum + arr.reduce((s, a) => s + a.nanoAmount, BigInt(0)), BigInt(0));
        
        // Convert nano totals to cents for comparison with user request
        const ownerAllocationTotal = Number(ownerAllocationNano / BigInt(100000000));
        const allParticipantsTotal = Number(allParticipantsNano / BigInt(100000000));
        const combinedTotal = legacyAvailable + ownerAllocationTotal + allParticipantsTotal;
        
        console.log('[WITHDRAWAL DEBUG] Balance check - legacy:', legacyAvailable, 'ownerAlloc:', ownerAllocationTotal, 'participantsAlloc:', allParticipantsTotal, 'combined:', combinedTotal, 'requested:', amount);
        
        if (amount > combinedTotal) {
          console.log('[WITHDRAWAL DEBUG] REJECTED: Amount exceeds balance. Requested:', amount, 'Available:', combinedTotal);
          return res.status(400).json({ error: "Amount exceeds available balance" });
        }
        
        // Build sanitized splits with selected allocations per participant
        const selectedAllocationIds: string[] = [];
        const sanitizedSplits: Array<{
          recipientName: string;
          iban: string;
          taxId: string;
          bankName: string;
          percentage: string;
          calculatedAmount: number;
          allocationIds: string[];
        }> = [];
        
        let totalLegacyUsed = 0; // Legacy in cents (for ledger/display)
        let totalLegacyUsedNano = BigInt(0); // Legacy in nano (for precise validation)
        let totalAllocationNano = BigInt(0); // Track precise nano total (source of truth)
        const NANO_PER_CENT_BASE = BigInt(100000000);
        
        // Pre-cache payment details to avoid repeated lookups
        const participantDetailsCache = new Map<string, any>();
        for (const p of participants) {
          const details = await storage.getCurrentPaymentDetails(p.id);
          if (details) {
            participantDetailsCache.set(p.id, details);
          }
        }
        
        // Sort all allocation pools (smallest first by nano) - mutate in place
        ownerAllocations.sort((a, b) => Number(a.nanoAmount - b.nanoAmount));
        for (const allocs of allocationsByParticipant.values()) {
          allocs.sort((a, b) => Number(a.nanoAmount - b.nanoAmount));
        }
        
        // Process splits - select allocations for each participant
        for (const split of splits) {
          const splitCalcAmount = split.calculatedAmount || 0; // Already in cents
          const splitAllocIds: string[] = [];
          
          // Find if this split is for owner
          // SECURE FALLBACK: Only treat as pure-legacy owner split when:
          // 1. NO royalty_participants exist at all (participants.length === 0)
          // 2. AND no allocations exist (availableAllocations.length === 0)
          // This handles production cases where only legacy balance exists without any allocation system
          // Otherwise, require proper owner matching to prevent unauthorized fund access
          const isPureLegacyOrg = participants.length === 0 && availableAllocations.length === 0;
          const isOwnerSplit = isPureLegacyOrg || // Pure legacy org = all splits use legacy
            split.iban === ownerIban || 
            split.recipientName === ownerParticipant?.name;
          
          console.log('[WITHDRAWAL DEBUG] Split processing:', {
            recipientName: split.recipientName,
            isOwnerSplit,
            isPureLegacyOrg,
            participantsCount: participants.length,
            allocationsCount: availableAllocations.length,
            ownerParticipantExists: !!ownerParticipant,
            ownerIban: ownerIban ? `${ownerIban.substring(0, 6)}...` : 'null',
            splitIban: split.iban ? `${split.iban.substring(0, 6)}...` : 'null'
          });
          
          let splitAllocatedNano = BigInt(0); // Track precise nano for this split
          
          if (isOwnerSplit) {
            // Owner split: use allocations first (allow minimal overage), then legacy for remainder
            // Work in nano for precision, convert target to nano
            const splitCalcNano = BigInt(splitCalcAmount) * BigInt(100000000);
            
            // Select owner allocations
            // If splitCalcNano is 0 (sub-cent amount), select ALL allocations to avoid leaving them behind
            // Otherwise, select until we meet the target amount
            for (const alloc of ownerAllocations) {
              if (selectedAllocationIds.includes(alloc.id)) continue;
              selectedAllocationIds.push(alloc.id);
              splitAllocIds.push(alloc.id);
              splitAllocatedNano += alloc.nanoAmount;
              // Only break early if there's a non-zero target to meet
              if (splitCalcNano > 0 && splitAllocatedNano >= splitCalcNano) break;
            }
            // Add to total nano (used for precise accounting)
            totalAllocationNano += splitAllocatedNano;
            
            // If allocations don't cover it, use legacy for the shortfall
            // Work entirely in nano for precise tracking
            if (splitAllocatedNano < splitCalcNano) {
              const shortfallNano = splitCalcNano - splitAllocatedNano;
              const legacyAvailableNano = BigInt(legacyAvailable) * NANO_PER_CENT_BASE - totalLegacyUsedNano;
              // Use minimum of shortfall and available legacy (both in nano)
              const legacyToUseNano = shortfallNano < legacyAvailableNano ? shortfallNano : legacyAvailableNano;
              // Track nano usage (for precise validation)
              totalLegacyUsedNano += legacyToUseNano;
              // Track cents usage (floor for ledger/display)
              totalLegacyUsed = Number(totalLegacyUsedNano / NANO_PER_CENT_BASE);
            }
          } else {
            // Participant split: use only their allocations (must be sufficient)
            // Find participant by IBAN match
            let matchedParticipantId: string | null = null;
            for (const [pId] of allocationsByParticipant.entries()) {
              const pDetails = participantDetailsCache.get(pId);
              if (pDetails?.iban === split.iban) {
                matchedParticipantId = pId;
                break;
              }
            }
            
            if (matchedParticipantId) {
              const participantAllocs = allocationsByParticipant.get(matchedParticipantId) || [];
              // Work in nano for precision, convert target to nano
              const splitCalcNano = BigInt(splitCalcAmount) * BigInt(100000000);
              
              // Select participant allocations
              // If splitCalcNano is 0 (sub-cent amount), select ALL allocations to avoid leaving them behind
              // Otherwise, select until we meet the target amount
              for (const alloc of participantAllocs) {
                if (selectedAllocationIds.includes(alloc.id)) continue;
                selectedAllocationIds.push(alloc.id);
                splitAllocIds.push(alloc.id);
                splitAllocatedNano += alloc.nanoAmount;
                // Only break early if there's a non-zero target to meet
                if (splitCalcNano > 0 && splitAllocatedNano >= splitCalcNano) break;
              }
              // Add to total nano (used for precise accounting)
              totalAllocationNano += splitAllocatedNano;
            }
          }
          
          // Calculate overage for this split in nano (precise) and cents (display with floor for conservative accounting)
          const splitCalcNano = BigInt(splitCalcAmount) * BigInt(100000000);
          const splitOverageNano = splitAllocatedNano > splitCalcNano ? splitAllocatedNano - splitCalcNano : BigInt(0);
          // Derive cents for display using floor (conservative - nano is authoritative)
          const NANO_PER_CENT = BigInt(100000000);
          const splitActualAmount = Number(splitAllocatedNano / NANO_PER_CENT); // Floor
          const splitOverage = Number(splitOverageNano / NANO_PER_CENT); // Floor
          
          // Build sanitized split with proper accounting (both cents for display and nano for precision)
          sanitizedSplits.push({
            recipientName: split.recipientName,
            iban: split.iban,
            taxId: split.taxId || '',
            bankName: split.bankName || '',
            percentage: split.percentage?.toString() || '0',
            calculatedAmount: splitCalcAmount, // User-requested amount for this split
            reservedAllocationCents: splitAllocIds.length > 0 ? splitActualAmount : 0, // Actual reserved (cents)
            reservedAllocationNano: splitAllocIds.length > 0 ? splitAllocatedNano.toString() : '0', // Precise nano
            splitOverageCents: splitOverage, // Overage (cents)
            splitOverageNano: splitOverageNano.toString(), // Precise overage (nano)
            allocationIds: splitAllocIds,
          });
        }
        
        const legacyAmount = totalLegacyUsed;
        
        // Calculate totals in nano (precise) and derive cents for display using floor (conservative accounting)
        const NANO_PER_CENT_CALC = BigInt(100000000);
        const totalOverageNano = sanitizedSplits.reduce((sum, s) => sum + BigInt(s.splitOverageNano || '0'), BigInt(0));
        const totalOverage = Number(totalOverageNano / NANO_PER_CENT_CALC); // Floor
        
        // Convert nano to cents for storage (display) using floor - nano is authoritative
        const allocationAmount = Number(totalAllocationNano / NANO_PER_CENT_CALC); // Floor
        
        // Calculate total reserved in nano for precise validation
        // Use tracked nano values directly (not derived from cents)
        const totalReservedNano = totalLegacyUsedNano + totalAllocationNano;
        const requestedNano = BigInt(amount) * NANO_PER_CENT_CALC;
        
        console.log(`[WITHDRAWAL] Amount breakdown: requested=${amount} (${requestedNano} nano), reserved=${Number(totalReservedNano / NANO_PER_CENT_CALC)} (${totalReservedNano} nano), legacy=${legacyAmount}, allocation=${allocationAmount}, overage=${totalOverage}, selected=${selectedAllocationIds.length} allocations`);
        
        // Validate using nano precision (reserved must meet or exceed request)
        if (totalReservedNano < requestedNano) {
          const availableEUR = Number(totalReservedNano / NANO_PER_CENT_CALC) / 100;
          return res.status(400).json({ 
            error: `Insufficient funds. Available: ${availableEUR.toFixed(2)} EUR, Requested: ${(amount / 100).toFixed(2)} EUR` 
          });
        }
        
        // Use the first participant's details as the "main" recipient for the withdrawal record
        const mainSplit = sanitizedSplits[0];
        
        // Create withdrawal with splits and reserve allocations atomically
        // This is done inside a transaction to prevent race conditions
        //
        // OPTION C ACCOUNTING:
        // - amount = user-requested amount (what they asked for)
        // - allocationAmount = actual cents reserved from allocations (may exceed requested due to atomic allocations)
        // - allocationOverageCents = overage (allocationAmount - portion needed from allocations)
        // - Balance deduction = amount (user request), not allocationAmount
        // - Overage remains in RESERVED allocations; if withdrawal is rejected, they become AVAILABLE again
        // - If withdrawal is approved, admin pays out 'amount', overage remains for future withdrawals
        const result = await storage.createWithdrawalWithSplits({
          orgId: org.id,
          amount: amount, // User-requested amount (preserved for business contract)
          legacyAmount,
          allocationAmount,
          allocationAmountNano: totalAllocationNano.toString(), // Precise nano amount
          allocationOverageCents: totalOverage, // Track overage for audit and future reuse
          allocationOverageNano: totalOverageNano.toString(), // Precise nano overage
          allocationIds: selectedAllocationIds, // Reserve all selected allocations
          requestedBy: userId,
          recipientName: mainSplit.recipientName,
          iban: mainSplit.iban,
          taxId: mainSplit.taxId,
          bankName: mainSplit.bankName,
          splits: sanitizedSplits, // Sanitized splits with nano precision
        });
        
        console.log(`[WITHDRAWAL] Created withdrawal ${result.withdrawal.id} with ${selectedAllocationIds.length} allocations reserved`);
        
        // Notify admins about withdrawal request
        const { db: database } = await import("./db");
        const { users: usersTable } = await import("@shared/schema");
        const { eq: eqFn } = await import("drizzle-orm");
        
        const admins = await database.select().from(usersTable).where(eqFn(usersTable.role, "ADMIN"));
        const organization = await storage.getOrganization(org.id);
        const amountEUR = (amount / 100).toFixed(2); // Convert cents to EUR
        const notificationTitle = "Новий запит на виведення роялті";
        const notificationMessage = `${organization?.name || "Організація"} запросила виведення ${amountEUR} EUR (з ${splits.length} учасниками, на основі алокацій)`;
        
        for (const admin of admins) {
          await storage.createNotification({
            userId: admin.id,
            releaseId: null,
            pitchingId: null,
            relatedEntityType: "withdrawal",
            relatedEntityId: result.withdrawal.id,
            title: notificationTitle,
            message: notificationMessage,
            type: "WITHDRAWAL_REQUESTED",
            changedFields: null,
            isRead: false,
          });
        }
        
        // Send email notification to admin (fire and forget - non-blocking)
        const { sendNotificationEmail } = await import("./googleMail");
        void sendNotificationEmail(notificationTitle, notificationMessage, "WITHDRAWAL_REQUESTED").catch(err => {
          console.error('[EMAIL] Failed to send notification email:', err);
        });
        
        // Send Telegram notification to admin (fire and forget - non-blocking)
        const { sendTelegramNotification } = await import("./telegram");
        void sendTelegramNotification(notificationTitle, notificationMessage).catch(err => {
          console.error('[TELEGRAM] Failed to send notification:', err);
        });

        return res.json(result);
      }

      // Save payment details if requested
      if (saveForFuture && recipientName && iban && bankName) {
        await storage.createPaymentDetails({
          orgId: org.id,
          recipientName,
          iban,
          taxId,
          bankName,
          isPrimary: false,
        });
      }

      // Validate splits if provided (legacy manual splits flow)
      console.log('[WITHDRAWAL DEBUG] Processing legacy splits flow');
      if (splits && splits.length > 0) {
        console.log('[WITHDRAWAL DEBUG] Legacy splits validation - count:', splits.length);
        if (splits.length > 10) {
          console.log('[WITHDRAWAL DEBUG] REJECTED: Too many splits:', splits.length);
          return res.status(400).json({ error: "Maximum 10 splits allowed" });
        }

        const totalPercentage = splits.reduce((sum: number, split: any) => 
          sum + parseFloat(split.percentage), 0
        );
        console.log('[WITHDRAWAL DEBUG] Total percentage:', totalPercentage);

        // Allow exactly 100% when there's only one recipient (single-participant withdrawal)
        // This supports the new allocation-based workflow where owner gets 100%
        if (totalPercentage > 100) {
          console.log('[WITHDRAWAL DEBUG] REJECTED: Percentage exceeds 100%:', totalPercentage);
          return res.status(400).json({ error: "Total split percentage cannot exceed 100%" });
        }
        
        // For multiple splits, ensure main recipient gets at least 1%
        // For single split at 100%, the split itself is the main recipient
        if (splits.length > 1) {
          const mainRecipientPercentage = 100 - totalPercentage;
          if (mainRecipientPercentage < 1 && totalPercentage < 100) {
            console.log('[WITHDRAWAL DEBUG] REJECTED: Main recipient percentage too low:', mainRecipientPercentage);
            return res.status(400).json({ error: "Main recipient must receive at least 1% of the withdrawal amount" });
          }
        }

        // For 100% single split, use split's details as main recipient
        const effectiveRecipientName = totalPercentage === 100 && splits.length === 1 
          ? splits[0].recipientName 
          : recipientName;
        const effectiveIban = totalPercentage === 100 && splits.length === 1 
          ? splits[0].iban 
          : iban;
        const effectiveTaxId = totalPercentage === 100 && splits.length === 1 
          ? splits[0].taxId 
          : taxId;
        const effectiveBankName = totalPercentage === 100 && splits.length === 1 
          ? splits[0].bankName 
          : bankName;

        // Create withdrawal with splits
        const result = await storage.createWithdrawalWithSplits({
          orgId: org.id,
          amount,
          requestedBy: userId,
          recipientName: effectiveRecipientName,
          iban: effectiveIban,
          taxId: effectiveTaxId,
          bankName: effectiveBankName,
          splits,
        });

        // Notify admins about withdrawal request
        const { db: database } = await import("./db");
        const { users: usersTable } = await import("@shared/schema");
        const { eq: eqFn } = await import("drizzle-orm");
        
        const admins = await database.select().from(usersTable).where(eqFn(usersTable.role, "ADMIN"));
        const organization = await storage.getOrganization(org.id);
        const amountEUR = (amount / 100).toFixed(2);
        const notificationTitle = "Новий запит на виведення роялті";
        const notificationMessage = `${organization?.name || "Організація"} запросила виведення ${amountEUR} EUR${splits && splits.length > 0 ? ` (з ${splits.length} розподіленнями)` : ''}`;
        
        for (const admin of admins) {
          await storage.createNotification({
            userId: admin.id,
            releaseId: null,
            pitchingId: null,
            relatedEntityType: "withdrawal",
            relatedEntityId: result.withdrawal.id,
            title: notificationTitle,
            message: notificationMessage,
            type: "WITHDRAWAL_REQUESTED",
            changedFields: null,
            isRead: false,
          });
        }
        
        // Send email notification to admin (fire and forget - non-blocking)
        const { sendNotificationEmail } = await import("./googleMail");
        void sendNotificationEmail(notificationTitle, notificationMessage, "WITHDRAWAL_REQUESTED").catch(err => {
          console.error('[EMAIL] Failed to send notification email:', err);
        });
        
        // Send Telegram notification to admin (fire and forget - non-blocking)
        const { sendTelegramNotification } = await import("./telegram");
        void sendTelegramNotification(notificationTitle, notificationMessage).catch(err => {
          console.error('[TELEGRAM] Failed to send notification:', err);
        });

        return res.json(result);
      }

      // Create simple withdrawal without splits
      const withdrawal = await storage.requestWithdrawal({
        orgId: org.id,
        amount,
        requestedBy: userId,
        recipientName,
        iban,
        taxId,
        bankName,
      });

      // Notify admins about withdrawal request
      const { db: database } = await import("./db");
      const { users: usersTable } = await import("@shared/schema");
      const { eq: eqFn } = await import("drizzle-orm");
      
      const admins = await database.select().from(usersTable).where(eqFn(usersTable.role, "ADMIN"));
      const organization = await storage.getOrganization(org.id);
      const amountEUR = (amount / 100).toFixed(2);
      const notificationTitle = "Новий запит на виведення роялті";
      const notificationMessage = `${organization?.name || "Організація"} запросила виведення ${amountEUR} EUR`;
      
      for (const admin of admins) {
        await storage.createNotification({
          userId: admin.id,
          releaseId: null,
          pitchingId: null,
          relatedEntityType: "withdrawal",
          relatedEntityId: withdrawal.id,
          title: notificationTitle,
          message: notificationMessage,
          type: "WITHDRAWAL_REQUESTED",
          changedFields: null,
          isRead: false,
        });
      }
      
      // Send email notification to admin (fire and forget - non-blocking)
      const { sendNotificationEmail } = await import("./googleMail");
      void sendNotificationEmail(notificationTitle, notificationMessage, "WITHDRAWAL_REQUESTED").catch(err => {
        console.error('[EMAIL] Failed to send notification email:', err);
      });
      
      // Send Telegram notification to admin (fire and forget - non-blocking)
      const { sendTelegramNotification } = await import("./telegram");
      void sendTelegramNotification(notificationTitle, notificationMessage).catch(err => {
        console.error('[TELEGRAM] Failed to send notification:', err);
      });

      res.json({ withdrawal, splits: [] });
    } catch (error: any) {
      console.error("Error requesting withdrawal:", error);
      if (error.message === 'Insufficient balance') {
        return res.status(400).json({ error: "Insufficient balance" });
      }
      res.status(500).json({ message: "Failed to request withdrawal" });
    }
  });

  // Finance: Simplified FIFO withdrawal from reportSplitShares (new system)
  app.post('/api/finance/simplified-withdraw', isAuthenticated, async (req: any, res) => {
    try {
      const userId = getUserId(req.user as AuthenticatedUser);
      const user = await storage.getUser(userId);
      const userOrgs = await getAccessibleOrganizations(user, userId, storage);

      if (userOrgs.length === 0) {
        return res.status(404).json({ error: "No organization found" });
      }

      const org = userOrgs[0];
      const { amountNano, participantId, recipientName, iban, taxId, bankName } = req.body;

      if (!amountNano || BigInt(amountNano) <= BigInt(0)) {
        return res.status(400).json({ error: "Invalid amount" });
      }

      const requestedNano = BigInt(amountNano);
      console.log(`[SIMPLIFIED-WITHDRAW] Processing request for org ${org.id}, amount: ${amountNano} nano`);

      // Get available shares for this participant (FIFO order by report month)
      const availableShares = await storage.getAvailableReportSplitSharesByOrg(org.id);
      
      // Filter to only this participant's shares and SORT by reportMonth ascending (FIFO)
      const participantShares = availableShares
        .filter((s: any) => participantId ? s.participantId === participantId : true)
        .sort((a: any, b: any) => {
          // Primary sort: reportMonth ascending (oldest first = FIFO)
          if (a.reportMonth < b.reportMonth) return -1;
          if (a.reportMonth > b.reportMonth) return 1;
          // Secondary sort: by id as tiebreaker for deterministic order
          return a.id.localeCompare(b.id);
        });

      // Calculate total available for this participant
      const totalAvailableNano = participantShares.reduce(
        (sum: bigint, s: any) => sum + BigInt(s.remainingNano), 
        BigInt(0)
      );

      if (requestedNano > totalAvailableNano) {
        return res.status(400).json({ 
          error: `Insufficient balance. Available: ${Number(totalAvailableNano) / 10000000000} EUR, Requested: ${Number(requestedNano) / 10000000000} EUR` 
        });
      }

      // FIFO selection: consume from oldest reports first
      let remainingToConsume = requestedNano;
      const applications: Array<{ shareId: string; appliedNano: string; reportMonth: string }> = [];

      for (const share of participantShares) {
        if (remainingToConsume <= BigInt(0)) break;
        
        const shareRemaining = BigInt(share.remainingNano);
        const toConsume = shareRemaining < remainingToConsume ? shareRemaining : remainingToConsume;
        
        applications.push({
          shareId: share.id,
          appliedNano: toConsume.toString(),
          reportMonth: share.reportMonth,
        });
        
        remainingToConsume -= toConsume;
      }

      // Create withdrawal record (uses existing table)
      const amountCents = Math.floor(Number(requestedNano) / 100000000);
      const withdrawal = await storage.requestWithdrawal({
        orgId: org.id,
        amount: amountCents,
        requestedBy: userId,
        recipientName: recipientName || '',
        iban: iban || '',
        taxId: taxId || '',
        bankName: bankName || '',
      });

      // Apply FIFO consumption - update share remainings and create applications
      for (const app of applications) {
        const share = participantShares.find((s: any) => s.id === app.shareId);
        if (!share) continue;
        
        const newRemaining = BigInt(share.remainingNano) - BigInt(app.appliedNano);
        const newStatus = newRemaining <= BigInt(0) ? 'PAID' : 'PARTIAL';
        
        await storage.updateReportSplitShareRemaining(app.shareId, newRemaining.toString(), newStatus);
        await storage.createWithdrawalReportApplication({
          withdrawalId: withdrawal.id,
          splitShareId: app.shareId,
          appliedNano: app.appliedNano,
        });
      }

      console.log(`[SIMPLIFIED-WITHDRAW] Created withdrawal ${withdrawal.id} with ${applications.length} report applications (FIFO)`);

      // Notify admins
      const { db: database } = await import("./db");
      const { users: usersTable } = await import("@shared/schema");
      const { eq: eqFn } = await import("drizzle-orm");
      
      const admins = await database.select().from(usersTable).where(eqFn(usersTable.role, "ADMIN"));
      const organization = await storage.getOrganization(org.id);
      const amountEUR = (Number(requestedNano) / 10000000000).toFixed(2);
      const notificationTitle = "Новий запит на виведення роялті (спрощена система)";
      const notificationMessage = `${organization?.name || "Організація"} запросила виведення ${amountEUR} EUR`;
      
      for (const admin of admins) {
        await storage.createNotification({
          userId: admin.id,
          releaseId: null,
          pitchingId: null,
          relatedEntityType: "withdrawal",
          relatedEntityId: withdrawal.id,
          title: notificationTitle,
          message: notificationMessage,
          type: "WITHDRAWAL_REQUESTED",
          changedFields: null,
          isRead: false,
        });
      }
      
      // Send notifications (fire and forget)
      const { sendNotificationEmail } = await import("./googleMail");
      void sendNotificationEmail(notificationTitle, notificationMessage, "WITHDRAWAL_REQUESTED").catch(err => {
        console.error('[EMAIL] Failed to send notification email:', err);
      });
      
      const { sendTelegramNotification } = await import("./telegram");
      void sendTelegramNotification(notificationTitle, notificationMessage).catch(err => {
        console.error('[TELEGRAM] Failed to send notification:', err);
      });

      res.json({
        withdrawal,
        applications,
        consumedNano: (requestedNano - remainingToConsume).toString(),
        remainingNano: remainingToConsume.toString(),
      });
    } catch (error: any) {
      console.error("Error requesting simplified withdrawal:", error);
      res.status(500).json({ message: "Failed to request withdrawal" });
    }
  });

  // Admin Finance: Get finance summary for any organization (Owner only)
  app.get('/api/admin/finance/summary/:orgId', isAuthenticated, async (req: any, res) => {
    try {
      const userId = getUserId(req.user as AuthenticatedUser);
      const currentUser = await storage.getUser(userId);
      
      if (!isPlatformOwner(currentUser)) {
        return res.status(403).json({ error: "Owner access required" });
      }

      const { orgId } = req.params;
      console.log(`[ADMIN FINANCE] Getting summary for org: ${orgId}`);
      
      // Get base balance info (for totalEarned and totalWithdrawn)
      const { totalEarned, totalWithdrawn, totalEarnedUah } = await storage.getAvailableBalance(orgId);
      
      // Calculate combined available balance (legacy + allocations) - same as user /api/finance/summary
      const { legacyAvailable } = await storage.getLegacyBalance(orgId);
      const availableAllocations = await storage.getAvailableAllocationsByOrg(orgId);
      
      // Sum allocation values in nano for precision, then convert to cents
      let totalAllocationNano = BigInt(0);
      for (const a of availableAllocations) {
        const nanoAmount = a.shareAmountNano 
          ? BigInt(a.shareAmountNano)
          : BigInt(Math.round(Number(a.shareAmount) * 10000000000));
        totalAllocationNano += nanoAmount;
      }
      const allocationTotalCents = Number(totalAllocationNano / BigInt(100000000));
      
      // Combined total = legacy balance + allocations total
      const availableBalance = legacyAvailable + allocationTotalCents;
      
      console.log(`[ADMIN FINANCE] Total earned: ${totalEarned}`);
      console.log(`[ADMIN FINANCE] Total withdrawn: ${totalWithdrawn}`);
      console.log(`[ADMIN FINANCE] Legacy available: ${legacyAvailable}`);
      console.log(`[ADMIN FINANCE] Allocations total (cents): ${allocationTotalCents}`);
      console.log(`[ADMIN FINANCE] Combined available balance: ${availableBalance}`);
      
      res.json({
        totalEarned,
        totalWithdrawn,
        availableBalance: Math.max(0, availableBalance), // Never negative
        totalEarnedUah,  // UAH equivalent calculated using per-report exchange rates
      });
    } catch (error) {
      console.error("Error getting admin finance summary:", error);
      res.status(500).json({ message: "Failed to get finance summary" });
    }
  });

  // Admin Finance: Get withdrawals for any organization
  app.get('/api/admin/finance/withdrawals/:orgId', isAuthenticated, async (req: any, res) => {
    try {
      const userId = getUserId(req.user as AuthenticatedUser);
      const currentUser = await storage.getUser(userId);
      
      if (!isPlatformOwner(currentUser)) {
        return res.status(403).json({ error: "Owner access required" });
      }

      const { orgId } = req.params;
      const withdrawals = await storage.getWithdrawals(orgId);
      
      console.log(`[ADMIN FINANCE] Got ${withdrawals.length} withdrawals for org ${orgId}`);
      
      // Fetch splits for each withdrawal
      const withdrawalsWithSplits = await Promise.all(
        withdrawals.map(async (withdrawal) => {
          const splits = await storage.getWithdrawalSplits(withdrawal.id);
          return { ...withdrawal, splits };
        })
      );
      
      res.json(withdrawalsWithSplits);
    } catch (error) {
      console.error("Error getting admin withdrawals:", error);
      res.status(500).json({ message: "Failed to get withdrawals" });
    }
  });
  
  // Admin Finance: Get all withdrawals with splits
  app.get('/api/admin/finance/all-withdrawals', isAuthenticated, async (req: any, res) => {
    try {
      const userId = getUserId(req.user as AuthenticatedUser);
      const currentUser = await storage.getUser(userId);
      
      if (!isPlatformOwner(currentUser)) {
        return res.status(403).json({ error: "Owner access required" });
      }

      // Get regular artist/label withdrawals
      const withdrawalsWithSplits = await storage.getAllWithdrawalsWithSplits();
      
      // Get curator withdrawals (type: WITHDRAWAL, status: PROCESSING)
      const curatorWithdrawalsRaw = await db
        .select({
          transaction: curatorTransactions,
          organization: organizations,
        })
        .from(curatorTransactions)
        .leftJoin(organizations, eq(curatorTransactions.curatorOrgId, organizations.id))
        .where(eq(curatorTransactions.type, 'WITHDRAWAL'))
        .orderBy(desc(curatorTransactions.createdAt));
      
      // Map curator withdrawals to match the regular withdrawal format
      const curatorWithdrawals = curatorWithdrawalsRaw.map(item => {
        const bankAccount = item.transaction.bankAccount ? JSON.parse(item.transaction.bankAccount as string) : null;
        return {
          id: item.transaction.id,
          orgId: item.transaction.curatorOrgId,
          amount: item.transaction.amount, // Already in kopecks (UAH cents)
          amountEur: null, // Curator withdrawals are in UAH only
          currency: item.transaction.currency || 'UAH',
          status: item.transaction.status === 'PROCESSING' ? 'PENDING' : 
                  item.transaction.status === 'COMPLETED' ? 'APPROVED' : 
                  item.transaction.status === 'CANCELLED' ? 'REJECTED' : item.transaction.status,
          // Extract bank details from bankAccount for display
          recipientName: bankAccount?.recipientName || null,
          iban: bankAccount?.iban || null,
          taxId: bankAccount?.taxId || null,
          bankName: bankAccount?.bankName || null,
          bankAccount: bankAccount ? JSON.stringify(bankAccount) : null,
          requestedAt: item.transaction.createdAt,
          processedAt: item.transaction.processedAt,
          requestedBy: null,
          processedBy: null,
          notes: item.transaction.description,
          legacyWithdrawal: false,
          isCuratorWithdrawal: true, // Flag to identify curator withdrawals
          organization: item.organization,
          requester: null,
          processor: null,
          splits: [],
        };
      });
      
      // Merge and sort by requestedAt (most recent first)
      const allWithdrawals = [...withdrawalsWithSplits, ...curatorWithdrawals]
        .sort((a, b) => {
          const dateA = new Date(a.requestedAt).getTime();
          const dateB = new Date(b.requestedAt).getTime();
          return dateB - dateA;
        });
      
      res.json(allWithdrawals);
    } catch (error) {
      console.error("Error getting all withdrawals:", error);
      res.status(500).json({ message: "Failed to get all withdrawals" });
    }
  });

  // Admin Finance: Create manual withdrawal
  // Consumes ONLY whole allocations in FIFO order (oldest first) - no partial splits
  // Allocations larger than remaining amount are NOT consumed (left for future)
  app.post('/api/admin/withdrawals/manual', isAuthenticated, async (req: any, res) => {
    try {
      const userId = getUserId(req.user as AuthenticatedUser);
      const currentUser = await storage.getUser(userId);
      
      if (!isPlatformOwner(currentUser)) {
        return res.status(403).json({ error: "Owner access required" });
      }

      const { orgId, amount, date, notes } = req.body;

      if (!orgId || !amount || amount <= 0 || !date) {
        return res.status(400).json({ error: "Missing required fields" });
      }

      console.log(`[ADMIN FINANCE] Creating manual withdrawal for org ${orgId}: amount=${amount}, date=${date}`);

      const { trackRoyaltyAllocations } = await import('@shared/schema');
      // Note: db, withdrawals, organizations, eq, asc, and, inArray are imported globally at top of file

      const NANO_PER_CENT = BigInt(100000000);

      // Use transaction with row-level locking for safety
      const result = await db.transaction(async (tx) => {
        // 1. Lock organization row
        const [org] = await tx
          .select()
          .from(organizations)
          .where(eq(organizations.id, orgId))
          .for('update');
        
        if (!org) {
          throw new Error('Organization not found');
        }
        
        // 2. Get legacy balance using canonical storage helper (inside transaction)
        const legacyBalance = await storage.getLegacyBalanceInTransaction(tx, orgId);
        const legacyAvailable = legacyBalance.legacyAvailable;
        
        // 3. Get and lock AVAILABLE allocations (FIFO order by availableAt)
        const availableAllocations = await tx
          .select({
            id: trackRoyaltyAllocations.id,
            orgId: trackRoyaltyAllocations.orgId,
            shareAmount: trackRoyaltyAllocations.shareAmount,
            shareAmountNano: trackRoyaltyAllocations.shareAmountNano,
            availableAt: trackRoyaltyAllocations.availableAt,
            status: trackRoyaltyAllocations.status,
          })
          .from(trackRoyaltyAllocations)
          .where(and(
            eq(trackRoyaltyAllocations.orgId, orgId),
            eq(trackRoyaltyAllocations.status, 'AVAILABLE')
          ))
          .orderBy(asc(trackRoyaltyAllocations.availableAt))
          .for('update');
        
        // Calculate total allocation value in nano
        let totalAllocationNano = BigInt(0);
        for (const a of availableAllocations) {
          // Use shareAmountNano if available, fallback to shareAmount conversion
          const nanoAmount = a.shareAmountNano 
            ? BigInt(a.shareAmountNano)
            : BigInt(Math.round(parseFloat(a.shareAmount?.toString() || '0') * 10000000000));
          totalAllocationNano += nanoAmount;
        }
        const allocationTotalCents = Number(totalAllocationNano / NANO_PER_CENT);
        
        // Combined available balance
        const availableBalance = legacyAvailable + allocationTotalCents;
        
        console.log(`[ADMIN FINANCE] Balance in tx: legacy=${legacyAvailable}, allocations=${allocationTotalCents}, combined=${availableBalance}`);

        // Check if there's enough balance
        if (amount > availableBalance) {
          throw new Error(`Insufficient balance. Available: ${availableBalance}, Requested: ${amount}`);
        }

        // 4. Consume funds: first from legacy, then from WHOLE allocations only (FIFO)
        let remainingCents = amount;
        let legacyUsed = 0;
        let allocationUsedCents = 0;
        let allocationUsedNano = BigInt(0);
        const consumedAllocationIds: string[] = [];
        
        // Use legacy balance first
        if (legacyAvailable > 0 && remainingCents > 0) {
          legacyUsed = Math.min(legacyAvailable, remainingCents);
          remainingCents -= legacyUsed;
        }
        
        // Then consume allocations in FIFO order (whole allocations only)
        // Admin manual withdrawal consumes entire allocations and records overage
        let allocationOverageNano = BigInt(0);
        if (remainingCents > 0 && availableAllocations.length > 0) {
          let remainingNano = BigInt(remainingCents) * NANO_PER_CENT;
          
          for (const allocation of availableAllocations) {
            if (remainingNano <= BigInt(0)) break;
            
            // Use shareAmountNano if available, fallback to shareAmount conversion
            const allocationNano = allocation.shareAmountNano 
              ? BigInt(allocation.shareAmountNano)
              : BigInt(Math.round(parseFloat(allocation.shareAmount?.toString() || '0') * 10000000000));
            
            // Consume entire allocation
            consumedAllocationIds.push(allocation.id);
            allocationUsedNano += allocationNano;
            
            if (allocationNano <= remainingNano) {
              remainingNano -= allocationNano;
            } else {
              // Allocation exceeds remaining - record overage for audit
              allocationOverageNano += allocationNano - remainingNano;
              remainingNano = BigInt(0);
            }
          }
          
          allocationUsedCents = Number(allocationUsedNano / NANO_PER_CENT);
        }
        
        const allocationOverageCents = Number(allocationOverageNano / NANO_PER_CENT);
        
        console.log(`[ADMIN FINANCE] Consumption: legacy=${legacyUsed}, allocation=${allocationUsedCents}, overage=${allocationOverageCents}, allocations_consumed=${consumedAllocationIds.length}`);

        // 5. Mark consumed allocations as PAID (final for COMPLETED withdrawals)
        if (consumedAllocationIds.length > 0) {
          await tx
            .update(trackRoyaltyAllocations)
            .set({ status: 'PAID' })
            .where(inArray(trackRoyaltyAllocations.id, consumedAllocationIds));
        }

        // 6. Create withdrawal record with allocation info including overage
        // Note: For admin manual withdrawals, overage is consumed with the allocation
        // (no overage recovery - admin chooses the withdrawal amount intentionally)
        const [withdrawal] = await tx.insert(withdrawals).values({
          orgId,
          amount,
          legacyAmount: legacyUsed,
          allocationAmount: allocationUsedCents,
          allocationAmountNano: allocationUsedNano.toString(),
          allocationOverageCents: allocationOverageCents,
          allocationOverageNano: allocationOverageNano.toString(),
          status: 'COMPLETED',
          requestedBy: userId,
          processedBy: userId,
          notes: notes || `Manual withdrawal created by admin${allocationOverageCents > 0 ? ` (consumed €${(allocationOverageCents / 100).toFixed(2)} additional from allocations)` : ''}`,
          requestedAt: new Date(date),
          processedAt: new Date(date),
        }).returning();

        // 7. Update consumed allocations with withdrawal reference
        if (consumedAllocationIds.length > 0) {
          await tx
            .update(trackRoyaltyAllocations)
            .set({ withdrawalId: withdrawal.id })
            .where(inArray(trackRoyaltyAllocations.id, consumedAllocationIds));
        }

        // 8. Deduct from organization balance
        await tx.update(organizations)
          .set({ balance: sql`${organizations.balance} - ${amount}` })
          .where(eq(organizations.id, orgId));

        return { withdrawal, consumedAllocations: consumedAllocationIds.length, legacyUsed, allocationUsedCents };
      });

      console.log(`[ADMIN FINANCE] Manual withdrawal created: ${result.withdrawal.id}, legacy=${result.legacyUsed}, allocations=${result.allocationUsedCents} (${result.consumedAllocations} items)`);

      res.json(result.withdrawal);
    } catch (error: any) {
      console.error("Error creating manual withdrawal:", error);
      if (error.message?.includes('Insufficient balance')) {
        return res.status(400).json({ error: error.message });
      }
      res.status(500).json({ message: "Failed to create manual withdrawal" });
    }
  });

  // Admin Finance: Update withdrawal status (approve/reject)
  app.patch('/api/admin/withdrawals/:id', isAuthenticated, async (req: any, res) => {
    try {
      const userId = getUserId(req.user as AuthenticatedUser);
      const currentUser = await storage.getUser(userId);
      
      if (!isPlatformOwner(currentUser)) {
        return res.status(403).json({ error: "Owner access required" });
      }

      const { id } = req.params;
      const { status, notes } = req.body;

      if (!['APPROVED', 'REJECTED', 'COMPLETED'].includes(status)) {
        return res.status(400).json({ error: "Invalid status" });
      }

      // First check if this is a curator withdrawal
      const [curatorWithdrawal] = await db
        .select()
        .from(curatorTransactions)
        .where(and(
          eq(curatorTransactions.id, id),
          eq(curatorTransactions.type, 'WITHDRAWAL')
        ));
      
      if (curatorWithdrawal) {
        // Handle curator withdrawal status update
        const newStatus = status === 'APPROVED' || status === 'COMPLETED' ? 'COMPLETED' : 
                          status === 'REJECTED' ? 'CANCELLED' : status;
        
        await db
          .update(curatorTransactions)
          .set({ 
            status: newStatus as any,
            processedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(curatorTransactions.id, id));
        
        // Get updated withdrawal for response
        const [updated] = await db
          .select()
          .from(curatorTransactions)
          .where(eq(curatorTransactions.id, id));
        
        return res.json({
          id: updated.id,
          status: updated.status === 'COMPLETED' ? 'APPROVED' : 
                  updated.status === 'CANCELLED' ? 'REJECTED' : updated.status,
          isCuratorWithdrawal: true,
        });
      }

      // Get the regular withdrawal first to check existence and org ownership
      const allOrgs = await storage.getAllOrganizations();
      let targetWithdrawal = null;
      
      for (const org of allOrgs) {
        const orgWithdrawals = await storage.getWithdrawals(org.id);
        const found = orgWithdrawals.find(w => w.id === id);
        if (found) {
          targetWithdrawal = { ...found, orgId: org.id };
          break;
        }
      }

      if (!targetWithdrawal) {
        return res.status(404).json({ error: "Withdrawal not found" });
      }

      // OPTION C OVERAGE HANDLING:
      // - On REJECTION: Refund balance AND release ALL allocations back to AVAILABLE
      // - On COMPLETION: Mark allocations as PAID
      //   - Note: Overage allocations stay RESERVED but will eventually become AVAILABLE
      //     when the withdrawal system evolves to support overage credits
      
      const { db: database } = await import("./db");
      const { trackRoyaltyAllocations, withdrawals: withdrawalsTable } = await import("@shared/schema");
      const { eq: eqFn, inArray } = await import("drizzle-orm");
      
      // ATOMIC TRANSACTION: All status updates, balance refunds, and allocation changes
      // happen together - either all succeed or all rollback
      // Lock order: organization -> withdrawal -> allocations (consistent with createWithdrawalWithSplits)
      await database.transaction(async (tx) => {
        // Lock organization row FIRST (consistent with other withdrawal flows)
        await tx
          .select()
          .from(organizations)
          .where(eqFn(organizations.id, targetWithdrawal.orgId))
          .for('update');
        
        // Lock the withdrawal row
        const [lockedWithdrawal] = await tx
          .select()
          .from(withdrawalsTable)
          .where(eqFn(withdrawalsTable.id, id))
          .for('update');
        
        if (!lockedWithdrawal) {
          throw new Error('Withdrawal not found during transaction');
        }
        
        if (status === 'REJECTED') {
          // Refund the amount back to organization balance (only if previously deducted)
          // Use targetWithdrawal.amount which is already in correct cents format from storage
          if (lockedWithdrawal.status === 'PENDING' || lockedWithdrawal.status === 'APPROVED') {
            await tx
              .update(organizations)
              .set({ balance: sql`${organizations.balance} + ${targetWithdrawal.amount}` })
              .where(eqFn(organizations.id, targetWithdrawal.orgId));
          }
          
          // Release ALL reserved allocations back to AVAILABLE
          // For old withdrawals (no allocations), this affects 0 rows - safe!
          await tx
            .update(trackRoyaltyAllocations)
            .set({ status: 'AVAILABLE', withdrawalId: null })
            .where(eqFn(trackRoyaltyAllocations.withdrawalId, id));
          
          console.log(`[WITHDRAWAL] Rejected withdrawal ${id}: refunded ${targetWithdrawal.amount} cents, released all allocations`);
        }
        
        if (status === 'COMPLETED') {
          // OPTION C: Only mark needed allocations as PAID, release overage to AVAILABLE
          // Use targetWithdrawal values which are in correct format from storage
          const overageCents = targetWithdrawal.allocationOverageCents || 0;
          const allocationAmount = targetWithdrawal.allocationAmount || 0;
          
          if (overageCents > 0 && allocationAmount > overageCents) {
            // Get all reserved allocations for this withdrawal (with lock)
            const reservedAllocations = await tx
              .select()
              .from(trackRoyaltyAllocations)
              .where(eqFn(trackRoyaltyAllocations.withdrawalId, id))
              .for('update');
            
            if (reservedAllocations.length > 0) {
              // Calculate how many cents should actually be PAID (total reserved minus overage)
              const centsToPay = allocationAmount - overageCents;
              
              // Sort allocations by amount DESCENDING (largest first)
              const sortedAllocations = [...reservedAllocations].sort((a, b) => 
                Number(b.shareAmount) - Number(a.shareAmount)
              );
              
              // Select allocations to mark as PAID until we reach centsToPay
              const toPay: string[] = [];
              const toRelease: string[] = [];
              
              // Work in nano-units for precision
              const nanoToPay = BigInt(centsToPay) * BigInt(100000000);
              let paidNano = BigInt(0);
              
              for (const alloc of sortedAllocations) {
                const allocNano = alloc.shareAmountNano 
                  ? BigInt(alloc.shareAmountNano)
                  : BigInt(Math.round(Number(alloc.shareAmount) * 10000000000));
                
                if (paidNano < nanoToPay) {
                  toPay.push(alloc.id);
                  paidNano += allocNano;
                } else {
                  toRelease.push(alloc.id);
                }
              }
              
              const paidSum = Number(paidNano / BigInt(100000000));
              
              // Mark needed allocations as PAID
              if (toPay.length > 0) {
                await tx
                  .update(trackRoyaltyAllocations)
                  .set({ status: 'PAID' })
                  .where(inArray(trackRoyaltyAllocations.id, toPay));
              }
              
              // Release overage allocations back to AVAILABLE
              if (toRelease.length > 0) {
                await tx
                  .update(trackRoyaltyAllocations)
                  .set({ status: 'AVAILABLE', withdrawalId: null })
                  .where(inArray(trackRoyaltyAllocations.id, toRelease));
              }
              
              const releasedCents = toRelease.reduce((sum, allocId) => {
                const alloc = reservedAllocations.find(a => a.id === allocId);
                const allocCents = alloc?.shareAmountNano 
                  ? Number(BigInt(alloc.shareAmountNano) / BigInt(100000000))
                  : Math.round(Number(alloc?.shareAmount || 0) * 100);
                return sum + allocCents;
              }, 0);
              
              console.log(`[WITHDRAWAL] Completed withdrawal ${id}: ${toPay.length} allocations PAID (${paidSum} cents), ${toRelease.length} allocations released (${releasedCents} cents)`);
            }
          } else {
            // No overage or edge case - simply mark all as PAID
            await tx
              .update(trackRoyaltyAllocations)
              .set({ status: 'PAID' })
              .where(eqFn(trackRoyaltyAllocations.withdrawalId, id));
            
            console.log(`[WITHDRAWAL] Completed withdrawal ${id}: marked all allocations as PAID (no overage or edge case)`);
          }
        }

        // Update the withdrawal status (inside the same transaction)
        await tx
          .update(withdrawalsTable)
          .set({
            status,
            notes,
            processedBy: userId,
            processedAt: new Date(),
          })
          .where(eqFn(withdrawalsTable.id, id));
      });

      // Fetch the updated withdrawal using storage helper to ensure correct format
      const updated = await storage.getWithdrawal(id);

      if (!updated) {
        return res.status(500).json({ error: "Failed to update withdrawal" });
      }

      res.json(updated);
    } catch (error) {
      console.error("Error updating withdrawal:", error);
      res.status(500).json({ message: "Failed to update withdrawal" });
    }
  });

  // Admin Finance: Edit withdrawal (full edit)
  app.put('/api/admin/withdrawals/:id', isAuthenticated, async (req: any, res) => {
    try {
      const userId = getUserId(req.user as AuthenticatedUser);
      const currentUser = await storage.getUser(userId);
      
      if (!isPlatformOwner(currentUser)) {
        return res.status(403).json({ error: "Owner access required" });
      }

      const { id } = req.params;
      const { amount, date, notes } = req.body;

      // Validate inputs
      if (!amount || amount <= 0) {
        return res.status(400).json({ error: "Valid amount is required" });
      }

      if (!date) {
        return res.status(400).json({ error: "Date is required" });
      }

      // Get the withdrawal to check existence and get orgId
      const allOrgs = await storage.getAllOrganizations();
      let targetWithdrawal = null;
      let orgId = null;
      
      for (const org of allOrgs) {
        const orgWithdrawals = await storage.getWithdrawals(org.id);
        const found = orgWithdrawals.find(w => w.id === id);
        if (found) {
          targetWithdrawal = found;
          orgId = org.id;
          break;
        }
      }

      if (!targetWithdrawal || !orgId) {
        return res.status(404).json({ error: "Withdrawal not found" });
      }

      const { db: database } = await import("./db");
      const { withdrawals, organizations } = await import("@shared/schema");
      const { eq } = await import("drizzle-orm");

      // Transaction to update withdrawal and adjust balance if amount changed
      const result = await database.transaction(async (tx) => {
        // Lock and re-fetch current withdrawal inside transaction to prevent race conditions
        const currentWithdrawals = await tx.execute(
          sql`SELECT * FROM withdrawals WHERE id = ${id} FOR UPDATE`
        );

        if (!currentWithdrawals.rows || currentWithdrawals.rows.length === 0) {
          throw new Error("Withdrawal no longer exists");
        }

        const currentWithdrawal = currentWithdrawals.rows[0] as any;
        const oldAmount = Number(currentWithdrawal.amount);
        const amountDifference = amount - oldAmount;

        // Update the withdrawal
        const [updated] = await tx
          .update(withdrawals)
          .set({
            amount,
            notes: notes || null,
            requestedAt: new Date(date),
            processedAt: new Date(date),
          })
          .where(eq(withdrawals.id, id))
          .returning();

        // Adjust organization balance if amount changed
        if (amountDifference !== 0) {
          await tx
            .update(organizations)
            .set({ balance: sql`${organizations.balance} - ${amountDifference}` })
            .where(eq(organizations.id, orgId));
        }

        return updated;
      });

      console.log(`[ADMIN FINANCE] Withdrawal ${id} updated successfully`);
      res.json(result);
    } catch (error: any) {
      console.error("Error editing withdrawal:", error);
      
      // Return specific error messages
      if (error.message?.includes('no longer exists')) {
        return res.status(404).json({ error: "Withdrawal no longer exists" });
      }
      if (error.message?.includes('Insufficient')) {
        return res.status(400).json({ error: error.message });
      }
      
      res.status(500).json({ error: "Failed to edit withdrawal", details: error.message });
    }
  });

  // Admin Finance: Delete withdrawal
  app.delete('/api/admin/withdrawals/:id', isAuthenticated, async (req: any, res) => {
    try {
      const userId = getUserId(req.user as AuthenticatedUser);
      const currentUser = await storage.getUser(userId);
      
      if (!isPlatformOwner(currentUser)) {
        return res.status(403).json({ error: "Owner access required" });
      }

      const { id } = req.params;

      // Get the withdrawal to check existence and get orgId + amount
      const allOrgs = await storage.getAllOrganizations();
      let targetWithdrawal = null;
      let orgId = null;
      
      for (const org of allOrgs) {
        const orgWithdrawals = await storage.getWithdrawals(org.id);
        const found = orgWithdrawals.find(w => w.id === id);
        if (found) {
          targetWithdrawal = found;
          orgId = org.id;
          break;
        }
      }

      if (!targetWithdrawal || !orgId) {
        return res.status(404).json({ error: "Withdrawal not found" });
      }

      // NOTE: COMPLETED withdrawals CAN be deleted for full rollback
      // This allows admins to correct errors by completely reversing a transaction
      // All linked allocations (RESERVED or PAID) will be returned to AVAILABLE

      const { db: database } = await import("./db");
      const { withdrawals, organizations, trackRoyaltyAllocations } = await import("@shared/schema");
      const { eq, and } = await import("drizzle-orm");

      // Transaction to delete withdrawal, refund balance, AND release allocations
      await database.transaction(async (tx) => {
        // Lock and re-fetch withdrawal inside transaction to get current amount
        const currentWithdrawals = await tx.execute(
          sql`SELECT * FROM withdrawals WHERE id = ${id} FOR UPDATE`
        );

        if (!currentWithdrawals.rows || currentWithdrawals.rows.length === 0) {
          throw new Error("Withdrawal no longer exists");
        }

        const currentWithdrawal = currentWithdrawals.rows[0] as any;
        const withdrawalAmount = Number(currentWithdrawal.amount);

        // FULL ROLLBACK: Release ALL allocations (RESERVED and PAID) back to AVAILABLE
        // This allows complete reversal of transactions for error correction
        const releaseResult = await tx
          .update(trackRoyaltyAllocations)
          .set({ status: 'AVAILABLE', withdrawalId: null })
          .where(eq(trackRoyaltyAllocations.withdrawalId, id));
        
        // Delete the withdrawal
        await tx.delete(withdrawals).where(eq(withdrawals.id, id));

        // Refund the amount back to organization balance using locked fresh data
        await tx
          .update(organizations)
          .set({ balance: sql`${organizations.balance} + ${withdrawalAmount}` })
          .where(eq(organizations.id, orgId));
      });

      console.log(`[ADMIN FINANCE] Withdrawal ${id} deleted successfully, balance refunded, allocations released`);
      res.json({ success: true, message: "Withdrawal deleted and balance refunded" });
    } catch (error: any) {
      console.error("Error deleting withdrawal:", error);
      
      // Return specific error messages with correct HTTP status codes
      if (error.message?.includes('no longer exists')) {
        return res.status(404).json({ error: "Withdrawal no longer exists" });
      }
      
      res.status(500).json({ error: "Failed to delete withdrawal", details: error.message });
    }
  });

  // TEST: Manual trigger for activating releases (admin only)
  app.post('/api/admin/activate-releases-now', isAuthenticated, async (req: any, res) => {
    try {
      const userId = getUserId(req.user as AuthenticatedUser);
      const currentUser = await storage.getUser(userId);
      
      if (!isPlatformAdmin(currentUser)) {
        return res.status(403).json({ error: "Admin access required" });
      }
      
      const { getKievDateString } = await import('./scheduledTasks');
      const todayKiev = getKievDateString();
      console.log(`📅 Manual activation: Today in Kiev timezone: ${todayKiev}`);
      
      // Get all organizations
      const orgs = await storage.getAllOrganizations();
      const deliveringReleases = [];
      
      for (const org of orgs) {
        const orgReleases = await storage.getReleases(org.id);
        const delivering = orgReleases.filter(r => r.status === 'DELIVERING');
        deliveringReleases.push(...delivering);
      }
      
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
        for (const release of releasesToActivate) {
          await storage.updateRelease(release.id, {
            status: 'ACTIVE',
            updatedAt: new Date()
          });
          
          console.log(`✅ Manually activated release: ${release.title} (ID: ${release.id})`);
        }
        
        res.json({ 
          message: `Successfully activated ${releasesToActivate.length} releases`,
          activated: releasesToActivate.map(r => ({ id: r.id, title: r.title, releaseDate: r.releaseDate })),
          todayKiev
        });
      } else {
        res.json({ 
          message: 'No releases to activate today',
          activated: [],
          todayKiev,
          deliveringCount: deliveringReleases.length
        });
      }
    } catch (error) {
      console.error("Error manually activating releases:", error);
      res.status(500).json({ message: "Failed to activate releases" });
    }
  });

  // TEST: Diagnostic endpoint for file download system
  app.get('/api/test/download-diagnostic/:fileId', isAuthenticated, async (req: any, res) => {
    try {
      const userId = getUserId(req.user as AuthenticatedUser);
      const user = await storage.getUser(userId);
      const { fileId } = req.params;
      
      const diagnostic: any = {
        timestamp: new Date().toISOString(),
        user: {
          id: userId,
          role: user?.role,
        },
        fileId,
        checks: {},
        errors: []
      };
      
      // Check 1: Can we access Google Drive?
      try {
        await googleDriveStorage.getFile(fileId);
        diagnostic.checks.googleDriveAccess = '✅ Can access Google Drive';
      } catch (error: any) {
        diagnostic.checks.googleDriveAccess = `❌ ${error.message}`;
        diagnostic.errors.push(`Google Drive: ${error.message}`);
      }
      
      // Check 2: User organizations (considers frozen status)
      const userOrgs = await getAccessibleOrganizations(user, userId, storage);
      diagnostic.checks.userOrganizations = `Found ${userOrgs.length} organizations`;
      
      // Check 3: File access rights
      let hasAccess = false;
      for (const org of userOrgs) {
        const releases = await storage.getReleases(org.id);
        const releaseWithFile = releases.find(r => r.artworkFileId === fileId);
        if (releaseWithFile) {
          hasAccess = true;
          diagnostic.checks.fileAccess = `✅ Access granted via release: ${releaseWithFile.title}`;
          break;
        }
        
        const allTracks = (await Promise.all(
          releases.map(release => storage.getTracks(release.id))
        )).flat();
        const trackWithFile = allTracks.find(t => t.audioFileId === fileId);
        if (trackWithFile) {
          hasAccess = true;
          diagnostic.checks.fileAccess = `✅ Access granted via track: ${trackWithFile.title}`;
          break;
        }
      }
      
      if (!hasAccess && user?.role !== 'ADMIN') {
        diagnostic.checks.fileAccess = '❌ No access to this file';
        diagnostic.errors.push('User does not have access to this file');
      } else if (user?.role === 'ADMIN') {
        diagnostic.checks.fileAccess = '✅ Admin has full access';
      }
      
      diagnostic.canDownload = diagnostic.errors.length === 0;
      
      res.json(diagnostic);
    } catch (error: any) {
      console.error('Diagnostic error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Test endpoint to verify notification systems (email + Telegram)
  app.post('/api/test-notifications', isAuthenticated, async (req, res) => {
    try {
      const user = req.user as User;
      
      // Only admins can test notifications
      if (user.role !== 'ADMIN') {
        return res.status(403).json({ error: 'Only admins can test notifications' });
      }

      const testTitle = "🧪 Тестове сповіщення";
      const testMessage = `Це тестове повідомлення від ${user.email} о ${new Date().toLocaleString('uk-UA')}`;

      console.log('[TEST] Sending test notifications...');

      // Test email notification with English subject
      const { sendNotificationEmail } = await import("./googleMail");
      void sendNotificationEmail(testTitle, testMessage, "RELEASE_CREATED").catch(err => {
        console.error('[EMAIL] Failed to send test notification:', err);
      });

      // Test Telegram notification
      const { sendTelegramNotification } = await import("./telegram");
      void sendTelegramNotification(testTitle, testMessage).catch(err => {
        console.error('[TELEGRAM] Failed to send test notification:', err);
      });

      res.json({ 
        success: true, 
        message: 'Test notifications sent (check logs for confirmation)' 
      });
    } catch (error: any) {
      console.error('[TEST] Error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Platform Analytics (all platform admins - Users tab is accessible to all)
  app.get('/api/admin/platform-analytics', isAuthenticated, async (req: any, res) => {
    try {
      const userId = getUserId(req.user as AuthenticatedUser);
      const currentUser = await storage.getUser(userId);
      
      if (!isPlatformAdmin(currentUser)) {
        return res.status(403).json({ error: "Admin access required" });
      }

      const { startDate: startDateParam, endDate: endDateParam } = req.query;
      
      let periodStart: Date;
      let periodEnd: Date;
      
      if (startDateParam && endDateParam) {
        periodStart = new Date(startDateParam as string);
        periodStart.setHours(0, 0, 0, 0);
        periodEnd = new Date(endDateParam as string);
        periodEnd.setHours(23, 59, 59, 999);
      } else {
        periodEnd = new Date();
        periodEnd.setHours(23, 59, 59, 999);
        periodStart = new Date();
        periodStart.setDate(periodStart.getDate() - 30);
        periodStart.setHours(0, 0, 0, 0);
      }

      // Helper to fill missing dates with zeros
      const fillMissingDates = (data: Array<{ date: string; count: number }>, startDate: Date, endDate: Date) => {
        const dateMap = new Map(data.map(d => [d.date, d.count]));
        const result: Array<{ date: string; count: number }> = [];
        const current = new Date(startDate);
        current.setHours(0, 0, 0, 0);
        const end = new Date(endDate);
        end.setHours(0, 0, 0, 0);
        
        while (current <= end) {
          const dateStr = current.toISOString().split('T')[0];
          result.push({
            date: dateStr,
            count: dateMap.get(dateStr) || 0
          });
          current.setDate(current.getDate() + 1);
        }
        return result;
      };
      
      // Total users (exclude platform admins)
      const [totalUsersResult] = await db.select({ count: count() })
        .from(users)
        .where(isNull(users.platformRole));
      const totalUsers = totalUsersResult.count;

      // New users in period
      const [newUsersResult] = await db.select({ count: count() })
        .from(users)
        .where(and(
          isNull(users.platformRole),
          gte(users.createdAt, periodStart),
          lte(users.createdAt, periodEnd)
        ));
      const newUsers = newUsersResult.count;

      // Users by day for chart
      const usersByDay = await db.select({
        date: sql<string>`DATE(${users.createdAt})`,
        count: count()
      })
        .from(users)
        .where(and(
          isNull(users.platformRole),
          gte(users.createdAt, periodStart),
          lte(users.createdAt, periodEnd)
        ))
        .groupBy(sql`DATE(${users.createdAt})`)
        .orderBy(sql`DATE(${users.createdAt})`);

      // Total releases - filter by date range if dates are provided
      const hasDateFilter = !!(startDateParam && endDateParam);
      const [totalReleasesResult] = hasDateFilter 
        ? await db.select({ count: count() })
            .from(releases)
            .where(and(
              gte(releases.createdAt, periodStart),
              lte(releases.createdAt, periodEnd)
            ))
        : await db.select({ count: count() })
            .from(releases);
      const totalReleases = totalReleasesResult.count;

      // Total music videos - filter by date range if dates are provided
      const [totalVideosResult] = hasDateFilter
        ? await db.select({ count: count() })
            .from(musicVideos)
            .where(and(
              gte(musicVideos.createdAt, periodStart),
              lte(musicVideos.createdAt, periodEnd)
            ))
        : await db.select({ count: count() })
            .from(musicVideos);
      const totalVideos = totalVideosResult.count;

      // Releases by day
      const releasesByDay = await db.select({
        date: sql<string>`DATE(${releases.createdAt})`,
        count: count()
      })
        .from(releases)
        .where(and(
          gte(releases.createdAt, periodStart),
          lte(releases.createdAt, periodEnd)
        ))
        .groupBy(sql`DATE(${releases.createdAt})`)
        .orderBy(sql`DATE(${releases.createdAt})`);

      // Videos by day
      const videosByDay = await db.select({
        date: sql<string>`DATE(${musicVideos.createdAt})`,
        count: count()
      })
        .from(musicVideos)
        .where(and(
          gte(musicVideos.createdAt, periodStart),
          lte(musicVideos.createdAt, periodEnd)
        ))
        .groupBy(sql`DATE(${musicVideos.createdAt})`)
        .orderBy(sql`DATE(${musicVideos.createdAt})`);

      // Pitching stats - filter by date range if dates are provided
      const [totalPitchingResult] = hasDateFilter
        ? await db.select({ count: count() })
            .from(pitchingSubmissions)
            .where(and(
              gte(pitchingSubmissions.createdAt, periodStart),
              lte(pitchingSubmissions.createdAt, periodEnd)
            ))
        : await db.select({ count: count() })
            .from(pitchingSubmissions);
      const totalPitching = totalPitchingResult.count;

      const pitchingByStatus = hasDateFilter
        ? await db.select({
            status: pitchingSubmissions.status,
            count: count()
          })
            .from(pitchingSubmissions)
            .where(and(
              gte(pitchingSubmissions.createdAt, periodStart),
              lte(pitchingSubmissions.createdAt, periodEnd)
            ))
            .groupBy(pitchingSubmissions.status)
        : await db.select({
            status: pitchingSubmissions.status,
            count: count()
          })
            .from(pitchingSubmissions)
            .groupBy(pitchingSubmissions.status);

      // Organizations without agreement (all members must accept)
      const allOrgs = await db.select({
        id: organizations.id,
        name: organizations.name,
        type: organizations.type,
        createdAt: organizations.createdAt
      }).from(organizations);

      const orgsWithoutAgreement = [];
      for (const org of allOrgs) {
        const members = await db.select({
          userId: orgMembers.userId,
          agreementAccepted: users.agreementAccepted
        })
          .from(orgMembers)
          .leftJoin(users, eq(orgMembers.userId, users.id))
          .where(eq(orgMembers.orgId, org.id));
        
        // Include if: no members OR any member hasn't accepted
        if (members.length === 0 || members.some((m: any) => !m.agreementAccepted)) {
          orgsWithoutAgreement.push(org);
        }
      }

      // Organizations without social media
      const orgsWithoutSocial = await db.select({
        id: organizations.id,
        name: organizations.name,
        type: organizations.type,
        createdAt: organizations.createdAt
      })
        .from(organizations)
        .where(and(
          or(isNull(organizations.spotifyUrl), eq(organizations.spotifyUrl, '')),
          or(isNull(organizations.appleMusicUrl), eq(organizations.appleMusicUrl, '')),
          or(isNull(organizations.youtubeUrl), eq(organizations.youtubeUrl, '')),
          or(isNull(organizations.instagramUrl), eq(organizations.instagramUrl, '')),
          or(isNull(organizations.tiktokUrl), eq(organizations.tiktokUrl, ''))
        ));

      // Social media stats (count only non-empty, non-null URLs)
      const allOrgsForSocial = await db.select({
        spotifyUrl: organizations.spotifyUrl,
        appleMusicUrl: organizations.appleMusicUrl,
        youtubeUrl: organizations.youtubeUrl,
        instagramUrl: organizations.instagramUrl,
        tiktokUrl: organizations.tiktokUrl,
      }).from(organizations);

      const spotifyCount = allOrgsForSocial.filter(o => o.spotifyUrl && o.spotifyUrl.trim() !== '').length;
      const appleMusicCount = allOrgsForSocial.filter(o => o.appleMusicUrl && o.appleMusicUrl.trim() !== '').length;
      const youtubeCount = allOrgsForSocial.filter(o => o.youtubeUrl && o.youtubeUrl.trim() !== '').length;
      const instagramCount = allOrgsForSocial.filter(o => o.instagramUrl && o.instagramUrl.trim() !== '').length;
      const tiktokCount = allOrgsForSocial.filter(o => o.tiktokUrl && o.tiktokUrl.trim() !== '').length;

      // Organizations without any releases
      const orgsWithReleases = await db.selectDistinct({ orgId: releases.orgId }).from(releases);
      const orgIdsWithReleases = new Set(orgsWithReleases.map(r => r.orgId));
      const orgsWithoutReleases = allOrgs.filter(org => !orgIdsWithReleases.has(org.id));

      // Daily Active Users (DAU) - count unique users per day
      const periodStartStr = periodStart.toISOString().split('T')[0];
      const periodEndStr = periodEnd.toISOString().split('T')[0];
      const dauByDay = await db.select({
        date: userActivity.date,
        count: count()
      })
        .from(userActivity)
        .where(and(
          gte(userActivity.date, periodStartStr),
          lte(userActivity.date, periodEndStr)
        ))
        .groupBy(userActivity.date)
        .orderBy(userActivity.date);

      // Average session duration per day (in minutes)
      const sessionDurations = await db.select({
        date: userActivity.date,
        avgDuration: sql<number>`AVG(EXTRACT(EPOCH FROM (${userActivity.lastActivity} - ${userActivity.sessionStart})) / 60)`,
      })
        .from(userActivity)
        .where(and(
          gte(userActivity.date, periodStartStr),
          lte(userActivity.date, periodEndStr)
        ))
        .groupBy(userActivity.date)
        .orderBy(userActivity.date);

      // Fill missing dates with zeros for all charts
      const filledUsersByDay = fillMissingDates(usersByDay, periodStart, periodEnd);
      const filledReleasesByDay = fillMissingDates(releasesByDay, periodStart, periodEnd);
      const filledVideosByDay = fillMissingDates(videosByDay, periodStart, periodEnd);
      const filledDauByDay = fillMissingDates(dauByDay, periodStart, periodEnd);
      
      // Fill session durations (convert avgDuration to count format for consistency)
      const sessionDurationMap = new Map(sessionDurations.map(d => [d.date, Math.round(Number(d.avgDuration) || 0)]));
      const filledSessionDurations: Array<{ date: string; duration: number }> = [];
      const currentDate = new Date(periodStart);
      currentDate.setHours(0, 0, 0, 0);
      const endDateLoop = new Date(periodEnd);
      endDateLoop.setHours(0, 0, 0, 0);
      while (currentDate <= endDateLoop) {
        const dateStr = currentDate.toISOString().split('T')[0];
        filledSessionDurations.push({
          date: dateStr,
          duration: sessionDurationMap.get(dateStr) || 0
        });
        currentDate.setDate(currentDate.getDate() + 1);
      }

      res.json({
        users: {
          total: totalUsers,
          new: newUsers,
          byDay: filledUsersByDay
        },
        activity: {
          dauByDay: filledDauByDay,
          sessionDurationByDay: filledSessionDurations
        },
        content: {
          totalReleases,
          totalVideos,
          releasesByDay: filledReleasesByDay,
          videosByDay: filledVideosByDay
        },
        pitching: {
          total: totalPitching,
          byStatus: pitchingByStatus
        },
        agreements: {
          withoutAgreement: orgsWithoutAgreement,
          withAgreement: Math.max(0, allOrgs.length - orgsWithoutAgreement.length)
        },
        socialMedia: {
          withoutAny: orgsWithoutSocial,
          spotify: spotifyCount,
          appleMusic: appleMusicCount,
          youtube: youtubeCount,
          instagram: instagramCount,
          tiktok: tiktokCount
        },
        releases: {
          withoutReleases: orgsWithoutReleases
        }
      });
    } catch (error: any) {
      console.error("Error fetching platform analytics:", error);
      res.status(500).json({ error: "Failed to fetch platform analytics" });
    }
  });

  // Platform Revenue (PLATFORM_OWNER only)
  app.get('/api/admin/platform-revenue', isAuthenticated, async (req: any, res) => {
    try {
      const userId = getUserId(req.user as AuthenticatedUser);
      const currentUser = await storage.getUser(userId);
      
      if (currentUser?.platformRole !== 'PLATFORM_OWNER') {
        return res.status(403).json({ error: "Platform Owner access required" });
      }

      const { startDate: startDateParam, endDate: endDateParam } = req.query;
      
      // Create date range from ISO date strings
      const startDate = new Date(startDateParam as string);
      startDate.setHours(0, 0, 0, 0);
      const endDate = new Date(endDateParam as string);
      endDate.setHours(23, 59, 59, 999);

      // Get paid releases within period
      const paidReleases = await db.select({
        id: releases.id,
        type: releases.type,
        paymentStatus: releases.paymentStatus,
        paymentAmount: releases.paymentAmount,
        paidAt: releases.paidAt,
      })
        .from(releases)
        .where(and(
          eq(releases.paymentStatus, 'PAID'),
          gte(releases.paidAt, startDate),
          sql`${releases.paidAt} <= ${endDate}`
        ));

      // Get paid music videos within period
      const paidVideos = await db.select({
        id: musicVideos.id,
        paymentStatus: musicVideos.paymentStatus,
        paymentAmount: musicVideos.paymentAmount,
        paidAt: musicVideos.paidAt,
      })
        .from(musicVideos)
        .where(and(
          eq(musicVideos.paymentStatus, 'PAID'),
          gte(musicVideos.paidAt, startDate),
          sql`${musicVideos.paidAt} <= ${endDate}`
        ));

      // Get paid YouTube Ads campaigns within period
      const paidYoutubeAds = await db.select({
        id: youtubeAdCampaigns.id,
        budget: youtubeAdCampaigns.budget,
        paymentStatus: youtubeAdCampaigns.paymentStatus,
        paidAt: youtubeAdCampaigns.paidAt,
      })
        .from(youtubeAdCampaigns)
        .where(and(
          eq(youtubeAdCampaigns.paymentStatus, 'PAID'),
          gte(youtubeAdCampaigns.paidAt, startDate),
          sql`${youtubeAdCampaigns.paidAt} <= ${endDate}`
        ));

      // Get paid playlist pitching applications within period
      const paidPlaylists = await db.select({
        id: pitchingApplications.id,
        paidAmount: pitchingApplications.paidAmount,
        paymentStatus: pitchingApplications.paymentStatus,
        updatedAt: pitchingApplications.updatedAt,
      })
        .from(pitchingApplications)
        .where(and(
          eq(pitchingApplications.paymentStatus, 'PAID'),
          gte(pitchingApplications.updatedAt, startDate),
          sql`${pitchingApplications.updatedAt} <= ${endDate}`
        ));

      // Count by type
      const singlesCount = paidReleases.filter(r => r.type === 'SINGLE').length;
      const albumsCount = paidReleases.filter(r => r.type === 'ALBUM' || r.type === 'EP').length;
      const videosCount = paidVideos.length;
      const youtubeAdsCount = paidYoutubeAds.length;
      const playlistsCount = paidPlaylists.length;

      // Calculate revenue from ACTUAL payment amounts (stored in kopecks)
      // Fallback to default prices for legacy records without paymentAmount
      // Default: Singles 1000 UAH (100000 kopecks), Albums 2000 UAH (200000 kopecks), Videos 1000 UAH (100000 kopecks)
      const DEFAULT_SINGLE_PRICE = 100000; // 1000 UAH in kopecks
      const DEFAULT_ALBUM_PRICE = 200000;  // 2000 UAH in kopecks
      const DEFAULT_VIDEO_PRICE = 100000;  // 1000 UAH in kopecks
      
      const singlesRevenue = paidReleases
        .filter(r => r.type === 'SINGLE')
        .reduce((sum, r) => sum + (r.paymentAmount ?? DEFAULT_SINGLE_PRICE), 0);
      const albumsRevenue = paidReleases
        .filter(r => r.type === 'ALBUM' || r.type === 'EP')
        .reduce((sum, r) => sum + (r.paymentAmount ?? DEFAULT_ALBUM_PRICE), 0);
      const videosRevenue = paidVideos
        .reduce((sum, v) => sum + (v.paymentAmount ?? DEFAULT_VIDEO_PRICE), 0);
      // Playlists: paidAmount is stored in base currency (UAH), convert to kopecks
      const playlistsRevenue = paidPlaylists
        .reduce((sum, p) => sum + ((p.paidAmount ?? 0) * 100), 0);
      // YouTube Ads: budget is in USD, convert to UAH kopecks using Wayforpay rate
      const { getExchangeRate } = await import('./currencyService');
      const usdToUahRate = await getExchangeRate('USD', 'UAH');
      const youtubeAdsRevenue = paidYoutubeAds.reduce((sum, ad) => sum + Math.round(ad.budget * usdToUahRate * 100), 0);
      const totalRevenue = singlesRevenue + albumsRevenue + videosRevenue + playlistsRevenue + youtubeAdsRevenue;

      res.json({
        period: { startDate: startDateParam, endDate: endDateParam },
        revenue: {
          total: totalRevenue,
          singles: { count: singlesCount, amount: singlesRevenue },
          albums: { count: albumsCount, amount: albumsRevenue },
          videos: { count: videosCount, amount: videosRevenue },
          playlists: { count: playlistsCount, amount: playlistsRevenue },
          youtubeAds: { count: youtubeAdsCount, amount: youtubeAdsRevenue }
        }
      });
    } catch (error: any) {
      console.error("Error fetching platform revenue:", error);
      res.status(500).json({ error: "Failed to fetch platform revenue" });
    }
  });

  // Platform Revenue Transactions - detailed list of all paid releases and videos
  app.get('/api/admin/platform-revenue/transactions', isAuthenticated, async (req: any, res) => {
    try {
      const userId = getUserId(req.user as AuthenticatedUser);
      const currentUser = await storage.getUser(userId);
      
      if (currentUser?.platformRole !== 'PLATFORM_OWNER') {
        return res.status(403).json({ error: "Platform Owner access required" });
      }

      const { startDate: startDateParam, endDate: endDateParam } = req.query;
      
      const startDate = new Date(startDateParam as string);
      startDate.setHours(0, 0, 0, 0);
      const endDate = new Date(endDateParam as string);
      endDate.setHours(23, 59, 59, 999);

      // Get paid releases with organization info
      const paidReleasesData = await db.select({
        id: releases.id,
        title: releases.title,
        type: releases.type,
        paidAt: releases.paidAt,
        paymentAmount: releases.paymentAmount,
        orgId: releases.orgId,
      })
        .from(releases)
        .where(and(
          eq(releases.paymentStatus, 'PAID'),
          gte(releases.paidAt, startDate),
          sql`${releases.paidAt} <= ${endDate}`
        ))
        .orderBy(sql`${releases.paidAt} DESC`);

      // Get paid music videos with organization info
      const paidVideosData = await db.select({
        id: musicVideos.id,
        title: musicVideos.title,
        paidAt: musicVideos.paidAt,
        paymentAmount: musicVideos.paymentAmount,
        orgId: musicVideos.orgId,
      })
        .from(musicVideos)
        .where(and(
          eq(musicVideos.paymentStatus, 'PAID'),
          gte(musicVideos.paidAt, startDate),
          sql`${musicVideos.paidAt} <= ${endDate}`
        ))
        .orderBy(sql`${musicVideos.paidAt} DESC`);

      // Get paid YouTube Ads campaigns with organization info
      const paidYoutubeAdsData = await db.select({
        id: youtubeAdCampaigns.id,
        videoUrl: youtubeAdCampaigns.videoUrl,
        budget: youtubeAdCampaigns.budget,
        paidAt: youtubeAdCampaigns.paidAt,
        orgId: youtubeAdCampaigns.orgId,
      })
        .from(youtubeAdCampaigns)
        .where(and(
          eq(youtubeAdCampaigns.paymentStatus, 'PAID'),
          gte(youtubeAdCampaigns.paidAt, startDate),
          sql`${youtubeAdCampaigns.paidAt} <= ${endDate}`
        ))
        .orderBy(sql`${youtubeAdCampaigns.paidAt} DESC`);

      // Get organization names
      const orgIds = [...new Set([
        ...paidReleasesData.map(r => r.orgId),
        ...paidVideosData.map(v => v.orgId),
        ...paidYoutubeAdsData.map(a => a.orgId)
      ])];
      
      const orgsData = orgIds.length > 0 ? await db.select({
        id: organizations.id,
        name: organizations.name,
      })
        .from(organizations)
        .where(sql`${organizations.id} IN (${sql.raw(orgIds.map(id => `'${id}'`).join(','))})`) : [];
      
      const orgMap = new Map(orgsData.map(o => [o.id, o.name]));

      // USD to UAH conversion rate from Wayforpay
      const { getExchangeRate } = await import('./currencyService');
      const usdToUahRate = await getExchangeRate('USD', 'UAH');
      
      // Fallback prices for legacy records without paymentAmount
      const DEFAULT_SINGLE_PRICE = 100000; // 1000 UAH in kopecks
      const DEFAULT_ALBUM_PRICE = 200000;  // 2000 UAH in kopecks
      const DEFAULT_VIDEO_PRICE = 100000;  // 1000 UAH in kopecks

      // Build transactions list with ACTUAL payment amounts (fallback for legacy)
      const transactions = [
        ...paidReleasesData.map(r => ({
          id: r.id,
          type: r.type === 'SINGLE' ? 'single' : 'album',
          title: r.title,
          paidAt: r.paidAt,
          amount: r.paymentAmount ?? (r.type === 'SINGLE' ? DEFAULT_SINGLE_PRICE : DEFAULT_ALBUM_PRICE),
          organizationName: orgMap.get(r.orgId) || 'Unknown'
        })),
        ...paidVideosData.map(v => ({
          id: v.id,
          type: 'video',
          title: v.title,
          paidAt: v.paidAt,
          amount: v.paymentAmount ?? DEFAULT_VIDEO_PRICE,
          organizationName: orgMap.get(v.orgId) || 'Unknown'
        })),
        ...paidYoutubeAdsData.map(a => ({
          id: a.id,
          type: 'youtubeAds',
          title: `YouTube Ads: $${a.budget}`,
          paidAt: a.paidAt,
          amount: Math.round(a.budget * usdToUahRate * 100),
          organizationName: orgMap.get(a.orgId) || 'Unknown'
        }))
      ].sort((a, b) => new Date(b.paidAt!).getTime() - new Date(a.paidAt!).getTime());

      res.json({ transactions });
    } catch (error: any) {
      console.error("Error fetching platform revenue transactions:", error);
      res.status(500).json({ error: "Failed to fetch platform revenue transactions" });
    }
  });

  // Currency Rates (PLATFORM_OWNER only)
  app.get('/api/admin/currency-rates', isAuthenticated, async (req: any, res) => {
    try {
      const userId = getUserId(req.user as AuthenticatedUser);
      const currentUser = await storage.getUser(userId);
      
      if (currentUser?.platformRole !== 'PLATFORM_OWNER') {
        return res.status(403).json({ error: "Platform Owner access required" });
      }

      const { getCurrencyRates, getDisplayRates } = await import('./currencyService');
      const { rates, fetchedAt, ratesDate } = await getCurrencyRates();
      const displayRates = getDisplayRates(rates);

      res.json({
        rates: displayRates,
        ratesDate,
        fetchedAt: new Date(fetchedAt).toISOString(),
        source: 'wayforpay'
      });
    } catch (error: any) {
      console.error("Error fetching currency rates:", error);
      res.status(500).json({ error: "Failed to fetch currency rates" });
    }
  });

  // Platform Expenses CRUD (PLATFORM_OWNER only)
  
  // Get all expenses for period
  app.get('/api/admin/platform-expenses', isAuthenticated, async (req: any, res) => {
    try {
      const userId = getUserId(req.user as AuthenticatedUser);
      const currentUser = await storage.getUser(userId);
      
      if (currentUser?.platformRole !== 'PLATFORM_OWNER') {
        return res.status(403).json({ error: "Platform Owner access required" });
      }

      const { startDate: startDateParam, endDate: endDateParam } = req.query;
      
      const startDate = new Date(startDateParam as string);
      startDate.setHours(0, 0, 0, 0);
      const endDate = new Date(endDateParam as string);
      endDate.setHours(23, 59, 59, 999);

      const expenses = await db.select()
        .from(platformExpenses)
        .where(and(
          gte(platformExpenses.expenseDate, startDate),
          sql`${platformExpenses.expenseDate} <= ${endDate}`
        ))
        .orderBy(sql`${platformExpenses.expenseDate} DESC`);

      // Get creator names and organization names
      const expensesWithDetails = await Promise.all(expenses.map(async (expense) => {
        const creator = await storage.getUser(expense.createdBy);
        let organizationName = null;
        if (expense.organizationId) {
          const org = await storage.getOrganization(expense.organizationId);
          organizationName = org?.name || null;
        }
        return {
          ...expense,
          creatorName: creator ? `${creator.firstName} ${creator.lastName}` : 'Unknown',
          organizationName
        };
      }));

      res.json(expensesWithDetails);
    } catch (error: any) {
      console.error("Error fetching platform expenses:", error);
      res.status(500).json({ error: "Failed to fetch platform expenses" });
    }
  });

  // Create expense
  app.post('/api/admin/platform-expenses', isAuthenticated, async (req: any, res) => {
    try {
      const userId = getUserId(req.user as AuthenticatedUser);
      const currentUser = await storage.getUser(userId);
      
      if (currentUser?.platformRole !== 'PLATFORM_OWNER') {
        return res.status(403).json({ error: "Platform Owner access required" });
      }

      const validatedData = insertPlatformExpenseSchema.parse({
        ...req.body,
        createdBy: userId,
        expenseDate: new Date(req.body.expenseDate)
      });

      const [newExpense] = await db.insert(platformExpenses)
        .values(validatedData)
        .returning();

      res.status(201).json(newExpense);
    } catch (error: any) {
      console.error("Error creating platform expense:", error);
      if (error.name === 'ZodError') {
        return res.status(400).json({ error: "Invalid expense data", details: error.errors });
      }
      res.status(500).json({ error: "Failed to create expense" });
    }
  });

  // Update expense
  app.put('/api/admin/platform-expenses/:id', isAuthenticated, async (req: any, res) => {
    try {
      const userId = getUserId(req.user as AuthenticatedUser);
      const currentUser = await storage.getUser(userId);
      
      if (currentUser?.platformRole !== 'PLATFORM_OWNER') {
        return res.status(403).json({ error: "Platform Owner access required" });
      }

      const { id } = req.params;
      const { type, category, amount, comment, expenseDate, organizationId } = req.body;

      const [updatedExpense] = await db.update(platformExpenses)
        .set({
          type: type || 'EXPENSE',
          category,
          amount,
          comment,
          organizationId: organizationId || null,
          expenseDate: new Date(expenseDate),
          updatedAt: new Date()
        })
        .where(eq(platformExpenses.id, id))
        .returning();

      if (!updatedExpense) {
        return res.status(404).json({ error: "Expense not found" });
      }

      res.json(updatedExpense);
    } catch (error: any) {
      console.error("Error updating platform expense:", error);
      res.status(500).json({ error: "Failed to update expense" });
    }
  });

  // Delete expense
  app.delete('/api/admin/platform-expenses/:id', isAuthenticated, async (req: any, res) => {
    try {
      const userId = getUserId(req.user as AuthenticatedUser);
      const currentUser = await storage.getUser(userId);
      
      if (currentUser?.platformRole !== 'PLATFORM_OWNER') {
        return res.status(403).json({ error: "Platform Owner access required" });
      }

      const { id } = req.params;

      const [deletedExpense] = await db.delete(platformExpenses)
        .where(eq(platformExpenses.id, id))
        .returning();

      if (!deletedExpense) {
        return res.status(404).json({ error: "Expense not found" });
      }

      res.json({ success: true });
    } catch (error: any) {
      console.error("Error deleting platform expense:", error);
      res.status(500).json({ error: "Failed to delete expense" });
    }
  });

  // Get platform setting by key
  app.get('/api/admin/platform-settings/:key', isAuthenticated, async (req: any, res) => {
    try {
      const userId = getUserId(req.user as AuthenticatedUser);
      const currentUser = await storage.getUser(userId);
      
      if (currentUser?.platformRole !== 'PLATFORM_OWNER') {
        return res.status(403).json({ error: "Platform Owner access required" });
      }

      const { key } = req.params;

      const [setting] = await db.select()
        .from(platformSettings)
        .where(eq(platformSettings.key, key));

      if (!setting) {
        return res.json({ key, value: null });
      }

      res.json({ key: setting.key, value: JSON.parse(setting.value) });
    } catch (error: any) {
      console.error("Error fetching platform setting:", error);
      res.status(500).json({ error: "Failed to fetch platform setting" });
    }
  });

  // Set platform setting by key
  app.put('/api/admin/platform-settings/:key', isAuthenticated, async (req: any, res) => {
    try {
      const userId = getUserId(req.user as AuthenticatedUser);
      const currentUser = await storage.getUser(userId);
      
      if (currentUser?.platformRole !== 'PLATFORM_OWNER') {
        return res.status(403).json({ error: "Platform Owner access required" });
      }

      const { key } = req.params;
      const { value } = req.body;

      if (value === undefined) {
        return res.status(400).json({ error: "Value is required" });
      }

      const serializedValue = JSON.stringify(value);

      // Upsert the setting
      const [existingSetting] = await db.select()
        .from(platformSettings)
        .where(eq(platformSettings.key, key));

      if (existingSetting) {
        const [updatedSetting] = await db.update(platformSettings)
          .set({
            value: serializedValue,
            updatedBy: userId,
            updatedAt: new Date()
          })
          .where(eq(platformSettings.key, key))
          .returning();
        res.json({ key: updatedSetting.key, value: JSON.parse(updatedSetting.value) });
      } else {
        const [newSetting] = await db.insert(platformSettings)
          .values({
            key,
            value: serializedValue,
            updatedBy: userId
          })
          .returning();
        res.json({ key: newSetting.key, value: JSON.parse(newSetting.value) });
      }
    } catch (error: any) {
      console.error("Error setting platform setting:", error);
      res.status(500).json({ error: "Failed to save platform setting" });
    }
  });

  // Serve uploaded files (legacy local storage support)
  const express = await import('express');
  const path = await import('path');
  app.use('/uploads', express.default.static(path.join(process.cwd(), 'uploads')));

  // =============================================
  // HOLIDAY GIFT HUNT SYSTEM
  // =============================================
  
  const HOLIDAY_HUNT_ENABLED = false;
  const HOLIDAY_SEASON_ID = "2024-christmas";
  const HOLIDAY_TEST_EMAILS = ["muzika.ua.info@gmail.com"];
  
  // Placement locations for gifts
  const GIFT_PLACEMENTS = [
    { id: "dashboard-stats", page: "/", description: "Dashboard stats area" },
    { id: "catalog-header", page: "/catalog", description: "Catalog header" },
    { id: "release-details", page: "/releases/*", description: "Release details page" },
    { id: "analytics-header", page: "/analytics", description: "Analytics header" },
    { id: "finance-header", page: "/finance", description: "Finance header" },
    { id: "reports-header", page: "/reports", description: "Reports header" },
    { id: "settings-banner", page: "/settings", description: "Settings banner" },
    { id: "pitching-header", page: "/pitching", description: "Pitching header" },
    { id: "ads-header", page: "/ads", description: "Ads header" },
    { id: "dashboard-releases", page: "/", description: "Dashboard recent releases" },
  ];

  // Deterministic hash function for consistent randomization
  function hashOrgId(orgId: string, salt: string): number {
    let hash = 0;
    const str = orgId + salt;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return Math.abs(hash);
  }

  // GET /api/holiday-gift - Get or create gift assignment for current organization
  app.get('/api/holiday-gift', isAuthenticated, async (req: any, res) => {
    try {
      if (!HOLIDAY_HUNT_ENABLED) {
        return res.json({ enabled: false });
      }

      const userId = getUserId(req.user as AuthenticatedUser);
      const currentUser = await storage.getUser(userId);
      
      if (!currentUser) {
        return res.status(401).json({ error: "User not found" });
      }

      // TEST MODE: For test emails, always return unclaimed gift for testing
      if (HOLIDAY_TEST_EMAILS.includes(currentUser.email)) {
        const testPlacementIndex = Math.floor(Date.now() / 60000) % GIFT_PLACEMENTS.length; // Changes every minute
        const testPlacement = GIFT_PLACEMENTS[testPlacementIndex];
        return res.json({
          enabled: true,
          hasGift: true,
          claimed: false,
          testMode: true,
          assignment: {
            id: "test-assignment-id",
            placementId: testPlacement.id,
            claimedAt: null,
          },
          prize: {
            id: "test-prize-id",
            name: "Тестовий подарунок",
            description: "Це тестовий режим для перевірки функціоналу. Подарунок змінюється кожну хвилину.",
          },
        });
      }

      // Get user's organization
      const userOrgs = await storage.getUserOrganizations(userId);
      if (!userOrgs || userOrgs.length === 0) {
        return res.json({ enabled: true, hasGift: false, reason: "no_organization" });
      }

      const orgId = userOrgs[0].id;

      // Check if already has an assignment for this season
      const [existingAssignment] = await db.select()
        .from(holidayGiftAssignments)
        .where(and(
          eq(holidayGiftAssignments.organizationId, orgId),
          eq(holidayGiftAssignments.seasonId, HOLIDAY_SEASON_ID)
        ));

      if (existingAssignment) {
        // Already assigned - return the assignment
        const [prize] = await db.select()
          .from(holidayGiftPrizes)
          .where(eq(holidayGiftPrizes.id, existingAssignment.prizeId));

        return res.json({
          enabled: true,
          hasGift: true,
          claimed: !!existingAssignment.claimedAt,
          assignment: {
            id: existingAssignment.id,
            placementId: existingAssignment.placementId,
            claimedAt: existingAssignment.claimedAt,
          },
          prize: prize ? {
            id: prize.id,
            name: prize.name,
            description: prize.description,
          } : null,
        });
      }

      // Check if there are any prizes left
      const availablePrizes = await db.select()
        .from(holidayGiftPrizes)
        .where(and(
          eq(holidayGiftPrizes.isActive, true),
          eq(holidayGiftPrizes.seasonId, HOLIDAY_SEASON_ID),
          sql`${holidayGiftPrizes.claimedCount} < ${holidayGiftPrizes.totalLimit}`
        ));

      if (availablePrizes.length === 0) {
        return res.json({ enabled: true, hasGift: false, reason: "all_prizes_claimed" });
      }

      // Calculate weighted random selection based on remaining count
      const totalWeight = availablePrizes.reduce((sum, p) => sum + (p.totalLimit - p.claimedCount), 0);
      const hash = hashOrgId(orgId, HOLIDAY_SEASON_ID);
      let targetWeight = hash % totalWeight;
      
      let selectedPrize = availablePrizes[0];
      for (const prize of availablePrizes) {
        const weight = prize.totalLimit - prize.claimedCount;
        if (targetWeight < weight) {
          selectedPrize = prize;
          break;
        }
        targetWeight -= weight;
      }

      // Select placement based on hash
      const placementIndex = hash % GIFT_PLACEMENTS.length;
      const selectedPlacement = GIFT_PLACEMENTS[placementIndex];

      // Create assignment
      const [newAssignment] = await db.insert(holidayGiftAssignments)
        .values({
          organizationId: orgId,
          prizeId: selectedPrize.id,
          placementId: selectedPlacement.id,
          seasonId: HOLIDAY_SEASON_ID,
        })
        .returning();

      return res.json({
        enabled: true,
        hasGift: true,
        claimed: false,
        assignment: {
          id: newAssignment.id,
          placementId: newAssignment.placementId,
          claimedAt: null,
        },
        prize: {
          id: selectedPrize.id,
          name: selectedPrize.name,
          description: selectedPrize.description,
        },
      });
    } catch (error: any) {
      console.error("Error getting holiday gift:", error);
      res.status(500).json({ error: "Failed to get holiday gift" });
    }
  });

  // POST /api/holiday-gift/claim - Claim a gift (with transaction locking)
  app.post('/api/holiday-gift/claim', isAuthenticated, async (req: any, res) => {
    try {
      if (!HOLIDAY_HUNT_ENABLED) {
        return res.status(400).json({ error: "Holiday hunt is disabled" });
      }

      const userId = getUserId(req.user as AuthenticatedUser);
      const currentUser = await storage.getUser(userId);
      
      if (!currentUser) {
        return res.status(401).json({ error: "User not found" });
      }

      // TEST MODE: For test emails, always return success without DB changes
      if (HOLIDAY_TEST_EMAILS.includes(currentUser.email)) {
        console.log(`Holiday gift claimed (TEST MODE): user=${userId}, email=${currentUser.email}`);
        return res.json({
          success: true,
          testMode: true,
          prize: {
            id: "test-prize-id",
            name: "Тестовий подарунок",
            description: "Це тестовий режим. Подарунок не зберігається в базу даних.",
          },
        });
      }

      // Get user's organization
      const userOrgs = await storage.getUserOrganizations(userId);
      if (!userOrgs || userOrgs.length === 0) {
        return res.status(400).json({ error: "No organization found" });
      }

      const orgId = userOrgs[0].id;

      // Find the assignment
      const [assignment] = await db.select()
        .from(holidayGiftAssignments)
        .where(and(
          eq(holidayGiftAssignments.organizationId, orgId),
          eq(holidayGiftAssignments.seasonId, HOLIDAY_SEASON_ID)
        ));

      if (!assignment) {
        return res.status(404).json({ error: "No gift assignment found" });
      }

      if (assignment.claimedAt) {
        return res.status(400).json({ error: "Gift already claimed" });
      }

      // Get the prize
      const [prize] = await db.select()
        .from(holidayGiftPrizes)
        .where(eq(holidayGiftPrizes.id, assignment.prizeId));

      if (!prize) {
        return res.status(404).json({ error: "Prize not found" });
      }

      // Check if prize is still available (race condition protection)
      if (prize.claimedCount >= prize.totalLimit) {
        return res.status(400).json({ error: "Prize no longer available" });
      }

      // Update prize claimed count and assignment atomically
      await db.update(holidayGiftPrizes)
        .set({
          claimedCount: sql`${holidayGiftPrizes.claimedCount} + 1`,
          updatedAt: new Date(),
        })
        .where(and(
          eq(holidayGiftPrizes.id, prize.id),
          sql`${holidayGiftPrizes.claimedCount} < ${holidayGiftPrizes.totalLimit}`
        ));

      // Mark assignment as claimed
      const [updatedAssignment] = await db.update(holidayGiftAssignments)
        .set({
          claimedAt: new Date(),
          claimedByUserId: userId,
        })
        .where(and(
          eq(holidayGiftAssignments.id, assignment.id),
          isNull(holidayGiftAssignments.claimedAt)
        ))
        .returning();

      if (!updatedAssignment) {
        return res.status(400).json({ error: "Failed to claim gift - already claimed" });
      }

      console.log(`Holiday gift claimed: org=${orgId}, prize=${prize.name}, user=${userId}`);

      return res.json({
        success: true,
        prize: {
          id: prize.id,
          name: prize.name,
          description: prize.description,
        },
      });
    } catch (error: any) {
      console.error("Error claiming holiday gift:", error);
      res.status(500).json({ error: "Failed to claim holiday gift" });
    }
  });

  // GET /api/admin/holiday-gifts/claims - Get all gift claims with details (Owner only)
  app.get('/api/admin/holiday-gifts/claims', isAuthenticated, async (req: any, res) => {
    try {
      const userId = getUserId(req.user as AuthenticatedUser);
      const currentUser = await storage.getUser(userId);
      
      if (!isPlatformOwner(currentUser)) {
        return res.status(403).json({ error: "Owner access required" });
      }

      const assignments = await db
        .select({
          id: holidayGiftAssignments.id,
          organizationId: holidayGiftAssignments.organizationId,
          prizeId: holidayGiftAssignments.prizeId,
          placementId: holidayGiftAssignments.placementId,
          assignedAt: holidayGiftAssignments.assignedAt,
          claimedAt: holidayGiftAssignments.claimedAt,
          claimedByUserId: holidayGiftAssignments.claimedByUserId,
          prizeName: holidayGiftPrizes.name,
          prizeDescription: holidayGiftPrizes.description,
          organizationName: organizations.name,
          organizationType: organizations.type,
          claimerEmail: users.email,
          claimerFirstName: users.firstName,
          claimerLastName: users.lastName,
        })
        .from(holidayGiftAssignments)
        .leftJoin(holidayGiftPrizes, eq(holidayGiftAssignments.prizeId, holidayGiftPrizes.id))
        .leftJoin(organizations, eq(holidayGiftAssignments.organizationId, organizations.id))
        .leftJoin(users, eq(holidayGiftAssignments.claimedByUserId, users.id))
        .orderBy(desc(holidayGiftAssignments.claimedAt));

      const claims = assignments.map((a) => ({
        id: a.id,
        organizationId: a.organizationId,
        prizeId: a.prizeId,
        placementId: a.placementId,
        assignedAt: a.assignedAt,
        claimedAt: a.claimedAt,
        claimedByUserId: a.claimedByUserId,
        prizeName: a.prizeName,
        prizeDescription: a.prizeDescription,
        organizationName: a.organizationName,
        organizationType: a.organizationType,
        claimedByUser: a.claimedByUserId ? {
          id: a.claimedByUserId,
          email: a.claimerEmail,
          firstName: a.claimerFirstName,
          lastName: a.claimerLastName,
        } : null,
      }));

      res.json({ claims });
    } catch (error: any) {
      console.error("Error getting holiday gift claims:", error);
      res.status(500).json({ error: "Failed to get holiday gift claims" });
    }
  });

  // GET /api/admin/holiday-gifts/stats - Admin stats for holiday gifts (Owner only)
  app.get('/api/admin/holiday-gifts/stats', isAuthenticated, async (req: any, res) => {
    try {
      const userId = getUserId(req.user as AuthenticatedUser);
      const currentUser = await storage.getUser(userId);
      
      if (!isPlatformOwner(currentUser)) {
        return res.status(403).json({ error: "Owner access required" });
      }

      const prizes = await db.select().from(holidayGiftPrizes);
      const assignments = await db.select().from(holidayGiftAssignments);
      
      const claimedCount = assignments.filter(a => a.claimedAt).length;
      const totalPrizes = prizes.reduce((sum, p) => sum + p.totalLimit, 0);
      const totalClaimed = prizes.reduce((sum, p) => sum + p.claimedCount, 0);

      res.json({
        enabled: HOLIDAY_HUNT_ENABLED,
        prizes: prizes.map(p => ({
          id: p.id,
          name: p.name,
          totalLimit: p.totalLimit,
          claimedCount: p.claimedCount,
          remaining: p.totalLimit - p.claimedCount,
        })),
        stats: {
          totalPrizes,
          totalClaimed,
          totalAssignments: assignments.length,
          claimedAssignments: claimedCount,
        },
      });
    } catch (error: any) {
      console.error("Error getting holiday gift stats:", error);
      res.status(500).json({ error: "Failed to get holiday gift stats" });
    }
  });

  // ============================================================================
  // LOCAL PLAYLISTS API
  // ============================================================================

  // GET /api/local-playlists - Get all active local playlists for users
  app.get('/api/local-playlists', isAuthenticated, async (req: any, res) => {
    try {
      const playlistsData = await db
        .select({
          id: localPlaylists.id,
          name: localPlaylists.name,
          description: localPlaylists.description,
          platform: localPlaylists.platform,
          followerCount: localPlaylists.followerCount,
          tracksCount: localPlaylists.tracksCount,
          genre: localPlaylists.genre,
          imageUrl: localPlaylists.imageUrl,
          playlistUrl: localPlaylists.playlistUrl,
          spotifyId: localPlaylists.spotifyId,
          curatorOrgId: localPlaylists.curatorOrgId,
          isActive: localPlaylists.isActive,
          lastSyncedAt: localPlaylists.lastSyncedAt,
          createdAt: localPlaylists.createdAt,
          curatorName: organizations.name,
        })
        .from(localPlaylists)
        .leftJoin(organizations, eq(localPlaylists.curatorOrgId, organizations.id))
        .where(eq(localPlaylists.isActive, true))
        .orderBy(desc(localPlaylists.createdAt));

      res.json(playlistsData);
    } catch (error: any) {
      console.error("Error fetching local playlists:", error);
      res.status(500).json({ error: "Failed to fetch playlists" });
    }
  });

  // GET /api/local-playlists/:id/history - Get playlist followers history for users
  app.get('/api/local-playlists/:id/history', isAuthenticated, async (req: any, res) => {
    try {
      const playlistId = parseInt(req.params.id);
      
      const history = await db
        .select()
        .from(playlistFollowerSnapshots)
        .where(eq(playlistFollowerSnapshots.playlistId, playlistId))
        .orderBy(asc(playlistFollowerSnapshots.collectedAt));

      res.json(history);
    } catch (error: any) {
      console.error("Error fetching playlist history:", error);
      res.status(500).json({ error: "Failed to fetch playlist history" });
    }
  });

  // GET /api/local-playlists/:id/pricing - Get pricing packages for a playlist (public)
  app.get('/api/local-playlists/:id/pricing', isAuthenticated, async (req: any, res) => {
    try {
      const playlistId = parseInt(req.params.id);
      if (isNaN(playlistId) || playlistId <= 0) {
        return res.status(400).json({ error: "Invalid playlist ID" });
      }

      // Verify playlist exists and is active
      const playlist = await db.select().from(localPlaylists).where(
        and(eq(localPlaylists.id, playlistId), eq(localPlaylists.isActive, true))
      ).limit(1);

      if (!playlist[0]) {
        return res.status(404).json({ error: "Playlist not found" });
      }

      // Fetch active pricing packages for this playlist
      const packages = await db
        .select()
        .from(curatorPricingPackages)
        .where(
          and(
            eq(curatorPricingPackages.playlistId, playlistId),
            eq(curatorPricingPackages.isActive, true)
          )
        )
        .orderBy(asc(curatorPricingPackages.sortOrder));

      res.json(packages);
    } catch (error: any) {
      console.error("Error fetching playlist pricing:", error);
      res.status(500).json({ error: "Failed to fetch pricing" });
    }
  });

  // GET /api/playlists/likes - Get user's liked playlist IDs
  app.get('/api/playlists/likes', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const likes = await db
        .select({ playlistId: playlistLikes.playlistId })
        .from(playlistLikes)
        .where(eq(playlistLikes.userId, userId));
      
      res.json(likes.map(l => l.playlistId));
    } catch (error: any) {
      console.error("Error fetching playlist likes:", error);
      res.status(500).json({ error: "Failed to fetch likes" });
    }
  });

  // POST /api/playlists/:id/like - Like a playlist
  app.post('/api/playlists/:id/like', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const playlistId = parseInt(req.params.id);
      
      if (isNaN(playlistId) || playlistId <= 0) {
        return res.status(400).json({ error: "Invalid playlist ID" });
      }

      await db.transaction(async (tx) => {
        const existing = await tx
          .select()
          .from(playlistLikes)
          .where(and(eq(playlistLikes.userId, userId), eq(playlistLikes.playlistId, playlistId)))
          .limit(1);
        
        if (!existing[0]) {
          await tx.insert(playlistLikes).values({ userId, playlistId });
        }
      });

      res.json({ success: true, liked: true });
    } catch (error: any) {
      console.error("Error liking playlist:", error);
      res.status(500).json({ error: "Failed to like playlist" });
    }
  });

  // DELETE /api/playlists/:id/like - Unlike a playlist
  app.delete('/api/playlists/:id/like', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const playlistId = parseInt(req.params.id);
      
      if (isNaN(playlistId) || playlistId <= 0) {
        return res.status(400).json({ error: "Invalid playlist ID" });
      }

      await db
        .delete(playlistLikes)
        .where(and(eq(playlistLikes.userId, userId), eq(playlistLikes.playlistId, playlistId)));

      res.json({ success: true, liked: false });
    } catch (error: any) {
      console.error("Error unliking playlist:", error);
      res.status(500).json({ error: "Failed to unlike playlist" });
    }
  });

  // GET /api/playlists/cart - Get user's cart items with details
  app.get('/api/playlists/cart', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const cartItems = await db
        .select({
          id: playlistCartItems.id,
          playlistId: playlistCartItems.playlistId,
          packageId: playlistCartItems.packageId,
          createdAt: playlistCartItems.createdAt,
          playlistName: localPlaylists.name,
          playlistImageUrl: localPlaylists.imageUrl,
          playlistFollowerCount: localPlaylists.followerCount,
          packageName: curatorPricingPackages.name,
          packagePrice: curatorPricingPackages.price,
          packageCurrency: curatorPricingPackages.currency,
          packageBenefits: curatorPricingPackages.benefits,
          packageIncludesPhoto: curatorPricingPackages.includesArtistPhoto,
        })
        .from(playlistCartItems)
        .innerJoin(localPlaylists, eq(playlistCartItems.playlistId, localPlaylists.id))
        .innerJoin(curatorPricingPackages, eq(playlistCartItems.packageId, curatorPricingPackages.id))
        .where(eq(playlistCartItems.userId, userId))
        .orderBy(desc(playlistCartItems.createdAt));

      res.json(cartItems);
    } catch (error: any) {
      console.error("Error fetching cart:", error);
      res.status(500).json({ error: "Failed to fetch cart" });
    }
  });

  // POST /api/playlists/cart - Add item to cart
  app.post('/api/playlists/cart', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const { playlistId, packageId } = req.body;
      
      if (!playlistId || !packageId) {
        return res.status(400).json({ error: "Playlist ID and package ID required" });
      }

      await db.transaction(async (tx) => {
        // Remove existing item for this playlist if any (replace with new package)
        await tx
          .delete(playlistCartItems)
          .where(and(eq(playlistCartItems.userId, userId), eq(playlistCartItems.playlistId, playlistId)));
        
        // Add new cart item
        await tx.insert(playlistCartItems).values({
          userId,
          playlistId,
          packageId,
        });
      });

      res.json({ success: true });
    } catch (error: any) {
      console.error("Error adding to cart:", error);
      res.status(500).json({ error: "Failed to add to cart" });
    }
  });

  // DELETE /api/playlists/cart/:id - Remove item from cart
  app.delete('/api/playlists/cart/:id', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const itemId = req.params.id;

      await db
        .delete(playlistCartItems)
        .where(and(eq(playlistCartItems.id, itemId), eq(playlistCartItems.userId, userId)));

      res.json({ success: true });
    } catch (error: any) {
      console.error("Error removing from cart:", error);
      res.status(500).json({ error: "Failed to remove from cart" });
    }
  });

  // ==================== PITCHING APPLICATIONS ====================

  // POST /api/pitching-applications - Create new pitching application(s)
  app.post('/api/pitching-applications', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const { trackId, proposedPlacementDate, spotifyLink, instagramLink, comment, photos, cartItemIds } = req.body;

      if (!trackId || !cartItemIds || cartItemIds.length === 0) {
        return res.status(400).json({ error: "Track and cart items are required" });
      }

      const parsedProposedDate = proposedPlacementDate ? new Date(proposedPlacementDate) : null;

      // Get user's organization
      const userOrgs = await db
        .select({ id: organizations.id })
        .from(organizations)
        .innerJoin(orgMembers, eq(organizations.id, orgMembers.orgId))
        .where(eq(orgMembers.userId, userId))
        .limit(1);

      if (userOrgs.length === 0) {
        return res.status(400).json({ error: "No organization found for user" });
      }
      const orgId = userOrgs[0].id;

      // Get cart items with playlist and package details
      const cartItems = await db
        .select({
          id: playlistCartItems.id,
          playlistId: playlistCartItems.playlistId,
          packageId: playlistCartItems.packageId,
          curatorOrgId: localPlaylists.curatorOrgId,
          packagePrice: curatorPricingPackages.price,
          packageCurrency: curatorPricingPackages.currency,
        })
        .from(playlistCartItems)
        .innerJoin(localPlaylists, eq(playlistCartItems.playlistId, localPlaylists.id))
        .innerJoin(curatorPricingPackages, eq(playlistCartItems.packageId, curatorPricingPackages.id))
        .where(
          and(
            eq(playlistCartItems.userId, userId),
            inArray(playlistCartItems.id, cartItemIds)
          )
        );

      if (cartItems.length === 0) {
        return res.status(400).json({ error: "No valid cart items found" });
      }

      // Check for existing active applications (pending or in_review) for the same playlists
      const playlistIds = cartItems.map(item => item.playlistId);
      const existingActiveApplications = await db
        .select({
          playlistId: pitchingApplications.playlistId,
          status: pitchingApplications.status,
        })
        .from(pitchingApplications)
        .where(
          and(
            eq(pitchingApplications.orgId, orgId),
            inArray(pitchingApplications.playlistId, playlistIds),
            inArray(pitchingApplications.status, ['PENDING', 'IN_REVIEW'])
          )
        );

      if (existingActiveApplications.length > 0) {
        const duplicatePlaylistIds = existingActiveApplications.map(app => app.playlistId);
        return res.status(400).json({ 
          error: "You already have an active application for one or more selected playlists. Please wait for the curator to review your existing application before submitting a new one.",
          duplicatePlaylistIds 
        });
      }

      // Helper function to generate unique application code
      const generateApplicationCode = (): string => {
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
        let code = 'APP-';
        for (let i = 0; i < 6; i++) {
          code += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return code;
      };

      // Use transaction for atomic creation + cart cleanup
      const createdApplications = await db.transaction(async (tx) => {
        const applications = [];
        for (const cartItem of cartItems) {
          const applicationCode = generateApplicationCode();
          const [application] = await tx
            .insert(pitchingApplications)
            .values({
              userId,
              orgId,
              trackId,
              playlistId: cartItem.playlistId,
              packageId: cartItem.packageId,
              curatorOrgId: cartItem.curatorOrgId || '',
              spotifyLink: spotifyLink || null,
              instagramLink: instagramLink || null,
              comment: comment || null,
              photos: photos || [],
              paidAmount: cartItem.packagePrice,
              paidCurrency: cartItem.packageCurrency,
              applicationCode,
              proposedPlacementDate: parsedProposedDate,
            })
            .returning();
          applications.push(application);
        }

        // Bulk delete cart items after all inserts succeed
        await tx
          .delete(playlistCartItems)
          .where(inArray(playlistCartItems.id, cartItemIds));

        // Update organization with social links if they're empty (with validation)
        if (spotifyLink || instagramLink) {
          const isValidSpotifyUrl = (url: string) => /^https:\/\/open\.spotify\.com\/(artist|user)\/[a-zA-Z0-9]+/.test(url);
          const isValidInstagramLink = (link: string) => {
            if (link.startsWith('@')) return /^@[a-zA-Z0-9._]+$/.test(link);
            return /^https?:\/\/(www\.)?instagram\.com\/[a-zA-Z0-9._]+/.test(link);
          };

          const [org] = await tx
            .select({ spotifyUrl: organizations.spotifyUrl, instagramUrl: organizations.instagramUrl })
            .from(organizations)
            .where(eq(organizations.id, orgId))
            .limit(1);
          
          const updateData: { spotifyUrl?: string; instagramUrl?: string } = {};
          if (spotifyLink && !org.spotifyUrl && isValidSpotifyUrl(spotifyLink)) {
            updateData.spotifyUrl = spotifyLink;
          }
          if (instagramLink && !org.instagramUrl && isValidInstagramLink(instagramLink)) {
            updateData.instagramUrl = instagramLink;
          }
          
          if (Object.keys(updateData).length > 0) {
            await tx
              .update(organizations)
              .set(updateData)
              .where(eq(organizations.id, orgId));
          }
        }

        return applications;
      });

      res.json({ success: true, applications: createdApplications });

      // Send notifications to curators (non-blocking)
      (async () => {
        try {
          // Get track info for notification
          const [track] = await db
            .select({ title: tracks.title })
            .from(tracks)
            .where(eq(tracks.id, trackId))
            .limit(1);
          const trackTitle = track?.title || 'трек';

          // Get artist org name
          const [artistOrg] = await db
            .select({ name: organizations.name })
            .from(organizations)
            .where(eq(organizations.id, orgId))
            .limit(1);
          const artistName = artistOrg?.name || 'Артист';

          // Group applications by curator org to send one notification per curator
          const curatorApps: Record<string, { playlistNames: string[], applicationIds: string[] }> = {};
          for (const app of createdApplications) {
            const curatorId = app.curatorOrgId;
            if (!curatorApps[curatorId]) {
              curatorApps[curatorId] = { playlistNames: [], applicationIds: [] };
            }
            curatorApps[curatorId].applicationIds.push(app.id);
            
            // Get playlist name
            const [playlist] = await db
              .select({ name: localPlaylists.name })
              .from(localPlaylists)
              .where(eq(localPlaylists.id, app.playlistId))
              .limit(1);
            if (playlist?.name) {
              curatorApps[curatorId].playlistNames.push(playlist.name);
            }
          }

          // Send notifications to each curator organization
          for (const [curatorOrgId, data] of Object.entries(curatorApps)) {
            const playlistList = data.playlistNames.join(', ');
            const firstAppId = data.applicationIds[0];
            const notificationLink = `/curator/applications?id=${firstAppId}`;

            // Get all members of curator organization
            const curatorMembers = await db
              .select({ userId: orgMembers.userId })
              .from(orgMembers)
              .where(eq(orgMembers.orgId, curatorOrgId));

            // Create in-app notification for each curator member
            for (const member of curatorMembers) {
              try {
                await storage.createNotification({
                  userId: member.userId,
                  type: 'ALERT',
                  title: '🎵 Нова заявка на плейлист',
                  message: `${artistName} подав заявку на трек "${trackTitle}" для плейлиста: ${playlistList}`,
                  link: notificationLink,
                });
              } catch (notifError) {
                console.error('[PITCHING] Error creating curator notification:', notifError);
              }
            }

            // Send Telegram notification to curator organization
            const { sendOrgTelegramNotification } = await import("./telegram");
            const telegramMessage = `Артист: ${artistName}\nТрек: "${trackTitle}"\nПлейлисти: ${playlistList}\n\nПереглянути заявку:\nhttps://muzika-dist.com${notificationLink}`;
            
            void sendOrgTelegramNotification(
              storage,
              curatorOrgId,
              '🎵 Нова заявка на плейлист!',
              telegramMessage
            ).catch(err => console.error('[TELEGRAM] Error sending new application notification:', err));
          }
        } catch (notificationError) {
          console.error('[PITCHING] Error sending curator notifications:', notificationError);
        }
      })();

    } catch (error: any) {
      console.error("Error creating pitching applications:", error);
      res.status(500).json({ error: "Failed to create applications" });
    }
  });

  // GET /api/pitching-applications/pending-count - Get count of pending applications for curator
  app.get('/api/pitching-applications/pending-count', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.id;

      // Get user's curator organization
      const userOrgs = await db
        .select({ id: organizations.id, type: organizations.type })
        .from(organizations)
        .innerJoin(orgMembers, eq(organizations.id, orgMembers.orgId))
        .where(eq(orgMembers.userId, userId));

      const curatorOrg = userOrgs.find(o => o.type === 'PLAYLIST_CURATOR');
      
      if (!curatorOrg) {
        return res.json({ count: 0 });
      }

      // Count pending applications for this curator (only valid ones with playlist and package)
      const [result] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(pitchingApplications)
        .innerJoin(localPlaylists, eq(pitchingApplications.playlistId, localPlaylists.id))
        .innerJoin(curatorPricingPackages, eq(pitchingApplications.packageId, curatorPricingPackages.id))
        .where(
          and(
            eq(pitchingApplications.curatorOrgId, curatorOrg.id),
            eq(pitchingApplications.status, 'PENDING')
          )
        );

      res.json({ count: result?.count || 0 });
    } catch (error: any) {
      console.error("Error getting pending applications count:", error);
      res.status(500).json({ error: "Failed to get pending count" });
    }
  });

  // GET /api/pitching-applications - Get applications for user or curator
  app.get('/api/pitching-applications', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const { role, status } = req.query;

      // Get user's organizations
      const userOrgs = await db
        .select({ id: organizations.id, type: organizations.type })
        .from(organizations)
        .innerJoin(orgMembers, eq(organizations.id, orgMembers.orgId))
        .where(eq(orgMembers.userId, userId));

      if (userOrgs.length === 0) {
        return res.json([]);
      }

      const curatorOrg = userOrgs.find(o => o.type === 'PLAYLIST_CURATOR');
      const artistOrg = userOrgs.find(o => o.type !== 'PLAYLIST_CURATOR');

      let applications;
      
      if (role === 'curator' && curatorOrg) {
        // Get applications sent to curator's playlists
        applications = await db
          .select({
            id: pitchingApplications.id,
            applicationCode: pitchingApplications.applicationCode,
            userId: pitchingApplications.userId,
            orgId: pitchingApplications.orgId,
            trackId: pitchingApplications.trackId,
            playlistId: pitchingApplications.playlistId,
            packageId: pitchingApplications.packageId,
            curatorOrgId: pitchingApplications.curatorOrgId,
            spotifyLink: pitchingApplications.spotifyLink,
            instagramLink: pitchingApplications.instagramLink,
            comment: pitchingApplications.comment,
            photos: pitchingApplications.photos,
            status: pitchingApplications.status,
            curatorResponse: pitchingApplications.curatorResponse,
            spotifyTrackUrl: pitchingApplications.spotifyTrackUrl,
            paymentStatus: pitchingApplications.paymentStatus,
            paidAt: pitchingApplications.paidAt,
            paidAmount: pitchingApplications.paidAmount,
            paidCurrency: pitchingApplications.paidCurrency,
            createdAt: pitchingApplications.createdAt,
            reviewedAt: pitchingApplications.reviewedAt,
            proposedPlacementDate: pitchingApplications.proposedPlacementDate,
            curatorProposedDate: pitchingApplications.curatorProposedDate,
            confirmedPlacementDate: pitchingApplications.confirmedPlacementDate,
            playlistName: localPlaylists.name,
            playlistImageUrl: localPlaylists.imageUrl,
            playlistPlatform: localPlaylists.platform,
            packageName: curatorPricingPackages.name,
            packageIncludesPhoto: curatorPricingPackages.includesArtistPhoto,
          })
          .from(pitchingApplications)
          .innerJoin(localPlaylists, eq(pitchingApplications.playlistId, localPlaylists.id))
          .innerJoin(curatorPricingPackages, eq(pitchingApplications.packageId, curatorPricingPackages.id))
          .where(
            status 
              ? and(eq(pitchingApplications.curatorOrgId, curatorOrg.id), eq(pitchingApplications.status, status))
              : eq(pitchingApplications.curatorOrgId, curatorOrg.id)
          )
          .orderBy(desc(pitchingApplications.createdAt));
      } else if (artistOrg) {
        // Get applications submitted by the user's organization
        applications = await db
          .select({
            id: pitchingApplications.id,
            applicationCode: pitchingApplications.applicationCode,
            userId: pitchingApplications.userId,
            orgId: pitchingApplications.orgId,
            trackId: pitchingApplications.trackId,
            playlistId: pitchingApplications.playlistId,
            packageId: pitchingApplications.packageId,
            curatorOrgId: pitchingApplications.curatorOrgId,
            spotifyLink: pitchingApplications.spotifyLink,
            instagramLink: pitchingApplications.instagramLink,
            comment: pitchingApplications.comment,
            photos: pitchingApplications.photos,
            status: pitchingApplications.status,
            curatorResponse: pitchingApplications.curatorResponse,
            rejectionReason: pitchingApplications.rejectionReason,
            paymentStatus: pitchingApplications.paymentStatus,
            paidAt: pitchingApplications.paidAt,
            paidAmount: pitchingApplications.paidAmount,
            paidCurrency: pitchingApplications.paidCurrency,
            createdAt: pitchingApplications.createdAt,
            reviewedAt: pitchingApplications.reviewedAt,
            proposedPlacementDate: pitchingApplications.proposedPlacementDate,
            curatorProposedDate: pitchingApplications.curatorProposedDate,
            confirmedPlacementDate: pitchingApplications.confirmedPlacementDate,
            playlistName: localPlaylists.name,
            playlistImageUrl: localPlaylists.imageUrl,
            packageName: curatorPricingPackages.name,
            packageIncludesPhoto: curatorPricingPackages.includesArtistPhoto,
            curatorName: organizations.name,
          })
          .from(pitchingApplications)
          .innerJoin(localPlaylists, eq(pitchingApplications.playlistId, localPlaylists.id))
          .innerJoin(curatorPricingPackages, eq(pitchingApplications.packageId, curatorPricingPackages.id))
          .innerJoin(organizations, eq(pitchingApplications.curatorOrgId, organizations.id))
          .where(
            status 
              ? and(eq(pitchingApplications.orgId, artistOrg.id), eq(pitchingApplications.status, status))
              : eq(pitchingApplications.orgId, artistOrg.id)
          )
          .orderBy(desc(pitchingApplications.createdAt));
      } else {
        return res.json([]);
      }

      // Enrich with track, release cover, organization info, release date, and streaming stats
      const enrichedApplications = await Promise.all(applications.map(async (app) => {
        const [track] = await db
          .select({ id: tracks.id, title: tracks.title, audioFileId: tracks.audioFileId, releaseId: tracks.releaseId })
          .from(tracks)
          .where(eq(tracks.id, app.trackId))
          .limit(1);

        // Get the release artwork and release date
        let coverArtworkFileId = null;
        let releaseDate = null;
        if (track?.releaseId) {
          const [release] = await db
            .select({ artworkFileId: releases.artworkFileId, releaseDate: releases.releaseDate })
            .from(releases)
            .where(eq(releases.id, track.releaseId))
            .limit(1);
          coverArtworkFileId = release?.artworkFileId || null;
          releaseDate = release?.releaseDate || null;
        }

        const [org] = await db
          .select({ id: organizations.id, name: organizations.name })
          .from(organizations)
          .where(eq(organizations.id, app.orgId))
          .limit(1);

        // Get streaming stats for the artist's organization from the playlist platform
        let platformStats = null;
        const playlistPlatform = (app as any).playlistPlatform;
        if (playlistPlatform && app.orgId) {
          // Map playlist platform to streaming report partner names
          const platformMapping: Record<string, string[]> = {
            'Spotify': ['Spotify'],
            'YouTube': ['YouTube', 'YouTube Music'],
            'Apple Music': ['Apple Music'],
            'Deezer': ['Deezer'],
            'Tidal': ['Tidal'],
            'TikTok': ['TikTok'],
            'Amazon': ['Amazon Music', 'Amazon'],
          };
          
          const partnerNames = platformMapping[playlistPlatform] || [playlistPlatform];
          
          // Get the latest period with data for this organization and platform
          const latestReportData = await db
            .select({
              period: streamingReportRows.period,
              streams: sql<number>`COALESCE(SUM(${streamingReportRows.streams}), 0)::int`,
              revenue: sql<string>`COALESCE(SUM(${streamingReportRows.netRevenue}::numeric), 0)::text`,
            })
            .from(streamingReportRows)
            .innerJoin(streamingReports, eq(streamingReportRows.reportId, streamingReports.id))
            .where(
              and(
                eq(streamingReports.orgId, app.orgId),
                inArray(streamingReportRows.partner, partnerNames)
              )
            )
            .groupBy(streamingReportRows.period)
            .orderBy(desc(streamingReportRows.period))
            .limit(1);
          
          if (latestReportData.length > 0) {
            platformStats = {
              platform: playlistPlatform,
              period: latestReportData[0].period,
              streams: latestReportData[0].streams,
              revenue: parseFloat(latestReportData[0].revenue) || 0,
            };
          }
        }

        // Get first chat message timestamp for timeline
        const [firstChatMessage] = await db
          .select({ createdAt: curatorMessages.createdAt })
          .from(curatorMessages)
          .where(eq(curatorMessages.applicationId, app.id))
          .orderBy(curatorMessages.createdAt)
          .limit(1);

        return {
          ...app,
          trackTitle: track?.title || 'Unknown Track',
          trackAudioFileId: track?.audioFileId || null,
          coverArtworkFileId,
          releaseDate,
          platformStats,
          organizationName: org?.name || 'Unknown Organization',
          firstChatMessageAt: firstChatMessage?.createdAt || null,
        };
      }));

      res.json(enrichedApplications);
    } catch (error: any) {
      console.error("Error fetching pitching applications:", error);
      res.status(500).json({ error: "Failed to fetch applications" });
    }
  });

  // POST /api/pitching-applications/:id/find-spotify - Find track on Spotify (curator only)
  app.post('/api/pitching-applications/:id/find-spotify', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const applicationId = req.params.id;

      // Get user's curator organization
      const userOrgs = await db
        .select({ id: organizations.id, type: organizations.type })
        .from(organizations)
        .innerJoin(orgMembers, eq(organizations.id, orgMembers.orgId))
        .where(eq(orgMembers.userId, userId));

      const curatorOrg = userOrgs.find(o => o.type === 'PLAYLIST_CURATOR');
      if (!curatorOrg) {
        return res.status(403).json({ error: "Only curators can search for tracks" });
      }

      // Get the application
      const [application] = await db
        .select()
        .from(pitchingApplications)
        .where(eq(pitchingApplications.id, applicationId))
        .limit(1);

      if (!application) {
        return res.status(404).json({ error: "Application not found" });
      }

      // Verify curator owns this application's playlist
      if (application.curatorOrgId !== curatorOrg.id) {
        return res.status(403).json({ error: "You don't have access to this application" });
      }

      // Get track and artist info
      const [track] = await db
        .select({ title: tracks.title, releaseId: tracks.releaseId })
        .from(tracks)
        .where(eq(tracks.id, application.trackId))
        .limit(1);

      if (!track) {
        return res.status(404).json({ error: "Track not found" });
      }

      // Get organization name (artist name)
      const [org] = await db
        .select({ name: organizations.name })
        .from(organizations)
        .where(eq(organizations.id, application.orgId))
        .limit(1);

      const artistName = org?.name || '';

      // Search on Spotify
      const { searchTrackOnSpotify } = await import('./spotify');
      const trackId = await searchTrackOnSpotify(track.title, artistName, application.spotifyLink || undefined);

      if (!trackId) {
        return res.status(404).json({ error: "Track not found on Spotify" });
      }

      // Build Spotify URL
      const spotifyTrackUrl = `https://open.spotify.com/track/${trackId}`;

      // Save to database
      await db
        .update(pitchingApplications)
        .set({ spotifyTrackUrl, updatedAt: new Date() })
        .where(eq(pitchingApplications.id, applicationId));

      res.json({ success: true, spotifyTrackUrl });
    } catch (error: any) {
      console.error("Error finding track on Spotify:", error);
      res.status(500).json({ error: error.message || "Failed to search on Spotify" });
    }
  });

  // PUT /api/pitching-applications/:id/accept-date - Accept curator's proposed date (artist only)
  app.put('/api/pitching-applications/:id/accept-date', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const applicationId = req.params.id;

      // Get the application
      const [application] = await db
        .select()
        .from(pitchingApplications)
        .where(eq(pitchingApplications.id, applicationId))
        .limit(1);

      if (!application) {
        return res.status(404).json({ error: "Application not found" });
      }

      // Verify the user owns this application (is member of the org that submitted it)
      const isOwner = await db
        .select()
        .from(orgMembers)
        .where(
          and(
            eq(orgMembers.orgId, application.orgId),
            eq(orgMembers.userId, userId)
          )
        )
        .limit(1);

      if (isOwner.length === 0) {
        return res.status(403).json({ error: "Not authorized to accept date for this application" });
      }

      // Must have a curator proposed date to accept
      if (!application.curatorProposedDate) {
        return res.status(400).json({ error: "No curator proposed date to accept" });
      }

      // Update the application to confirm the date
      const [updated] = await db
        .update(pitchingApplications)
        .set({
          confirmedPlacementDate: application.curatorProposedDate,
        })
        .where(eq(pitchingApplications.id, applicationId))
        .returning();

      res.json(updated);

      // Send notification to curator about date acceptance (async, non-blocking)
      (async () => {
        try {
          // Get playlist info to find curator org
          const [playlist] = await db
            .select({
              id: localPlaylists.id,
              name: localPlaylists.name,
              curatorOrgId: localPlaylists.curatorOrgId,
            })
            .from(localPlaylists)
            .where(eq(localPlaylists.id, application.playlistId))
            .limit(1);

          if (!playlist || !playlist.curatorOrgId) {
            console.log('[PITCHING] No curator org found for playlist');
            return;
          }

          const curatorOrgId = playlist.curatorOrgId;

          // Get artist/org name
          const [artistOrg] = await db
            .select({ name: organizations.name })
            .from(organizations)
            .where(eq(organizations.id, application.orgId))
            .limit(1);

          const artistName = artistOrg?.name || 'Артист';
          const trackTitle = application.trackTitle || 'Трек';
          const confirmedDate = application.curatorProposedDate 
            ? new Date(application.curatorProposedDate).toLocaleDateString('uk-UA', { day: 'numeric', month: 'long', year: 'numeric' })
            : '';
          const notificationLink = `/curator/applications?id=${application.id}`;

          // Get all curator org members
          const curatorMembers = await db
            .select({ userId: orgMembers.userId })
            .from(orgMembers)
            .where(eq(orgMembers.orgId, curatorOrgId));

          // Create in-app notification for each curator member
          for (const member of curatorMembers) {
            try {
              await storage.createNotification({
                userId: member.userId,
                type: 'ALERT',
                title: '✅ Дату підтверджено',
                message: `${artistName} підтвердив дату розміщення треку "${trackTitle}" в плейлисті "${playlist.name}" на ${confirmedDate}`,
                link: notificationLink,
              });
            } catch (notifError) {
              console.error('[PITCHING] Error creating curator date confirmation notification:', notifError);
            }
          }

          // Send Telegram notification to curator organization
          const { sendOrgTelegramNotification } = await import("./telegram");
          const telegramMessage = `Артист: ${artistName}\nТрек: "${trackTitle}"\nПлейлист: ${playlist.name}\nДата: ${confirmedDate}\n\nПереглянути заявку:\nhttps://muzika-dist.com${notificationLink}`;
          
          void sendOrgTelegramNotification(
            storage,
            curatorOrgId,
            '✅ Дату розміщення підтверджено!',
            telegramMessage
          ).catch(err => console.error('[TELEGRAM] Error sending date confirmation notification:', err));
        } catch (notificationError) {
          console.error('[PITCHING] Error sending date confirmation notifications:', notificationError);
        }
      })();

    } catch (error: any) {
      console.error("Error accepting date:", error);
      res.status(500).json({ error: "Failed to accept date" });
    }
  });

  // PUT /api/pitching-applications/:id/status - Update application status (curator only)
  app.put('/api/pitching-applications/:id/status', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const applicationId = req.params.id;
      const { status, curatorResponse, rejectionReason, confirmedPlacementDate, curatorProposedDate } = req.body;

      if (!['PENDING', 'IN_REVIEW', 'APPROVED', 'REJECTED'].includes(status)) {
        return res.status(400).json({ error: "Invalid status" });
      }

      // Validate rejection reason if status is REJECTED
      const validRejectionReasons = ['GENRE_MISMATCH', 'LOW_QUALITY', 'NOT_FITTING_PLAYLIST_STYLE', 'INCOMPLETE_PROFILE', 'INSUFFICIENT_STREAMING_STATS', 'CURATOR_PREFERENCE', 'RELEASE_TOO_OLD', 'OTHER'];
      if (status === 'REJECTED' && rejectionReason && !validRejectionReasons.includes(rejectionReason)) {
        return res.status(400).json({ error: "Invalid rejection reason" });
      }

      // Verify user is curator for this application's playlist
      const [application] = await db
        .select()
        .from(pitchingApplications)
        .where(eq(pitchingApplications.id, applicationId))
        .limit(1);

      if (!application) {
        return res.status(404).json({ error: "Application not found" });
      }

      // Check if user is member of the curator organization
      const isCurator = await db
        .select()
        .from(orgMembers)
        .where(
          and(
            eq(orgMembers.orgId, application.curatorOrgId),
            eq(orgMembers.userId, userId)
          )
        )
        .limit(1);

      if (isCurator.length === 0) {
        return res.status(403).json({ error: "Not authorized to update this application" });
      }

      // For free applications (paidAmount = 0), auto-set paymentStatus to PAID when approved
      const isFreeApplication = application.paidAmount === 0;
      
      // Build update data - only include paymentStatus for free applications being approved
      const updateData: Record<string, any> = {
        status,
        curatorResponse: curatorResponse || null,
        rejectionReason: status === 'REJECTED' ? rejectionReason : null,
        updatedAt: new Date(),
        reviewedAt: status !== 'PENDING' ? new Date() : null,
      };
      
      // Handle placement date confirmation
      if (confirmedPlacementDate) {
        updateData.confirmedPlacementDate = new Date(confirmedPlacementDate);
      }
      if (curatorProposedDate) {
        updateData.curatorProposedDate = new Date(curatorProposedDate);
      }
      
      // Auto-complete payment for free applications when approved
      if (status === 'APPROVED' && isFreeApplication) {
        updateData.paymentStatus = 'PAID';
      }
      
      await db
        .update(pitchingApplications)
        .set(updateData)
        .where(eq(pitchingApplications.id, applicationId));

      // Send notification to artist for status changes (non-blocking, graceful failure)
      if (status === 'APPROVED' || status === 'REJECTED') {
        try {
          // Get playlist name for notification
          const [playlist] = await db
            .select({ name: localPlaylists.name })
            .from(localPlaylists)
            .where(eq(localPlaylists.id, application.playlistId))
            .limit(1);

          const playlistName = playlist?.name || 'плейлист';
          
          // Get all users in the artist's organization
          const orgUsers = await db
            .select({ userId: orgMembers.userId })
            .from(orgMembers)
            .where(eq(orgMembers.orgId, application.orgId));

          // Create notification for each user in the organization
          for (const orgUser of orgUsers) {
            try {
              if (status === 'APPROVED') {
                // Different message for free vs paid applications
                const approvalMessage = isFreeApplication
                  ? `Ваша заявка на плейлист "${playlistName}" схвалена! Трек буде додано до плейлиста.`
                  : `Ваша заявка на плейлист "${playlistName}" схвалена. Оплатіть заявку, щоб завершити процес.`;
                
                await storage.createNotification({
                  userId: orgUser.userId,
                  title: 'Заявку схвалено! 🎉',
                  message: approvalMessage,
                  type: 'PITCHING_APPLICATION_APPROVED',
                  relatedEntityType: 'pitchingApplication',
                  relatedEntityId: applicationId,
                });
              } else if (status === 'REJECTED') {
                const reasonText = rejectionReason ? ` Причина: ${rejectionReason}` : '';
                await storage.createNotification({
                  userId: orgUser.userId,
                  title: 'Заявку відхилено',
                  message: `Ваша заявка на плейлист "${playlistName}" була відхилена.${reasonText}`,
                  type: 'PITCHING_APPLICATION_REJECTED',
                  relatedEntityType: 'pitchingApplication',
                  relatedEntityId: applicationId,
                });
              }
            } catch (notifError) {
              console.error('[PITCHING] Error creating notification for user:', orgUser.userId, notifError);
            }
          }

          // Send Telegram notification to artist's organization
          const { sendOrgTelegramNotification } = await import("./telegram");
          if (status === 'APPROVED') {
            const telegramApprovalMessage = isFreeApplication
              ? `Ваша заявка на плейлист "${playlistName}" схвалена! Трек буде додано до плейлиста.\n\nПереглянути деталі:\nhttps://muzika-dist.com/my-applications`
              : `Ваша заявка на плейлист "${playlistName}" схвалена.\n\nПерейдіть до розділу "Мої заявки", щоб оплатити та завершити процес:\nhttps://muzika-dist.com/my-applications`;
            
            void sendOrgTelegramNotification(
              storage,
              application.orgId,
              '🎉 Заявку на плейлист схвалено!',
              telegramApprovalMessage
            ).catch(err => console.error('[TELEGRAM] Error sending pitching approval:', err));
          } else if (status === 'REJECTED') {
            const reasonText = rejectionReason ? `\n\nПричина: ${rejectionReason}` : '';
            void sendOrgTelegramNotification(
              storage,
              application.orgId,
              '❌ Заявку на плейлист відхилено',
              `Ваша заявка на плейлист "${playlistName}" була відхилена.${reasonText}${curatorResponse ? `\n\nКоментар куратора: ${curatorResponse}` : ''}\n\nПереглянути деталі:\nhttps://muzika-dist.com/my-applications`
            ).catch(err => console.error('[TELEGRAM] Error sending pitching rejection:', err));
          }
        } catch (notificationError) {
          console.error('[PITCHING] Error sending notifications:', notificationError);
          // Continue - status update succeeded, notifications are non-critical
        }
      }

      res.json({ success: true });
    } catch (error: any) {
      console.error("Error updating application status:", error);
      res.status(500).json({ error: "Failed to update application" });
    }
  });

  // PUT /api/pitching-applications/:id/confirmed-date - Update confirmed placement date (curator only)
  app.put('/api/pitching-applications/:id/confirmed-date', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const applicationId = req.params.id;
      const { confirmedPlacementDate } = req.body;

      if (!confirmedPlacementDate) {
        return res.status(400).json({ error: "confirmedPlacementDate is required" });
      }

      // Get application
      const [application] = await db
        .select()
        .from(pitchingApplications)
        .where(eq(pitchingApplications.id, applicationId))
        .limit(1);

      if (!application) {
        return res.status(404).json({ error: "Application not found" });
      }

      // Only allow updating confirmed date for approved applications
      if (application.status !== 'APPROVED') {
        return res.status(400).json({ error: "Can only update confirmed date for approved applications" });
      }

      // Check if user is member of the curator organization
      const isCurator = await db
        .select()
        .from(orgMembers)
        .where(
          and(
            eq(orgMembers.orgId, application.curatorOrgId),
            eq(orgMembers.userId, userId)
          )
        )
        .limit(1);

      if (isCurator.length === 0) {
        return res.status(403).json({ error: "Not authorized to update this application" });
      }

      // Update confirmed placement date
      await db
        .update(pitchingApplications)
        .set({
          confirmedPlacementDate: new Date(confirmedPlacementDate),
          updatedAt: new Date(),
        })
        .where(eq(pitchingApplications.id, applicationId));

      res.json({ success: true });
    } catch (error: any) {
      console.error("Error updating confirmed date:", error);
      res.status(500).json({ error: "Failed to update confirmed date" });
    }
  });

  // POST /api/pitching-applications/:id/widget-payment - Generate Wayforpay payment for approved application
  app.post('/api/pitching-applications/:id/widget-payment', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const applicationId = req.params.id;

      // Get application
      const [application] = await db
        .select()
        .from(pitchingApplications)
        .where(eq(pitchingApplications.id, applicationId))
        .limit(1);

      if (!application) {
        return res.status(404).json({ error: "Application not found" });
      }

      // Verify user owns this application
      const userOrgs = await db
        .select({ id: organizations.id })
        .from(organizations)
        .innerJoin(orgMembers, eq(organizations.id, orgMembers.orgId))
        .where(eq(orgMembers.userId, userId));

      if (!userOrgs.some(o => o.id === application.orgId)) {
        return res.status(403).json({ error: "Not authorized" });
      }

      // Only allow payment for approved applications
      if (application.status !== 'APPROVED') {
        return res.status(400).json({ error: "Application is not approved" });
      }

      // Don't allow payment if already paid
      if (application.paymentStatus === 'PAID') {
        return res.status(400).json({ error: "Application has already been paid" });
      }

      // Get user details
      const [user] = await db
        .select()
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);

      if (!user) {
        return res.status(400).json({ error: "User not found" });
      }

      // Get playlist name for product description
      const [playlist] = await db
        .select({ name: localPlaylists.name })
        .from(localPlaylists)
        .where(eq(localPlaylists.id, application.playlistId))
        .limit(1);

      // Get Wayforpay credentials
      const merchantAccount = process.env.WAYFORPAY_MERCHANT_ACCOUNT;
      const secretKey = process.env.WAYFORPAY_SECRET_KEY;
      
      if (!merchantAccount || !secretKey) {
        console.error('[PITCHING WIDGET PAYMENT] Wayforpay credentials not configured');
        return res.status(500).json({ error: "Payment system not configured" });
      }

      // Generate order reference
      const orderReference = `pitching_${applicationId}_${Date.now()}`;
      const orderDate = Math.floor(Date.now() / 1000);

      // Update application with payment reference and set status to PENDING
      await db
        .update(pitchingApplications)
        .set({ 
          paymentId: orderReference,
          paymentStatus: 'PENDING',
          updatedAt: new Date(),
        })
        .where(eq(pitchingApplications.id, applicationId));

      // Amount from package price
      const amountUAH = application.paidAmount || 0;
      
      if (amountUAH <= 0) {
        return res.status(400).json({ error: "Invalid payment amount" });
      }

      // Generate HMAC_MD5 signature
      const crypto = await import('crypto');
      const productName = [`Пітчинг: ${playlist?.name || 'Плейлист'}`];
      const productCount = [1];
      const productPrice = [amountUAH];
      const currency = application.paidCurrency || "UAH";
      const merchantDomainName = "muzika.ua";

      const signString = [
        merchantAccount,
        merchantDomainName,
        orderReference,
        orderDate,
        amountUAH,
        currency,
        ...productName,
        ...productCount.map(String),
        ...productPrice.map(String),
      ].join(';');

      const merchantSignature = crypto.createHmac('md5', secretKey).update(signString).digest('hex');

      // Webhook URL for Wayforpay to send payment confirmation
      const baseUrl = process.env.WAYFORPAY_SERVICE_URL || "https://muzika-dist.com";
      const serviceUrl = `${baseUrl}/api/webhooks/wayforpay`;

      console.log('[PITCHING WIDGET PAYMENT] Created payment data:', {
        applicationId,
        orderReference,
        amountUAH,
        currency,
        playlistName: playlist?.name,
      });

      // Return payment data for widget
      res.json({
        merchantAccount,
        merchantDomainName,
        merchantSignature,
        orderReference,
        orderDate,
        amount: amountUAH,
        currency,
        productName,
        productCount,
        productPrice,
        clientFirstName: user.firstName || "",
        clientLastName: user.lastName || "",
        clientEmail: user.email || "",
        clientPhone: user.phone || "",
        language: "UA",
        serviceUrl,
      });
    } catch (error: any) {
      console.error("Error creating pitching payment:", error);
      res.status(500).json({ error: "Failed to create payment" });
    }
  });

  // POST /api/pitching-applications/:id/donation-payment - Generate Wayforpay payment for voluntary donation on free application
  app.post('/api/pitching-applications/:id/donation-payment', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const applicationId = req.params.id;
      const { amount: donationAmount } = req.body;

      if (!donationAmount || donationAmount < 10) {
        return res.status(400).json({ error: "Minimum donation amount is 10 UAH" });
      }

      if (donationAmount > 50000) {
        return res.status(400).json({ error: "Maximum donation amount is 50000 UAH" });
      }

      const [application] = await db
        .select()
        .from(pitchingApplications)
        .where(eq(pitchingApplications.id, applicationId))
        .limit(1);

      if (!application) {
        return res.status(404).json({ error: "Application not found" });
      }

      const userOrgs = await db
        .select({ id: organizations.id })
        .from(organizations)
        .innerJoin(orgMembers, eq(organizations.id, orgMembers.orgId))
        .where(eq(orgMembers.userId, userId));

      if (!userOrgs.some(o => o.id === application.orgId)) {
        return res.status(403).json({ error: "Not authorized" });
      }

      if (application.status !== 'APPROVED') {
        return res.status(400).json({ error: "Application is not approved" });
      }

      if (application.paidAmount !== 0) {
        return res.status(400).json({ error: "Donations are only available for free applications" });
      }

      const existingPaidDonation = await db
        .select()
        .from(curatorDonations)
        .where(and(
          eq(curatorDonations.applicationId, applicationId),
          eq(curatorDonations.status, 'PAID')
        ))
        .limit(1);

      if (existingPaidDonation.length > 0) {
        return res.status(400).json({ error: "A donation has already been made for this application" });
      }

      await db
        .delete(curatorDonations)
        .where(and(
          eq(curatorDonations.applicationId, applicationId),
          eq(curatorDonations.status, 'PENDING')
        ));

      const [user] = await db
        .select()
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);

      if (!user) {
        return res.status(400).json({ error: "User not found" });
      }

      const [playlist] = await db
        .select({ name: localPlaylists.name })
        .from(localPlaylists)
        .where(eq(localPlaylists.id, application.playlistId))
        .limit(1);

      const merchantAccount = process.env.WAYFORPAY_MERCHANT_ACCOUNT;
      const secretKey = process.env.WAYFORPAY_SECRET_KEY;
      
      if (!merchantAccount || !secretKey) {
        console.error('[DONATION PAYMENT] Wayforpay credentials not configured');
        return res.status(500).json({ error: "Payment system not configured" });
      }

      const [donation] = await db.insert(curatorDonations).values({
        applicationId,
        curatorOrgId: application.curatorOrgId,
        artistOrgId: application.orgId,
        amount: donationAmount,
        currency: 'UAH',
        status: 'PENDING',
      }).returning();

      const orderReference = `donation_${donation.id}_${Date.now()}`;
      const orderDate = Math.floor(Date.now() / 1000);

      await db
        .update(curatorDonations)
        .set({ orderReference })
        .where(eq(curatorDonations.id, donation.id));

      const crypto = await import('crypto');
      const productName = [`Донат куратору: ${playlist?.name || 'Плейлист'}`];
      const productCount = [1];
      const productPrice = [donationAmount];
      const currency = "UAH";
      const merchantDomainName = "muzika.ua";

      const signString = [
        merchantAccount,
        merchantDomainName,
        orderReference,
        orderDate,
        donationAmount,
        currency,
        ...productName,
        ...productCount.map(String),
        ...productPrice.map(String),
      ].join(';');

      const merchantSignature = crypto.createHmac('md5', secretKey).update(signString).digest('hex');

      const baseUrl = process.env.WAYFORPAY_SERVICE_URL || "https://muzika-dist.com";
      const serviceUrl = `${baseUrl}/api/webhooks/wayforpay`;

      console.log('[DONATION PAYMENT] Created payment data:', {
        donationId: donation.id,
        applicationId,
        orderReference,
        amount: donationAmount,
        currency,
        playlistName: playlist?.name,
      });

      res.json({
        merchantAccount,
        merchantDomainName,
        merchantSignature,
        orderReference,
        orderDate,
        amount: donationAmount,
        currency,
        productName,
        productCount,
        productPrice,
        clientFirstName: user.firstName || "",
        clientLastName: user.lastName || "",
        clientEmail: user.email || "",
        clientPhone: user.phone || "",
        language: "UA",
        serviceUrl,
      });
    } catch (error: any) {
      console.error("Error creating donation payment:", error);
      res.status(500).json({ error: "Failed to create donation payment" });
    }
  });

  // GET /api/pitching-applications/:id/donation - Get donation status for an application
  app.get('/api/pitching-applications/:id/donation', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const applicationId = req.params.id;

      const [application] = await db
        .select()
        .from(pitchingApplications)
        .where(eq(pitchingApplications.id, applicationId))
        .limit(1);

      if (!application) {
        return res.status(404).json({ error: "Application not found" });
      }

      const userOrgs = await db
        .select({ id: organizations.id })
        .from(organizations)
        .innerJoin(orgMembers, eq(organizations.id, orgMembers.orgId))
        .where(eq(orgMembers.userId, userId));

      const userOrgIds = userOrgs.map(o => o.id);
      const isArtist = userOrgIds.includes(application.orgId);
      const isCurator = userOrgIds.includes(application.curatorOrgId);
      const isAdmin = isPlatformAdmin(req.user);

      if (!isArtist && !isCurator && !isAdmin) {
        return res.status(403).json({ error: "Not authorized" });
      }

      const donations = await db
        .select()
        .from(curatorDonations)
        .where(eq(curatorDonations.applicationId, applicationId))
        .orderBy(desc(curatorDonations.createdAt));

      res.json(donations);
    } catch (error: any) {
      console.error("Error fetching donations:", error);
      res.status(500).json({ error: "Failed to fetch donations" });
    }
  });

  // GET /api/local-playlists/history/bulk - Get recent follower history for all active playlists
  app.get('/api/local-playlists/history/bulk', isAuthenticated, async (req: any, res) => {
    try {
      const days = parseInt(req.query.days as string) || 30;
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - days);

      const activePlaylistIds = await db
        .select({ id: localPlaylists.id })
        .from(localPlaylists)
        .where(eq(localPlaylists.isActive, true));

      const playlistIds = activePlaylistIds.map(p => p.id);

      if (playlistIds.length === 0) {
        return res.json({});
      }

      const history = await db
        .select()
        .from(playlistFollowerSnapshots)
        .where(
          and(
            inArray(playlistFollowerSnapshots.playlistId, playlistIds),
            gte(playlistFollowerSnapshots.collectedAt, cutoffDate)
          )
        )
        .orderBy(asc(playlistFollowerSnapshots.collectedAt));

      const grouped: Record<number, typeof history> = {};
      for (const snapshot of history) {
        if (!grouped[snapshot.playlistId]) {
          grouped[snapshot.playlistId] = [];
        }
        grouped[snapshot.playlistId].push(snapshot);
      }

      res.json(grouped);
    } catch (error: any) {
      console.error("Error fetching bulk playlist history:", error);
      res.status(500).json({ error: "Failed to fetch playlist history" });
    }
  });

  // GET /api/local-playlists/pricing/bulk - Get pricing packages for all active playlists
  app.get('/api/local-playlists/pricing/bulk', isAuthenticated, async (req: any, res) => {
    try {
      const activePlaylistIds = await db
        .select({ id: localPlaylists.id })
        .from(localPlaylists)
        .where(eq(localPlaylists.isActive, true));

      const playlistIds = activePlaylistIds.map(p => p.id);

      if (playlistIds.length === 0) {
        return res.json({});
      }

      const pricing = await db
        .select()
        .from(curatorPricingPackages)
        .where(
          and(
            inArray(curatorPricingPackages.playlistId, playlistIds),
            eq(curatorPricingPackages.isActive, true)
          )
        )
        .orderBy(asc(curatorPricingPackages.sortOrder));

      const grouped: Record<number, typeof pricing> = {};
      for (const pkg of pricing) {
        if (!grouped[pkg.playlistId]) {
          grouped[pkg.playlistId] = [];
        }
        grouped[pkg.playlistId].push(pkg);
      }

      res.json(grouped);
    } catch (error: any) {
      console.error("Error fetching bulk playlist pricing:", error);
      res.status(500).json({ error: "Failed to fetch playlist pricing" });
    }
  });

  // GET /api/curator-profile/:curatorId - Get public curator profile (no auth required)
  app.get('/api/curator-profile/:curatorId', async (req: any, res) => {
    try {
      const { curatorId } = req.params;
      
      // Try to find by ID or by slug
      const curatorOrg = await db
        .select({
          id: organizations.id,
          name: organizations.name,
          curatorBio: organizations.curatorBio,
          curatorAboutMe: organizations.curatorAboutMe,
          curatorGenres: organizations.curatorGenres,
          curatorLanguages: organizations.curatorLanguages,
          curatorFaqItems: organizations.curatorFaqItems,
          curatorCoverImageUrl: organizations.curatorCoverImageUrl,
          curatorBannerUrl: organizations.curatorBannerUrl,
          curatorSlug: organizations.curatorSlug,
          spotifyUrl: organizations.spotifyUrl,
          instagramUrl: organizations.instagramUrl,
          youtubeUrl: organizations.youtubeUrl,
          tiktokUrl: organizations.tiktokUrl,
        })
        .from(organizations)
        .where(
          and(
            eq(organizations.type, 'PLAYLIST_CURATOR'),
            or(
              eq(organizations.id, curatorId),
              eq(organizations.curatorSlug, curatorId)
            )
          )
        )
        .limit(1);

      if (curatorOrg.length === 0) {
        return res.status(404).json({ error: "Curator not found" });
      }

      // Get curator's active playlists
      const playlistsData = await db
        .select({
          id: localPlaylists.id,
          name: localPlaylists.name,
          description: localPlaylists.description,
          platform: localPlaylists.platform,
          followerCount: localPlaylists.followerCount,
          tracksCount: localPlaylists.tracksCount,
          genre: localPlaylists.genre,
          imageUrl: localPlaylists.imageUrl,
          playlistUrl: localPlaylists.playlistUrl,
          isActive: localPlaylists.isActive,
          createdAt: localPlaylists.createdAt,
        })
        .from(localPlaylists)
        .where(
          and(
            eq(localPlaylists.curatorOrgId, curatorOrg[0].id),
            eq(localPlaylists.isActive, true)
          )
        )
        .orderBy(desc(localPlaylists.followerCount));

      // Calculate curator statistics
      const applicationsData = await db
        .select({
          status: pitchingApplications.status,
          createdAt: pitchingApplications.createdAt,
          reviewedAt: pitchingApplications.reviewedAt,
          isPlacementVerified: pitchingApplications.isPlacementVerified,
        })
        .from(pitchingApplications)
        .where(eq(pitchingApplications.curatorOrgId, curatorOrg[0].id));

      // Count placed tracks (approved applications only)
      const placedTracksCount = applicationsData.filter(
        app => app.status === 'APPROVED'
      ).length;

      // Calculate average response time in hours
      const reviewedApplications = applicationsData.filter(
        app => app.reviewedAt && app.createdAt
      );
      
      let avgResponseTimeHours: number | null = null;
      let responseSpeed: 'super_fast' | 'fast' | 'slow' | null = null;
      
      if (reviewedApplications.length > 0) {
        const totalHours = reviewedApplications.reduce((sum, app) => {
          const created = new Date(app.createdAt!);
          const reviewed = new Date(app.reviewedAt!);
          const diffMs = reviewed.getTime() - created.getTime();
          const diffHours = diffMs / (1000 * 60 * 60);
          return sum + diffHours;
        }, 0);
        avgResponseTimeHours = totalHours / reviewedApplications.length;
        
        // Determine response speed status
        if (avgResponseTimeHours < 24) {
          responseSpeed = 'super_fast'; // Less than 24 hours
        } else if (avgResponseTimeHours < 48) {
          responseSpeed = 'fast'; // 1-2 days
        } else {
          responseSpeed = 'slow'; // 2+ days
        }
      }

      res.json({
        curator: curatorOrg[0],
        playlists: playlistsData,
        stats: {
          placedTracksCount,
          responseSpeed,
        },
      });
    } catch (error: any) {
      console.error("Error fetching curator profile:", error);
      res.status(500).json({ error: "Failed to fetch curator profile" });
    }
  });

  // GET /api/curator-profile/:curatorId/follower-history - Get aggregated follower history (public)
  app.get('/api/curator-profile/:curatorId/follower-history', async (req: any, res) => {
    try {
      const { curatorId } = req.params;
      const days = parseInt(req.query.days as string) || 30;
      
      const curatorOrg = await db
        .select({ id: organizations.id })
        .from(organizations)
        .where(
          and(
            eq(organizations.type, 'PLAYLIST_CURATOR'),
            or(
              eq(organizations.id, curatorId),
              eq(organizations.curatorSlug, curatorId)
            )
          )
        )
        .limit(1);

      if (curatorOrg.length === 0) {
        return res.status(404).json({ error: "Curator not found" });
      }

      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - days);

      const curatorPlaylists = await db
        .select({ id: localPlaylists.id })
        .from(localPlaylists)
        .where(
          and(
            eq(localPlaylists.curatorOrgId, curatorOrg[0].id),
            eq(localPlaylists.isActive, true)
          )
        );

      const playlistIds = curatorPlaylists.map(p => p.id);

      if (playlistIds.length === 0) {
        return res.json([]);
      }

      const history = await db
        .select({
          date: sql<string>`DATE(${playlistFollowerSnapshots.collectedAt})`,
          totalFollowers: sql<number>`SUM(${playlistFollowerSnapshots.followerCount})`,
        })
        .from(playlistFollowerSnapshots)
        .where(
          and(
            inArray(playlistFollowerSnapshots.playlistId, playlistIds),
            gte(playlistFollowerSnapshots.collectedAt, cutoffDate)
          )
        )
        .groupBy(sql`DATE(${playlistFollowerSnapshots.collectedAt})`)
        .orderBy(asc(sql`DATE(${playlistFollowerSnapshots.collectedAt})`));

      res.json(history);
    } catch (error: any) {
      console.error("Error fetching curator follower history:", error);
      res.status(500).json({ error: "Failed to fetch follower history" });
    }
  });

  // ==========================================
  // CURATOR PLAYLIST MANAGEMENT ENDPOINTS
  // ==========================================

  // Helper to check if user is a curator - verifies membership in PLAYLIST_CURATOR organization
  const isCurator = async (user: AuthenticatedUser) => {
    const userId = getUserId(user);
    
    // Check if user is a member of any PLAYLIST_CURATOR organization
    const curatorMembership = await db.select({ count: sql<number>`count(*)` })
      .from(organizationMembers)
      .innerJoin(organizations, eq(organizationMembers.organizationId, organizations.id))
      .where(and(
        eq(organizationMembers.userId, userId),
        eq(organizations.type, 'PLAYLIST_CURATOR')
      ));
    
    return (curatorMembership[0]?.count || 0) > 0;
  };

  // Get curator org ID - finds PLAYLIST_CURATOR organization user belongs to
  const getCuratorOrgId = async (user: AuthenticatedUser): Promise<string | null> => {
    const userId = getUserId(user);
    
    // Find a PLAYLIST_CURATOR organization the user is a member of
    const curatorOrgs = await db.select({ orgId: organizations.id })
      .from(orgMembers)
      .innerJoin(organizations, eq(orgMembers.orgId, organizations.id))
      .where(and(
        eq(orgMembers.userId, userId),
        eq(organizations.type, 'PLAYLIST_CURATOR')
      ))
      .limit(1);
    
    if (curatorOrgs.length === 0) return null;
    
    return curatorOrgs[0].orgId;
  };

  // GET /api/curator/playlists - Get playlists owned by curator
  app.get('/api/curator/playlists', isAuthenticated, async (req: any, res) => {
    try {
      const curatorOrgId = await getCuratorOrgId(req.user as AuthenticatedUser);
      if (!curatorOrgId) {
        return res.status(403).json({ error: "Curator access required" });
      }

      const playlistsData = await db
        .select()
        .from(localPlaylists)
        .where(eq(localPlaylists.curatorOrgId, curatorOrgId))
        .orderBy(desc(localPlaylists.createdAt));

      res.json(playlistsData);
    } catch (error: any) {
      console.error("Error fetching curator playlists:", error);
      res.status(500).json({ error: "Failed to fetch playlists" });
    }
  });

  // POST /api/curator/playlists - Create a new playlist
  app.post('/api/curator/playlists', isAuthenticated, async (req: any, res) => {
    try {
      const curatorOrgId = await getCuratorOrgId(req.user as AuthenticatedUser);
      if (!curatorOrgId) {
        return res.status(403).json({ error: "Curator access required" });
      }

      const { description, platform, genres, playlistUrl, packages } = req.body;
      
      // Debug logging
      console.log('📦 CREATE PLAYLIST - Received data:', {
        description,
        platform,
        genres,
        playlistUrl,
        packagesCount: packages?.length || 0,
        packages: packages
      });

      if (!playlistUrl) {
        return res.status(400).json({ error: "Playlist URL is required" });
      }

      let name = '';
      let spotifyId = '';
      let fetchedDescription = description || '';
      let imageUrl = '';
      let followerCount = 0;
      let tracksCount = 0;

      if (platform === 'Spotify') {
        spotifyId = extractSpotifyPlaylistId(playlistUrl);
        if (!spotifyId) {
          return res.status(400).json({ error: "Invalid Spotify playlist URL" });
        }

        try {
          const playlistData = await fetchSpotifyPlaylistData(spotifyId);
          if (playlistData && playlistData.name) {
            name = playlistData.name;
            imageUrl = playlistData.imageUrl || '';
            followerCount = playlistData.followerCount || 0;
            tracksCount = playlistData.tracksCount || 0;
            if (!description) {
              const rawDesc = playlistData.description || '';
              fetchedDescription = rawDesc.replace(/&#x2F;/g, '/').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#39;/g, "'").replace(/&quot;/g, '"');
            }
          } else {
            return res.status(400).json({ error: "Could not fetch playlist data from Spotify. The playlist may be private or invalid." });
          }
        } catch (spotifyError) {
          console.error("Failed to fetch Spotify playlist data:", spotifyError);
          return res.status(400).json({ error: "Failed to fetch playlist from Spotify. Please check the URL." });
        }
      } else {
        const urlSlug = playlistUrl.split('/').pop()?.split('?')[0] || 'Playlist';
        name = `${platform} Playlist - ${urlSlug.substring(0, 20)}`;
      }

      if (!name) {
        return res.status(400).json({ error: "Could not determine playlist name" });
      }

      const genreString = Array.isArray(genres) ? genres.join(', ') : '';

      // Validate packages if provided (allow price = 0 for free packages)
      const validPackages = packages && Array.isArray(packages) 
        ? packages.slice(0, 10).filter((pkg: any) => 
            pkg.name && typeof pkg.name === 'string' && pkg.name.trim() &&
            typeof pkg.price === 'number' && pkg.price >= 0 &&
            ['UAH', 'USD', 'EUR'].includes(pkg.currency || 'UAH')
          )
        : [];

      // Use transaction to ensure atomicity
      const newPlaylist = await db.transaction(async (tx) => {
        const [playlist] = await tx
          .insert(localPlaylists)
          .values({
            name,
            description: fetchedDescription,
            platform: platform || 'Spotify',
            genre: genreString,
            playlistUrl,
            spotifyId,
            imageUrl,
            followerCount,
            tracksCount,
            curatorOrgId,
            isActive: true,
          })
          .returning();

        // Save pricing packages if provided
        if (validPackages.length > 0) {
          const packagesToInsert = validPackages.map((pkg: any, index: number) => ({
            playlistId: playlist.id,
            name: pkg.name.trim(),
            price: pkg.price,
            currency: pkg.currency || 'UAH',
            benefits: pkg.description ? [pkg.description] : [],
            includesArtistPhoto: pkg.includesArtistPhoto || false,
            sortOrder: index,
            isActive: true,
          }));

          await tx.insert(curatorPricingPackages).values(packagesToInsert);
        }

        return playlist;
      });

      res.json(newPlaylist);
    } catch (error: any) {
      console.error("Error creating curator playlist:", error);
      res.status(500).json({ error: "Failed to create playlist" });
    }
  });

  // PUT /api/curator/playlists/:id - Update a playlist
  app.put('/api/curator/playlists/:id', isAuthenticated, async (req: any, res) => {
    try {
      const curatorOrgId = await getCuratorOrgId(req.user as AuthenticatedUser);
      if (!curatorOrgId) {
        return res.status(403).json({ error: "Curator access required" });
      }

      const playlistId = parseInt(req.params.id);
      const { description, platform, genres, playlistUrl, packages } = req.body;

      const existing = await db.select().from(localPlaylists).where(
        and(eq(localPlaylists.id, playlistId), eq(localPlaylists.curatorOrgId, curatorOrgId))
      ).limit(1);

      if (!existing[0]) {
        return res.status(404).json({ error: "Playlist not found" });
      }

      let name = existing[0].name;
      let spotifyId = existing[0].spotifyId;
      let fetchedDescription = description || '';
      let imageUrl = existing[0].imageUrl;
      let followerCount = existing[0].followerCount;
      let tracksCount = existing[0].tracksCount;

      if (platform === 'Spotify' && playlistUrl && playlistUrl !== existing[0].playlistUrl) {
        const newSpotifyId = extractSpotifyPlaylistId(playlistUrl);
        if (!newSpotifyId) {
          return res.status(400).json({ error: "Invalid Spotify playlist URL" });
        }
        spotifyId = newSpotifyId;

        try {
          const playlistData = await fetchSpotifyPlaylistData(spotifyId);
          if (playlistData) {
            name = playlistData.name;
            imageUrl = playlistData.imageUrl || '';
            followerCount = playlistData.followerCount || 0;
            tracksCount = playlistData.tracksCount || 0;
            if (!description) {
              const rawDesc = playlistData.description || '';
              fetchedDescription = rawDesc.replace(/&#x2F;/g, '/').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#39;/g, "'").replace(/&quot;/g, '"');
            }
          }
        } catch (spotifyError) {
          console.error("Failed to fetch Spotify playlist data:", spotifyError);
        }
      }

      const genreString = Array.isArray(genres) ? genres.join(', ') : existing[0].genre;

      // Validate packages if provided (allow price = 0 for free packages)
      const validPackages = packages && Array.isArray(packages) 
        ? packages.slice(0, 10).filter((pkg: any) => 
            pkg.name && typeof pkg.name === 'string' && pkg.name.trim() &&
            typeof pkg.price === 'number' && pkg.price >= 0 &&
            ['UAH', 'USD', 'EUR'].includes(pkg.currency || 'UAH')
          )
        : null;

      // Use transaction to ensure atomicity
      const updated = await db.transaction(async (tx) => {
        const [playlist] = await tx
          .update(localPlaylists)
          .set({
            name,
            description: fetchedDescription,
            platform,
            genre: genreString,
            playlistUrl,
            spotifyId,
            imageUrl,
            followerCount,
            tracksCount,
            updatedAt: new Date(),
          })
          .where(eq(localPlaylists.id, playlistId))
          .returning();

        // Update packages if provided (replace all)
        if (validPackages !== null) {
          // Delete existing packages
          await tx.delete(curatorPricingPackages).where(eq(curatorPricingPackages.playlistId, playlistId));
          
          // Insert new packages
          if (validPackages.length > 0) {
            const packagesToInsert = validPackages.map((pkg: any, index: number) => ({
              playlistId: playlist.id,
              name: pkg.name.trim(),
              price: pkg.price,
              currency: pkg.currency || 'UAH',
              benefits: pkg.description ? [pkg.description] : [],
              includesArtistPhoto: pkg.includesArtistPhoto || false,
              sortOrder: index,
              isActive: true,
            }));

            await tx.insert(curatorPricingPackages).values(packagesToInsert);
          }
        }

        return playlist;
      });

      res.json(updated);
    } catch (error: any) {
      console.error("Error updating curator playlist:", error);
      res.status(500).json({ error: "Failed to update playlist" });
    }
  });

  // DELETE /api/curator/playlists/:id - Delete a playlist
  app.delete('/api/curator/playlists/:id', isAuthenticated, async (req: any, res) => {
    try {
      const curatorOrgId = await getCuratorOrgId(req.user as AuthenticatedUser);
      if (!curatorOrgId) {
        return res.status(403).json({ error: "Curator access required" });
      }

      const playlistId = parseInt(req.params.id);

      const existing = await db.select().from(localPlaylists).where(
        and(eq(localPlaylists.id, playlistId), eq(localPlaylists.curatorOrgId, curatorOrgId))
      ).limit(1);

      if (!existing[0]) {
        return res.status(404).json({ error: "Playlist not found" });
      }

      await db.delete(localPlaylists).where(eq(localPlaylists.id, playlistId));
      res.json({ success: true });
    } catch (error: any) {
      console.error("Error deleting curator playlist:", error);
      res.status(500).json({ error: "Failed to delete playlist" });
    }
  });

  // POST /api/curator/playlists/:id/sync - Sync playlist data from Spotify
  app.post('/api/curator/playlists/:id/sync', isAuthenticated, async (req: any, res) => {
    try {
      const curatorOrgId = await getCuratorOrgId(req.user as AuthenticatedUser);
      if (!curatorOrgId) {
        return res.status(403).json({ error: "Curator access required" });
      }

      const playlistId = parseInt(req.params.id);

      const existing = await db.select().from(localPlaylists).where(
        and(eq(localPlaylists.id, playlistId), eq(localPlaylists.curatorOrgId, curatorOrgId))
      ).limit(1);

      if (!existing[0]) {
        return res.status(404).json({ error: "Playlist not found" });
      }

      if (!existing[0].spotifyId) {
        return res.status(400).json({ error: "No Spotify ID configured for this playlist" });
      }

      // Sync with Spotify API using existing helper
      const spotifyData = await fetchSpotifyPlaylistData(existing[0].spotifyId);
      if (!spotifyData) {
        return res.status(500).json({ error: "Failed to fetch data from Spotify" });
      }

      const [updated] = await db
        .update(localPlaylists)
        .set({
          name: spotifyData.name,
          description: spotifyData.description ? spotifyData.description.replace(/&#x2F;/g, '/').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#39;/g, "'").replace(/&quot;/g, '"') : null,
          followerCount: spotifyData.followerCount || null,
          tracksCount: spotifyData.tracksCount || null,
          averageTrackPopularity: spotifyData.averageTrackPopularity || null,
          imageUrl: spotifyData.imageUrl || null,
          playlistUrl: `https://open.spotify.com/playlist/${existing[0].spotifyId}`,
          lastSyncedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(localPlaylists.id, playlistId))
        .returning();

      // Save follower snapshot
      await db.insert(playlistFollowerSnapshots).values({
        playlistId,
        followerCount: spotifyData.followerCount || 0,
        tracksCount: spotifyData.tracksCount || 0,
      });

      res.json(updated);
    } catch (error: any) {
      console.error("Error syncing curator playlist:", error);
      res.status(500).json({ error: "Failed to sync playlist" });
    }
  });

  // POST /api/curator/playlists/sync-all - Sync all curator playlists from Spotify
  app.post('/api/curator/playlists/sync-all', isAuthenticated, async (req: any, res) => {
    try {
      const curatorOrgId = await getCuratorOrgId(req.user as AuthenticatedUser);
      if (!curatorOrgId) {
        return res.status(403).json({ error: "Curator access required" });
      }

      const allPlaylists = await db.select().from(localPlaylists).where(
        eq(localPlaylists.curatorOrgId, curatorOrgId)
      );

      if (allPlaylists.length === 0) {
        return res.json({ synced: 0, failed: 0, results: [] });
      }

      const results: { id: number; name: string; success: boolean; error?: string }[] = [];

      for (const playlist of allPlaylists) {
        if (!playlist.spotifyId) {
          results.push({ id: playlist.id, name: playlist.name, success: false, error: "No Spotify ID" });
          continue;
        }

        try {
          const spotifyData = await fetchSpotifyPlaylistData(playlist.spotifyId);
          if (!spotifyData) {
            results.push({ id: playlist.id, name: playlist.name, success: false, error: "Failed to fetch from Spotify" });
            continue;
          }

          await db
            .update(localPlaylists)
            .set({
              name: spotifyData.name,
              description: spotifyData.description ? spotifyData.description.replace(/&#x2F;/g, '/').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#39;/g, "'").replace(/&quot;/g, '"') : null,
              followerCount: spotifyData.followerCount || null,
              tracksCount: spotifyData.tracksCount || null,
              averageTrackPopularity: spotifyData.averageTrackPopularity || null,
              imageUrl: spotifyData.imageUrl || null,
              playlistUrl: `https://open.spotify.com/playlist/${playlist.spotifyId}`,
              lastSyncedAt: new Date(),
              updatedAt: new Date(),
            })
            .where(eq(localPlaylists.id, playlist.id));

          await db.insert(playlistFollowerSnapshots).values({
            playlistId: playlist.id,
            followerCount: spotifyData.followerCount || 0,
            tracksCount: spotifyData.tracksCount || 0,
          });

          results.push({ id: playlist.id, name: spotifyData.name, success: true });
        } catch (err: any) {
          results.push({ id: playlist.id, name: playlist.name, success: false, error: err.message });
        }
      }

      const synced = results.filter(r => r.success).length;
      const failed = results.filter(r => !r.success).length;

      res.json({ synced, failed, results });
    } catch (error: any) {
      console.error("Error syncing all curator playlists:", error);
      res.status(500).json({ error: "Failed to sync playlists" });
    }
  });

  // POST /api/curator/playlists/:id/toggle-visibility - Toggle playlist visibility
  app.post('/api/curator/playlists/:id/toggle-visibility', isAuthenticated, async (req: any, res) => {
    try {
      const curatorOrgId = await getCuratorOrgId(req.user as AuthenticatedUser);
      if (!curatorOrgId) {
        return res.status(403).json({ error: "Curator access required" });
      }

      const playlistId = parseInt(req.params.id);
      if (isNaN(playlistId) || playlistId <= 0) {
        return res.status(400).json({ error: "Invalid playlist ID" });
      }

      // Use atomic transaction to prevent race conditions
      const result = await db.transaction(async (tx) => {
        const existing = await tx.select().from(localPlaylists).where(
          and(eq(localPlaylists.id, playlistId), eq(localPlaylists.curatorOrgId, curatorOrgId))
        ).limit(1);

        if (!existing[0]) {
          return null;
        }

        const [updated] = await tx
          .update(localPlaylists)
          .set({
            isActive: !existing[0].isActive,
            updatedAt: new Date(),
          })
          .where(eq(localPlaylists.id, playlistId))
          .returning();

        return updated;
      });

      if (!result) {
        return res.status(404).json({ error: "Playlist not found" });
      }

      res.json(result);
    } catch (error: any) {
      console.error("Error toggling playlist visibility:", error);
      res.status(500).json({ error: "Failed to toggle visibility" });
    }
  });

  // GET /api/curator/playlists/history/bulk - Get history for curator's playlists
  app.get('/api/curator/playlists/history/bulk', isAuthenticated, async (req: any, res) => {
    try {
      const curatorOrgId = await getCuratorOrgId(req.user as AuthenticatedUser);
      if (!curatorOrgId) {
        return res.status(403).json({ error: "Curator access required" });
      }

      const days = parseInt(req.query.days as string) || 30;
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - days);

      const curatorPlaylists = await db
        .select({ id: localPlaylists.id })
        .from(localPlaylists)
        .where(eq(localPlaylists.curatorOrgId, curatorOrgId));

      const playlistIds = curatorPlaylists.map(p => p.id);

      if (playlistIds.length === 0) {
        return res.json({});
      }

      const history = await db
        .select()
        .from(playlistFollowerSnapshots)
        .where(
          and(
            inArray(playlistFollowerSnapshots.playlistId, playlistIds),
            gte(playlistFollowerSnapshots.collectedAt, cutoffDate)
          )
        )
        .orderBy(asc(playlistFollowerSnapshots.collectedAt));

      const grouped: Record<number, typeof history> = {};
      for (const snapshot of history) {
        if (!grouped[snapshot.playlistId]) {
          grouped[snapshot.playlistId] = [];
        }
        grouped[snapshot.playlistId].push(snapshot);
      }

      res.json(grouped);
    } catch (error: any) {
      console.error("Error fetching curator playlist history:", error);
      res.status(500).json({ error: "Failed to fetch playlist history" });
    }
  });

  // POST /api/curator/playlists/:id/view - Record a playlist view
  app.post('/api/curator/playlists/:id/view', async (req: any, res) => {
    try {
      const playlistId = parseInt(req.params.id);
      const viewerOrgId = req.user?.selectedOrgId || null;

      await db.insert(curatorPlaylistViews).values({
        playlistId,
        viewerOrgId,
      });

      res.json({ success: true });
    } catch (error: any) {
      console.error("Error recording playlist view:", error);
      res.status(500).json({ error: "Failed to record view" });
    }
  });

  // GET /api/curator/playlists/views - Get view statistics for curator's playlists
  app.get('/api/curator/playlists/views', isAuthenticated, async (req: any, res) => {
    try {
      const curatorOrgId = await getCuratorOrgId(req.user as AuthenticatedUser);
      if (!curatorOrgId) {
        return res.status(403).json({ error: "Curator access required" });
      }

      const startDate = req.query.startDate ? new Date(req.query.startDate as string) : new Date(new Date().setMonth(new Date().getMonth() - 1));
      const endDate = req.query.endDate ? new Date(req.query.endDate as string) : new Date();
      
      // Set end date to end of day
      endDate.setHours(23, 59, 59, 999);

      // Get curator's playlists
      const curatorPlaylists = await db
        .select({ id: localPlaylists.id, name: localPlaylists.name, imageUrl: localPlaylists.imageUrl })
        .from(localPlaylists)
        .where(eq(localPlaylists.curatorOrgId, curatorOrgId));

      const playlistIds = curatorPlaylists.map(p => p.id);

      if (playlistIds.length === 0) {
        return res.json({ playlists: [], viewsByDay: [], totalViews: 0 });
      }

      // Get views within date range
      const views = await db
        .select()
        .from(curatorPlaylistViews)
        .where(
          and(
            inArray(curatorPlaylistViews.playlistId, playlistIds),
            gte(curatorPlaylistViews.viewedAt, startDate),
            lte(curatorPlaylistViews.viewedAt, endDate)
          )
        )
        .orderBy(asc(curatorPlaylistViews.viewedAt));

      // Group views by day and playlist
      const viewsByDay: Record<string, Record<number, number>> = {};
      for (const view of views) {
        const dateKey = view.viewedAt!.toISOString().split('T')[0];
        if (!viewsByDay[dateKey]) {
          viewsByDay[dateKey] = {};
        }
        if (!viewsByDay[dateKey][view.playlistId]) {
          viewsByDay[dateKey][view.playlistId] = 0;
        }
        viewsByDay[dateKey][view.playlistId]++;
      }

      // Convert to array format for chart
      const sortedDates = Object.keys(viewsByDay).sort();
      const chartData = sortedDates.map(date => {
        const dayData: any = { date };
        let total = 0;
        for (const playlist of curatorPlaylists) {
          dayData[`playlist_${playlist.id}`] = viewsByDay[date][playlist.id] || 0;
          total += viewsByDay[date][playlist.id] || 0;
        }
        dayData.total = total;
        return dayData;
      });

      // Calculate per-playlist view totals for ranking
      const playlistViewCounts: Record<number, number> = {};
      for (const view of views) {
        if (!playlistViewCounts[view.playlistId]) {
          playlistViewCounts[view.playlistId] = 0;
        }
        playlistViewCounts[view.playlistId]++;
      }

      // Add viewCount to each playlist and sort by views
      const playlistsWithViews = curatorPlaylists.map(p => ({
        ...p,
        viewCount: playlistViewCounts[p.id] || 0,
      })).sort((a, b) => b.viewCount - a.viewCount);

      res.json({
        playlists: playlistsWithViews,
        viewsByDay: chartData,
        totalViews: views.length,
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
      });
    } catch (error: any) {
      console.error("Error fetching playlist views:", error);
      res.status(500).json({ error: "Failed to fetch playlist views" });
    }
  });

  // GET /api/curator/applications/stats - Get application statistics for curator
  app.get('/api/curator/applications/stats', isAuthenticated, async (req: any, res) => {
    try {
      const curatorOrgId = await getCuratorOrgId(req.user as AuthenticatedUser);
      if (!curatorOrgId) {
        return res.status(403).json({ error: "Curator access required" });
      }

      // Get all applications for this curator
      const applications = await db
        .select({
          id: pitchingApplications.id,
          status: pitchingApplications.status,
          rejectionReason: pitchingApplications.rejectionReason,
          playlistId: pitchingApplications.playlistId,
          orgId: pitchingApplications.orgId,
          createdAt: pitchingApplications.createdAt,
        })
        .from(pitchingApplications)
        .where(eq(pitchingApplications.curatorOrgId, curatorOrgId));

      // Total count
      const totalApplications = applications.length;

      // Status counts
      const statusCounts: Record<string, number> = {};
      for (const app of applications) {
        const status = app.status || 'PENDING';
        statusCounts[status] = (statusCounts[status] || 0) + 1;
      }

      // Approval rate (approved + paid + resolved / total excluding pending and in_review)
      const approvedStatuses = ['APPROVED', 'PAID', 'RESOLVED'];
      const rejectedCount = statusCounts['REJECTED'] || 0;
      const approvedCount = approvedStatuses.reduce((sum, s) => sum + (statusCounts[s] || 0), 0);
      const decidedCount = approvedCount + rejectedCount;
      const approvalRate = decidedCount > 0 ? Math.round((approvedCount / decidedCount) * 100) : 0;

      // Rejection reasons distribution
      const rejectionReasons: Record<string, number> = {};
      for (const app of applications) {
        if (app.status === 'REJECTED' && app.rejectionReason) {
          rejectionReasons[app.rejectionReason] = (rejectionReasons[app.rejectionReason] || 0) + 1;
        }
      }

      // Monthly applications (last 12 months)
      const monthlyData: Record<string, number> = {};
      const now = new Date();
      for (let i = 11; i >= 0; i--) {
        const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
        monthlyData[key] = 0;
      }
      for (const app of applications) {
        if (app.createdAt) {
          const date = new Date(app.createdAt);
          const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
          if (monthlyData[key] !== undefined) {
            monthlyData[key]++;
          }
        }
      }
      const applicationsByMonth = Object.entries(monthlyData).map(([month, count]) => ({
        month,
        count,
      }));

      // Top organizations (artists) by application count
      const orgCounts: Record<string, number> = {};
      for (const app of applications) {
        if (app.orgId) {
          orgCounts[app.orgId] = (orgCounts[app.orgId] || 0) + 1;
        }
      }
      const topOrgIds = Object.entries(orgCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([orgId, count]) => ({ orgId, count }));

      // Fetch org names
      const orgIds = topOrgIds.map(o => o.orgId);
      let orgsData: { id: string; name: string }[] = [];
      if (orgIds.length > 0) {
        orgsData = await db
          .select({ id: organizations.id, name: organizations.name })
          .from(organizations)
          .where(inArray(organizations.id, orgIds));
      }
      const orgNameMap = new Map(orgsData.map(o => [o.id, o.name]));
      const topArtists = topOrgIds.map(o => ({
        orgId: o.orgId,
        name: orgNameMap.get(o.orgId) || 'Unknown',
        applicationCount: o.count,
      }));

      // Top playlists by application count
      const playlistCounts: Record<number, number> = {};
      for (const app of applications) {
        if (app.playlistId) {
          playlistCounts[app.playlistId] = (playlistCounts[app.playlistId] || 0) + 1;
        }
      }
      const topPlaylistIds = Object.entries(playlistCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([playlistId, count]) => ({ playlistId: parseInt(playlistId), count }));

      // Fetch playlist names
      const playlistIds = topPlaylistIds.map(p => p.playlistId);
      let playlistsData: { id: number; name: string; imageUrl: string | null }[] = [];
      if (playlistIds.length > 0) {
        playlistsData = await db
          .select({ id: localPlaylists.id, name: localPlaylists.name, imageUrl: localPlaylists.imageUrl })
          .from(localPlaylists)
          .where(inArray(localPlaylists.id, playlistIds));
      }
      const playlistDataMap = new Map(playlistsData.map(p => [p.id, p]));
      const topPlaylists = topPlaylistIds.map(p => ({
        playlistId: p.playlistId,
        name: playlistDataMap.get(p.playlistId)?.name || 'Unknown',
        imageUrl: playlistDataMap.get(p.playlistId)?.imageUrl || null,
        applicationCount: p.count,
      }));

      res.json({
        totalApplications,
        statusCounts,
        approvalRate,
        rejectionReasons,
        applicationsByMonth,
        topArtists,
        topPlaylists,
      });
    } catch (error: any) {
      console.error("Error fetching application stats:", error);
      res.status(500).json({ error: "Failed to fetch application statistics" });
    }
  });

  // GET /api/curator/playlists/:id/pricing - Get pricing packages for a playlist
  app.get('/api/curator/playlists/:id/pricing', isAuthenticated, async (req: any, res) => {
    try {
      const curatorOrgId = await getCuratorOrgId(req.user as AuthenticatedUser);
      if (!curatorOrgId) {
        return res.status(403).json({ error: "Curator access required" });
      }

      const playlistId = parseInt(req.params.id);

      // Verify ownership
      const existing = await db
        .select()
        .from(localPlaylists)
        .where(and(
          eq(localPlaylists.id, playlistId),
          eq(localPlaylists.curatorOrgId, curatorOrgId)
        ))
        .limit(1);

      if (existing.length === 0) {
        return res.status(404).json({ error: "Playlist not found" });
      }

      const packages = await db
        .select()
        .from(curatorPricingPackages)
        .where(eq(curatorPricingPackages.playlistId, playlistId))
        .orderBy(asc(curatorPricingPackages.sortOrder));

      res.json(packages);
    } catch (error: any) {
      console.error("Error fetching pricing packages:", error);
      res.status(500).json({ error: "Failed to fetch pricing packages" });
    }
  });

  // POST /api/curator/playlists/:id/pricing - Create a pricing package
  app.post('/api/curator/playlists/:id/pricing', isAuthenticated, async (req: any, res) => {
    try {
      const curatorOrgId = await getCuratorOrgId(req.user as AuthenticatedUser);
      if (!curatorOrgId) {
        return res.status(403).json({ error: "Curator access required" });
      }

      const playlistId = parseInt(req.params.id);
      const { name, price, currency = 'UAH', benefits = [] } = req.body;

      if (!name || typeof price !== 'number' || price < 0) {
        return res.status(400).json({ error: "Invalid package data" });
      }

      // Verify ownership
      const existing = await db
        .select()
        .from(localPlaylists)
        .where(and(
          eq(localPlaylists.id, playlistId),
          eq(localPlaylists.curatorOrgId, curatorOrgId)
        ))
        .limit(1);

      if (existing.length === 0) {
        return res.status(404).json({ error: "Playlist not found" });
      }

      // Get current max sortOrder
      const maxOrder = await db
        .select({ max: sql<number>`COALESCE(MAX(sort_order), 0)` })
        .from(curatorPricingPackages)
        .where(eq(curatorPricingPackages.playlistId, playlistId));

      const [newPackage] = await db
        .insert(curatorPricingPackages)
        .values({
          playlistId,
          name,
          price,
          currency,
          benefits,
          sortOrder: (maxOrder[0]?.max || 0) + 1,
        })
        .returning();

      res.status(201).json(newPackage);
    } catch (error: any) {
      console.error("Error creating pricing package:", error);
      res.status(500).json({ error: "Failed to create pricing package" });
    }
  });

  // PUT /api/curator/pricing/:id - Update a pricing package
  app.put('/api/curator/pricing/:id', isAuthenticated, async (req: any, res) => {
    try {
      const curatorOrgId = await getCuratorOrgId(req.user as AuthenticatedUser);
      if (!curatorOrgId) {
        return res.status(403).json({ error: "Curator access required" });
      }

      const packageId = parseInt(req.params.id);
      const { name, price, currency, benefits, isActive } = req.body;

      // Get the package and verify ownership via playlist
      const existingPackage = await db
        .select({ pkg: curatorPricingPackages, playlist: localPlaylists })
        .from(curatorPricingPackages)
        .leftJoin(localPlaylists, eq(curatorPricingPackages.playlistId, localPlaylists.id))
        .where(eq(curatorPricingPackages.id, packageId))
        .limit(1);

      if (existingPackage.length === 0) {
        return res.status(404).json({ error: "Package not found" });
      }

      if (existingPackage[0].playlist?.curatorOrgId !== curatorOrgId) {
        return res.status(403).json({ error: "Not authorized to edit this package" });
      }

      const updates: any = { updatedAt: new Date() };
      if (name !== undefined) updates.name = name;
      if (price !== undefined) updates.price = price;
      if (currency !== undefined) updates.currency = currency;
      if (benefits !== undefined) updates.benefits = benefits;
      if (isActive !== undefined) updates.isActive = isActive;

      const [updated] = await db
        .update(curatorPricingPackages)
        .set(updates)
        .where(eq(curatorPricingPackages.id, packageId))
        .returning();

      res.json(updated);
    } catch (error: any) {
      console.error("Error updating pricing package:", error);
      res.status(500).json({ error: "Failed to update pricing package" });
    }
  });

  // DELETE /api/curator/pricing/:id - Delete a pricing package
  app.delete('/api/curator/pricing/:id', isAuthenticated, async (req: any, res) => {
    try {
      const curatorOrgId = await getCuratorOrgId(req.user as AuthenticatedUser);
      if (!curatorOrgId) {
        return res.status(403).json({ error: "Curator access required" });
      }

      const packageId = parseInt(req.params.id);

      // Get the package and verify ownership via playlist
      const existingPackage = await db
        .select({ pkg: curatorPricingPackages, playlist: localPlaylists })
        .from(curatorPricingPackages)
        .leftJoin(localPlaylists, eq(curatorPricingPackages.playlistId, localPlaylists.id))
        .where(eq(curatorPricingPackages.id, packageId))
        .limit(1);

      if (existingPackage.length === 0) {
        return res.status(404).json({ error: "Package not found" });
      }

      if (existingPackage[0].playlist?.curatorOrgId !== curatorOrgId) {
        return res.status(403).json({ error: "Not authorized to delete this package" });
      }

      await db
        .delete(curatorPricingPackages)
        .where(eq(curatorPricingPackages.id, packageId));

      res.json({ success: true });
    } catch (error: any) {
      console.error("Error deleting pricing package:", error);
      res.status(500).json({ error: "Failed to delete pricing package" });
    }
  });

  // GET /api/curator/organization - Get curator's organization
  app.get('/api/curator/organization', isAuthenticated, async (req: any, res) => {
    try {
      const curatorOrgId = await getCuratorOrgId(req.user as AuthenticatedUser);
      if (!curatorOrgId) {
        return res.status(403).json({ error: "Curator access required" });
      }

      const org = await db.select().from(organizations).where(eq(organizations.id, curatorOrgId)).limit(1);
      if (!org.length) {
        return res.status(404).json({ error: "Organization not found" });
      }

      res.json({ id: org[0].id, name: org[0].name });
    } catch (error) {
      console.error("Error fetching curator organization:", error);
      res.status(500).json({ error: "Failed to fetch curator organization" });
    }
  });

  // GET /api/curator/notification-preferences - Get curator's notification preferences
  app.get('/api/curator/notification-preferences', isAuthenticated, async (req: any, res) => {
    try {
      const curatorOrgId = await getCuratorOrgId(req.user as AuthenticatedUser);
      if (!curatorOrgId) {
        return res.status(403).json({ error: "Curator access required" });
      }

      const org = await db.select({
        curatorNotifyEmail: organizations.curatorNotifyEmail,
        curatorNotifyNewApplications: organizations.curatorNotifyNewApplications,
        curatorNotifyStatusUpdates: organizations.curatorNotifyStatusUpdates,
      }).from(organizations).where(eq(organizations.id, curatorOrgId)).limit(1);

      if (!org.length) {
        return res.status(404).json({ error: "Organization not found" });
      }

      res.json({
        emailNotifications: org[0].curatorNotifyEmail ?? true,
        newApplications: org[0].curatorNotifyNewApplications ?? true,
        statusUpdates: org[0].curatorNotifyStatusUpdates ?? true,
      });
    } catch (error) {
      console.error("Error fetching curator notification preferences:", error);
      res.status(500).json({ error: "Failed to fetch notification preferences" });
    }
  });

  // PUT /api/curator/notification-preferences - Update curator's notification preferences
  app.put('/api/curator/notification-preferences', isAuthenticated, async (req: any, res) => {
    try {
      const curatorOrgId = await getCuratorOrgId(req.user as AuthenticatedUser);
      if (!curatorOrgId) {
        return res.status(403).json({ error: "Curator access required" });
      }

      const { emailNotifications, newApplications, statusUpdates } = req.body;

      const updateData: any = {};
      if (typeof emailNotifications === 'boolean') {
        updateData.curatorNotifyEmail = emailNotifications;
      }
      if (typeof newApplications === 'boolean') {
        updateData.curatorNotifyNewApplications = newApplications;
      }
      if (typeof statusUpdates === 'boolean') {
        updateData.curatorNotifyStatusUpdates = statusUpdates;
      }

      if (Object.keys(updateData).length === 0) {
        return res.status(400).json({ error: "No valid fields to update" });
      }

      await db.update(organizations)
        .set(updateData)
        .where(eq(organizations.id, curatorOrgId));

      res.json({ success: true });
    } catch (error) {
      console.error("Error updating curator notification preferences:", error);
      res.status(500).json({ error: "Failed to update notification preferences" });
    }
  });

  // GET /api/curator/balance - Get curator's financial balance
  app.get('/api/curator/balance', isAuthenticated, async (req: any, res) => {
    try {
      const curatorOrgId = await getCuratorOrgId(req.user as AuthenticatedUser);
      if (!curatorOrgId) {
        return res.status(403).json({ error: "Curator access required" });
      }

      const now = new Date();

      // Get all transactions for this curator
      const transactions = await db
        .select()
        .from(curatorTransactions)
        .where(eq(curatorTransactions.curatorOrgId, curatorOrgId));

      // Update PENDING transactions that are now available
      for (const tx of transactions) {
        if (tx.type === 'INCOME' && tx.status === 'PENDING' && tx.availableAt && tx.availableAt <= now) {
          await db
            .update(curatorTransactions)
            .set({ status: 'AVAILABLE', updatedAt: new Date() })
            .where(eq(curatorTransactions.id, tx.id));
          tx.status = 'AVAILABLE';
        }
      }

      // Calculate balances
      let availableBalance = 0;
      let pendingBalance = 0;
      let totalEarned = 0;
      let totalWithdrawn = 0;

      for (const tx of transactions) {
        if (tx.type === 'INCOME') {
          totalEarned += tx.amount;
          if (tx.status === 'AVAILABLE') {
            availableBalance += tx.amount;
          } else if (tx.status === 'PENDING') {
            pendingBalance += tx.amount;
          }
        } else if (tx.type === 'WITHDRAWAL') {
          if (tx.status === 'COMPLETED') {
            totalWithdrawn += tx.amount;
          } else if (tx.status === 'PROCESSING') {
            // Funds already deducted from available when withdrawal was requested
          }
        }
      }

      // Subtract processing withdrawals from available
      const processingWithdrawals = transactions
        .filter(tx => tx.type === 'WITHDRAWAL' && tx.status === 'PROCESSING')
        .reduce((sum, tx) => sum + tx.amount, 0);
      
      availableBalance -= processingWithdrawals;
      availableBalance -= totalWithdrawn;

      res.json({
        availableBalance, // In kopecks
        pendingBalance,   // In kopecks
        totalEarned,      // In kopecks
        totalWithdrawn,   // In kopecks
        currency: 'UAH',
      });
    } catch (error: any) {
      console.error("Error fetching curator balance:", error);
      res.status(500).json({ error: "Failed to fetch balance" });
    }
  });

  // GET /api/curator/transactions - Get curator's transaction history
  app.get('/api/curator/transactions', isAuthenticated, async (req: any, res) => {
    try {
      const curatorOrgId = await getCuratorOrgId(req.user as AuthenticatedUser);
      if (!curatorOrgId) {
        return res.status(403).json({ error: "Curator access required" });
      }

      const transactions = await db
        .select()
        .from(curatorTransactions)
        .where(eq(curatorTransactions.curatorOrgId, curatorOrgId))
        .orderBy(desc(curatorTransactions.createdAt));

      res.json(transactions);
    } catch (error: any) {
      console.error("Error fetching curator transactions:", error);
      res.status(500).json({ error: "Failed to fetch transactions" });
    }
  });

  // POST /api/curator/withdraw - Request funds withdrawal
  app.post('/api/curator/withdraw', isAuthenticated, async (req: any, res) => {
    try {
      const curatorOrgId = await getCuratorOrgId(req.user as AuthenticatedUser);
      if (!curatorOrgId) {
        return res.status(403).json({ error: "Curator access required" });
      }

      const { amount, bankAccount } = req.body;

      if (!amount || amount <= 0) {
        return res.status(400).json({ error: "Invalid withdrawal amount" });
      }

      if (!bankAccount || !bankAccount.iban || !bankAccount.recipientName) {
        return res.status(400).json({ error: "Bank account details required" });
      }

      // Get current available balance
      const now = new Date();
      const transactions = await db
        .select()
        .from(curatorTransactions)
        .where(eq(curatorTransactions.curatorOrgId, curatorOrgId));

      // Update PENDING to AVAILABLE if time has passed
      for (const tx of transactions) {
        if (tx.type === 'INCOME' && tx.status === 'PENDING' && tx.availableAt && tx.availableAt <= now) {
          await db
            .update(curatorTransactions)
            .set({ status: 'AVAILABLE', updatedAt: new Date() })
            .where(eq(curatorTransactions.id, tx.id));
          tx.status = 'AVAILABLE';
        }
      }

      // Calculate available balance
      let availableBalance = 0;
      for (const tx of transactions) {
        if (tx.type === 'INCOME' && tx.status === 'AVAILABLE') {
          availableBalance += tx.amount;
        } else if (tx.type === 'WITHDRAWAL' && (tx.status === 'PROCESSING' || tx.status === 'COMPLETED')) {
          availableBalance -= tx.amount;
        }
      }

      if (amount > availableBalance) {
        return res.status(400).json({ 
          error: "Insufficient funds",
          availableBalance,
          requestedAmount: amount,
        });
      }

      // Create withdrawal transaction
      const [withdrawal] = await db
        .insert(curatorTransactions)
        .values({
          curatorOrgId,
          type: 'WITHDRAWAL',
          status: 'PROCESSING',
          amount,
          currency: 'UAH',
          description: `Виведення коштів на ${bankAccount.iban.slice(-4)}`,
          bankAccount: JSON.stringify(bankAccount),
        })
        .returning();

      await storage.logAction({
        userId: req.user.id,
        orgId: curatorOrgId,
        action: 'CURATOR_WITHDRAWAL_REQUESTED',
        entity: 'curator_transaction',
        entityId: withdrawal.id,
        data: {
          amount,
          currency: 'UAH',
          bankAccountIban: bankAccount.iban,
        }
      });

      // Notify platform admins about curator withdrawal request
      try {
        const curatorOrg = await db.select().from(organizations).where(eq(organizations.id, curatorOrgId)).limit(1);
        const curatorName = curatorOrg[0]?.name || 'Куратор';
        const amountFormatted = (amount / 100).toFixed(2);
        
        const notificationTitle = '💸 Запит на виведення коштів (куратор)';
        const notificationMessage = `${curatorName} запросив виведення ${amountFormatted} ₴ на ${bankAccount.iban.slice(-4)}`;
        
        // Get all platform admins
        const admins = await db.select().from(users).where(eq(users.role, "ADMIN"));
        
        for (const admin of admins) {
          await storage.createNotification({
            userId: admin.id,
            releaseId: null,
            pitchingId: null,
            relatedEntityType: "curatorWithdrawal",
            relatedEntityId: withdrawal.id,
            title: notificationTitle,
            message: notificationMessage,
            type: "CURATOR_WITHDRAWAL_REQUESTED",
            changedFields: null,
            isRead: false,
          });
        }
        
        // Send Telegram notification to admins
        const { sendTelegramNotification } = await import("./telegram");
        void sendTelegramNotification(notificationTitle, notificationMessage).catch(err => {
          console.error("Error sending Telegram notification for curator withdrawal:", err);
        });
      } catch (notifyError) {
        console.error("Error sending withdrawal notifications:", notifyError);
      }

      res.json({
        success: true,
        transactionId: withdrawal.id,
        message: 'Запит на виведення прийнято. Кошти будуть перераховані протягом 1-3 робочих днів.',
      });
    } catch (error: any) {
      console.error("Error processing withdrawal:", error);
      res.status(500).json({ error: "Failed to process withdrawal" });
    }
  });

  // GET /api/curator/finance-analytics - Get detailed finance analytics for curator
  app.get('/api/curator/finance-analytics', isAuthenticated, async (req: any, res) => {
    try {
      const curatorOrgId = await getCuratorOrgId(req.user as AuthenticatedUser);
      if (!curatorOrgId) {
        return res.status(403).json({ error: "Curator access required" });
      }

      // Get all income transactions for this curator
      const incomeTransactions = await db
        .select({
          id: curatorTransactions.id,
          amount: curatorTransactions.amount,
          applicationId: curatorTransactions.applicationId,
          createdAt: curatorTransactions.createdAt,
        })
        .from(curatorTransactions)
        .where(and(
          eq(curatorTransactions.curatorOrgId, curatorOrgId),
          eq(curatorTransactions.type, 'INCOME')
        ));

      // Get all completed withdrawals
      const withdrawals = await db
        .select({
          amount: curatorTransactions.amount,
        })
        .from(curatorTransactions)
        .where(and(
          eq(curatorTransactions.curatorOrgId, curatorOrgId),
          eq(curatorTransactions.type, 'WITHDRAWAL'),
          eq(curatorTransactions.status, 'COMPLETED')
        ));

      const totalWithdrawn = withdrawals.reduce((sum, w) => sum + w.amount, 0);

      // Get application IDs from income transactions
      const applicationIds = incomeTransactions
        .filter(tx => tx.applicationId)
        .map(tx => tx.applicationId as string);

      // Get applications with related data
      let applicationsData: any[] = [];
      if (applicationIds.length > 0) {
        applicationsData = await db
          .select({
            id: pitchingApplications.id,
            orgId: pitchingApplications.orgId,
            playlistId: pitchingApplications.playlistId,
            packageId: pitchingApplications.packageId,
            paidAmount: pitchingApplications.paidAmount,
            createdAt: pitchingApplications.createdAt,
          })
          .from(pitchingApplications)
          .where(inArray(pitchingApplications.id, applicationIds));
      }

      // Create lookup maps
      const applicationMap = new Map(applicationsData.map(a => [a.id, a]));

      // Get unique org IDs and playlist IDs
      const orgIds = [...new Set(applicationsData.map(a => a.orgId))];
      const playlistIds = [...new Set(applicationsData.map(a => a.playlistId))];
      const packageIds = [...new Set(applicationsData.map(a => a.packageId))];

      // Fetch organization names
      let orgsData: any[] = [];
      if (orgIds.length > 0) {
        orgsData = await db
          .select({ id: organizations.id, name: organizations.name })
          .from(organizations)
          .where(inArray(organizations.id, orgIds));
      }
      const orgMap = new Map(orgsData.map(o => [o.id, o.name]));

      // Fetch playlist names
      let playlistsData: any[] = [];
      if (playlistIds.length > 0) {
        playlistsData = await db
          .select({ id: localPlaylists.id, name: localPlaylists.name, imageUrl: localPlaylists.imageUrl })
          .from(localPlaylists)
          .where(inArray(localPlaylists.id, playlistIds));
      }
      const playlistMap = new Map(playlistsData.map(p => [p.id, p]));

      // Fetch package names
      let packagesData: any[] = [];
      if (packageIds.length > 0) {
        packagesData = await db
          .select({ id: curatorPricingPackages.id, name: curatorPricingPackages.name })
          .from(curatorPricingPackages)
          .where(inArray(curatorPricingPackages.id, packageIds));
      }
      const packageMap = new Map(packagesData.map(p => [p.id, p.name]));

      // Calculate monthly earnings (last 12 months)
      const monthlyEarnings: { month: string; amount: number }[] = [];
      const now = new Date();
      for (let i = 11; i >= 0; i--) {
        const monthDate = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const monthKey = `${monthDate.getFullYear()}-${String(monthDate.getMonth() + 1).padStart(2, '0')}`;
        monthlyEarnings.push({ month: monthKey, amount: 0 });
      }

      for (const tx of incomeTransactions) {
        if (tx.createdAt) {
          const txDate = new Date(tx.createdAt);
          const monthKey = `${txDate.getFullYear()}-${String(txDate.getMonth() + 1).padStart(2, '0')}`;
          const monthEntry = monthlyEarnings.find(m => m.month === monthKey);
          if (monthEntry) {
            monthEntry.amount += tx.amount;
          }
        }
      }

      // Calculate earnings this month
      const currentMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
      const earningsThisMonth = monthlyEarnings.find(m => m.month === currentMonthKey)?.amount || 0;

      // Calculate top playlists by income
      const playlistIncomeMap = new Map<number, { name: string; imageUrl: string | null; amount: number }>();
      for (const tx of incomeTransactions) {
        if (tx.applicationId) {
          const app = applicationMap.get(tx.applicationId);
          if (app) {
            const playlist = playlistMap.get(app.playlistId);
            if (playlist) {
              const existing = playlistIncomeMap.get(app.playlistId);
              if (existing) {
                existing.amount += tx.amount;
              } else {
                playlistIncomeMap.set(app.playlistId, {
                  name: playlist.name,
                  imageUrl: playlist.imageUrl,
                  amount: tx.amount,
                });
              }
            }
          }
        }
      }
      const topPlaylists = Array.from(playlistIncomeMap.values())
        .sort((a, b) => b.amount - a.amount)
        .slice(0, 5);

      // Calculate top artists by income
      const artistIncomeMap = new Map<string, { name: string; amount: number }>();
      for (const tx of incomeTransactions) {
        if (tx.applicationId) {
          const app = applicationMap.get(tx.applicationId);
          if (app) {
            const orgName = orgMap.get(app.orgId);
            if (orgName) {
              const existing = artistIncomeMap.get(app.orgId);
              if (existing) {
                existing.amount += tx.amount;
              } else {
                artistIncomeMap.set(app.orgId, { name: orgName, amount: tx.amount });
              }
            }
          }
        }
      }
      const topArtists = Array.from(artistIncomeMap.values())
        .sort((a, b) => b.amount - a.amount)
        .slice(0, 3);

      // Calculate package distribution
      const packageCountMap = new Map<string, { name: string; count: number; amount: number }>();
      for (const tx of incomeTransactions) {
        if (tx.applicationId) {
          const app = applicationMap.get(tx.applicationId);
          if (app) {
            const packageName = packageMap.get(app.packageId) || 'Unknown';
            const existing = packageCountMap.get(packageName);
            if (existing) {
              existing.count += 1;
              existing.amount += tx.amount;
            } else {
              packageCountMap.set(packageName, { name: packageName, count: 1, amount: tx.amount });
            }
          }
        }
      }
      const packageDistribution = Array.from(packageCountMap.values())
        .sort((a, b) => b.count - a.count);

      // Calculate stats
      const totalApplications = incomeTransactions.length;
      const averageCheck = totalApplications > 0 
        ? Math.round(incomeTransactions.reduce((sum, tx) => sum + tx.amount, 0) / totalApplications)
        : 0;

      res.json({
        totalWithdrawn,
        monthlyEarnings,
        earningsThisMonth,
        topPlaylists,
        topArtists,
        packageDistribution,
        stats: {
          totalApplications,
          averageCheck,
        },
      });
    } catch (error: any) {
      console.error("Error fetching curator finance analytics:", error);
      res.status(500).json({ error: "Failed to fetch analytics" });
    }
  });

  // GET /api/curator/finance-analytics/:month - Get finance analytics for a specific month
  app.get('/api/curator/finance-analytics/:month', isAuthenticated, async (req: any, res) => {
    try {
      const curatorOrgId = await getCuratorOrgId(req.user as AuthenticatedUser);
      if (!curatorOrgId) {
        return res.status(403).json({ error: "Curator access required" });
      }

      const monthParam = req.params.month; // Format: "2026-01"
      if (!monthParam || !/^\d{4}-\d{2}$/.test(monthParam)) {
        return res.status(400).json({ error: "Invalid month format. Use YYYY-MM" });
      }

      const [year, month] = monthParam.split('-').map(Number);
      const monthStart = new Date(year, month - 1, 1);
      const monthEnd = new Date(year, month, 1);

      // Get income transactions for this specific month
      const incomeTransactions = await db
        .select({
          id: curatorTransactions.id,
          amount: curatorTransactions.amount,
          applicationId: curatorTransactions.applicationId,
          createdAt: curatorTransactions.createdAt,
        })
        .from(curatorTransactions)
        .where(and(
          eq(curatorTransactions.curatorOrgId, curatorOrgId),
          eq(curatorTransactions.type, 'INCOME'),
          gte(curatorTransactions.createdAt, monthStart),
          lt(curatorTransactions.createdAt, monthEnd)
        ));

      // Get application IDs from income transactions
      const applicationIds = incomeTransactions
        .filter(tx => tx.applicationId)
        .map(tx => tx.applicationId as string);

      // Get applications with related data
      let applicationsData: any[] = [];
      if (applicationIds.length > 0) {
        applicationsData = await db
          .select({
            id: pitchingApplications.id,
            orgId: pitchingApplications.orgId,
            playlistId: pitchingApplications.playlistId,
            packageId: pitchingApplications.packageId,
            paidAmount: pitchingApplications.paidAmount,
          })
          .from(pitchingApplications)
          .where(inArray(pitchingApplications.id, applicationIds));
      }

      const applicationMap = new Map(applicationsData.map(a => [a.id, a]));

      // Get unique org IDs and playlist IDs
      const orgIds = [...new Set(applicationsData.map(a => a.orgId))];
      const playlistIds = [...new Set(applicationsData.map(a => a.playlistId))];

      // Fetch organization names
      let orgsData: any[] = [];
      if (orgIds.length > 0) {
        orgsData = await db
          .select({ id: organizations.id, name: organizations.name })
          .from(organizations)
          .where(inArray(organizations.id, orgIds));
      }
      const orgMap = new Map(orgsData.map(o => [o.id, o.name]));

      // Fetch playlist data
      let playlistsData: any[] = [];
      if (playlistIds.length > 0) {
        playlistsData = await db
          .select({ id: localPlaylists.id, name: localPlaylists.name, imageUrl: localPlaylists.imageUrl })
          .from(localPlaylists)
          .where(inArray(localPlaylists.id, playlistIds));
      }
      const playlistMap = new Map(playlistsData.map(p => [p.id, p]));

      // Calculate total earnings for this month
      const earnings = incomeTransactions.reduce((sum, tx) => sum + tx.amount, 0);

      // Calculate top playlists by income (for this month)
      const playlistIncomeMap = new Map<number, { name: string; imageUrl: string | null; amount: number }>();
      for (const tx of incomeTransactions) {
        if (tx.applicationId) {
          const app = applicationMap.get(tx.applicationId);
          if (app) {
            const playlist = playlistMap.get(app.playlistId);
            if (playlist) {
              const existing = playlistIncomeMap.get(app.playlistId);
              if (existing) {
                existing.amount += tx.amount;
              } else {
                playlistIncomeMap.set(app.playlistId, {
                  name: playlist.name,
                  imageUrl: playlist.imageUrl,
                  amount: tx.amount,
                });
              }
            }
          }
        }
      }
      const topPlaylists = Array.from(playlistIncomeMap.values())
        .sort((a, b) => b.amount - a.amount)
        .slice(0, 5);

      // Calculate top artists by income (for this month)
      const artistIncomeMap = new Map<string, { name: string; amount: number }>();
      for (const tx of incomeTransactions) {
        if (tx.applicationId) {
          const app = applicationMap.get(tx.applicationId);
          if (app) {
            const orgName = orgMap.get(app.orgId);
            if (orgName) {
              const existing = artistIncomeMap.get(app.orgId);
              if (existing) {
                existing.amount += tx.amount;
              } else {
                artistIncomeMap.set(app.orgId, { name: orgName, amount: tx.amount });
              }
            }
          }
        }
      }
      const topArtists = Array.from(artistIncomeMap.values())
        .sort((a, b) => b.amount - a.amount)
        .slice(0, 3);

      // Calculate stats
      const totalApplications = incomeTransactions.length;
      const averageCheck = totalApplications > 0 
        ? Math.round(earnings / totalApplications)
        : 0;

      res.json({
        month: monthParam,
        earnings,
        topPlaylists,
        topArtists,
        stats: {
          totalApplications,
          averageCheck,
        },
      });
    } catch (error: any) {
      console.error("Error fetching curator month analytics:", error);
      res.status(500).json({ error: "Failed to fetch month analytics" });
    }
  });

  // ==========================================
  // END CURATOR ENDPOINTS
  // ==========================================

  // GET /api/admin/playlist-curators - Get organizations with type PLAYLIST_CURATOR
  app.get('/api/admin/playlist-curators', isAuthenticated, async (req: any, res) => {
    try {
      const userId = getUserId(req.user as AuthenticatedUser);
      const currentUser = await storage.getUser(userId);
      
      if (!isPlatformAdmin(currentUser)) {
        return res.status(403).json({ error: "Admin access required" });
      }

      const curators = await db
        .select({ id: organizations.id, name: organizations.name })
        .from(organizations)
        .where(eq(organizations.type, 'PLAYLIST_CURATOR'))
        .orderBy(organizations.name);

      res.json(curators);
    } catch (error: any) {
      console.error("Error fetching playlist curators:", error);
      res.status(500).json({ error: "Failed to fetch curators" });
    }
  });

  // POST /api/admin/local-playlists/upload-image - Upload playlist image to Google Drive
  app.post('/api/admin/local-playlists/upload-image', isAuthenticated, async (req: any, res) => {
    try {
      const userId = getUserId(req.user as AuthenticatedUser);
      const currentUser = await storage.getUser(userId);
      
      if (!isPlatformAdmin(currentUser)) {
        return res.status(403).json({ error: "Admin access required" });
      }

      const multer = (await import('multer')).default;
      const upload = multer({ 
        storage: multer.memoryStorage(),
        limits: { fileSize: 10 * 1024 * 1024 }
      });
      
      await new Promise<void>((resolve, reject) => {
        upload.single('image')(req, res, (err) => {
          if (err) {
            reject(err);
          } else {
            resolve();
          }
        });
      });
      
      if (!req.file) {
        return res.status(400).json({ error: "No file provided" });
      }

      const fileName = `playlist_${Date.now()}_${req.file.originalname}`;
      const result = await googleDriveStorage.uploadFile(
        req.file.buffer,
        fileName,
        req.file.mimetype
      );

      res.json({ fileId: result.fileId, imageUrl: result.webContentLink });
    } catch (error: any) {
      console.error("Error uploading playlist image:", error);
      res.status(500).json({ error: "Failed to upload image" });
    }
  });

  // GET /api/admin/local-playlists - Admin get all local playlists (including inactive)
  app.get('/api/admin/local-playlists', isAuthenticated, async (req: any, res) => {
    try {
      const userId = getUserId(req.user as AuthenticatedUser);
      const currentUser = await storage.getUser(userId);
      
      if (!isPlatformAdmin(currentUser)) {
        return res.status(403).json({ error: "Admin access required" });
      }

      const playlists = await db
        .select()
        .from(localPlaylists)
        .orderBy(desc(localPlaylists.createdAt));

      res.json(playlists);
    } catch (error: any) {
      console.error("Error fetching admin local playlists:", error);
      res.status(500).json({ error: "Failed to fetch playlists" });
    }
  });

  // POST /api/admin/local-playlists - Admin create a new local playlist
  app.post('/api/admin/local-playlists', isAuthenticated, async (req: any, res) => {
    try {
      const userId = getUserId(req.user as AuthenticatedUser);
      const currentUser = await storage.getUser(userId);
      
      if (!isPlatformAdmin(currentUser)) {
        return res.status(403).json({ error: "Admin access required" });
      }

      const validatedData = insertLocalPlaylistSchema.parse(req.body);
      
      const [playlist] = await db
        .insert(localPlaylists)
        .values(validatedData)
        .returning();

      res.json(playlist);
    } catch (error: any) {
      console.error("Error creating local playlist:", error);
      if (error.name === 'ZodError') {
        return res.status(400).json({ error: "Invalid data", details: error.errors });
      }
      res.status(500).json({ error: "Failed to create playlist" });
    }
  });

  // PUT /api/admin/local-playlists/:id - Admin update a local playlist
  app.put('/api/admin/local-playlists/:id', isAuthenticated, async (req: any, res) => {
    try {
      const userId = getUserId(req.user as AuthenticatedUser);
      const currentUser = await storage.getUser(userId);
      
      if (!isPlatformAdmin(currentUser)) {
        return res.status(403).json({ error: "Admin access required" });
      }

      const playlistId = parseInt(req.params.id);
      const validatedData = insertLocalPlaylistSchema.partial().parse(req.body);
      
      const [playlist] = await db
        .update(localPlaylists)
        .set({ ...validatedData, updatedAt: new Date() })
        .where(eq(localPlaylists.id, playlistId))
        .returning();

      if (!playlist) {
        return res.status(404).json({ error: "Playlist not found" });
      }

      res.json(playlist);
    } catch (error: any) {
      console.error("Error updating local playlist:", error);
      res.status(500).json({ error: "Failed to update playlist" });
    }
  });

  // DELETE /api/admin/local-playlists/:id - Admin delete a local playlist
  app.delete('/api/admin/local-playlists/:id', isAuthenticated, async (req: any, res) => {
    try {
      const userId = getUserId(req.user as AuthenticatedUser);
      const currentUser = await storage.getUser(userId);
      
      if (!isPlatformAdmin(currentUser)) {
        return res.status(403).json({ error: "Admin access required" });
      }

      const playlistId = parseInt(req.params.id);
      
      await db
        .delete(localPlaylists)
        .where(eq(localPlaylists.id, playlistId));

      res.json({ success: true });
    } catch (error: any) {
      console.error("Error deleting local playlist:", error);
      res.status(500).json({ error: "Failed to delete playlist" });
    }
  });

  // POST /api/admin/local-playlists/fetch-spotify - Fetch Spotify playlist data by URL
  app.post('/api/admin/local-playlists/fetch-spotify', isAuthenticated, async (req: any, res) => {
    try {
      const userId = getUserId(req.user as AuthenticatedUser);
      const currentUser = await storage.getUser(userId);
      
      if (!isPlatformAdmin(currentUser)) {
        return res.status(403).json({ error: "Admin access required" });
      }

      const { url } = req.body;
      if (!url) {
        return res.status(400).json({ error: "URL is required" });
      }

      const spotifyId = extractSpotifyPlaylistId(url);
      if (!spotifyId) {
        return res.status(400).json({ error: "Invalid Spotify playlist URL" });
      }

      const playlistData = await fetchSpotifyPlaylistData(spotifyId);
      if (!playlistData) {
        return res.status(404).json({ error: "Could not fetch playlist data from Spotify" });
      }

      res.json({
        spotifyId,
        ...playlistData
      });
    } catch (error: any) {
      console.error("Error fetching Spotify playlist:", error);
      res.status(500).json({ error: "Failed to fetch Spotify playlist data" });
    }
  });

  // POST /api/admin/local-playlists/:id/sync - Sync playlist data from Spotify
  app.post('/api/admin/local-playlists/:id/sync', isAuthenticated, async (req: any, res) => {
    try {
      const userId = getUserId(req.user as AuthenticatedUser);
      const currentUser = await storage.getUser(userId);
      
      if (!isPlatformAdmin(currentUser)) {
        return res.status(403).json({ error: "Admin access required" });
      }

      const playlistId = parseInt(req.params.id);
      
      const [playlist] = await db
        .select()
        .from(localPlaylists)
        .where(eq(localPlaylists.id, playlistId));

      if (!playlist) {
        return res.status(404).json({ error: "Playlist not found" });
      }

      if (playlist.platform !== 'Spotify') {
        return res.status(400).json({ error: "Sync is only available for Spotify playlists" });
      }

      let spotifyId = playlist.spotifyId;
      if (!spotifyId && playlist.playlistUrl) {
        spotifyId = extractSpotifyPlaylistId(playlist.playlistUrl);
      }

      if (!spotifyId) {
        return res.status(400).json({ error: "No Spotify ID found for this playlist" });
      }

      const playlistData = await fetchSpotifyPlaylistData(spotifyId);
      if (!playlistData) {
        return res.status(500).json({ error: "Failed to fetch data from Spotify" });
      }

      // Update playlist with fresh data
      const [updatedPlaylist] = await db
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
        .where(eq(localPlaylists.id, playlistId))
        .returning();

      // Save snapshot for history tracking
      await db.insert(playlistFollowerSnapshots).values({
        playlistId: playlistId,
        followerCount: playlistData.followerCount,
        tracksCount: playlistData.tracksCount,
      });

      res.json(updatedPlaylist);
    } catch (error: any) {
      console.error("Error syncing playlist:", error);
      res.status(500).json({ error: "Failed to sync playlist" });
    }
  });

  // GET /api/admin/local-playlists/:id/history - Get playlist followers history
  app.get('/api/admin/local-playlists/:id/history', isAuthenticated, async (req: any, res) => {
    try {
      const userId = getUserId(req.user as AuthenticatedUser);
      const currentUser = await storage.getUser(userId);
      
      if (!isPlatformAdmin(currentUser)) {
        return res.status(403).json({ error: "Admin access required" });
      }

      const playlistId = parseInt(req.params.id);
      
      const history = await db
        .select()
        .from(playlistFollowerSnapshots)
        .where(eq(playlistFollowerSnapshots.playlistId, playlistId))
        .orderBy(asc(playlistFollowerSnapshots.collectedAt));

      res.json(history);
    } catch (error: any) {
      console.error("Error fetching playlist history:", error);
      res.status(500).json({ error: "Failed to fetch playlist history" });
    }
  });

  // POST /api/local-playlists/:id/pitch - User submit pitch to a local playlist
  app.post('/api/local-playlists/:id/pitch', isAuthenticated, async (req: any, res) => {
    try {
      const userId = getUserId(req.user as AuthenticatedUser);
      const currentUser = await storage.getUser(userId);
      const userOrgs = await storage.getUserActiveOrganizations(userId);
      
      if (!userOrgs.length) {
        return res.status(403).json({ error: "No active organization" });
      }

      const playlistId = parseInt(req.params.id);
      const { releaseId, trackId, message } = req.body;
      
      if (!releaseId) {
        return res.status(400).json({ error: "Release ID is required" });
      }

      // Check if playlist exists and is active
      const [playlist] = await db
        .select()
        .from(localPlaylists)
        .where(and(
          eq(localPlaylists.id, playlistId),
          eq(localPlaylists.isActive, true)
        ));

      if (!playlist) {
        return res.status(404).json({ error: "Playlist not found" });
      }

      // Check for existing pitch
      const existingPitch = await db
        .select()
        .from(localPlaylistPitches)
        .where(and(
          eq(localPlaylistPitches.playlistId, playlistId),
          eq(localPlaylistPitches.releaseId, releaseId),
          eq(localPlaylistPitches.orgId, userOrgs[0].id)
        ));

      if (existingPitch.length > 0) {
        return res.status(400).json({ error: "You have already pitched this release to this playlist" });
      }

      const [pitch] = await db
        .insert(localPlaylistPitches)
        .values({
          playlistId,
          releaseId,
          orgId: userOrgs[0].id,
          userId,
          trackId: trackId || null,
          message: message || null,
          status: "PENDING",
        })
        .returning();

      res.json(pitch);
    } catch (error: any) {
      console.error("Error creating pitch:", error);
      res.status(500).json({ error: "Failed to submit pitch" });
    }
  });

  // GET /api/admin/local-playlist-pitches - Admin get all pitches
  app.get('/api/admin/local-playlist-pitches', isAuthenticated, async (req: any, res) => {
    try {
      const userId = getUserId(req.user as AuthenticatedUser);
      const currentUser = await storage.getUser(userId);
      
      if (!isPlatformAdmin(currentUser)) {
        return res.status(403).json({ error: "Admin access required" });
      }

      const pitches = await db
        .select({
          pitch: localPlaylistPitches,
          playlist: localPlaylists,
          org: organizations,
        })
        .from(localPlaylistPitches)
        .leftJoin(localPlaylists, eq(localPlaylistPitches.playlistId, localPlaylists.id))
        .leftJoin(organizations, eq(localPlaylistPitches.orgId, organizations.id))
        .orderBy(desc(localPlaylistPitches.createdAt));

      res.json(pitches);
    } catch (error: any) {
      console.error("Error fetching pitches:", error);
      res.status(500).json({ error: "Failed to fetch pitches" });
    }
  });

  // PUT /api/admin/local-playlist-pitches/:id - Admin update pitch status
  app.put('/api/admin/local-playlist-pitches/:id', isAuthenticated, async (req: any, res) => {
    try {
      const userId = getUserId(req.user as AuthenticatedUser);
      const currentUser = await storage.getUser(userId);
      
      if (!isPlatformAdmin(currentUser)) {
        return res.status(403).json({ error: "Admin access required" });
      }

      const pitchId = parseInt(req.params.id);
      const { status, adminNotes } = req.body;
      
      const [pitch] = await db
        .update(localPlaylistPitches)
        .set({ status, adminNotes, updatedAt: new Date() })
        .where(eq(localPlaylistPitches.id, pitchId))
        .returning();

      if (!pitch) {
        return res.status(404).json({ error: "Pitch not found" });
      }

      res.json(pitch);
    } catch (error: any) {
      console.error("Error updating pitch:", error);
      res.status(500).json({ error: "Failed to update pitch" });
    }
  });

  // GET /api/admin/curator-applications - Admin get all curator playlist applications
  app.get('/api/admin/curator-applications', isAuthenticated, async (req: any, res) => {
    try {
      const userId = getUserId(req.user as AuthenticatedUser);
      const currentUser = await storage.getUser(userId);
      
      if (!isPlatformAdmin(currentUser)) {
        return res.status(403).json({ error: "Admin access required" });
      }

      const applications = await db
        .select({
          id: pitchingApplications.id,
          applicationCode: pitchingApplications.applicationCode,
          status: pitchingApplications.status,
          paymentStatus: pitchingApplications.paymentStatus,
          paidAmount: pitchingApplications.paidAmount,
          paidCurrency: pitchingApplications.paidCurrency,
          spotifyLink: pitchingApplications.spotifyLink,
          instagramLink: pitchingApplications.instagramLink,
          comment: pitchingApplications.comment,
          photos: pitchingApplications.photos,
          spotifyTrackUrl: pitchingApplications.spotifyTrackUrl,
          proposedPlacementDate: pitchingApplications.proposedPlacementDate,
          curatorProposedDate: pitchingApplications.curatorProposedDate,
          confirmedPlacementDate: pitchingApplications.confirmedPlacementDate,
          curatorResponse: pitchingApplications.curatorResponse,
          createdAt: pitchingApplications.createdAt,
          reviewedAt: pitchingApplications.reviewedAt,
          rejectionReason: pitchingApplications.rejectionReason,
          trackId: pitchingApplications.trackId,
          playlistId: pitchingApplications.playlistId,
          artistOrgId: pitchingApplications.orgId,
          curatorOrgId: pitchingApplications.curatorOrgId,
          packagePrice: curatorPricingPackages.price,
          packageCurrency: curatorPricingPackages.currency,
          packageName: curatorPricingPackages.name,
          playlistName: localPlaylists.name,
          playlistImageUrl: localPlaylists.imageUrl,
          playlistPlatform: localPlaylists.platform,
        })
        .from(pitchingApplications)
        .leftJoin(curatorPricingPackages, eq(pitchingApplications.packageId, curatorPricingPackages.id))
        .leftJoin(localPlaylists, eq(pitchingApplications.playlistId, localPlaylists.id))
        .orderBy(desc(pitchingApplications.createdAt));

      const enrichedApplications = await Promise.all(applications.map(async (app) => {
        const artistOrg = app.artistOrgId ? await storage.getOrganization(app.artistOrgId) : null;
        const curatorOrg = app.curatorOrgId ? await storage.getOrganization(app.curatorOrgId) : null;

        const [track] = await db
          .select({ id: tracks.id, title: tracks.title, audioFileId: tracks.audioFileId, releaseId: tracks.releaseId })
          .from(tracks)
          .where(eq(tracks.id, app.trackId))
          .limit(1);

        let coverArtworkFileId = null;
        let releaseDate = null;
        if (track?.releaseId) {
          const [release] = await db
            .select({ artworkFileId: releases.artworkFileId, releaseDate: releases.releaseDate })
            .from(releases)
            .where(eq(releases.id, track.releaseId))
            .limit(1);
          coverArtworkFileId = release?.artworkFileId || null;
          releaseDate = release?.releaseDate || null;
        }

        let platformStats = null;
        if (app.playlistPlatform && app.artistOrgId) {
          const platformMapping: Record<string, string[]> = {
            'Spotify': ['Spotify'],
            'YouTube': ['YouTube', 'YouTube Music'],
            'Apple Music': ['Apple Music'],
            'Deezer': ['Deezer'],
            'Tidal': ['Tidal'],
            'TikTok': ['TikTok'],
            'Amazon': ['Amazon Music', 'Amazon'],
          };
          const partnerNames = platformMapping[app.playlistPlatform] || [app.playlistPlatform];
          const latestReportData = await db
            .select({
              period: streamingReportRows.period,
              streams: sql<number>`COALESCE(SUM(${streamingReportRows.streams}), 0)::int`,
              revenue: sql<string>`COALESCE(SUM(${streamingReportRows.netRevenue}::numeric), 0)::text`,
            })
            .from(streamingReportRows)
            .innerJoin(streamingReports, eq(streamingReportRows.reportId, streamingReports.id))
            .where(
              and(
                eq(streamingReports.orgId, app.artistOrgId),
                inArray(streamingReportRows.partner, partnerNames)
              )
            )
            .groupBy(streamingReportRows.period)
            .orderBy(desc(streamingReportRows.period))
            .limit(1);
          if (latestReportData.length > 0) {
            platformStats = {
              platform: app.playlistPlatform,
              period: latestReportData[0].period,
              streams: latestReportData[0].streams,
              revenue: parseFloat(latestReportData[0].revenue) || 0,
            };
          }
        }

        return {
          ...app,
          artistOrgName: artistOrg?.name || 'Unknown',
          curatorOrgName: curatorOrg?.name || 'Unknown',
          playlistName: app.playlistName || 'Unknown',
          trackTitle: track?.title || 'Unknown',
          trackAudioFileId: track?.audioFileId || null,
          coverArtworkFileId,
          releaseDate,
          platformStats,
          organizationName: artistOrg?.name || 'Unknown',
        };
      }));

      res.json(enrichedApplications);
    } catch (error: any) {
      console.error("Error fetching curator applications:", error);
      res.status(500).json({ error: "Failed to fetch curator applications" });
    }
  });

  // Image proxy for external CDN images (Spotify, etc.) to bypass CORS/CSP restrictions
  app.get('/api/image-proxy', async (req, res) => {
    try {
      const { url } = req.query;
      if (!url || typeof url !== 'string') {
        return res.status(400).json({ error: "URL parameter required" });
      }

      const allowedDomains = ['i.scdn.co', 'mosaic.scdn.co', 'image-cdn-ak.spotifycdn.com', 'image-cdn-fa.spotifycdn.com', 'wrapped-images.spotifycdn.com', 'seed-mix-image.spotifycdn.com'];
      const parsedUrl = new URL(url);
      if (!allowedDomains.some(d => parsedUrl.hostname.endsWith(d))) {
        return res.status(403).json({ error: "Domain not allowed" });
      }

      const response = await fetch(url);
      if (!response.ok) {
        return res.status(response.status).json({ error: "Failed to fetch image" });
      }

      const contentType = response.headers.get('content-type') || 'image/jpeg';
      const buffer = Buffer.from(await response.arrayBuffer());

      res.set({
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=86400',
        'Access-Control-Allow-Origin': '*',
      });
      res.send(buffer);
    } catch (error) {
      console.error("Image proxy error:", error);
      res.status(500).json({ error: "Proxy error" });
    }
  });

  // Admin: Read-only access to curator-artist chat messages for an application
  app.get('/api/admin/curator-messages/:applicationId', isAuthenticated, async (req: any, res) => {
    try {
      const userId = getUserId(req.user as AuthenticatedUser);
      const currentUser = await storage.getUser(userId);
      
      if (!isPlatformAdmin(currentUser)) {
        return res.status(403).json({ error: "Admin access required" });
      }

      const { applicationId } = req.params;

      const application = await db.select().from(pitchingApplications).where(eq(pitchingApplications.id, applicationId)).limit(1);
      if (!application.length) {
        return res.status(404).json({ message: "Application not found" });
      }

      const messages = await db.select().from(curatorMessages)
        .where(eq(curatorMessages.applicationId, applicationId))
        .orderBy(curatorMessages.createdAt);

      res.json(messages);
    } catch (error) {
      console.error("Error fetching admin curator messages:", error);
      res.status(500).json({ message: "Failed to fetch messages" });
    }
  });

  app.get("/api/admin/content/releases", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req.user as AuthenticatedUser);
      if (!userId) return res.status(401).json({ error: "User not authenticated" });

      const user = await storage.getUser(userId);
      if (!user) return res.status(401).json({ error: "User not found" });

      const isAdmin = isPlatformAdmin(user);
      const orgId = (req.query.orgId as string) || "";
      const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);

      const conditions: any[] = [];

      if (isAdmin && orgId) {
        conditions.push(eq(releases.orgId, orgId));
      } else if (!isAdmin) {
        const userOrgs = await storage.getUserActiveOrganizations(userId);
        if (userOrgs.length === 0) return res.json([]);
        conditions.push(eq(releases.orgId, userOrgs[0].id));
      }

      const releaseRows = await db
        .select({
          id: releases.id,
          title: releases.title,
          artworkFileId: releases.artworkFileId,
          artistId: releases.artistId,
          orgId: releases.orgId,
        })
        .from(releases)
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(desc(releases.createdAt))
        .limit(limit);

      const result = await Promise.all(
        releaseRows.map(async (r) => {
          const relTracks = await db
            .select({
              id: tracks.id,
              title: tracks.title,
              audioFileId: tracks.audioFileId,
              tiktokClipStart: tracks.tiktokClipStart,
            })
            .from(tracks)
            .where(eq(tracks.releaseId, r.id))
            .orderBy(tracks.trackIndex);

          const artist = await db
            .select({ name: artists.name })
            .from(artists)
            .where(eq(artists.id, r.artistId))
            .limit(1);

          const org = await db
            .select({ name: organizations.name })
            .from(organizations)
            .where(eq(organizations.id, r.orgId))
            .limit(1);

          return {
            id: r.id,
            title: r.title,
            artworkFileId: r.artworkFileId,
            artistName: artist[0]?.name || "Unknown",
            organizationName: org[0]?.name || "Unknown",
            tracks: relTracks,
          };
        })
      );

      res.json(result);
    } catch (error) {
      console.error("Error fetching content releases:", error);
      res.status(500).json({ error: "Failed to fetch content releases" });
    }
  });

  const renderSettingsSchema = z.object({
    format: z.enum(["vertical", "square", "portrait", "landscape"]),
    backgroundType: z.enum(["blurred", "solid", "gradient", "video"]),
    videoBackgroundFileId: z.string().optional(),
    solidColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).default("#000000"),
    gradientColor1: z.string().regex(/^#[0-9a-fA-F]{6}$/).default("#1a1a2e"),
    gradientColor2: z.string().regex(/^#[0-9a-fA-F]{6}$/).default("#16213e"),
    tagline: z.string().max(50).default("NEW MUSIC"),
    taglineColor: z.enum(["black", "white", "none"]),
    promoTitle: z.string().max(100).default(""),
    promoTitleColor: z.enum(["black", "white", "none"]),
    template: z.enum(["glow-player", "promo-card"]),
    promoLayout: z.enum(["cover", "fullscreen", "textonly"]).default("cover"),
    duration: z.number().int().min(5).max(60),
    storeIcons: z.array(z.enum(["spotify", "apple", "youtube", "tiktok", "deezer", "tidal", "amazon", "shazam"])),
    storeIconStyle: z.enum(["black", "white"]),
    audioStart: z.number().min(0).max(600).default(0),
    videoDarken: z.boolean().default(true),
    textPosition: z.enum(["top", "center", "bottom"]).default("bottom"),
    iconsPosition: z.enum(["top", "center", "bottom"]).default("bottom"),
    syncTextIconEffects: z.boolean().default(true),
    textShadowColor: z.string().default("#000000"),
    textShadowIntensity: z.number().min(0).max(100).default(50),
    textGlow: z.boolean().default(false),
    textGlowColor: z.string().default("#ffffff"),
    iconShadowColor: z.string().default("#000000"),
    iconShadowIntensity: z.number().min(0).max(100).default(0),
    iconGlow: z.boolean().default(false),
    iconGlowColor: z.string().default("#ffffff"),
  });

  const PRESET_VIDEO_BG_FOLDER = "1l-4wi7mVZCal6BzpRlMq8rjlZAsYdcHy";
  const CUSTOM_VIDEO_BG_FOLDER = "1hxaBEs3M2DSSqcYW9IPRj0guBUrGTNCZ";

  app.get("/api/admin/content/video-backgrounds", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req.user as AuthenticatedUser);
      if (!userId) return res.status(401).json({ error: "User not authenticated" });

      const [presetFiles, customFiles] = await Promise.all([
        googleDriveStorage.listVideoFilesInFolder(PRESET_VIDEO_BG_FOLDER),
        googleDriveStorage.listVideoFilesInFolder(CUSTOM_VIDEO_BG_FOLDER),
      ]);

      res.json({
        preset: presetFiles.map(f => ({
          id: f.id,
          name: f.name.replace(/\.[^.]+$/, ''),
          thumbnailUrl: `/api/admin/content/video-backgrounds/thumbnail/${f.id}`,
          proxyUrl: `/api/admin/content/video-backgrounds/proxy/${f.id}`,
        })),
        custom: customFiles.map(f => ({
          id: f.id,
          name: f.name.replace(/\.[^.]+$/, ''),
          thumbnailUrl: `/api/admin/content/video-backgrounds/thumbnail/${f.id}`,
          proxyUrl: `/api/admin/content/video-backgrounds/proxy/${f.id}`,
        })),
      });
    } catch (error: any) {
      console.error("Error listing video backgrounds:", error);
      res.status(500).json({ error: "Failed to list video backgrounds" });
    }
  });

  app.post("/api/admin/content/video-backgrounds/upload", isAuthenticated, videoUpload.single("file"), async (req, res) => {
    try {
      const userId = getUserId(req.user as AuthenticatedUser);
      if (!userId) return res.status(401).json({ error: "User not authenticated" });

      const file = req.file;
      if (!file) return res.status(400).json({ error: "No file uploaded" });

      const MAX_BG_SIZE = 200 * 1024 * 1024;
      if (file.size > MAX_BG_SIZE) {
        try { const fsMod2 = await import("fs"); fsMod2.unlinkSync(file.path); } catch {}
        return res.status(400).json({ error: "File too large. Maximum 200 MB" });
      }

      const allowedTypes = ["video/mp4", "video/quicktime", "video/x-quicktime", "video/webm"];
      if (!allowedTypes.includes(file.mimetype)) {
        try { const fsMod2 = await import("fs"); fsMod2.unlinkSync(file.path); } catch {}
        return res.status(400).json({ error: "Invalid file type. Only MP4, MOV, WebM allowed" });
      }

      const fsMod = await import("fs");
      const fileBuffer = fsMod.readFileSync(file.path);
      try { fsMod.unlinkSync(file.path); } catch {}

      const result = await googleDriveStorage.uploadFile(
        fileBuffer,
        file.originalname,
        file.mimetype,
        CUSTOM_VIDEO_BG_FOLDER
      );

      res.json({
        id: result.fileId,
        name: file.originalname.replace(/\.[^.]+$/, ''),
        thumbnailUrl: `/api/admin/content/video-backgrounds/thumbnail/${result.fileId}`,
        proxyUrl: `/api/admin/content/video-backgrounds/proxy/${result.fileId}`,
      });
    } catch (error: any) {
      console.error("Error uploading video background:", error);
      res.status(500).json({ error: "Failed to upload video background" });
    }
  });

  app.delete("/api/admin/content/video-backgrounds/:fileId", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req.user as AuthenticatedUser);
      if (!userId) return res.status(401).json({ error: "User not authenticated" });

      await googleDriveStorage.deleteFile(req.params.fileId);
      res.json({ success: true });
    } catch (error: any) {
      console.error("Error deleting video background:", error);
      res.status(500).json({ error: "Failed to delete video background" });
    }
  });

  app.get("/api/admin/content/video-backgrounds/thumbnail/:fileId", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req.user as AuthenticatedUser);
      if (!userId) return res.status(401).json({ error: "User not authenticated" });

      const buffer = await googleDriveStorage.getThumbnail(req.params.fileId, 320);

      res.set({
        "Content-Type": "image/jpeg",
        "Content-Length": buffer.length.toString(),
        "Cache-Control": "public, max-age=86400",
      });
      res.send(buffer);
    } catch (error: any) {
      console.error("Error proxying video thumbnail:", error);
      res.status(500).json({ error: "Failed to load thumbnail" });
    }
  });

  app.get("/api/admin/content/video-backgrounds/proxy/:fileId", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req.user as AuthenticatedUser);
      if (!userId) return res.status(401).json({ error: "User not authenticated" });

      const buffer = await googleDriveStorage.downloadFile(req.params.fileId);
      const total = buffer.length;
      const range = req.headers.range;

      if (range) {
        const parts = range.replace(/bytes=/, "").split("-");
        const start = parseInt(parts[0], 10);
        const end = parts[1] ? parseInt(parts[1], 10) : total - 1;
        const chunkSize = end - start + 1;

        res.status(206);
        res.set({
          "Content-Range": `bytes ${start}-${end}/${total}`,
          "Accept-Ranges": "bytes",
          "Content-Length": chunkSize.toString(),
          "Content-Type": "video/mp4",
          "Cache-Control": "public, max-age=3600",
        });
        res.send(buffer.subarray(start, end + 1));
      } else {
        res.set({
          "Accept-Ranges": "bytes",
          "Content-Type": "video/mp4",
          "Content-Length": total.toString(),
          "Cache-Control": "public, max-age=3600",
        });
        res.send(buffer);
      }
    } catch (error: any) {
      console.error("Error proxying video background:", error);
      res.status(500).json({ error: "Failed to load video background" });
    }
  });

  app.get("/api/admin/content/waveform/:fileId", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req.user as AuthenticatedUser);
      if (!userId) return res.status(401).json({ error: "User not authenticated" });

      const { fileId } = req.params;
      const BARS = 200;

      const fileBuffer = await googleDriveStorage.downloadFile(fileId);

      const { execSync } = await import("child_process");
      const fs = await import("fs");
      const os = await import("os");
      const path = await import("path");

      const tmpInput = path.join(os.tmpdir(), `waveform_in_${Date.now()}`);
      const tmpOutput = path.join(os.tmpdir(), `waveform_out_${Date.now()}.raw`);

      fs.writeFileSync(tmpInput, fileBuffer);

      try {
        const { isBinaryError } = await import("./videoRenderer");
        const runFfmpeg = () => execSync(
          `"${getFfmpegPath()}" -i "${tmpInput}" -ac 1 -ar 8000 -f f32le -y "${tmpOutput}"`,
          { stdio: "pipe", timeout: 30000 }
        );
        try {
          runFfmpeg();
        } catch (ffErr: any) {
          if (isBinaryError(ffErr)) {
            console.warn("ffmpeg failed with binary error, resetting path and retrying...", ffErr?.message?.substring(0, 200));
            resetFfmpegPath();
            runFfmpeg();
          } else {
            throw ffErr;
          }
        }

        const rawBuf = fs.readFileSync(tmpOutput);
        const samples = new Float32Array(rawBuf.buffer, rawBuf.byteOffset, rawBuf.byteLength / 4);

        const actualBars = Math.min(BARS, samples.length);
        const blockSize = Math.max(1, Math.floor(samples.length / actualBars));
        const bars: number[] = [];

        for (let i = 0; i < actualBars; i++) {
          let sum = 0;
          const start = i * blockSize;
          for (let j = 0; j < blockSize; j++) {
            sum += Math.abs(samples[start + j]);
          }
          bars.push(sum / blockSize);
        }

        const max = Math.max(...bars, 0.01);
        const normalized = bars.map((v) => Math.round((v / max) * 1000) / 1000);

        res.json({ waveform: normalized });
      } finally {
        try { fs.unlinkSync(tmpInput); } catch {}
        try { fs.unlinkSync(tmpOutput); } catch {}
      }
    } catch (error: any) {
      console.error("Waveform generation error:", error);
      res.status(500).json({ error: "Failed to generate waveform" });
    }
  });

  const renderJobs: Record<string, { percent: number; stage: string; status: "running" | "done" | "error"; error?: string; downloadId?: string; filename?: string }> = {};

  app.post("/api/admin/content/render", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req.user as AuthenticatedUser);
      if (!userId) return res.status(401).json({ error: "User not authenticated" });

      const { releaseId, trackId, settings: rawSettings } = req.body;
      if (!releaseId || !trackId || !rawSettings) {
        return res.status(400).json({ error: "Missing releaseId, trackId, or settings" });
      }

      const settingsResult = renderSettingsSchema.safeParse(rawSettings);
      if (!settingsResult.success) {
        return res.status(400).json({ error: "Invalid settings", details: settingsResult.error.issues });
      }
      const settings = settingsResult.data;

      const jobId = `job_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      renderJobs[jobId] = { percent: 0, stage: "downloading", status: "running" };

      res.json({ jobId });

      (async () => {
        try {
          renderJobs[jobId] = { percent: 1, stage: "downloading", status: "running" };

          const release = await db
            .select({
              title: releases.title,
              artworkFileId: releases.artworkFileId,
              artistId: releases.artistId,
            })
            .from(releases)
            .where(eq(releases.id, releaseId))
            .limit(1);

          if (!release[0]) {
            renderJobs[jobId] = { percent: 0, stage: "", status: "error", error: "Release not found" };
            return;
          }

          const track = await db
            .select({
              title: tracks.title,
              audioFileId: tracks.audioFileId,
            })
            .from(tracks)
            .where(and(eq(tracks.id, trackId), eq(tracks.releaseId, releaseId)))
            .limit(1);

          if (!track[0]) {
            renderJobs[jobId] = { percent: 0, stage: "", status: "error", error: "Track not found" };
            return;
          }

          const artist = await db
            .select({ name: artists.name })
            .from(artists)
            .where(eq(artists.id, release[0].artistId))
            .limit(1);

          let artworkBuffer: Buffer | null = null;
          if (release[0].artworkFileId) {
            try {
              artworkBuffer = await googleDriveStorage.downloadFile(release[0].artworkFileId);
            } catch (e) {
              console.error("Failed to download artwork:", e);
            }
          }

          renderJobs[jobId].percent = 3;

          let audioBuffer: Buffer | null = null;
          if (track[0].audioFileId) {
            try {
              audioBuffer = await googleDriveStorage.downloadFile(track[0].audioFileId);
            } catch (e) {
              console.error("Failed to download audio:", e);
            }
          }

          let videoBgBuffer: Buffer | null = null;
          if (settings.backgroundType === "video" && settings.videoBackgroundFileId) {
            try {
              renderJobs[jobId] = { percent: 4, stage: "downloading background", status: "running" };
              videoBgBuffer = await googleDriveStorage.downloadFile(settings.videoBackgroundFileId);
            } catch (e) {
              console.error("Failed to download video background:", e);
            }
          }

          renderJobs[jobId] = { percent: 5, stage: "rendering", status: "running" };

          const { isBinaryError, resetChromiumPath, resetFfmpegPath: resetFfmpeg } = await import("./videoRenderer");

          let videoBuffer: Buffer;
          try {
            videoBuffer = await renderMotionVideo(
              artworkBuffer,
              audioBuffer,
              track[0].title,
              artist[0]?.name || "Unknown Artist",
              settings,
              (percent: number, stage: string) => {
                renderJobs[jobId] = { ...renderJobs[jobId], percent, stage };
              },
              videoBgBuffer,
            );
          } catch (renderErr: any) {
            if (isBinaryError(renderErr)) {
              console.warn("Render failed with binary error, resetting paths and retrying in 3s...", renderErr?.message?.substring(0, 200));
              resetChromiumPath();
              resetFfmpeg();
              try {
                const osMod2 = await import("os");
                const pathMod2 = await import("path");
                const fsMod2 = await import("fs");
                const tmpChromiumDir = pathMod2.join(osMod2.tmpdir(), "muzika_chromium");
                if (fsMod2.existsSync(tmpChromiumDir)) {
                  fsMod2.rmSync(tmpChromiumDir, { recursive: true, force: true });
                  console.log("Cleaned /tmp chromium dir before retry");
                }
              } catch {}
              await new Promise(r => setTimeout(r, 3000));
              renderJobs[jobId] = { percent: 5, stage: "retrying", status: "running" };
              videoBuffer = await renderMotionVideo(
                artworkBuffer,
                audioBuffer,
                track[0].title,
                artist[0]?.name || "Unknown Artist",
                settings,
                (percent: number, stage: string) => {
                  renderJobs[jobId] = { ...renderJobs[jobId], percent, stage };
                },
                videoBgBuffer,
              );
            } else {
              throw renderErr;
            }
          }

          const safeFilename = (release[0].title || "video").replace(/[^\w\s.-]/g, "_") + "_motion.mp4";

          const fsMod = await import("fs");
          const pathMod = await import("path");
          const osMod = await import("os");
          const downloadId = `render_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
          const tmpPath = pathMod.join(osMod.tmpdir(), `${downloadId}.mp4`);
          fsMod.writeFileSync(tmpPath, videoBuffer);

          (app as any).__renderCache = (app as any).__renderCache || {};
          (app as any).__renderCache[downloadId] = { path: tmpPath, filename: safeFilename, createdAt: Date.now(), userId };

          setTimeout(() => {
            try { fsMod.unlinkSync(tmpPath); } catch {}
            delete (app as any).__renderCache?.[downloadId];
          }, 5 * 60 * 1000);

          renderJobs[jobId] = { percent: 100, stage: "done", status: "done", downloadId, filename: safeFilename };

          setTimeout(() => { delete renderJobs[jobId]; }, 10 * 60 * 1000);
        } catch (error: any) {
          console.error("Error rendering video:", error?.message || error, "constructor:", error?.constructor?.name, "code:", error?.code);
          renderJobs[jobId] = { percent: 0, stage: "", status: "error", error: error.message || "Render failed" };
        }
      })();
    } catch (error: any) {
      console.error("Error starting render:", error);
      res.status(500).json({ error: error.message || "Failed to start render" });
    }
  });

  app.get("/api/admin/content/render/progress/:jobId", isAuthenticated, async (req, res) => {
    const job = renderJobs[req.params.jobId];
    if (!job) return res.status(404).json({ error: "Job not found" });
    res.json(job);
  });

  app.get("/api/admin/content/render/download/:downloadId", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req.user as AuthenticatedUser);
      if (!userId) return res.status(401).json({ error: "User not authenticated" });

      const { downloadId } = req.params;
      const cache = (app as any).__renderCache;
      const entry = cache?.[downloadId];
      if (!entry) return res.status(404).json({ error: "Render not found or expired" });
      if (entry.userId !== userId) return res.status(403).json({ error: "Access denied" });

      const fsMod = await import("fs");
      if (!fsMod.existsSync(entry.path)) {
        delete cache[downloadId];
        return res.status(404).json({ error: "File expired" });
      }

      res.set({
        "Content-Type": "video/mp4",
        "Content-Disposition": `attachment; filename="${entry.filename}"`,
        "Content-Length": fsMod.statSync(entry.path).size.toString(),
      });
      fsMod.createReadStream(entry.path).pipe(res);
    } catch (error: any) {
      res.status(500).json({ error: "Download failed" });
    }
  });

  // ===================== ACADEMY ROUTES =====================

  // List published courses (for all authenticated non-curator users)
  app.get("/api/academy/courses", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req.user as AuthenticatedUser);
      if (!userId) return res.status(401).json({ error: "User not authenticated" });

      const user = await storage.getUser(userId);
      if (!user) return res.status(401).json({ error: "User not found" });
      if (!isPlatformAdmin(user)) return res.status(403).json({ error: "Access denied" });

      const { category, type } = req.query;
      const courses = await storage.getAcademyCourses({
        status: "PUBLISHED",
        category: category as string | undefined,
        type: type as string | undefined,
      });

      // Get user's purchases to mark owned courses
      const purchases = await storage.getUserAcademyPurchases(userId);
      const purchasedCourseIds = new Set(purchases.map(p => p.courseId));

      const result = courses.map(course => ({
        ...course,
        contentHtml: course.isFree || purchasedCourseIds.has(course.id) ? course.contentHtml : null,
        videoFileId: course.isFree || purchasedCourseIds.has(course.id) ? course.videoFileId : null,
        purchased: purchasedCourseIds.has(course.id),
      }));

      res.json(result);
    } catch (error: any) {
      console.error("[ACADEMY] Error fetching courses:", error);
      res.status(500).json({ error: "Failed to fetch courses" });
    }
  });

  // Get single course by slug
  app.get("/api/academy/courses/by-slug/:slug", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req.user as AuthenticatedUser);
      if (!userId) return res.status(401).json({ error: "User not authenticated" });

      const user = await storage.getUser(userId);
      if (!isPlatformAdmin(user)) return res.status(403).json({ error: "Access denied" });

      const course = await storage.getAcademyCourseBySlug(req.params.slug);
      if (!course) return res.status(404).json({ error: "Course not found" });
      if (course.status !== "PUBLISHED") {
        if (!isPlatformAdmin(user)) return res.status(404).json({ error: "Course not found" });
      }

      const purchase = await storage.getAcademyPurchase(userId, course.id);
      const hasAccess = course.isFree || !!purchase;

      res.json({
        ...course,
        contentHtml: hasAccess ? course.contentHtml : (course.contentHtml ? course.contentHtml.substring(0, 500) + '...' : null),
        videoFileId: hasAccess ? course.videoFileId : null,
        purchased: !!purchase,
        hasAccess,
      });
    } catch (error: any) {
      console.error("[ACADEMY] Error fetching course:", error);
      res.status(500).json({ error: "Failed to fetch course" });
    }
  });

  // Video streaming proxy (protected)
  app.get("/api/academy/courses/:id/video", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req.user as AuthenticatedUser);
      if (!userId) return res.status(401).json({ error: "User not authenticated" });

      const user = await storage.getUser(userId);
      if (!isPlatformAdmin(user)) return res.status(403).json({ error: "Access denied" });

      const course = await storage.getAcademyCourse(req.params.id);
      if (!course || !course.videoFileId) return res.status(404).json({ error: "Video not found" });

      const rangeHeader = req.headers.range;
      let rangeParam: { start: number; end: number } | undefined;

      if (rangeHeader) {
        const parts = rangeHeader.replace(/bytes=/, '').split('-');
        const start = parseInt(parts[0], 10);
        const end = parts[1] ? parseInt(parts[1], 10) : start + 5 * 1024 * 1024;
        rangeParam = { start, end };
      }

      const result = await googleDriveStorage.streamFile(course.videoFileId, rangeParam);

      if (result.isPartial && result.actualRange) {
        res.writeHead(206, {
          'Content-Range': `bytes ${result.actualRange.start}-${result.actualRange.end}/${result.actualRange.total}`,
          'Accept-Ranges': 'bytes',
          'Content-Length': result.contentLength,
          'Content-Type': 'video/mp4',
          'Cache-Control': 'no-store, no-cache',
          'X-Content-Type-Options': 'nosniff',
        });
      } else {
        res.writeHead(200, {
          'Content-Length': result.contentLength,
          'Content-Type': 'video/mp4',
          'Accept-Ranges': 'bytes',
          'Cache-Control': 'no-store, no-cache',
          'X-Content-Type-Options': 'nosniff',
        });
      }
      (result.stream as any).pipe(res);
    } catch (error: any) {
      console.error("[ACADEMY] Video streaming error:", error);
      res.status(500).json({ error: "Failed to stream video" });
    }
  });

  // Generate WayForPay payment for academy course
  app.post("/api/academy/courses/:id/purchase", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req.user as AuthenticatedUser);
      if (!userId) return res.status(401).json({ error: "User not authenticated" });

      const user = await storage.getUser(userId);
      if (!isPlatformAdmin(user)) return res.status(403).json({ error: "Access denied" });

      const course = await storage.getAcademyCourse(req.params.id);
      if (!course) return res.status(404).json({ error: "Course not found" });
      if (course.isFree) return res.status(400).json({ error: "Course is free" });

      const existing = await storage.getAcademyPurchase(userId, course.id);
      if (existing) return res.status(400).json({ error: "Already purchased" });

      const merchantAccount = process.env.WAYFORPAY_MERCHANT_ACCOUNT;
      const secretKey = process.env.WAYFORPAY_SECRET_KEY;
      if (!merchantAccount || !secretKey) {
        return res.status(500).json({ error: "Payment system not configured" });
      }

      const orderReference = `academy_${course.id}_${userId}_${Date.now()}`;
      const orderDate = Math.floor(Date.now() / 1000);
      const amountUAH = Math.round((course.price || 0) / 100);
      const currency = "UAH";
      const merchantDomainName = "muzika.ua";
      const productName = [course.title];
      const productCount = [1];
      const productPrice = [amountUAH];

      const signString = [
        merchantAccount, merchantDomainName, orderReference, orderDate,
        amountUAH, currency, ...productName, ...productCount.map(String), ...productPrice.map(String),
      ].join(';');

      const merchantSignature = crypto.createHmac('md5', secretKey).update(signString).digest('hex');
      const baseUrl = process.env.WAYFORPAY_SERVICE_URL || "https://muzika-dist.com";
      const serviceUrl = `${baseUrl}/api/webhooks/wayforpay`;

      // Create pending purchase
      await storage.createAcademyPurchase({
        userId,
        courseId: course.id,
        amount: course.price || 0,
        currency: "UAH",
        status: "PENDING",
        orderReference,
      });

      res.json({
        merchantAccount,
        merchantDomainName,
        merchantSignature,
        orderReference,
        orderDate,
        amount: amountUAH,
        currency,
        productName,
        productCount,
        productPrice,
        serviceUrl,
        returnUrl: `${baseUrl}/academy/${course.slug}`,
      });
    } catch (error: any) {
      console.error("[ACADEMY] Purchase error:", error);
      res.status(500).json({ error: "Failed to create payment" });
    }
  });

  // Admin: List all courses (including drafts)
  app.get("/api/admin/academy/courses", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req.user as AuthenticatedUser);
      if (!userId) return res.status(401).json({ error: "User not authenticated" });
      const user = await storage.getUser(userId);
      if (!isPlatformAdmin(user)) return res.status(403).json({ error: "Access denied" });

      const courses = await storage.getAcademyCourses();
      res.json(courses);
    } catch (error: any) {
      res.status(500).json({ error: "Failed to fetch courses" });
    }
  });

  // Admin: Create course
  app.post("/api/admin/academy/courses", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req.user as AuthenticatedUser);
      if (!userId) return res.status(401).json({ error: "User not authenticated" });
      const user = await storage.getUser(userId);
      if (!isPlatformAdmin(user)) return res.status(403).json({ error: "Access denied" });

      const { title, description, category, type, price, isFree, contentHtml, readingTime, videoDuration } = req.body;

      // Generate slug from title
      const slug = title.toLowerCase()
        .replace(/[^a-z0-9а-яіїєґ\s-]/gi, '')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
        .substring(0, 100) + '-' + Date.now().toString(36);

      const course = await storage.createAcademyCourse({
        title,
        slug,
        description,
        category,
        type,
        price: isFree ? null : (price || null),
        isFree: isFree ?? true,
        contentHtml: contentHtml || null,
        readingTime: readingTime || null,
        videoDuration: videoDuration || null,
        status: "DRAFT",
        createdBy: userId,
      });

      res.json(course);
    } catch (error: any) {
      console.error("[ACADEMY ADMIN] Create error:", error);
      res.status(500).json({ error: "Failed to create course" });
    }
  });

  // Admin: Update course
  app.put("/api/admin/academy/courses/:id", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req.user as AuthenticatedUser);
      if (!userId) return res.status(401).json({ error: "User not authenticated" });
      const user = await storage.getUser(userId);
      if (!isPlatformAdmin(user)) return res.status(403).json({ error: "Access denied" });

      const { title, description, category, type, price, isFree, contentHtml, readingTime, videoDuration, status, coverImageFileId, videoFileId } = req.body;

      const updates: any = {};
      if (title !== undefined) updates.title = title;
      if (description !== undefined) updates.description = description;
      if (category !== undefined) updates.category = category;
      if (type !== undefined) updates.type = type;
      if (price !== undefined) updates.price = price;
      if (isFree !== undefined) updates.isFree = isFree;
      if (contentHtml !== undefined) updates.contentHtml = contentHtml;
      if (readingTime !== undefined) updates.readingTime = readingTime;
      if (videoDuration !== undefined) updates.videoDuration = videoDuration;
      if (status !== undefined) updates.status = status;
      if (coverImageFileId !== undefined) updates.coverImageFileId = coverImageFileId;
      if (videoFileId !== undefined) updates.videoFileId = videoFileId;

      const course = await storage.updateAcademyCourse(req.params.id, updates);
      if (!course) return res.status(404).json({ error: "Course not found" });

      res.json(course);
    } catch (error: any) {
      console.error("[ACADEMY ADMIN] Update error:", error);
      res.status(500).json({ error: "Failed to update course" });
    }
  });

  // Admin: Delete course
  app.delete("/api/admin/academy/courses/:id", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req.user as AuthenticatedUser);
      if (!userId) return res.status(401).json({ error: "User not authenticated" });
      const user = await storage.getUser(userId);
      if (!isPlatformAdmin(user)) return res.status(403).json({ error: "Access denied" });

      await storage.deleteAcademyCourse(req.params.id);
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: "Failed to delete course" });
    }
  });

  // Admin: Upload cover image for academy course
  app.post("/api/admin/academy/courses/:id/cover", isAuthenticated, upload.single("file"), async (req, res) => {
    try {
      const userId = getUserId(req.user as AuthenticatedUser);
      if (!userId) return res.status(401).json({ error: "User not authenticated" });
      const user = await storage.getUser(userId);
      if (!isPlatformAdmin(user)) return res.status(403).json({ error: "Access denied" });

      const file = req.file;
      if (!file) return res.status(400).json({ error: "No file uploaded" });

      const fileId = await googleDriveStorage.uploadFile(
        file.buffer,
        file.originalname,
        file.mimetype,
        "academy_covers"
      );

      await storage.updateAcademyCourse(req.params.id, { coverImageFileId: fileId });
      res.json({ fileId });
    } catch (error: any) {
      console.error("[ACADEMY ADMIN] Cover upload error:", error);
      res.status(500).json({ error: "Failed to upload cover" });
    }
  });

  // Admin: Upload video for academy course
  app.post("/api/admin/academy/courses/:id/video", isAuthenticated, upload.single("file"), async (req, res) => {
    try {
      const userId = getUserId(req.user as AuthenticatedUser);
      if (!userId) return res.status(401).json({ error: "User not authenticated" });
      const user = await storage.getUser(userId);
      if (!isPlatformAdmin(user)) return res.status(403).json({ error: "Access denied" });

      const file = req.file;
      if (!file) return res.status(400).json({ error: "No file uploaded" });

      const fileId = await googleDriveStorage.uploadFile(
        file.buffer,
        file.originalname,
        file.mimetype,
        "academy_videos"
      );

      await storage.updateAcademyCourse(req.params.id, { videoFileId: fileId });
      res.json({ fileId });
    } catch (error: any) {
      console.error("[ACADEMY ADMIN] Video upload error:", error);
      res.status(500).json({ error: "Failed to upload video" });
    }
  });

  app.post("/api/admin/academy/courses/:id/content-image", isAuthenticated, upload.single("file"), async (req, res) => {
    try {
      const userId = getUserId(req.user as AuthenticatedUser);
      if (!userId) return res.status(401).json({ error: "User not authenticated" });
      const user = await storage.getUser(userId);
      if (!isPlatformAdmin(user)) return res.status(403).json({ error: "Access denied" });

      const file = req.file;
      if (!file) return res.status(400).json({ error: "No file uploaded" });
      if (!file.mimetype.startsWith("image/")) return res.status(400).json({ error: "Only images allowed" });

      const fileId = await googleDriveStorage.uploadFile(
        file.buffer,
        file.originalname,
        file.mimetype,
        "academy_content_images"
      );

      res.json({ url: `/api/files/${fileId}/proxy`, fileId });
    } catch (error: any) {
      console.error("[ACADEMY ADMIN] Content image upload error:", error);
      res.status(500).json({ error: "Failed to upload image" });
    }
  });

  // ===================== END ACADEMY ROUTES =====================

  const httpServer = createServer(app);
  return httpServer;
}
