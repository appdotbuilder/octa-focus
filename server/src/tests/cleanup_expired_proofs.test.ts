import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { usersTable, goalsTable, sessionsTable, taskVerificationsTable } from '../db/schema';
import { cleanupExpiredProofs } from '../handlers/cleanup_expired_proofs';
import { writeFile, mkdir } from 'fs/promises';
import { existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { eq } from 'drizzle-orm';

describe('cleanupExpiredProofs', () => {
  beforeEach(createDB);
  afterEach(resetDB);

  // Helper to create test data
  const createTestUser = async () => {
    const users = await db.insert(usersTable)
      .values({
        email: 'test@example.com',
        username: 'testuser'
      })
      .returning()
      .execute();
    return users[0];
  };

  const createTestGoal = async (userId: number) => {
    const goals = await db.insert(goalsTable)
      .values({
        user_id: userId,
        title: 'Test Goal',
        description: 'A test goal',
        category: 'physical'
      })
      .returning()
      .execute();
    return goals[0];
  };

  const createTestSession = async (userId: number, goalId: number) => {
    const sessions = await db.insert(sessionsTable)
      .values({
        user_id: userId,
        goal_id: goalId,
        title: 'Test Session',
        planned_duration: 30,
        status: 'completed'
      })
      .returning()
      .execute();
    return sessions[0];
  };

  const createTestProofFile = async (filename: string): Promise<string> => {
    const testDir = join(process.cwd(), 'test-proofs');
    if (!existsSync(testDir)) {
      mkdirSync(testDir, { recursive: true });
    }
    
    const filePath = join(testDir, filename);
    await writeFile(filePath, 'test proof content');
    return filePath;
  };

  it('should cleanup expired verifications with proof files', async () => {
    const user = await createTestUser();
    const goal = await createTestGoal(user.id);
    const session = await createTestSession(user.id, goal.id);

    // Create proof file
    const proofFilePath = await createTestProofFile('expired-proof.jpg');
    expect(existsSync(proofFilePath)).toBe(true);

    // Create expired verification with proof file
    const expiredTime = new Date();
    expiredTime.setHours(expiredTime.getHours() - 1); // 1 hour ago

    await db.insert(taskVerificationsTable)
      .values({
        session_id: session.id,
        verification_type: 'photo',
        task_type: 'pushups',
        expected_reps: 10,
        verified_reps: 10,
        proof_file_path: proofFilePath,
        verification_status: 'verified',
        expires_at: expiredTime
      })
      .execute();

    // Run cleanup
    const result = await cleanupExpiredProofs();

    // Should have cleaned up 1 record
    expect(result.deletedCount).toBe(1);

    // Proof file should be deleted
    expect(existsSync(proofFilePath)).toBe(false);

    // Database record should have null proof_file_path
    const verifications = await db.select()
      .from(taskVerificationsTable)
      .where(eq(taskVerificationsTable.session_id, session.id))
      .execute();

    expect(verifications).toHaveLength(1);
    expect(verifications[0].proof_file_path).toBeNull();
  });

  it('should cleanup multiple expired verifications', async () => {
    const user = await createTestUser();
    const goal = await createTestGoal(user.id);
    const session = await createTestSession(user.id, goal.id);

    // Create multiple proof files
    const proofFile1 = await createTestProofFile('expired-proof-1.jpg');
    const proofFile2 = await createTestProofFile('expired-proof-2.jpg');

    const expiredTime = new Date();
    expiredTime.setHours(expiredTime.getHours() - 2);

    // Create multiple expired verifications
    await db.insert(taskVerificationsTable)
      .values([
        {
          session_id: session.id,
          verification_type: 'photo',
          task_type: 'pushups',
          proof_file_path: proofFile1,
          verification_status: 'verified',
          expires_at: expiredTime
        },
        {
          session_id: session.id,
          verification_type: 'video',
          task_type: 'squats',
          proof_file_path: proofFile2,
          verification_status: 'verified',
          expires_at: expiredTime
        }
      ])
      .execute();

    const result = await cleanupExpiredProofs();

    expect(result.deletedCount).toBe(2);
    expect(existsSync(proofFile1)).toBe(false);
    expect(existsSync(proofFile2)).toBe(false);

    // Both records should have null proof_file_path
    const verifications = await db.select()
      .from(taskVerificationsTable)
      .where(eq(taskVerificationsTable.session_id, session.id))
      .execute();

    expect(verifications).toHaveLength(2);
    verifications.forEach(verification => {
      expect(verification.proof_file_path).toBeNull();
    });
  });

  it('should handle non-existent proof files gracefully', async () => {
    const user = await createTestUser();
    const goal = await createTestGoal(user.id);
    const session = await createTestSession(user.id, goal.id);

    const nonExistentPath = '/non/existent/path/proof.jpg';
    const expiredTime = new Date();
    expiredTime.setHours(expiredTime.getHours() - 1);

    // Create expired verification with non-existent proof file
    await db.insert(taskVerificationsTable)
      .values({
        session_id: session.id,
        verification_type: 'photo',
        task_type: 'pushups',
        proof_file_path: nonExistentPath,
        verification_status: 'verified',
        expires_at: expiredTime
      })
      .execute();

    const result = await cleanupExpiredProofs();

    // Should still cleanup the database record
    expect(result.deletedCount).toBe(1);

    // Database record should have null proof_file_path
    const verifications = await db.select()
      .from(taskVerificationsTable)
      .where(eq(taskVerificationsTable.session_id, session.id))
      .execute();

    expect(verifications).toHaveLength(1);
    expect(verifications[0].proof_file_path).toBeNull();
  });

  it('should not affect non-expired verifications', async () => {
    const user = await createTestUser();
    const goal = await createTestGoal(user.id);
    const session = await createTestSession(user.id, goal.id);

    // Create proof file for non-expired verification
    const proofFilePath = await createTestProofFile('valid-proof.jpg');
    
    const futureTime = new Date();
    futureTime.setHours(futureTime.getHours() + 24); // Expires in 24 hours

    // Create non-expired verification
    await db.insert(taskVerificationsTable)
      .values({
        session_id: session.id,
        verification_type: 'photo',
        task_type: 'pushups',
        proof_file_path: proofFilePath,
        verification_status: 'verified',
        expires_at: futureTime
      })
      .execute();

    const result = await cleanupExpiredProofs();

    // Should not cleanup any records
    expect(result.deletedCount).toBe(0);

    // Proof file should still exist
    expect(existsSync(proofFilePath)).toBe(true);

    // Database record should still have proof_file_path
    const verifications = await db.select()
      .from(taskVerificationsTable)
      .where(eq(taskVerificationsTable.session_id, session.id))
      .execute();

    expect(verifications).toHaveLength(1);
    expect(verifications[0].proof_file_path).toBe(proofFilePath);
  });

  it('should not affect verifications without proof files', async () => {
    const user = await createTestUser();
    const goal = await createTestGoal(user.id);
    const session = await createTestSession(user.id, goal.id);

    const expiredTime = new Date();
    expiredTime.setHours(expiredTime.getHours() - 1);

    // Create expired verification without proof file (manual verification)
    await db.insert(taskVerificationsTable)
      .values({
        session_id: session.id,
        verification_type: 'manual',
        task_type: 'meditation',
        proof_file_path: null,
        verification_status: 'verified',
        expires_at: expiredTime
      })
      .execute();

    const result = await cleanupExpiredProofs();

    // Should not cleanup any records (no proof files to clean)
    expect(result.deletedCount).toBe(0);

    // Verification should still exist unchanged
    const verifications = await db.select()
      .from(taskVerificationsTable)
      .where(eq(taskVerificationsTable.session_id, session.id))
      .execute();

    expect(verifications).toHaveLength(1);
    expect(verifications[0].proof_file_path).toBeNull();
    expect(verifications[0].verification_type).toBe('manual');
  });

  it('should handle mixed scenarios correctly', async () => {
    const user = await createTestUser();
    const goal = await createTestGoal(user.id);
    const session = await createTestSession(user.id, goal.id);

    // Create one proof file
    const expiredProofFile = await createTestProofFile('expired-mixed.jpg');
    const validProofFile = await createTestProofFile('valid-mixed.jpg');

    const expiredTime = new Date();
    expiredTime.setHours(expiredTime.getHours() - 1);
    
    const futureTime = new Date();
    futureTime.setHours(futureTime.getHours() + 24);

    // Create mixed verifications
    await db.insert(taskVerificationsTable)
      .values([
        // Expired with proof file - should be cleaned
        {
          session_id: session.id,
          verification_type: 'photo',
          task_type: 'pushups',
          proof_file_path: expiredProofFile,
          verification_status: 'verified',
          expires_at: expiredTime
        },
        // Valid with proof file - should not be cleaned
        {
          session_id: session.id,
          verification_type: 'video',
          task_type: 'squats',
          proof_file_path: validProofFile,
          verification_status: 'verified',
          expires_at: futureTime
        },
        // Expired without proof file - should not be cleaned
        {
          session_id: session.id,
          verification_type: 'manual',
          task_type: 'meditation',
          proof_file_path: null,
          verification_status: 'verified',
          expires_at: expiredTime
        }
      ])
      .execute();

    const result = await cleanupExpiredProofs();

    // Should only cleanup 1 record (expired with proof file)
    expect(result.deletedCount).toBe(1);

    // Expired proof file should be deleted, valid one should remain
    expect(existsSync(expiredProofFile)).toBe(false);
    expect(existsSync(validProofFile)).toBe(true);

    // Check database state
    const verifications = await db.select()
      .from(taskVerificationsTable)
      .where(eq(taskVerificationsTable.session_id, session.id))
      .execute();

    expect(verifications).toHaveLength(3);
    
    const expiredPhotoVerification = verifications.find(v => v.task_type === 'pushups');
    const validVideoVerification = verifications.find(v => v.task_type === 'squats');
    const manualVerification = verifications.find(v => v.task_type === 'meditation');

    expect(expiredPhotoVerification?.proof_file_path).toBeNull();
    expect(validVideoVerification?.proof_file_path).toBe(validProofFile);
    expect(manualVerification?.proof_file_path).toBeNull();
  });
});