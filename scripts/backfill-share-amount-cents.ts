import { neon } from "@neondatabase/serverless";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is required");
}

const sql = neon(connectionString);

async function backfillShareAmountNano() {
  console.log("Starting backfill of shareAmountNano (EUR * 10^10) for existing allocations...");

  const result = await sql`
    UPDATE track_royalty_allocations 
    SET share_amount_nano = (ROUND(CAST(share_amount AS NUMERIC) * 10000000000))::BIGINT::TEXT
    WHERE share_amount_nano IS NULL
    RETURNING id
  `;

  console.log(`Backfill complete. Updated ${result.length} allocations.`);
  
  const sample = await sql`
    SELECT share_amount, share_amount_nano 
    FROM track_royalty_allocations 
    ORDER BY share_amount ASC 
    LIMIT 5
  `;
  console.log("Sample of smallest allocations:", sample);
}

backfillShareAmountNano()
  .then(() => {
    console.log("Backfill finished successfully.");
    process.exit(0);
  })
  .catch((error) => {
    console.error("Backfill failed:", error);
    process.exit(1);
  });
