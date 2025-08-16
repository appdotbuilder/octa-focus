import { db } from '../db';
import { sessionsTable, taskVerificationsTable } from '../db/schema';
import { type SubmitVerificationInput, type TaskVerification } from '../schema';
import { eq } from 'drizzle-orm';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

export const submitVerification = async (input: SubmitVerificationInput): Promise<TaskVerification> => {
  try {
    // Validate that session exists and is active
    const session = await db.select()
      .from(sessionsTable)
      .where(eq(sessionsTable.id, input.session_id))
      .execute();

    if (session.length === 0) {
      throw new Error(`Session with id ${input.session_id} not found`);
    }

    if (session[0].status !== 'active') {
      throw new Error(`Session must be active to submit verification. Current status: ${session[0].status}`);
    }

    // Set expiration time for proof file (24 hours from now)
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 24);

    // Handle proof file storage if provided
    let proofFilePath: string | null = null;
    if (input.proof_file_data) {
      // Create unique filename using session ID and timestamp
      const timestamp = Date.now();
      const randomBytes = crypto.randomBytes(8).toString('hex');
      const filename = `proof_${input.session_id}_${timestamp}_${randomBytes}`;
      proofFilePath = `/tmp/verifications/${filename}`;

      // Ensure tmp directory exists
      const tmpDir = '/tmp/verifications';
      if (!fs.existsSync(tmpDir)) {
        fs.mkdirSync(tmpDir, { recursive: true });
      }

      // Validate and decode base64 file data
      try {
        // Check if the string is valid base64
        if (!/^[A-Za-z0-9+/]*={0,2}$/.test(input.proof_file_data)) {
          throw new Error('Invalid base64 format');
        }
        
        // Additional validation: check if length is valid for base64
        if (input.proof_file_data.length % 4 !== 0) {
          throw new Error('Invalid base64 length');
        }

        const buffer = Buffer.from(input.proof_file_data, 'base64');
        
        // Verify the buffer is not empty (would indicate invalid base64)
        if (buffer.length === 0 && input.proof_file_data.length > 0) {
          throw new Error('Invalid base64 data');
        }
        
        fs.writeFileSync(proofFilePath, buffer);
      } catch (error) {
        throw new Error('Invalid proof file data - must be valid base64');
      }
    }

    // Insert verification record
    const result = await db.insert(taskVerificationsTable)
      .values({
        session_id: input.session_id,
        verification_type: input.verification_type,
        task_type: input.task_type,
        expected_reps: input.expected_reps,
        verified_reps: null, // Will be set after AI verification
        confidence_score: null, // Will be set after AI verification
        proof_file_path: proofFilePath,
        verification_status: 'pending',
        verified_at: null,
        expires_at: expiresAt,
      })
      .returning()
      .execute();

    // Convert real fields back to numbers for the response
    const verification = result[0];
    return {
      ...verification,
      confidence_score: verification.confidence_score ? parseFloat(verification.confidence_score.toString()) : null,
    };
  } catch (error) {
    console.error('Verification submission failed:', error);
    throw error;
  }
};