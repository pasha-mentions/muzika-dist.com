import { db } from "./db";
import { releases } from "@shared/schema";
import { sql } from "drizzle-orm";

/**
 * Fix Google Drive artwork URLs to use thumbnail API for proper image display
 * Converts old formats to: https://drive.google.com/thumbnail?id=FILE_ID&sz=w1000
 */
async function fixArtworkUrls() {
  try {
    console.log('🔧 Starting artwork URL migration...');
    
    // First, let's see what we have
    const beforeSample = await db.execute(sql`
      SELECT id, title, artwork_url 
      FROM releases 
      WHERE artwork_url LIKE '%drive.google.com%' 
      LIMIT 3
    `);
    
    console.log('\n📋 Sample URLs BEFORE migration:');
    for (const row of beforeSample.rows) {
      console.log(`   ${row.title}: ${row.artwork_url}`);
    }
    
    // Update URLs to use thumbnail API
    // Extract file ID from various Google Drive URL formats and convert to thumbnail format
    const result = await db.execute(sql`
      UPDATE releases 
      SET artwork_url = 'https://drive.google.com/thumbnail?id=' || 
        CASE 
          WHEN artwork_url LIKE '%/d/%/view%' THEN 
            substring(artwork_url from '/d/([^/]+)')
          WHEN artwork_url LIKE '%id=%' THEN 
            substring(artwork_url from 'id=([^&]+)')
          ELSE artwork_url
        END || '&sz=w1000'
      WHERE artwork_url LIKE '%drive.google.com%'
        AND artwork_url NOT LIKE '%thumbnail%'
    `);
    
    console.log('\n✅ Artwork URLs fixed successfully!');
    console.log(`   Updated ${result.rowCount || 0} releases`);
    
    // Show sample of updated URLs
    const afterSample = await db.execute(sql`
      SELECT id, title, artwork_url 
      FROM releases 
      WHERE artwork_url LIKE '%drive.google.com%' 
      LIMIT 5
    `);
    
    console.log('\n📋 Sample URLs AFTER migration:');
    for (const row of afterSample.rows) {
      console.log(`   ${row.title}: ${row.artwork_url}`);
    }
    
  } catch (error) {
    console.error('❌ Error fixing artwork URLs:', error);
    process.exit(1);
  }
  
  process.exit(0);
}

fixArtworkUrls();
