import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import type { Express } from "express";
import bcrypt from "bcrypt";
import crypto from "crypto";
import rateLimit from "express-rate-limit";
import { storage } from "./storage";
import { seedAdmin } from "./seed-admin";
import { sendPasswordResetEmail } from "./googleMail";

// Rate limiters for authentication endpoints to prevent brute-force attacks
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // 10 attempts per IP per 15 minutes
  message: { message: "Too many login attempts. Please try again in 15 minutes." },
  standardHeaders: true,
  legacyHeaders: false,
});

const passwordResetLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5, // 5 password reset requests per IP per hour
  message: { message: "Too many password reset attempts. Please try again later." },
  standardHeaders: true,
  legacyHeaders: false,
});

// Passport Local Strategy для email/password авторизації
const setupLocalAuth = () => {
  passport.use(new LocalStrategy({
    usernameField: 'email',
    passwordField: 'password'
  },
  async (email: string, password: string, done: any) => {
    try {
      // Знайти користувача за email
      const user = await storage.getUserByEmail(email.toLowerCase());
      
      if (!user) {
        return done(null, false, { message: 'Invalid email or password' });
      }

      // Перевірити чи встановлено пароль
      if (!user.passwordHash) {
        return done(null, false, { message: 'Password not set. Please contact administrator to reset your password.' });
      }

      // Порівняти пароль з хешом
      const isPasswordValid = await bcrypt.compare(password, user.passwordHash);
      
      if (!isPasswordValid) {
        return done(null, false, { message: 'Invalid email or password' });
      }

      // Успішна авторизація
      return done(null, user);
    } catch (error) {
      console.error("Error in Local Auth:", error);
      return done(error, false);
    }
  }));
};

// Track admin seeding promise
let adminSeedingPromise: Promise<void> | null = null;

export const setupLocalAuthRoutes = (app: Express) => {
  setupLocalAuth();

  // Login endpoint with rate limiting
  app.post("/api/auth/login", loginLimiter, async (req, res, next) => {
    // Lazy admin seeding on first login attempt - MUST complete before auth
    if (!adminSeedingPromise) {
      adminSeedingPromise = seedAdmin().catch(err => {
        console.error('[LAZY SEED ADMIN ERROR]', err);
        adminSeedingPromise = null; // Reset on failure to allow retry
      });
    }

    // Wait for admin seeding to complete
    await adminSeedingPromise;

    passport.authenticate("local", (err: any, user: any, info: any) => {
      if (err) {
        console.error("❌ Local Auth error:", err);
        return res.status(500).json({ message: "Authentication error" });
      }
      
      if (!user) {
        return res.status(401).json({ message: info?.message || "Invalid credentials" });
      }

      req.login(user, (loginErr) => {
        if (loginErr) {
          console.error("❌ Login error:", loginErr);
          return res.status(500).json({ message: "Login failed" });
        }
        
        console.log("✅ Local Auth success:", user.email);
        
        // Remove sensitive fields before sending to client
        const { passwordHash, ...safeUser } = user;
        return res.json(safeUser);
      });
    })(req, res, next);
  });

  // Verify reset token - check if token is valid before showing reset form
  app.post("/api/auth/verify-reset-token", async (req, res) => {
    try {
      const { token } = req.body;

      if (!token || typeof token !== 'string') {
        return res.status(400).json({ message: "Token is required" });
      }

      // Find the token
      const resetToken = await storage.getPasswordResetToken(token);

      if (!resetToken) {
        return res.status(400).json({ message: "Invalid reset token" });
      }

      // Check if token is expired
      if (new Date() > new Date(resetToken.expiresAt)) {
        return res.status(400).json({ message: "Reset token has expired" });
      }

      // Check if token was already used
      if (resetToken.used) {
        return res.status(400).json({ message: "Reset token has already been used" });
      }

      res.json({ valid: true });
    } catch (error) {
      console.error("Error verifying reset token:", error);
      res.status(500).json({ message: "Failed to verify token" });
    }
  });

  // Forgot password - request reset email with rate limiting
  app.post("/api/auth/forgot-password", passwordResetLimiter, async (req, res) => {
    try {
      const { email } = req.body;

      if (!email || typeof email !== 'string') {
        return res.status(400).json({ message: "Email is required" });
      }

      const normalizedEmail = email.toLowerCase().trim();
      
      // Find user by email
      const user = await storage.getUserByEmail(normalizedEmail);
      
      // Always return success to prevent email enumeration
      if (!user) {
        console.log(`Password reset requested for non-existent email: ${normalizedEmail}`);
        return res.json({ 
          success: true, 
          message: "If an account exists with this email, you will receive a password reset link." 
        });
      }

      // Generate secure random token
      const resetToken = crypto.randomBytes(32).toString('hex');
      
      // Set expiry to 1 hour from now
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000);

      // Invalidate any existing tokens for this user
      await storage.invalidatePasswordResetTokens(user.id);

      // Create new reset token
      await storage.createPasswordResetToken({
        userId: user.id,
        token: resetToken,
        expiresAt
      });

      // Send email with reset link
      await sendPasswordResetEmail(
        user.email!,
        resetToken,
        user.preferredLanguage || 'uk'
      );

      console.log(`✅ Password reset email sent to: ${normalizedEmail}`);
      
      res.json({ 
        success: true, 
        message: "If an account exists with this email, you will receive a password reset link." 
      });
    } catch (error) {
      console.error("Error in forgot-password:", error);
      res.status(500).json({ message: "Failed to process password reset request" });
    }
  });

  // Reset password - set new password with token
  app.post("/api/auth/reset-password", async (req, res) => {
    try {
      const { token, password } = req.body;

      if (!token || typeof token !== 'string') {
        return res.status(400).json({ message: "Reset token is required" });
      }

      if (!password || typeof password !== 'string') {
        return res.status(400).json({ message: "Password is required" });
      }

      // Validate password strength
      if (password.length < 8 || password.length > 32) {
        return res.status(400).json({ message: "Password must be 8-32 characters long" });
      }

      const hasDigit = /\d/.test(password);
      const hasLetter = /[a-zA-Z]/.test(password);

      if (!hasDigit || !hasLetter) {
        return res.status(400).json({ message: "Password must contain at least one letter and one digit" });
      }

      // Find the token
      const resetToken = await storage.getPasswordResetToken(token);

      if (!resetToken) {
        return res.status(400).json({ message: "Invalid or expired reset link" });
      }

      // Check if token is expired
      if (new Date() > new Date(resetToken.expiresAt)) {
        return res.status(400).json({ message: "Reset link has expired. Please request a new one." });
      }

      // Check if token was already used
      if (resetToken.used) {
        return res.status(400).json({ message: "This reset link has already been used" });
      }

      // Hash the new password
      const salt = await bcrypt.genSalt(10);
      const passwordHash = await bcrypt.hash(password, salt);

      // Update user's password
      await storage.setUserPassword(resetToken.userId, passwordHash);

      // Mark token as used
      await storage.markPasswordResetTokenUsed(resetToken.id);

      console.log(`✅ Password reset successful for user: ${resetToken.userId}`);

      res.json({ 
        success: true, 
        message: "Password has been reset successfully. You can now log in with your new password." 
      });
    } catch (error) {
      console.error("Error in reset-password:", error);
      res.status(500).json({ message: "Failed to reset password" });
    }
  });
};
