import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { usersTable, goalsTable, milestonesTable, sessionsTable, sessionBlocksTable } from '../db/schema';
import { type CreateSessionInput } from '../schema';
import { createSession } from '../handlers/create_session';
import { eq, and } from 'drizzle-orm';

describe('createSession', () => {
  let testUserId: number;
  let testGoalId: number;
  let testMilestoneId: number;

  beforeEach(async () => {
    await createDB();
    
    // Create test user
    const userResult = await db.insert(usersTable)
      .values({
        email: 'test@example.com',
        username: 'testuser',
      })
      .returning()
      .execute();
    testUserId = userResult[0].id;

    // Create test goal
    const goalResult = await db.insert(goalsTable)
      .values({
        user_id: testUserId,
        title: 'Test Goal',
        description: 'A goal for testing',
        category: 'physical',
        target_value: 100,
        target_unit: 'reps',
        is_active: true,
      })
      .returning()
      .execute();
    testGoalId = goalResult[0].id;

    // Create test milestone
    const milestoneResult = await db.insert(milestonesTable)
      .values({
        goal_id: testGoalId,
        title: 'Test Milestone',
        description: 'A milestone for testing',
        target_value: 50,
        is_completed: false,
      })
      .returning()
      .execute();
    testMilestoneId = milestoneResult[0].id;
  });

  afterEach(resetDB);

  it('should create a session with basic information', async () => {
    const testInput: CreateSessionInput = {
      user_id: testUserId,
      goal_id: testGoalId,
      milestone_id: null,
      title: 'Focus Session',
      planned_duration: 60,
    };

    const result = await createSession(testInput);

    // Validate returned session
    expect(result.user_id).toEqual(testUserId);
    expect(result.goal_id).toEqual(testGoalId);
    expect(result.milestone_id).toBeNull();
    expect(result.title).toEqual('Focus Session');
    expect(result.planned_duration).toEqual(60);
    expect(result.actual_duration).toBeNull();
    expect(result.status).toEqual('scheduled');
    expect(result.started_at).toBeNull();
    expect(result.completed_at).toBeNull();
    expect(result.id).toBeDefined();
    expect(result.created_at).toBeInstanceOf(Date);
    expect(result.updated_at).toBeInstanceOf(Date);
  });

  it('should create a session with milestone', async () => {
    const testInput: CreateSessionInput = {
      user_id: testUserId,
      goal_id: testGoalId,
      milestone_id: testMilestoneId,
      title: 'Milestone Session',
      planned_duration: 45,
    };

    const result = await createSession(testInput);

    expect(result.milestone_id).toEqual(testMilestoneId);
    expect(result.title).toEqual('Milestone Session');
    expect(result.planned_duration).toEqual(45);
  });

  it('should create session blocks for apps', async () => {
    const testInput: CreateSessionInput = {
      user_id: testUserId,
      goal_id: testGoalId,
      milestone_id: null,
      title: 'Focused Work',
      planned_duration: 90,
      blocked_apps: ['com.instagram.android', 'com.twitter.android', 'com.facebook.katana'],
    };

    const result = await createSession(testInput);

    // Check session blocks were created
    const sessionBlocks = await db.select()
      .from(sessionBlocksTable)
      .where(eq(sessionBlocksTable.session_id, result.id))
      .execute();

    expect(sessionBlocks).toHaveLength(3);
    
    const appBlocks = sessionBlocks.filter(block => block.block_type === 'app');
    expect(appBlocks).toHaveLength(3);
    
    const appIdentifiers = appBlocks.map(block => block.identifier).sort();
    expect(appIdentifiers).toEqual(['com.facebook.katana', 'com.instagram.android', 'com.twitter.android']);
    
    appBlocks.forEach(block => {
      expect(block.is_active).toBe(true);
      expect(block.created_at).toBeInstanceOf(Date);
    });
  });

  it('should create session blocks for websites', async () => {
    const testInput: CreateSessionInput = {
      user_id: testUserId,
      goal_id: testGoalId,
      milestone_id: null,
      title: 'Deep Work',
      planned_duration: 120,
      blocked_websites: ['reddit.com', 'youtube.com', 'facebook.com'],
    };

    const result = await createSession(testInput);

    // Check session blocks were created
    const sessionBlocks = await db.select()
      .from(sessionBlocksTable)
      .where(eq(sessionBlocksTable.session_id, result.id))
      .execute();

    expect(sessionBlocks).toHaveLength(3);
    
    const websiteBlocks = sessionBlocks.filter(block => block.block_type === 'website');
    expect(websiteBlocks).toHaveLength(3);
    
    const websiteIdentifiers = websiteBlocks.map(block => block.identifier).sort();
    expect(websiteIdentifiers).toEqual(['facebook.com', 'reddit.com', 'youtube.com']);
    
    websiteBlocks.forEach(block => {
      expect(block.is_active).toBe(true);
      expect(block.created_at).toBeInstanceOf(Date);
    });
  });

  it('should create session blocks for both apps and websites', async () => {
    const testInput: CreateSessionInput = {
      user_id: testUserId,
      goal_id: testGoalId,
      milestone_id: testMilestoneId,
      title: 'Complete Focus',
      planned_duration: 180,
      blocked_apps: ['com.instagram.android', 'com.tiktok'],
      blocked_websites: ['reddit.com', 'youtube.com'],
    };

    const result = await createSession(testInput);

    // Check session blocks were created
    const sessionBlocks = await db.select()
      .from(sessionBlocksTable)
      .where(eq(sessionBlocksTable.session_id, result.id))
      .execute();

    expect(sessionBlocks).toHaveLength(4);
    
    const appBlocks = sessionBlocks.filter(block => block.block_type === 'app');
    const websiteBlocks = sessionBlocks.filter(block => block.block_type === 'website');
    
    expect(appBlocks).toHaveLength(2);
    expect(websiteBlocks).toHaveLength(2);
    
    const appIdentifiers = appBlocks.map(block => block.identifier).sort();
    const websiteIdentifiers = websiteBlocks.map(block => block.identifier).sort();
    
    expect(appIdentifiers).toEqual(['com.instagram.android', 'com.tiktok']);
    expect(websiteIdentifiers).toEqual(['reddit.com', 'youtube.com']);
  });

  it('should save session to database', async () => {
    const testInput: CreateSessionInput = {
      user_id: testUserId,
      goal_id: testGoalId,
      milestone_id: null,
      title: 'Database Test Session',
      planned_duration: 30,
    };

    const result = await createSession(testInput);

    // Query database to verify session was saved
    const sessions = await db.select()
      .from(sessionsTable)
      .where(eq(sessionsTable.id, result.id))
      .execute();

    expect(sessions).toHaveLength(1);
    const savedSession = sessions[0];
    
    expect(savedSession.user_id).toEqual(testUserId);
    expect(savedSession.goal_id).toEqual(testGoalId);
    expect(savedSession.title).toEqual('Database Test Session');
    expect(savedSession.planned_duration).toEqual(30);
    expect(savedSession.status).toEqual('scheduled');
    expect(savedSession.created_at).toBeInstanceOf(Date);
  });

  it('should throw error when goal does not exist', async () => {
    const testInput: CreateSessionInput = {
      user_id: testUserId,
      goal_id: 99999, // Non-existent goal
      milestone_id: null,
      title: 'Invalid Goal Session',
      planned_duration: 60,
    };

    await expect(createSession(testInput)).rejects.toThrow(/goal not found/i);
  });

  it('should throw error when goal does not belong to user', async () => {
    // Create another user and goal
    const anotherUserResult = await db.insert(usersTable)
      .values({
        email: 'other@example.com',
        username: 'otheruser',
      })
      .returning()
      .execute();
    const anotherUserId = anotherUserResult[0].id;

    const anotherGoalResult = await db.insert(goalsTable)
      .values({
        user_id: anotherUserId,
        title: 'Another User Goal',
        category: 'mental',
      })
      .returning()
      .execute();
    const anotherGoalId = anotherGoalResult[0].id;

    const testInput: CreateSessionInput = {
      user_id: testUserId, // Different user
      goal_id: anotherGoalId, // Goal belongs to another user
      milestone_id: null,
      title: 'Wrong User Session',
      planned_duration: 60,
    };

    await expect(createSession(testInput)).rejects.toThrow(/goal does not belong to user/i);
  });

  it('should throw error when milestone does not exist', async () => {
    const testInput: CreateSessionInput = {
      user_id: testUserId,
      goal_id: testGoalId,
      milestone_id: 99999, // Non-existent milestone
      title: 'Invalid Milestone Session',
      planned_duration: 60,
    };

    await expect(createSession(testInput)).rejects.toThrow(/milestone not found/i);
  });

  it('should throw error when milestone does not belong to goal', async () => {
    // Create another goal and milestone
    const anotherGoalResult = await db.insert(goalsTable)
      .values({
        user_id: testUserId,
        title: 'Another Goal',
        category: 'skill',
      })
      .returning()
      .execute();
    const anotherGoalId = anotherGoalResult[0].id;

    const anotherMilestoneResult = await db.insert(milestonesTable)
      .values({
        goal_id: anotherGoalId,
        title: 'Another Milestone',
      })
      .returning()
      .execute();
    const anotherMilestoneId = anotherMilestoneResult[0].id;

    const testInput: CreateSessionInput = {
      user_id: testUserId,
      goal_id: testGoalId, // Different goal
      milestone_id: anotherMilestoneId, // Milestone belongs to another goal
      title: 'Wrong Goal Milestone Session',
      planned_duration: 60,
    };

    await expect(createSession(testInput)).rejects.toThrow(/milestone does not belong to goal/i);
  });

  it('should handle empty blocked apps and websites arrays', async () => {
    const testInput: CreateSessionInput = {
      user_id: testUserId,
      goal_id: testGoalId,
      milestone_id: null,
      title: 'No Blocks Session',
      planned_duration: 60,
      blocked_apps: [],
      blocked_websites: [],
    };

    const result = await createSession(testInput);

    // Check no session blocks were created
    const sessionBlocks = await db.select()
      .from(sessionBlocksTable)
      .where(eq(sessionBlocksTable.session_id, result.id))
      .execute();

    expect(sessionBlocks).toHaveLength(0);
    expect(result.title).toEqual('No Blocks Session');
  });

  it('should create session with maximum planned duration', async () => {
    const testInput: CreateSessionInput = {
      user_id: testUserId,
      goal_id: testGoalId,
      milestone_id: null,
      title: 'Long Session',
      planned_duration: 480, // 8 hours (maximum allowed)
    };

    const result = await createSession(testInput);

    expect(result.planned_duration).toEqual(480);
    expect(result.title).toEqual('Long Session');
  });
});