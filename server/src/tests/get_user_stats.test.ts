import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { usersTable, userStatsTable, sessionsTable, goalsTable } from '../db/schema';
import { type GetUserStatsInput } from '../schema';
import { getUserStats } from '../handlers/get_user_stats';
import { eq } from 'drizzle-orm';

// Test data
const testUser = {
  email: 'test@example.com',
  username: 'testuser'
};

const testGoal = {
  user_id: 1,
  title: 'Test Goal',
  description: 'A test goal',
  category: 'physical' as const
};

const testStats1 = {
  user_id: 1,
  category: 'physical',
  total_sessions: 10,
  completed_sessions: 8,
  total_duration: 480,
  streak_days: 5,
  last_activity: new Date(),
  leaderboard_score: 125.5,
  last_score_update: new Date()
};

const testStats2 = {
  user_id: 1,
  category: 'mental',
  total_sessions: 15,
  completed_sessions: 12,
  total_duration: 360,
  streak_days: 3,
  last_activity: new Date(),
  leaderboard_score: 98.75,
  last_score_update: new Date()
};

const testInput: GetUserStatsInput = {
  user_id: 1
};

describe('getUserStats', () => {
  beforeEach(createDB);
  afterEach(resetDB);

  it('should return all user stats when no category filter is applied', async () => {
    // Create test user first
    await db.insert(usersTable).values(testUser).execute();

    // Create test stats
    await db.insert(userStatsTable).values([testStats1, testStats2]).execute();

    const result = await getUserStats(testInput);

    expect(result).toHaveLength(2);
    expect(result[0].user_id).toEqual(1);
    expect(result[0].total_sessions).toEqual(10);
    expect(result[0].completed_sessions).toEqual(8);
    expect(result[0].total_duration).toEqual(480);
    expect(result[0].streak_days).toEqual(5);
    expect(typeof result[0].leaderboard_score).toBe('number');
    expect(result[0].leaderboard_score).toEqual(125.5);

    // Verify second stat
    expect(result[1].category).toEqual('mental');
    expect(result[1].total_sessions).toEqual(15);
    expect(typeof result[1].leaderboard_score).toBe('number');
    expect(result[1].leaderboard_score).toEqual(98.75);
  });

  it('should filter by category when specified', async () => {
    // Create test user first
    await db.insert(usersTable).values(testUser).execute();

    // Create test stats
    await db.insert(userStatsTable).values([testStats1, testStats2]).execute();

    const filteredInput: GetUserStatsInput = {
      user_id: 1,
      category: 'physical'
    };

    const result = await getUserStats(filteredInput);

    expect(result).toHaveLength(1);
    expect(result[0].category).toEqual('physical');
    expect(result[0].total_sessions).toEqual(10);
    expect(result[0].completed_sessions).toEqual(8);
  });

  it('should return empty array when user has no stats', async () => {
    // Create test user but no stats
    await db.insert(usersTable).values(testUser).execute();

    const result = await getUserStats(testInput);

    expect(result).toHaveLength(0);
  });

  it('should return empty array when category filter matches no stats', async () => {
    // Create test user first
    await db.insert(usersTable).values(testUser).execute();

    // Create test stats
    await db.insert(userStatsTable).values([testStats1]).execute();

    const filteredInput: GetUserStatsInput = {
      user_id: 1,
      category: 'creative'
    };

    const result = await getUserStats(filteredInput);

    expect(result).toHaveLength(0);
  });

  it('should update streak when last activity is old and no recent sessions', async () => {
    // Create test user and goal first
    await db.insert(usersTable).values(testUser).execute();
    await db.insert(goalsTable).values(testGoal).execute();

    // Create stat with old last_activity (more than 24 hours ago)
    const oldActivity = new Date();
    oldActivity.setDate(oldActivity.getDate() - 2); // 2 days ago

    const oldStat = {
      ...testStats1,
      streak_days: 5,
      last_activity: oldActivity
    };

    await db.insert(userStatsTable).values(oldStat).execute();

    const result = await getUserStats(testInput);

    expect(result).toHaveLength(1);
    expect(result[0].streak_days).toEqual(0); // Should be reset to 0
  });

  it('should maintain streak when there are recent completed sessions', async () => {
    // Create test user and goal first
    await db.insert(usersTable).values(testUser).execute();
    await db.insert(goalsTable).values(testGoal).execute();

    // Create stat with old last_activity
    const oldActivity = new Date();
    oldActivity.setDate(oldActivity.getDate() - 2);

    const oldStat = {
      ...testStats1,
      streak_days: 5,
      last_activity: oldActivity
    };

    await db.insert(userStatsTable).values(oldStat).execute();

    // Create a recent completed session (within 24 hours)
    const recentSession = {
      user_id: 1,
      goal_id: 1,
      title: 'Recent Session',
      planned_duration: 30,
      actual_duration: 30,
      status: 'completed' as const,
      completed_at: new Date() // Recent completion
    };

    await db.insert(sessionsTable).values(recentSession).execute();

    const result = await getUserStats(testInput);

    expect(result).toHaveLength(1);
    expect(result[0].streak_days).toEqual(5); // Should maintain streak
  });

  it('should handle stats with zero values correctly', async () => {
    // Create test user first
    await db.insert(usersTable).values(testUser).execute();

    const zeroStat = {
      user_id: 1,
      category: 'habit',
      total_sessions: 0,
      completed_sessions: 0,
      total_duration: 0,
      streak_days: 0,
      last_activity: null,
      leaderboard_score: 0,
      last_score_update: new Date()
    };

    await db.insert(userStatsTable).values(zeroStat).execute();

    const result = await getUserStats(testInput);

    expect(result).toHaveLength(1);
    expect(result[0].total_sessions).toEqual(0);
    expect(result[0].completed_sessions).toEqual(0);
    expect(result[0].total_duration).toEqual(0);
    expect(result[0].streak_days).toEqual(0);
    expect(result[0].last_activity).toBeNull();
    expect(typeof result[0].leaderboard_score).toBe('number');
    expect(result[0].leaderboard_score).toEqual(0);
  });

  it('should return stats ordered by category consistently', async () => {
    // Create test user first
    await db.insert(usersTable).values(testUser).execute();

    // Create multiple stats with different categories
    const stats = [
      { ...testStats1, category: 'creative' },
      { ...testStats1, category: 'physical' },
      { ...testStats1, category: 'mental' }
    ];

    await db.insert(userStatsTable).values(stats).execute();

    const result = await getUserStats(testInput);

    expect(result).toHaveLength(3);
    // Should be ordered by category (desc order)
    expect(result[0].category).toEqual('physical');
    expect(result[1].category).toEqual('mental');
    expect(result[2].category).toEqual('creative');
  });

  it('should save updated streak to database correctly', async () => {
    // Create test user and goal first
    await db.insert(usersTable).values(testUser).execute();
    await db.insert(goalsTable).values(testGoal).execute();

    // Create stat with old activity and positive streak
    const oldActivity = new Date();
    oldActivity.setDate(oldActivity.getDate() - 3);

    const oldStat = {
      ...testStats1,
      streak_days: 7,
      last_activity: oldActivity
    };

    const [insertedStat] = await db.insert(userStatsTable)
      .values(oldStat)
      .returning()
      .execute();

    // Call handler which should reset the streak
    await getUserStats(testInput);

    // Verify the database was updated
    const updatedStats = await db.select()
      .from(userStatsTable)
      .where(eq(userStatsTable.id, insertedStat.id))
      .execute();

    expect(updatedStats).toHaveLength(1);
    expect(updatedStats[0].streak_days).toEqual(0);
  });
});