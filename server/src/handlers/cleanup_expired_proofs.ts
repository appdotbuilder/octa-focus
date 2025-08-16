import { db } from '../db';
import { taskVerificationsTable } from '../db/schema';
import { lte, and, isNotNull, eq } from 'drizzle-orm';
import { unlink } from 'fs/promises';
import { existsSync } from 'fs';

export async function cleanupExpiredProofs(): Promise<{ deletedCount: number }> {
  try {
    const now = new Date();
    
    // Find expired verifications that still have proof files
    const expiredVerifications = await db.select()
      .from(taskVerificationsTable)
      .where(
        and(
          lte(taskVerificationsTable.expires_at, now),
          isNotNull(taskVerificationsTable.proof_file_path)
        )
      )
      .execute();

    let deletedCount = 0;

    // Process each expired verification
    for (const verification of expiredVerifications) {
      let fileDeleted = false;
      
      // Try to delete the proof file if it exists
      if (verification.proof_file_path) {
        try {
          if (existsSync(verification.proof_file_path)) {
            await unlink(verification.proof_file_path);
            fileDeleted = true;
          } else {
            // File already doesn't exist, consider it cleaned up
            fileDeleted = true;
          }
        } catch (fileError) {
          console.error(`Failed to delete proof file ${verification.proof_file_path}:`, fileError);
          // Continue processing even if file deletion fails
        }
      }

      // Always clear the file path from the database record for privacy
      // regardless of whether file deletion succeeded
      try {
        await db.update(taskVerificationsTable)
          .set({ 
            proof_file_path: null 
          })
          .where(eq(taskVerificationsTable.id, verification.id))
          .execute();
        
        deletedCount++;
      } catch (dbError) {
        console.error(`Failed to update verification record ${verification.id}:`, dbError);
      }
    }

    return { deletedCount };
  } catch (error) {
    console.error('Cleanup expired proofs failed:', error);
    throw error;
  }
}