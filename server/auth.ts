import type { RequestHandler } from "express";
import { db } from "./db";
import { users } from "@shared/schema";
import { eq } from "drizzle-orm";

// Cache for last activity update times to avoid excessive DB writes
const lastActivityUpdateCache = new Map<string, number>();
const ACTIVITY_UPDATE_INTERVAL = 60 * 1000; // 1 minute debounce

// Helper to update user activity (debounced to avoid excessive DB writes)
async function updateUserActivityIfNeeded(userId: string) {
  const now = Date.now();
  const lastUpdate = lastActivityUpdateCache.get(userId) || 0;
  
  // Only update if more than 1 minute has passed since last update
  if (now - lastUpdate > ACTIVITY_UPDATE_INTERVAL) {
    lastActivityUpdateCache.set(userId, now);
    try {
      await db.update(users).set({ lastActiveAt: new Date() }).where(eq(users.id, userId));
    } catch (error) {
      // Silently ignore errors to not break the request
    }
  }
}

// Universal authentication middleware that supports both Replit Auth and Google OAuth
export const isAuthenticated: RequestHandler = async (req, res, next) => {
  // Check if user is authenticated via Passport
  if (!req.isAuthenticated() || !req.user) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  const user = req.user as any;

  // If this is a Replit Auth user (has claims), check token expiration
  if (user.claims && user.expires_at) {
    const now = Math.floor(Date.now() / 1000);
    
    // If token is still valid, proceed
    if (now <= user.expires_at) {
      // Update activity in background (non-blocking)
      if (user.id) {
        updateUserActivityIfNeeded(user.id);
      }
      return next();
    }

    // Try to refresh token for Replit Auth users
    const refreshToken = user.refresh_token;
    if (!refreshToken) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    try {
      // Import here to avoid circular dependencies
      const { getOidcConfig } = await import("./replitAuth");
      const client = await import("openid-client");
      
      const config = await getOidcConfig();
      const tokenResponse = await client.refreshTokenGrant(config, refreshToken);
      
      // Update user session with new tokens
      user.claims = tokenResponse.claims();
      user.access_token = tokenResponse.access_token;
      user.refresh_token = tokenResponse.refresh_token;
      user.expires_at = user.claims?.exp;
      
      // Update activity in background (non-blocking)
      if (user.id) {
        updateUserActivityIfNeeded(user.id);
      }
      return next();
    } catch (error) {
      return res.status(401).json({ message: "Unauthorized" });
    }
  }

  // For Google OAuth users or other types, just check if they're authenticated
  // (Passport.js handles session management for us)
  
  // Update activity in background (non-blocking)
  if (user.id) {
    updateUserActivityIfNeeded(user.id);
  }
  return next();
};