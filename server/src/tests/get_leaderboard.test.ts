import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { usersTable, userStatsTable } from '../db/schema';
import { type GetLeaderboardInput } from '../schema';
import { getLeaderboard } from '../handlers/get_leaderboard';

// Test data for users and their stats
const testUsers = [
  { email: 'user1@example.com', username: 'user1' },
  { email: 'user2@example.com', username: 'user2' },
  { email: 'user3@example.com', username: 'user3' },
  { email: 'user4@example.com', username: 'user4' },
];

describe('getLeaderboard', () => {
  beforeEach(createDB);
  afterEach(resetDB);

  it('should return empty leaderboard when no users exist', async () => {
    const input: GetLeaderboardInput = {};

    const result = await getLeaderboard(input);

    expect(result).toEqual([]);
  });

  it('should return leaderboard ordered by score descending', async () => {
    // Create test users
    const users = await db.insert(usersTable).values(testUsers).returning().execute();

    // Create user stats with different scores
    const statsData = [
      {
        user_id: users[0].id,
        category: 'physical',
        total_sessions: 10,
        completed_sessions: 8,
        total_duration: 500,
        streak_days: 5,
        leaderboard_score: 150.5,
        last_activity: new Date('2024-01-15'),
        last_score_update: new Date('2024-01-15'),
      },
      {
        user_id: users[1].id,
        category: 'mental',
        total_sessions: 15,
        completed_sessions: 12,
        total_duration: 800,
        streak_days: 8,
        leaderboard_score: 245.75,
        last_activity: new Date('2024-01-14'),
        last_score_update: new Date('2024-01-14'),
      },
      {
        user_id: users[2].id,
        category: 'physical',
        total_sessions: 5,
        completed_sessions: 4,
        total_duration: 200,
        streak_days: 2,
        leaderboard_score: 85.25,
        last_activity: new Date('2024-01-16'),
        last_score_update: new Date('2024-01-16'),
      },
    ];

    await db.insert(userStatsTable).values(statsData).execute();

    const input: GetLeaderboardInput = {};

    const result = await getLeaderboard(input);

    expect(result).toHaveLength(3);
    expect(typeof result[0].leaderboard_score).toBe('number');
    expect(result[0].leaderboard_score).toBe(245.75);
    expect(result[1].leaderboard_score).toBe(150.5);
    expect(result[2].leaderboard_score).toBe(85.25);

    // Verify the order is correct (highest to lowest score)
    expect(result[0].user_id).toBe(users[1].id);
    expect(result[1].user_id).toBe(users[0].id);
    expect(result[2].user_id).toBe(users[2].id);
  });

  it('should filter by category when specified', async () => {
    // Create test users
    const users = await db.insert(usersTable).values(testUsers).returning().execute();

    // Create user stats in different categories
    const statsData = [
      {
        user_id: users[0].id,
        category: 'physical',
        total_sessions: 10,
        completed_sessions: 8,
        total_duration: 500,
        streak_days: 5,
        leaderboard_score: 150.5,
        last_activity: new Date('2024-01-15'),
        last_score_update: new Date('2024-01-15'),
      },
      {
        user_id: users[1].id,
        category: 'mental',
        total_sessions: 15,
        completed_sessions: 12,
        total_duration: 800,
        streak_days: 8,
        leaderboard_score: 245.75,
        last_activity: new Date('2024-01-14'),
        last_score_update: new Date('2024-01-14'),
      },
      {
        user_id: users[2].id,
        category: 'physical',
        total_sessions: 12,
        completed_sessions: 10,
        total_duration: 600,
        streak_days: 6,
        leaderboard_score: 185.25,
        last_activity: new Date('2024-01-16'),
        last_score_update: new Date('2024-01-16'),
      },
      {
        user_id: users[3].id,
        category: 'skill',
        total_sessions: 8,
        completed_sessions: 6,
        total_duration: 400,
        streak_days: 3,
        leaderboard_score: 95.0,
        last_activity: new Date('2024-01-13'),
        last_score_update: new Date('2024-01-13'),
      },
    ];

    await db.insert(userStatsTable).values(statsData).execute();

    const input: GetLeaderboardInput = { category: 'physical' };

    const result = await getLeaderboard(input);

    expect(result).toHaveLength(2);
    expect(result.every(stat => stat.category === 'physical')).toBe(true);
    
    // Should be ordered by score (highest first)
    expect(result[0].leaderboard_score).toBe(185.25);
    expect(result[1].leaderboard_score).toBe(150.5);
    expect(result[0].user_id).toBe(users[2].id);
    expect(result[1].user_id).toBe(users[0].id);
  });

  it('should respect limit parameter', async () => {
    // Create test users
    const users = await db.insert(usersTable).values(testUsers).returning().execute();

    // Create multiple user stats
    const statsData = users.map((user, index) => ({
      user_id: user.id,
      category: 'physical',
      total_sessions: 5 + index,
      completed_sessions: 4 + index,
      total_duration: 200 + (index * 100),
      streak_days: 2 + index,
      leaderboard_score: 100 + (index * 50),
      last_activity: new Date('2024-01-15'),
      last_score_update: new Date('2024-01-15'),
    }));

    await db.insert(userStatsTable).values(statsData).execute();

    const input: GetLeaderboardInput = { limit: 2 };

    const result = await getLeaderboard(input);

    expect(result).toHaveLength(2);
    // Should return the top 2 scores
    expect(result[0].leaderboard_score).toBe(250);
    expect(result[1].leaderboard_score).toBe(200);
  });

  it('should use default limit when not specified', async () => {
    // Create test users (more than default limit)
    const manyUsers = Array.from({ length: 15 }, (_, i) => ({
      email: `user${i}@example.com`,
      username: `user${i}`,
    }));

    const users = await db.insert(usersTable).values(manyUsers).returning().execute();

    // Create stats for all users
    const statsData = users.map((user, index) => ({
      user_id: user.id,
      category: 'physical',
      total_sessions: 5,
      completed_sessions: 4,
      total_duration: 200,
      streak_days: 2,
      leaderboard_score: 100 + index,
      last_activity: new Date('2024-01-15'),
      last_score_update: new Date('2024-01-15'),
    }));

    await db.insert(userStatsTable).values(statsData).execute();

    const input: GetLeaderboardInput = {};

    const result = await getLeaderboard(input);

    // Should default to 10 results
    expect(result).toHaveLength(10);
  });

  it('should handle category filter with no matching results', async () => {
    // Create test users
    const users = await db.insert(usersTable).values(testUsers.slice(0, 2)).returning().execute();

    // Create user stats only in 'physical' category
    const statsData = [
      {
        user_id: users[0].id,
        category: 'physical',
        total_sessions: 10,
        completed_sessions: 8,
        total_duration: 500,
        streak_days: 5,
        leaderboard_score: 150.5,
        last_activity: new Date('2024-01-15'),
        last_score_update: new Date('2024-01-15'),
      },
      {
        user_id: users[1].id,
        category: 'physical',
        total_sessions: 12,
        completed_sessions: 10,
        total_duration: 600,
        streak_days: 6,
        leaderboard_score: 185.25,
        last_activity: new Date('2024-01-16'),
        last_score_update: new Date('2024-01-16'),
      },
    ];

    await db.insert(userStatsTable).values(statsData).execute();

    const input: GetLeaderboardInput = { category: 'mental' };

    const result = await getLeaderboard(input);

    expect(result).toEqual([]);
  });

  it('should return complete user stats objects', async () => {
    // Create test user
    const users = await db.insert(usersTable).values([testUsers[0]]).returning().execute();

    const statsData = [{
      user_id: users[0].id,
      category: 'physical',
      total_sessions: 10,
      completed_sessions: 8,
      total_duration: 500,
      streak_days: 5,
      leaderboard_score: 150.75,
      last_activity: new Date('2024-01-15T10:30:00Z'),
      last_score_update: new Date('2024-01-15T09:00:00Z'),
    }];

    await db.insert(userStatsTable).values(statsData).execute();

    const input: GetLeaderboardInput = {};

    const result = await getLeaderboard(input);

    expect(result).toHaveLength(1);
    
    const userStats = result[0];
    expect(userStats.id).toBeDefined();
    expect(userStats.user_id).toBe(users[0].id);
    expect(userStats.category).toBe('physical');
    expect(userStats.total_sessions).toBe(10);
    expect(userStats.completed_sessions).toBe(8);
    expect(userStats.total_duration).toBe(500);
    expect(userStats.streak_days).toBe(5);
    expect(userStats.leaderboard_score).toBe(150.75);
    expect(userStats.last_activity).toBeInstanceOf(Date);
    expect(userStats.last_score_update).toBeInstanceOf(Date);
    expect(userStats.created_at).toBeInstanceOf(Date);
    expect(userStats.updated_at).toBeInstanceOf(Date);
    
    // Verify numeric conversion worked properly
    expect(typeof userStats.leaderboard_score).toBe('number');
  });
});