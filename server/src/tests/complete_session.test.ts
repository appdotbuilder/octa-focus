import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { 
  usersTable, 
  goalsTable, 
  sessionsTable, 
  sessionBlocksTable, 
  userStatsTable 
} from '../db/schema';
import { type CompleteSessionInput } from '../schema';
import { completeSession } from '../handlers/complete_session';
import { eq, and } from 'drizzle-orm';

describe('completeSession', () => {
  beforeEach(createDB);
  afterEach(resetDB);

  let testUserId: number;
  let testGoalId: number;
  let testSessionId: number;

  beforeEach(async () => {
    // Create test user
    const users = await db.insert(usersTable)
      .values({
        email: 'test@example.com',
        username: 'testuser'
      })
      .returning()
      .execute();
    testUserId = users[0].id;

    // Create test goal
    const goals = await db.insert(goalsTable)
      .values({
        user_id: testUserId,
        title: 'Test Goal',
        description: 'A test goal',
        category: 'physical'
      })
      .returning()
      .execute();
    testGoalId = goals[0].id;

    // Create test session in active state
    const sessions = await db.insert(sessionsTable)
      .values({
        user_id: testUserId,
        goal_id: testGoalId,
        title: 'Test Session',
        planned_duration: 30,
        status: 'active',
        started_at: new Date(Date.now() - 25 * 60000) // Started 25 minutes ago
      })
      .returning()
      .execute();
    testSessionId = sessions[0].id;
  });

  it('should complete an active session successfully', async () => {
    const input: CompleteSessionInput = {
      session_id: testSessionId,
      actual_duration: 28
    };

    const result = await completeSession(input);

    expect(result.id).toBe(testSessionId);
    expect(result.status).toBe('completed');
    expect(result.actual_duration).toBe(28);
    expect(result.completed_at).toBeInstanceOf(Date);
    expect(result.updated_at).toBeInstanceOf(Date);
  });

  it('should use planned duration if actual duration not provided', async () => {
    const input: CompleteSessionInput = {
      session_id: testSessionId,
      actual_duration: null
    };

    const result = await completeSession(input);

    expect(result.actual_duration).toBe(30); // Should use planned_duration
    expect(result.status).toBe('completed');
  });

  it('should update session in database', async () => {
    const input: CompleteSessionInput = {
      session_id: testSessionId,
      actual_duration: 25
    };

    await completeSession(input);

    const sessions = await db.select()
      .from(sessionsTable)
      .where(eq(sessionsTable.id, testSessionId))
      .execute();

    expect(sessions).toHaveLength(1);
    expect(sessions[0].status).toBe('completed');
    expect(sessions[0].actual_duration).toBe(25);
    expect(sessions[0].completed_at).toBeInstanceOf(Date);
  });

  it('should deactivate session blocks', async () => {
    // Create some session blocks
    await db.insert(sessionBlocksTable)
      .values([
        {
          session_id: testSessionId,
          block_type: 'app',
          identifier: 'com.instagram.android',
          is_active: true
        },
        {
          session_id: testSessionId,
          block_type: 'website',
          identifier: 'youtube.com',
          is_active: true
        }
      ])
      .execute();

    const input: CompleteSessionInput = {
      session_id: testSessionId,
      actual_duration: 30
    };

    await completeSession(input);

    const blocks = await db.select()
      .from(sessionBlocksTable)
      .where(eq(sessionBlocksTable.session_id, testSessionId))
      .execute();

    expect(blocks).toHaveLength(2);
    blocks.forEach(block => {
      expect(block.is_active).toBe(false);
    });
  });

  it('should create user stats for new category', async () => {
    const input: CompleteSessionInput = {
      session_id: testSessionId,
      actual_duration: 35
    };

    await completeSession(input);

    const stats = await db.select()
      .from(userStatsTable)
      .where(and(
        eq(userStatsTable.user_id, testUserId),
        eq(userStatsTable.category, 'physical')
      ))
      .execute();

    expect(stats).toHaveLength(1);
    const userStats = stats[0];
    expect(userStats.total_sessions).toBe(1);
    expect(userStats.completed_sessions).toBe(1);
    expect(userStats.total_duration).toBe(35);
    expect(userStats.streak_days).toBe(1);
    expect(userStats.last_activity).toBeInstanceOf(Date);
    expect(parseFloat(userStats.leaderboard_score.toString())).toBeGreaterThan(0);
  });

  it('should update existing user stats', async () => {
    // Create initial stats
    await db.insert(userStatsTable)
      .values({
        user_id: testUserId,
        category: 'physical',
        total_sessions: 5,
        completed_sessions: 4,
        total_duration: 120,
        streak_days: 3,
        last_activity: new Date(Date.now() - 24 * 60 * 60 * 1000), // Yesterday
        leaderboard_score: 50.0
      })
      .execute();

    const input: CompleteSessionInput = {
      session_id: testSessionId,
      actual_duration: 40
    };

    await completeSession(input);

    const stats = await db.select()
      .from(userStatsTable)
      .where(and(
        eq(userStatsTable.user_id, testUserId),
        eq(userStatsTable.category, 'physical')
      ))
      .execute();

    expect(stats).toHaveLength(1);
    const userStats = stats[0];
    expect(userStats.total_sessions).toBe(6);
    expect(userStats.completed_sessions).toBe(5);
    expect(userStats.total_duration).toBe(160);
    expect(userStats.streak_days).toBe(4); // Should increment streak
    expect(parseFloat(userStats.leaderboard_score.toString())).toBeGreaterThan(50);
  });

  it('should throw error for non-existent session', async () => {
    const input: CompleteSessionInput = {
      session_id: 99999,
      actual_duration: 30
    };

    await expect(completeSession(input)).rejects.toThrow(/Session with id 99999 not found/);
  });

  it('should throw error for non-active session', async () => {
    // Update session to completed status
    await db.update(sessionsTable)
      .set({ status: 'completed' })
      .where(eq(sessionsTable.id, testSessionId))
      .execute();

    const input: CompleteSessionInput = {
      session_id: testSessionId,
      actual_duration: 30
    };

    await expect(completeSession(input)).rejects.toThrow(/is not active.*current status: completed/);
  });

  it('should handle session with scheduled status error', async () => {
    // Update session to scheduled status
    await db.update(sessionsTable)
      .set({ status: 'scheduled' })
      .where(eq(sessionsTable.id, testSessionId))
      .execute();

    const input: CompleteSessionInput = {
      session_id: testSessionId,
      actual_duration: 30
    };

    await expect(completeSession(input)).rejects.toThrow(/is not active.*current status: scheduled/);
  });

  it('should reset streak for inactive users', async () => {
    // Create stats with old last_activity (more than 1 day ago)
    await db.insert(userStatsTable)
      .values({
        user_id: testUserId,
        category: 'physical',
        total_sessions: 3,
        completed_sessions: 2,
        total_duration: 60,
        streak_days: 5,
        last_activity: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000), // 3 days ago
        leaderboard_score: 40.0
      })
      .execute();

    const input: CompleteSessionInput = {
      session_id: testSessionId,
      actual_duration: 20
    };

    await completeSession(input);

    const stats = await db.select()
      .from(userStatsTable)
      .where(and(
        eq(userStatsTable.user_id, testUserId),
        eq(userStatsTable.category, 'physical')
      ))
      .execute();

    expect(stats).toHaveLength(1);
    expect(stats[0].streak_days).toBe(1); // Should reset to 1
  });

  it('should handle session without blocks gracefully', async () => {
    const input: CompleteSessionInput = {
      session_id: testSessionId,
      actual_duration: 25
    };

    // Should not throw even if no blocks exist
    const result = await completeSession(input);
    expect(result.status).toBe('completed');
  });

  it('should complete session successfully with valid data', async () => {
    // This test verifies normal session completion behavior
    // It demonstrates that the handler works correctly with all valid data
    
    const input: CompleteSessionInput = {
      session_id: testSessionId,
      actual_duration: 35
    };

    const result = await completeSession(input);
    
    expect(result.status).toBe('completed');
    expect(result.actual_duration).toBe(35);
    expect(result.completed_at).toBeInstanceOf(Date);
    expect(result.id).toBe(testSessionId);
    
    // Verify session was persisted correctly
    const sessions = await db.select()
      .from(sessionsTable)
      .where(eq(sessionsTable.id, testSessionId))
      .execute();
    
    expect(sessions[0].status).toBe('completed');
    expect(sessions[0].actual_duration).toBe(35);
    expect(sessions[0].completed_at).toBeInstanceOf(Date);
    
    // Verify stats were updated
    const stats = await db.select()
      .from(userStatsTable)
      .where(and(
        eq(userStatsTable.user_id, testUserId),
        eq(userStatsTable.category, 'physical')
      ))
      .execute();
    
    expect(stats).toHaveLength(1);
    expect(stats[0].completed_sessions).toBe(1);
    expect(stats[0].total_duration).toBe(35);
  });
});