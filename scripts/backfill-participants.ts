import { db } from "../server/db";
import { 
  trackSplits, 
  royaltyParticipants, 
  participantPaymentDetails,
  trackRoyaltyAllocations,
  paymentDetails
} from "../shared/schema";
import { eq, and, sql } from "drizzle-orm";

interface SplitEntry {
  name: string;
  iban: string;
  taxId: string;
  bankName: string;
  percentage: number;
}

async function backfillParticipants() {
  console.log("Starting participant backfill migration...");
  
  const activeSplits = await db.select().from(trackSplits).where(eq(trackSplits.isActive, true));
  console.log(`Found ${activeSplits.length} active track splits to process`);
  
  const participantsMap = new Map<string, { 
    orgId: string; 
    name: string; 
    taxId: string | null;
    iban: string;
    bankName: string;
  }>();
  
  for (const split of activeSplits) {
    const splits = split.splits as SplitEntry[];
    for (const entry of splits) {
      const key = `${split.orgId}:${entry.name}:${entry.taxId || ''}`;
      if (!participantsMap.has(key)) {
        participantsMap.set(key, {
          orgId: split.orgId,
          name: entry.name,
          taxId: entry.taxId || null,
          iban: entry.iban,
          bankName: entry.bankName
        });
      }
    }
  }
  
  console.log(`Found ${participantsMap.size} unique participants from splits`);
  
  for (const [key, data] of participantsMap) {
    const existing = await db.select()
      .from(royaltyParticipants)
      .where(and(
        eq(royaltyParticipants.orgId, data.orgId),
        eq(royaltyParticipants.name, data.name),
        data.taxId ? eq(royaltyParticipants.taxId, data.taxId) : sql`${royaltyParticipants.taxId} IS NULL`
      ))
      .limit(1);
    
    let participantId: string;
    
    if (existing.length > 0) {
      participantId = existing[0].id;
      console.log(`  Participant "${data.name}" already exists (id: ${participantId})`);
    } else {
      const [newParticipant] = await db.insert(royaltyParticipants).values({
        orgId: data.orgId,
        name: data.name,
        taxId: data.taxId,
        isOwner: false,
        isDeleted: false
      }).returning();
      participantId = newParticipant.id;
      console.log(`  Created participant "${data.name}" (id: ${participantId})`);
    }
    
    const existingPayment = await db.select()
      .from(participantPaymentDetails)
      .where(and(
        eq(participantPaymentDetails.participantId, participantId),
        eq(participantPaymentDetails.isCurrent, true)
      ))
      .limit(1);
    
    if (existingPayment.length === 0) {
      const [paymentDetail] = await db.insert(participantPaymentDetails).values({
        participantId,
        iban: data.iban,
        bankName: data.bankName,
        version: 1,
        isCurrent: true
      }).returning();
      console.log(`    Created payment details v1 for "${data.name}" (id: ${paymentDetail.id})`);
    } else {
      console.log(`    Payment details already exist for "${data.name}"`);
    }
  }
  
  console.log("\nCreating missing participants from allocations...");
  
  const distinctParticipantsFromAlloc = await db.selectDistinct({
    orgId: trackRoyaltyAllocations.orgId,
    name: trackRoyaltyAllocations.participantName,
    taxId: trackRoyaltyAllocations.participantTaxId,
    iban: trackRoyaltyAllocations.participantIban,
    bankName: trackRoyaltyAllocations.participantBankName
  }).from(trackRoyaltyAllocations);
  
  for (const data of distinctParticipantsFromAlloc) {
    const conditions = [
      eq(royaltyParticipants.orgId, data.orgId),
      eq(royaltyParticipants.name, data.name)
    ];
    if (data.taxId) {
      conditions.push(eq(royaltyParticipants.taxId, data.taxId));
    }
    
    const existing = await db.select()
      .from(royaltyParticipants)
      .where(and(...conditions))
      .limit(1);
    
    if (existing.length === 0) {
      const ownerPD = await db.select().from(paymentDetails)
        .where(and(
          eq(paymentDetails.orgId, data.orgId),
          eq(paymentDetails.isPrimary, true),
          eq(paymentDetails.isDeleted, false)
        )).limit(1);
      
      const isActualOwner = ownerPD.length > 0 && ownerPD[0].recipientName === data.name;
      
      const [newParticipant] = await db.insert(royaltyParticipants).values({
        orgId: data.orgId,
        name: data.name,
        taxId: data.taxId,
        isOwner: isActualOwner,
        isDeleted: false
      }).returning();
      console.log(`  Created ${isActualOwner ? 'owner' : ''} participant "${data.name}" from allocations (id: ${newParticipant.id})`);
      
      const [paymentDetail] = await db.insert(participantPaymentDetails).values({
        participantId: newParticipant.id,
        iban: data.iban,
        bankName: data.bankName || 'Unknown',
        version: 1,
        isCurrent: true
      }).returning();
      console.log(`    Created payment details v1 for "${data.name}" (id: ${paymentDetail.id})`);
    }
  }
  
  console.log("\nLinking allocations to participants...");
  
  const allocations = await db.select().from(trackRoyaltyAllocations);
  console.log(`Found ${allocations.length} allocations to process`);
  
  let updated = 0;
  let skipped = 0;
  
  for (const alloc of allocations) {
    if (alloc.participantId) {
      skipped++;
      continue;
    }
    
    const participant = await db.select()
      .from(royaltyParticipants)
      .where(and(
        eq(royaltyParticipants.orgId, alloc.orgId),
        eq(royaltyParticipants.name, alloc.participantName)
      ))
      .limit(1);
    
    if (participant.length === 0) {
      console.log(`  Warning: No participant found for "${alloc.participantName}" in org ${alloc.orgId}`);
      continue;
    }
    
    const paymentDetail = await db.select()
      .from(participantPaymentDetails)
      .where(and(
        eq(participantPaymentDetails.participantId, participant[0].id),
        eq(participantPaymentDetails.isCurrent, true)
      ))
      .limit(1);
    
    if (paymentDetail.length > 0) {
      await db.update(trackRoyaltyAllocations)
        .set({
          participantId: participant[0].id,
          paymentDetailId: paymentDetail[0].id
        })
        .where(eq(trackRoyaltyAllocations.id, alloc.id));
      updated++;
    }
  }
  
  console.log(`\nMigration complete: Updated ${updated} allocations, skipped ${skipped} (already linked)`);
}

backfillParticipants()
  .then(() => {
    console.log("Backfill completed successfully");
    process.exit(0);
  })
  .catch((err) => {
    console.error("Backfill failed:", err);
    process.exit(1);
  });
