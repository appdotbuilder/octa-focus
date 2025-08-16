import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { usersTable, goalsTable, sessionsTable, taskVerificationsTable } from '../db/schema';
import { processVerification } from '../handlers/process_verification';
import { eq } from 'drizzle-orm';

describe('processVerification', () => {
  beforeEach(createDB);
  afterEach(resetDB);

  // Helper function to create test data
  async function createTestData() {
    // Create user
    const userResult = await db.insert(usersTable)
      .values({
        email: 'test@example.com',
        username: 'testuser',
      })
      .returning()
      .execute();
    const user = userResult[0];

    // Create goal
    const goalResult = await db.insert(goalsTable)
      .values({
        user_id: user.id,
        title: 'Fitness Goal',
        category: 'physical',
        target_value: 100,
        target_unit: 'reps',
      })
      .returning()
      .execute();
    const goal = goalResult[0];

    // Create session
    const sessionResult = await db.insert(sessionsTable)
      .values({
        user_id: user.id,
        goal_id: goal.id,
        title: 'Test Session',
        planned_duration: 30,
        status: 'active',
      })
      .returning()
      .execute();
    const session = sessionResult[0];

    return { user, goal, session };
  }

  it('should process pending video verification successfully', async () => {
    const { session } = await createTestData();

    // Create pending verification
    const verificationResult = await db.insert(taskVerificationsTable)
      .values({
        session_id: session.id,
        verification_type: 'video',
        task_type: 'bodyweight_squats',
        expected_reps: 20,
        proof_file_path: '/tmp/test_video.mp4',
        verification_status: 'pending',
        expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours from now
      })
      .returning()
      .execute();
    const verification = verificationResult[0];

    const result = await processVerification(verification.id);

    // Check basic fields
    expect(result.id).toEqual(verification.id);
    expect(result.session_id).toEqual(session.id);
    expect(result.verification_type).toEqual('video');
    expect(result.task_type).toEqual('bodyweight_squats');
    expect(result.expected_reps).toEqual(20);
    expect(result.proof_file_path).toEqual('/tmp/test_video.mp4');

    // Check AI processing results
    expect(result.verification_status).toMatch(/^(verified|rejected)$/);
    expect(result.verified_reps).toBeGreaterThan(0);
    expect(result.confidence_score).toBeGreaterThan(0);
    expect(result.confidence_score).toBeLessThanOrEqual(1);
    expect(result.verified_at).toBeInstanceOf(Date);
    expect(typeof result.confidence_score).toBe('number'); // Ensure numeric conversion
  });

  it('should process photo verification with different behavior', async () => {
    const { session } = await createTestData();

    const verificationResult = await db.insert(taskVerificationsTable)
      .values({
        session_id: session.id,
        verification_type: 'photo',
        task_type: 'pushups',
        expected_reps: 15,
        proof_file_path: '/tmp/test_photo.jpg',
        verification_status: 'pending',
        expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000),
      })
      .returning()
      .execute();
    const verification = verificationResult[0];

    const result = await processVerification(verification.id);

    expect(result.verification_type).toEqual('photo');
    expect(result.verification_status).toMatch(/^(verified|rejected)$/);
    expect(result.verified_reps).toEqual(1); // Photo analysis returns 1 for activity detected
    expect(typeof result.confidence_score).toBe('number');
    expect(result.confidence_score).toBeGreaterThanOrEqual(0.6);
  });

  it('should process sensor verification with high accuracy', async () => {
    const { session } = await createTestData();

    const verificationResult = await db.insert(taskVerificationsTable)
      .values({
        session_id: session.id,
        verification_type: 'sensor',
        task_type: 'running_steps',
        expected_reps: 1000,
        verification_status: 'pending',
        expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000),
      })
      .returning()
      .execute();
    const verification = verificationResult[0];

    const result = await processVerification(verification.id);

    expect(result.verification_type).toEqual('sensor');
    expect(result.verification_status).toEqual('verified'); // Sensor data is highly reliable
    expect(result.confidence_score).toEqual(0.98);
    expect(result.verified_reps).toBeGreaterThan(950); // High accuracy range
    expect(result.verified_reps).toBeLessThan(1050);
  });

  it('should process manual verification with perfect accuracy', async () => {
    const { session } = await createTestData();

    const verificationResult = await db.insert(taskVerificationsTable)
      .values({
        session_id: session.id,
        verification_type: 'manual',
        task_type: 'meditation',
        expected_reps: 1,
        verification_status: 'pending',
        expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000),
      })
      .returning()
      .execute();
    const verification = verificationResult[0];

    const result = await processVerification(verification.id);

    expect(result.verification_type).toEqual('manual');
    expect(result.verification_status).toEqual('verified');
    expect(result.verified_reps).toEqual(1); // Manual accepts expected value
    expect(result.confidence_score).toEqual(1.0);
  });

  it('should handle non-quantifiable tasks', async () => {
    const { session } = await createTestData();

    const verificationResult = await db.insert(taskVerificationsTable)
      .values({
        session_id: session.id,
        verification_type: 'video',
        task_type: 'yoga_session',
        expected_reps: null, // Non-quantifiable
        verification_status: 'pending',
        expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000),
      })
      .returning()
      .execute();
    const verification = verificationResult[0];

    const result = await processVerification(verification.id);

    expect(result.expected_reps).toBeNull();
    expect(result.verified_reps).toBeNull();
    expect(result.verification_status).toEqual('verified');
    expect(result.confidence_score).toBeGreaterThan(0.8);
  });

  it('should mark expired verification as expired', async () => {
    const { session } = await createTestData();

    // Create verification that expires in the past
    const verificationResult = await db.insert(taskVerificationsTable)
      .values({
        session_id: session.id,
        verification_type: 'video',
        task_type: 'squats',
        expected_reps: 10,
        verification_status: 'pending',
        expires_at: new Date(Date.now() - 60 * 60 * 1000), // 1 hour ago
      })
      .returning()
      .execute();
    const verification = verificationResult[0];

    const result = await processVerification(verification.id);

    expect(result.verification_status).toEqual('expired');
    expect(result.verified_at).toBeInstanceOf(Date);
    expect(result.verified_reps).toBeNull(); // No AI processing for expired
    expect(result.confidence_score).toBeNull();
  });

  it('should update verification record in database', async () => {
    const { session } = await createTestData();

    const verificationResult = await db.insert(taskVerificationsTable)
      .values({
        session_id: session.id,
        verification_type: 'video',
        task_type: 'burpees',
        expected_reps: 5,
        verification_status: 'pending',
        expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000),
      })
      .returning()
      .execute();
    const verification = verificationResult[0];

    await processVerification(verification.id);

    // Query database to verify updates
    const updatedVerifications = await db.select()
      .from(taskVerificationsTable)
      .where(eq(taskVerificationsTable.id, verification.id))
      .execute();

    const updated = updatedVerifications[0];
    expect(updated.verification_status).toMatch(/^(verified|rejected)$/);
    expect(updated.verified_at).toBeInstanceOf(Date);
    expect(updated.verified_reps).toBeDefined();
    expect(updated.confidence_score).toBeDefined();
  });

  it('should throw error for non-existent verification', async () => {
    expect(() => processVerification(99999)).toThrow(/not found/i);
  });

  it('should throw error for non-pending verification', async () => {
    const { session } = await createTestData();

    // Create already verified verification
    const verificationResult = await db.insert(taskVerificationsTable)
      .values({
        session_id: session.id,
        verification_type: 'manual',
        task_type: 'completed_task',
        expected_reps: 1,
        verification_status: 'verified', // Already processed
        verified_at: new Date(),
        expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000),
      })
      .returning()
      .execute();
    const verification = verificationResult[0];

    expect(() => processVerification(verification.id)).toThrow(/not pending/i);
  });

  it('should handle different task types appropriately', async () => {
    const { session } = await createTestData();

    // Test multiple task types
    const taskTypes = ['bodyweight_squats', 'pushups', 'meditation', 'running', 'yoga'];
    
    for (const taskType of taskTypes) {
      const verificationResult = await db.insert(taskVerificationsTable)
        .values({
          session_id: session.id,
          verification_type: 'video',
          task_type: taskType,
          expected_reps: 10,
          verification_status: 'pending',
          expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000),
        })
        .returning()
        .execute();
      const verification = verificationResult[0];

      const result = await processVerification(verification.id);
      
      expect(result.task_type).toEqual(taskType);
      expect(result.verification_status).toMatch(/^(verified|rejected)$/);
      expect(typeof result.confidence_score).toBe('number');
    }
  });

  it('should properly convert numeric fields from database', async () => {
    const { session } = await createTestData();

    const verificationResult = await db.insert(taskVerificationsTable)
      .values({
        session_id: session.id,
        verification_type: 'sensor',
        task_type: 'step_counter',
        expected_reps: 500,
        verification_status: 'pending',
        expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000),
      })
      .returning()
      .execute();
    const verification = verificationResult[0];

    const result = await processVerification(verification.id);

    // Ensure proper numeric conversion from database strings
    expect(typeof result.confidence_score).toBe('number');
    expect(result.confidence_score).toBeGreaterThan(0);
    expect(result.confidence_score).toBeLessThanOrEqual(1);
  });
});