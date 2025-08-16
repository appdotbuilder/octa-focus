import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { usersTable, goalsTable, sessionsTable, sessionBlocksTable } from '../db/schema';
import { type StartSessionInput } from '../schema';
import { startSession } from '../handlers/start_session';
import { eq } from 'drizzle-orm';

// Test input
const testInput: StartSessionInput = {
  session_id: 1,
};

describe('startSession', () => {
  beforeEach(createDB);
  afterEach(resetDB);

  it('should start a scheduled session', async () => {
    // Create prerequisite data
    const userResult = await db.insert(usersTable)
      .values({
        email: 'test@example.com',
        username: 'testuser'
      })
      .returning()
      .execute();

    const goalResult = await db.insert(goalsTable)
      .values({
        user_id: userResult[0].id,
        title: 'Test Goal',
        description: 'A goal for testing',
        category: 'physical',
        target_value: 100,
        target_unit: 'reps'
      })
      .returning()
      .execute();

    const sessionResult = await db.insert(sessionsTable)
      .values({
        user_id: userResult[0].id,
        goal_id: goalResult[0].id,
        title: 'Test Session',
        planned_duration: 30,
        status: 'scheduled'
      })
      .returning()
      .execute();

    const result = await startSession({ session_id: sessionResult[0].id });

    // Verify session properties
    expect(result.id).toEqual(sessionResult[0].id);
    expect(result.status).toEqual('active');
    expect(result.started_at).toBeInstanceOf(Date);
    expect(result.updated_at).toBeInstanceOf(Date);
    expect(result.title).toEqual('Test Session');
    expect(result.planned_duration).toEqual(30);
    expect(result.actual_duration).toBeNull();
    expect(result.completed_at).toBeNull();
  });

  it('should update session in database', async () => {
    // Create prerequisite data
    const userResult = await db.insert(usersTable)
      .values({
        email: 'test@example.com',
        username: 'testuser'
      })
      .returning()
      .execute();

    const goalResult = await db.insert(goalsTable)
      .values({
        user_id: userResult[0].id,
        title: 'Test Goal',
        description: 'A goal for testing',
        category: 'mental',
        target_value: 60,
        target_unit: 'minutes'
      })
      .returning()
      .execute();

    const sessionResult = await db.insert(sessionsTable)
      .values({
        user_id: userResult[0].id,
        goal_id: goalResult[0].id,
        title: 'Meditation Session',
        planned_duration: 60,
        status: 'scheduled'
      })
      .returning()
      .execute();

    const beforeTime = new Date();
    await startSession({ session_id: sessionResult[0].id });
    const afterTime = new Date();

    // Verify database was updated
    const updatedSessions = await db.select()
      .from(sessionsTable)
      .where(eq(sessionsTable.id, sessionResult[0].id))
      .execute();

    const session = updatedSessions[0];
    expect(session.status).toEqual('active');
    expect(session.started_at).toBeInstanceOf(Date);
    expect(session.started_at!.getTime()).toBeGreaterThanOrEqual(beforeTime.getTime());
    expect(session.started_at!.getTime()).toBeLessThanOrEqual(afterTime.getTime());
    expect(session.updated_at.getTime()).toBeGreaterThanOrEqual(beforeTime.getTime());
  });

  it('should activate session blocks', async () => {
    // Create prerequisite data
    const userResult = await db.insert(usersTable)
      .values({
        email: 'test@example.com',
        username: 'testuser'
      })
      .returning()
      .execute();

    const goalResult = await db.insert(goalsTable)
      .values({
        user_id: userResult[0].id,
        title: 'Focus Goal',
        description: 'Deep work session',
        category: 'professional'
      })
      .returning()
      .execute();

    const sessionResult = await db.insert(sessionsTable)
      .values({
        user_id: userResult[0].id,
        goal_id: goalResult[0].id,
        title: 'Deep Work Session',
        planned_duration: 90,
        status: 'scheduled'
      })
      .returning()
      .execute();

    // Create session blocks (initially inactive)
    await db.insert(sessionBlocksTable)
      .values([
        {
          session_id: sessionResult[0].id,
          block_type: 'app',
          identifier: 'com.twitter.android',
          is_active: false
        },
        {
          session_id: sessionResult[0].id,
          block_type: 'website',
          identifier: 'facebook.com',
          is_active: false
        }
      ])
      .execute();

    await startSession({ session_id: sessionResult[0].id });

    // Verify session blocks were activated
    const blocks = await db.select()
      .from(sessionBlocksTable)
      .where(eq(sessionBlocksTable.session_id, sessionResult[0].id))
      .execute();

    expect(blocks).toHaveLength(2);
    blocks.forEach(block => {
      expect(block.is_active).toBe(true);
    });
  });

  it('should throw error for non-existent session', async () => {
    await expect(startSession({ session_id: 999 }))
      .rejects
      .toThrow(/session not found or not in scheduled status/i);
  });

  it('should throw error for session not in scheduled status', async () => {
    // Create prerequisite data
    const userResult = await db.insert(usersTable)
      .values({
        email: 'test@example.com',
        username: 'testuser'
      })
      .returning()
      .execute();

    const goalResult = await db.insert(goalsTable)
      .values({
        user_id: userResult[0].id,
        title: 'Test Goal',
        description: 'A goal for testing',
        category: 'skill'
      })
      .returning()
      .execute();

    // Create session with 'active' status (not 'scheduled')
    const sessionResult = await db.insert(sessionsTable)
      .values({
        user_id: userResult[0].id,
        goal_id: goalResult[0].id,
        title: 'Already Active Session',
        planned_duration: 45,
        status: 'active'
      })
      .returning()
      .execute();

    await expect(startSession({ session_id: sessionResult[0].id }))
      .rejects
      .toThrow(/session not found or not in scheduled status/i);
  });

  it('should handle session with milestone_id', async () => {
    // Create prerequisite data
    const userResult = await db.insert(usersTable)
      .values({
        email: 'test@example.com',
        username: 'testuser'
      })
      .returning()
      .execute();

    const goalResult = await db.insert(goalsTable)
      .values({
        user_id: userResult[0].id,
        title: 'Fitness Goal',
        description: 'Get stronger',
        category: 'physical',
        target_value: 50,
        target_unit: 'pushups'
      })
      .returning()
      .execute();

    // Create session with milestone (most sessions won't have milestones)
    const sessionResult = await db.insert(sessionsTable)
      .values({
        user_id: userResult[0].id,
        goal_id: goalResult[0].id,
        milestone_id: null, // Most common case
        title: 'Workout Session',
        planned_duration: 45,
        status: 'scheduled'
      })
      .returning()
      .execute();

    const result = await startSession({ session_id: sessionResult[0].id });

    expect(result.milestone_id).toBeNull();
    expect(result.status).toEqual('active');
    expect(result.started_at).toBeInstanceOf(Date);
  });
});