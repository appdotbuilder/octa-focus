import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { usersTable, goalsTable, milestonesTable, sessionsTable } from '../db/schema';
import { type GetUserSessionsInput } from '../schema';
import { getUserSessions } from '../handlers/get_user_sessions';
import { eq } from 'drizzle-orm';

describe('getUserSessions', () => {
  beforeEach(createDB);
  afterEach(resetDB);

  it('should get all sessions for a user', async () => {
    // Create test user
    const userResult = await db.insert(usersTable)
      .values({
        email: 'test@example.com',
        username: 'testuser'
      })
      .returning()
      .execute();
    const userId = userResult[0].id;

    // Create test goal
    const goalResult = await db.insert(goalsTable)
      .values({
        user_id: userId,
        title: 'Test Goal',
        description: 'A goal for testing',
        category: 'physical'
      })
      .returning()
      .execute();
    const goalId = goalResult[0].id;

    // Create test milestone
    const milestoneResult = await db.insert(milestonesTable)
      .values({
        goal_id: goalId,
        title: 'Test Milestone',
        description: 'A milestone for testing'
      })
      .returning()
      .execute();
    const milestoneId = milestoneResult[0].id;

    // Create test sessions
    await db.insert(sessionsTable)
      .values([
        {
          user_id: userId,
          goal_id: goalId,
          milestone_id: milestoneId,
          title: 'Session 1',
          planned_duration: 30,
          status: 'scheduled'
        },
        {
          user_id: userId,
          goal_id: goalId,
          title: 'Session 2',
          planned_duration: 45,
          status: 'completed',
          actual_duration: 40
        }
      ])
      .execute();

    const input: GetUserSessionsInput = {
      user_id: userId
    };

    const result = await getUserSessions(input);

    expect(result).toHaveLength(2);
    
    // Check first session (most recent due to ordering)
    const session1 = result.find(s => s.title === 'Session 2');
    expect(session1).toBeDefined();
    expect(session1!.user_id).toEqual(userId);
    expect(session1!.goal_id).toEqual(goalId);
    expect(session1!.milestone_id).toBeNull();
    expect(session1!.title).toEqual('Session 2');
    expect(session1!.planned_duration).toEqual(45);
    expect(session1!.actual_duration).toEqual(40);
    expect(session1!.status).toEqual('completed');
    expect(session1!.id).toBeDefined();
    expect(session1!.created_at).toBeInstanceOf(Date);
    expect(session1!.updated_at).toBeInstanceOf(Date);

    // Check second session
    const session2 = result.find(s => s.title === 'Session 1');
    expect(session2).toBeDefined();
    expect(session2!.user_id).toEqual(userId);
    expect(session2!.goal_id).toEqual(goalId);
    expect(session2!.milestone_id).toEqual(milestoneId);
    expect(session2!.title).toEqual('Session 1');
    expect(session2!.planned_duration).toEqual(30);
    expect(session2!.actual_duration).toBeNull();
    expect(session2!.status).toEqual('scheduled');
  });

  it('should filter sessions by status', async () => {
    // Create test user
    const userResult = await db.insert(usersTable)
      .values({
        email: 'test2@example.com',
        username: 'testuser2'
      })
      .returning()
      .execute();
    const userId = userResult[0].id;

    // Create test goal
    const goalResult = await db.insert(goalsTable)
      .values({
        user_id: userId,
        title: 'Test Goal 2',
        description: 'Another goal for testing',
        category: 'mental'
      })
      .returning()
      .execute();
    const goalId = goalResult[0].id;

    // Create sessions with different statuses
    await db.insert(sessionsTable)
      .values([
        {
          user_id: userId,
          goal_id: goalId,
          title: 'Scheduled Session',
          planned_duration: 30,
          status: 'scheduled'
        },
        {
          user_id: userId,
          goal_id: goalId,
          title: 'Completed Session',
          planned_duration: 45,
          status: 'completed',
          actual_duration: 40
        },
        {
          user_id: userId,
          goal_id: goalId,
          title: 'Active Session',
          planned_duration: 60,
          status: 'active'
        }
      ])
      .execute();

    // Test filtering by completed status
    const completedInput: GetUserSessionsInput = {
      user_id: userId,
      status: 'completed'
    };

    const completedResult = await getUserSessions(completedInput);
    expect(completedResult).toHaveLength(1);
    expect(completedResult[0].title).toEqual('Completed Session');
    expect(completedResult[0].status).toEqual('completed');

    // Test filtering by scheduled status
    const scheduledInput: GetUserSessionsInput = {
      user_id: userId,
      status: 'scheduled'
    };

    const scheduledResult = await getUserSessions(scheduledInput);
    expect(scheduledResult).toHaveLength(1);
    expect(scheduledResult[0].title).toEqual('Scheduled Session');
    expect(scheduledResult[0].status).toEqual('scheduled');
  });

  it('should limit results when limit is provided', async () => {
    // Create test user
    const userResult = await db.insert(usersTable)
      .values({
        email: 'test3@example.com',
        username: 'testuser3'
      })
      .returning()
      .execute();
    const userId = userResult[0].id;

    // Create test goal
    const goalResult = await db.insert(goalsTable)
      .values({
        user_id: userId,
        title: 'Test Goal 3',
        description: 'Goal for limit testing',
        category: 'skill'
      })
      .returning()
      .execute();
    const goalId = goalResult[0].id;

    // Create multiple sessions
    await db.insert(sessionsTable)
      .values([
        {
          user_id: userId,
          goal_id: goalId,
          title: 'Session 1',
          planned_duration: 30,
          status: 'completed'
        },
        {
          user_id: userId,
          goal_id: goalId,
          title: 'Session 2',
          planned_duration: 30,
          status: 'completed'
        },
        {
          user_id: userId,
          goal_id: goalId,
          title: 'Session 3',
          planned_duration: 30,
          status: 'completed'
        },
        {
          user_id: userId,
          goal_id: goalId,
          title: 'Session 4',
          planned_duration: 30,
          status: 'completed'
        }
      ])
      .execute();

    const input: GetUserSessionsInput = {
      user_id: userId,
      limit: 2
    };

    const result = await getUserSessions(input);
    expect(result).toHaveLength(2);

    // Results should be ordered by creation date (newest first)
    // Since we created them in order, newest should be Session 4, then Session 3
    const titles = result.map(s => s.title);
    expect(titles).toContain('Session 4');
    expect(titles).toContain('Session 3');
  });

  it('should return empty array for user with no sessions', async () => {
    // Create test user
    const userResult = await db.insert(usersTable)
      .values({
        email: 'nosessions@example.com',
        username: 'nosessions'
      })
      .returning()
      .execute();
    const userId = userResult[0].id;

    const input: GetUserSessionsInput = {
      user_id: userId
    };

    const result = await getUserSessions(input);
    expect(result).toHaveLength(0);
  });

  it('should only return sessions for the specified user', async () => {
    // Create two test users
    const user1Result = await db.insert(usersTable)
      .values({
        email: 'user1@example.com',
        username: 'user1'
      })
      .returning()
      .execute();
    const user1Id = user1Result[0].id;

    const user2Result = await db.insert(usersTable)
      .values({
        email: 'user2@example.com',
        username: 'user2'
      })
      .returning()
      .execute();
    const user2Id = user2Result[0].id;

    // Create goals for both users
    const goal1Result = await db.insert(goalsTable)
      .values({
        user_id: user1Id,
        title: 'User 1 Goal',
        category: 'physical'
      })
      .returning()
      .execute();
    const goal1Id = goal1Result[0].id;

    const goal2Result = await db.insert(goalsTable)
      .values({
        user_id: user2Id,
        title: 'User 2 Goal',
        category: 'mental'
      })
      .returning()
      .execute();
    const goal2Id = goal2Result[0].id;

    // Create sessions for both users
    await db.insert(sessionsTable)
      .values([
        {
          user_id: user1Id,
          goal_id: goal1Id,
          title: 'User 1 Session',
          planned_duration: 30,
          status: 'scheduled'
        },
        {
          user_id: user2Id,
          goal_id: goal2Id,
          title: 'User 2 Session',
          planned_duration: 45,
          status: 'completed'
        }
      ])
      .execute();

    // Get sessions for user 1 only
    const input: GetUserSessionsInput = {
      user_id: user1Id
    };

    const result = await getUserSessions(input);
    expect(result).toHaveLength(1);
    expect(result[0].title).toEqual('User 1 Session');
    expect(result[0].user_id).toEqual(user1Id);
    expect(result[0].goal_id).toEqual(goal1Id);
  });

  it('should handle sessions with null milestone_id', async () => {
    // Create test user
    const userResult = await db.insert(usersTable)
      .values({
        email: 'nulltest@example.com',
        username: 'nulltest'
      })
      .returning()
      .execute();
    const userId = userResult[0].id;

    // Create test goal
    const goalResult = await db.insert(goalsTable)
      .values({
        user_id: userId,
        title: 'Null Test Goal',
        category: 'habit'
      })
      .returning()
      .execute();
    const goalId = goalResult[0].id;

    // Create session without milestone
    await db.insert(sessionsTable)
      .values({
        user_id: userId,
        goal_id: goalId,
        title: 'Session Without Milestone',
        planned_duration: 25,
        status: 'active'
      })
      .execute();

    const input: GetUserSessionsInput = {
      user_id: userId
    };

    const result = await getUserSessions(input);
    expect(result).toHaveLength(1);
    expect(result[0].milestone_id).toBeNull();
    expect(result[0].title).toEqual('Session Without Milestone');
  });

  it('should verify sessions are saved in database correctly', async () => {
    // Create test user
    const userResult = await db.insert(usersTable)
      .values({
        email: 'dbtest@example.com',
        username: 'dbtest'
      })
      .returning()
      .execute();
    const userId = userResult[0].id;

    // Create test goal
    const goalResult = await db.insert(goalsTable)
      .values({
        user_id: userId,
        title: 'DB Test Goal',
        category: 'creative'
      })
      .returning()
      .execute();
    const goalId = goalResult[0].id;

    // Create test session
    await db.insert(sessionsTable)
      .values({
        user_id: userId,
        goal_id: goalId,
        title: 'DB Test Session',
        planned_duration: 50,
        status: 'failed',
        actual_duration: 30
      })
      .execute();

    // Get sessions via handler
    const result = await getUserSessions({ user_id: userId });
    expect(result).toHaveLength(1);

    // Verify the session exists in database directly
    const dbSessions = await db.select()
      .from(sessionsTable)
      .where(eq(sessionsTable.user_id, userId))
      .execute();

    expect(dbSessions).toHaveLength(1);
    expect(dbSessions[0].title).toEqual('DB Test Session');
    expect(dbSessions[0].planned_duration).toEqual(50);
    expect(dbSessions[0].actual_duration).toEqual(30);
    expect(dbSessions[0].status).toEqual('failed');
    expect(dbSessions[0].created_at).toBeInstanceOf(Date);
  });
});