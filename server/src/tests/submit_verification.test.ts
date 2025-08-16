import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { usersTable, goalsTable, sessionsTable, taskVerificationsTable } from '../db/schema';
import { type SubmitVerificationInput } from '../schema';
import { submitVerification } from '../handlers/submit_verification';
import { eq } from 'drizzle-orm';
import * as fs from 'fs';

// Test data
const testUser = {
  email: 'test@example.com',
  username: 'testuser'
};

const testGoal = {
  title: 'Test Goal',
  description: 'A goal for testing',
  category: 'physical' as const,
  target_value: 100,
  target_unit: 'reps'
};

const testSession = {
  title: 'Test Session',
  planned_duration: 30,
  status: 'active' as const
};

describe('submitVerification', () => {
  let userId: number;
  let goalId: number;
  let sessionId: number;

  beforeEach(async () => {
    await createDB();
    
    // Create test user
    const userResult = await db.insert(usersTable)
      .values(testUser)
      .returning()
      .execute();
    userId = userResult[0].id;

    // Create test goal
    const goalResult = await db.insert(goalsTable)
      .values({
        ...testGoal,
        user_id: userId
      })
      .returning()
      .execute();
    goalId = goalResult[0].id;

    // Create active test session
    const sessionResult = await db.insert(sessionsTable)
      .values({
        ...testSession,
        user_id: userId,
        goal_id: goalId
      })
      .returning()
      .execute();
    sessionId = sessionResult[0].id;

    // Clean up any existing tmp directory
    if (fs.existsSync('/tmp/verifications')) {
      fs.rmSync('/tmp/verifications', { recursive: true, force: true });
    }
  });

  afterEach(async () => {
    // Clean up tmp files
    if (fs.existsSync('/tmp/verifications')) {
      fs.rmSync('/tmp/verifications', { recursive: true, force: true });
    }
    await resetDB();
  });

  it('should create verification without proof file', async () => {
    const input: SubmitVerificationInput = {
      session_id: sessionId,
      verification_type: 'manual',
      task_type: 'pushups',
      expected_reps: 20
    };

    const result = await submitVerification(input);

    expect(result.session_id).toEqual(sessionId);
    expect(result.verification_type).toEqual('manual');
    expect(result.task_type).toEqual('pushups');
    expect(result.expected_reps).toEqual(20);
    expect(result.verified_reps).toBeNull();
    expect(result.confidence_score).toBeNull();
    expect(result.proof_file_path).toBeNull();
    expect(result.verification_status).toEqual('pending');
    expect(result.verified_at).toBeNull();
    expect(result.id).toBeDefined();
    expect(result.created_at).toBeInstanceOf(Date);
    expect(result.expires_at).toBeInstanceOf(Date);

    // Check expiration is about 24 hours from now
    const now = new Date();
    const expectedExpiration = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    const timeDiff = Math.abs(result.expires_at.getTime() - expectedExpiration.getTime());
    expect(timeDiff).toBeLessThan(60000); // Within 1 minute
  });

  it('should create verification with proof file', async () => {
    const testFileData = Buffer.from('test file content').toString('base64');
    
    const input: SubmitVerificationInput = {
      session_id: sessionId,
      verification_type: 'video',
      task_type: 'squats',
      expected_reps: 15,
      proof_file_data: testFileData
    };

    const result = await submitVerification(input);

    expect(result.session_id).toEqual(sessionId);
    expect(result.verification_type).toEqual('video');
    expect(result.task_type).toEqual('squats');
    expect(result.expected_reps).toEqual(15);
    expect(result.proof_file_path).toBeDefined();
    expect(result.proof_file_path).toMatch(/^\/tmp\/verifications\/proof_\d+_\d+_[a-f0-9]{16}$/);
    expect(result.verification_status).toEqual('pending');

    // Verify file was actually saved
    if (result.proof_file_path) {
      expect(fs.existsSync(result.proof_file_path)).toBe(true);
      const savedContent = fs.readFileSync(result.proof_file_path);
      expect(savedContent.toString()).toEqual('test file content');
    }
  });

  it('should save verification to database', async () => {
    const input: SubmitVerificationInput = {
      session_id: sessionId,
      verification_type: 'sensor',
      task_type: 'meditation',
      expected_reps: null
    };

    const result = await submitVerification(input);

    // Query database to verify it was saved
    const verifications = await db.select()
      .from(taskVerificationsTable)
      .where(eq(taskVerificationsTable.id, result.id))
      .execute();

    expect(verifications).toHaveLength(1);
    const saved = verifications[0];
    expect(saved.session_id).toEqual(sessionId);
    expect(saved.verification_type).toEqual('sensor');
    expect(saved.task_type).toEqual('meditation');
    expect(saved.expected_reps).toBeNull();
    expect(saved.verification_status).toEqual('pending');
    expect(saved.created_at).toBeInstanceOf(Date);
  });

  it('should handle all verification types', async () => {
    const verificationTypes: Array<'video' | 'photo' | 'sensor' | 'manual'> = [
      'video', 'photo', 'sensor', 'manual'
    ];

    for (const verificationType of verificationTypes) {
      const input: SubmitVerificationInput = {
        session_id: sessionId,
        verification_type: verificationType,
        task_type: `test_${verificationType}`,
        expected_reps: 10
      };

      const result = await submitVerification(input);
      expect(result.verification_type).toEqual(verificationType);
      expect(result.task_type).toEqual(`test_${verificationType}`);
    }
  });

  it('should handle null expected_reps', async () => {
    const input: SubmitVerificationInput = {
      session_id: sessionId,
      verification_type: 'manual',
      task_type: 'stretching',
      expected_reps: null
    };

    const result = await submitVerification(input);
    expect(result.expected_reps).toBeNull();
  });

  it('should throw error for non-existent session', async () => {
    const input: SubmitVerificationInput = {
      session_id: 99999,
      verification_type: 'manual',
      task_type: 'pushups',
      expected_reps: 20
    };

    expect(submitVerification(input)).rejects.toThrow(/Session with id 99999 not found/i);
  });

  it('should throw error for inactive session', async () => {
    // Create an inactive session
    const inactiveSessionResult = await db.insert(sessionsTable)
      .values({
        ...testSession,
        status: 'completed',
        user_id: userId,
        goal_id: goalId
      })
      .returning()
      .execute();

    const input: SubmitVerificationInput = {
      session_id: inactiveSessionResult[0].id,
      verification_type: 'manual',
      task_type: 'pushups',
      expected_reps: 20
    };

    expect(submitVerification(input)).rejects.toThrow(/Session must be active to submit verification/i);
  });

  it('should throw error for invalid base64 data', async () => {
    const input: SubmitVerificationInput = {
      session_id: sessionId,
      verification_type: 'photo',
      task_type: 'pushups',
      expected_reps: 20,
      proof_file_data: 'invalid-base64-data!@#$%'
    };

    expect(submitVerification(input)).rejects.toThrow(/Invalid proof file data - must be valid base64/i);
  });

  it('should create tmp directory if it does not exist', async () => {
    // Ensure directory doesn't exist
    if (fs.existsSync('/tmp/verifications')) {
      fs.rmSync('/tmp/verifications', { recursive: true, force: true });
    }

    const testFileData = Buffer.from('test content').toString('base64');
    const input: SubmitVerificationInput = {
      session_id: sessionId,
      verification_type: 'video',
      task_type: 'burpees',
      expected_reps: 10,
      proof_file_data: testFileData
    };

    const result = await submitVerification(input);

    expect(fs.existsSync('/tmp/verifications')).toBe(true);
    expect(result.proof_file_path).toBeDefined();
    if (result.proof_file_path) {
      expect(fs.existsSync(result.proof_file_path)).toBe(true);
    }
  });
});