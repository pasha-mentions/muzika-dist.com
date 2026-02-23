import bcrypt from "bcrypt";
import { db } from "./db";
import { users } from "@shared/schema";
import { eq } from "drizzle-orm";

async function ensurePlatformOwner() {
  const PLATFORM_OWNER_EMAIL = "muzika.ua.info@gmail.com";
  
  try {
    const [existingUser] = await db
      .select()
      .from(users)
      .where(eq(users.email, PLATFORM_OWNER_EMAIL))
      .limit(1);
    
    if (!existingUser) {
      console.log(`ℹ️  Platform owner (${PLATFORM_OWNER_EMAIL}) does not exist yet - skipping`);
      return;
    }
    
    if (existingUser.platformRole === "PLATFORM_OWNER") {
      console.log(`✅ Platform owner (${PLATFORM_OWNER_EMAIL}) already has PLATFORM_OWNER role`);
      return;
    }
    
    await db
      .update(users)
      .set({ platformRole: "PLATFORM_OWNER" })
      .where(eq(users.email, PLATFORM_OWNER_EMAIL));
    
    console.log(`✅ Platform owner role granted to ${PLATFORM_OWNER_EMAIL}`);
  } catch (error) {
    console.error("❌ Error ensuring platform owner:", error);
  }
}

async function seedAdmin() {
  const adminEmail = process.env.ADMIN_EMAIL || "admin@muzika.com";
  const adminPassword = process.env.ADMIN_PASSWORD || "Admin123!";
  
  try {
    await ensurePlatformOwner();
    
    const existingAdmin = await db.select().from(users).where(eq(users.email, adminEmail)).limit(1);
    
    if (existingAdmin.length > 0) {
      const admin = existingAdmin[0];
      
      if (!admin.passwordHash) {
        console.log("⚠️  Admin exists but has no password. Fixing...");
        const passwordHash = await bcrypt.hash(adminPassword, 10);
        
        await db.update(users)
          .set({ 
            passwordHash,
            role: "ADMIN"
          })
          .where(eq(users.id, admin.id));
        
        console.log("✅ Admin password repaired successfully!");
        console.log("📧 Email:", adminEmail);
        console.log("🔑 Password:", adminPassword);
        console.log("⚠️  Please change this password after first login!");
        return;
      }
      
      console.log("✅ Admin user already exists:", adminEmail);
      return;
    }

    const passwordHash = await bcrypt.hash(adminPassword, 10);
    
    const [newAdmin] = await db.insert(users).values({
      email: adminEmail,
      firstName: "Admin",
      lastName: "User",
      role: "ADMIN",
      passwordHash,
    }).returning();

    console.log("✅ Admin user created successfully!");
    console.log("📧 Email:", adminEmail);
    console.log("🔑 Password:", adminPassword);
    console.log("⚠️  Please change this password after first login!");
  } catch (error) {
    console.error("❌ Error creating admin user:", error);
    process.exit(1);
  }
}

export { seedAdmin };
