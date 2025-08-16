import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { usersTable, userStatsTable } from '../db/schema';
import { updateLeaderboardScores } from '../handlers/update_leaderboard_scores';
import { eq } from 'drizzle-orm';

describe('updateLeaderboardScores', () => {
  beforeEach(createDB);
  afterEach(resetDB);

  it('should apply decay to scores older than 24 hours', async () => {
    // Create test user
    const userResult = await db.insert(usersTable)
      .values({
        email: 'test@example.com',
        username: 'testuser'
      })
      .returning()
      .execute();

    const userId = userResult[0].id;

    // Create user stats with score last updated 2 days ago
    const twoDaysAgo = new Date();
    twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);

    await db.insert(userStatsTable)
      .values({
        user_id: userId,
        category: 'physical',
        total_sessions: 10,
        completed_sessions: 8,
        total_duration: 120,
        streak_days: 5,
        leaderboard_score: 100.0,
        last_score_update: twoDaysAgo
      })
      .execute();

    const result = await updateLeaderboardScores();

    expect(result.updatedCount).toBe(1);

    // Check that score was decayed (should be approximately 96.04 after 2 days of 2% daily decay)
    const updatedStats = await db.select()
      .from(userStatsTable)
      .where(eq(userStatsTable.user_id, userId))
      .execute();

    expect(updatedStats).toHaveLength(1);
    const newScore = parseFloat(updatedStats[0].leaderboard_score.toString());
    expect(newScore).toBeLessThan(100.0);
    expect(newScore).toBeGreaterThan(95.0);
    expect(newScore).toBeCloseTo(96.04, 1); // 100 * (0.98^2)
  });

  it('should not update scores updated within last 24 hours', async () => {
    // Create test user
    const userResult = await db.insert(usersTable)
      .values({
        email: 'recent@example.com',
        username: 'recentuser'
      })
      .returning()
      .execute();

    const userId = userResult[0].id;

    // Create user stats with score updated recently (12 hours ago)
    const twelveHoursAgo = new Date();
    twelveHoursAgo.setHours(twelveHoursAgo.getHours() - 12);

    await db.insert(userStatsTable)
      .values({
        user_id: userId,
        category: 'mental',
        total_sessions: 5,
        completed_sessions: 4,
        total_duration: 60,
        streak_days: 3,
        leaderboard_score: 50.0,
        last_score_update: twelveHoursAgo
      })
      .execute();

    const result = await updateLeaderboardScores();

    expect(result.updatedCount).toBe(0);

    // Verify score remains unchanged
    const unchangedStats = await db.select()
      .from(userStatsTable)
      .where(eq(userStatsTable.user_id, userId))
      .execute();

    expect(unchangedStats).toHaveLength(1);
    expect(parseFloat(unchangedStats[0].leaderboard_score.toString())).toBe(50.0);
  });

  it('should not update zero scores', async () => {
    // Create test user
    const userResult = await db.insert(usersTable)
      .values({
        email: 'zero@example.com',
        username: 'zerouser'
      })
      .returning()
      .execute();

    const userId = userResult[0].id;

    // Create user stats with zero score last updated 3 days ago
    const threeDaysAgo = new Date();
    threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);

    await db.insert(userStatsTable)
      .values({
        user_id: userId,
        category: 'skill',
        total_sessions: 0,
        completed_sessions: 0,
        total_duration: 0,
        streak_days: 0,
        leaderboard_score: 0.0,
        last_score_update: threeDaysAgo
      })
      .execute();

    const result = await updateLeaderboardScores();

    expect(result.updatedCount).toBe(0);

    // Verify zero score remains unchanged
    const zeroStats = await db.select()
      .from(userStatsTable)
      .where(eq(userStatsTable.user_id, userId))
      .execute();

    expect(zeroStats).toHaveLength(1);
    expect(parseFloat(zeroStats[0].leaderboard_score.toString())).toBe(0.0);
  });

  it('should update multiple eligible scores', async () => {
    // Create multiple test users
    const users = [];
    for (let i = 1; i <= 3; i++) {
      const userResult = await db.insert(usersTable)
        .values({
          email: `user${i}@example.com`,
          username: `user${i}`
        })
        .returning()
        .execute();
      users.push(userResult[0]);
    }

    const threeDaysAgo = new Date();
    threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);

    // Create user stats for all users with old scores
    for (let i = 0; i < users.length; i++) {
      await db.insert(userStatsTable)
        .values({
          user_id: users[i].id,
          category: 'physical',
          total_sessions: 10 + i,
          completed_sessions: 8 + i,
          total_duration: 120 + (i * 30),
          streak_days: 5 + i,
          leaderboard_score: 100.0 + (i * 25),
          last_score_update: threeDaysAgo
        })
        .execute();
    }

    const result = await updateLeaderboardScores();

    expect(result.updatedCount).toBe(3);

    // Verify all scores were decayed
    const allStats = await db.select()
      .from(userStatsTable)
      .execute();

    expect(allStats).toHaveLength(3);
    allStats.forEach((stat) => {
      const score = parseFloat(stat.leaderboard_score.toString());
      expect(score).toBeLessThan(150.0); // All original scores were <= 150
      expect(score).toBeGreaterThan(90.0); // Should be decayed but not too much
    });
  });

  it('should handle mixed scenarios correctly', async () => {
    // Create test users for different scenarios
    const scenarios = [
      { email: 'old@example.com', username: 'olduser', hoursAgo: 48, initialScore: 80.0, shouldUpdate: true },
      { email: 'recent@example.com', username: 'recentuser', hoursAgo: 12, initialScore: 60.0, shouldUpdate: false },
      { email: 'zero@example.com', username: 'zerouser', hoursAgo: 240, initialScore: 0.0, shouldUpdate: false }
    ];

    for (const scenario of scenarios) {
      const userResult = await db.insert(usersTable)
        .values({
          email: scenario.email,
          username: scenario.username
        })
        .returning()
        .execute();

      const userId = userResult[0].id;
      const updateTime = new Date();
      updateTime.setHours(updateTime.getHours() - scenario.hoursAgo);

      await db.insert(userStatsTable)
        .values({
          user_id: userId,
          category: 'physical',
          total_sessions: 10,
          completed_sessions: 8,
          total_duration: 120,
          streak_days: 5,
          leaderboard_score: scenario.initialScore,
          last_score_update: updateTime
        })
        .execute();
    }

    const result = await updateLeaderboardScores();

    // Only the old, non-zero score should be updated
    expect(result.updatedCount).toBe(1);

    // Verify results
    const allStats = await db.select()
      .from(userStatsTable)
      .execute();

    const oldUserStats = allStats.find(s => parseFloat(s.leaderboard_score.toString()) < 80.0 && parseFloat(s.leaderboard_score.toString()) > 0);
    expect(oldUserStats).toBeDefined();

    const recentUserStats = allStats.find(s => parseFloat(s.leaderboard_score.toString()) === 60.0);
    expect(recentUserStats).toBeDefined();

    const zeroUserStats = allStats.find(s => parseFloat(s.leaderboard_score.toString()) === 0.0);
    expect(zeroUserStats).toBeDefined();
  });

  it('should handle empty database gracefully', async () => {
    const result = await updateLeaderboardScores();

    expect(result.updatedCount).toBe(0);
  });
});