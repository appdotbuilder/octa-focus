import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { goalsTable, usersTable } from '../db/schema';
import { type CreateGoalInput } from '../schema';
import { createGoal } from '../handlers/create_goal';
import { eq } from 'drizzle-orm';

describe('createGoal', () => {
  beforeEach(createDB);
  afterEach(resetDB);

  let testUserId: number;

  beforeEach(async () => {
    // Create test user first since goals require a valid user_id
    const userResult = await db.insert(usersTable)
      .values({
        email: 'test@example.com',
        username: 'testuser'
      })
      .returning()
      .execute();
    
    testUserId = userResult[0].id;
  });

  const testInput: CreateGoalInput = {
    user_id: 0, // Will be set to testUserId in tests
    title: 'Complete 100 Push-ups Daily',
    description: 'Build upper body strength through daily push-ups',
    category: 'physical',
    target_value: 100,
    target_unit: 'reps'
  };

  it('should create a goal with all fields', async () => {
    const input = { ...testInput, user_id: testUserId };
    const result = await createGoal(input);

    // Basic field validation
    expect(result.title).toEqual('Complete 100 Push-ups Daily');
    expect(result.description).toEqual(testInput.description);
    expect(result.category).toEqual('physical');
    expect(result.target_value).toEqual(100);
    expect(result.target_unit).toEqual('reps');
    expect(result.user_id).toEqual(testUserId);
    expect(result.is_active).toEqual(true);
    expect(result.id).toBeDefined();
    expect(result.created_at).toBeInstanceOf(Date);
    expect(result.updated_at).toBeInstanceOf(Date);

    // Verify numeric type conversion
    expect(typeof result.target_value).toBe('number');
  });

  it('should create a goal with nullable fields', async () => {
    const input: CreateGoalInput = {
      user_id: testUserId,
      title: 'Daily Meditation',
      description: null,
      category: 'mental',
      target_value: null,
      target_unit: null
    };

    const result = await createGoal(input);

    expect(result.title).toEqual('Daily Meditation');
    expect(result.description).toBeNull();
    expect(result.category).toEqual('mental');
    expect(result.target_value).toBeNull();
    expect(result.target_unit).toBeNull();
    expect(result.user_id).toEqual(testUserId);
    expect(result.is_active).toEqual(true);
  });

  it('should save goal to database', async () => {
    const input = { ...testInput, user_id: testUserId };
    const result = await createGoal(input);

    // Query using proper drizzle syntax
    const goals = await db.select()
      .from(goalsTable)
      .where(eq(goalsTable.id, result.id))
      .execute();

    expect(goals).toHaveLength(1);
    expect(goals[0].title).toEqual('Complete 100 Push-ups Daily');
    expect(goals[0].description).toEqual(testInput.description);
    expect(goals[0].category).toEqual('physical');
    expect(goals[0].target_value).toEqual(100);
    expect(goals[0].target_unit).toEqual('reps');
    expect(goals[0].user_id).toEqual(testUserId);
    expect(goals[0].is_active).toBe(true);
    expect(goals[0].created_at).toBeInstanceOf(Date);
    expect(goals[0].updated_at).toBeInstanceOf(Date);
  });

  it('should handle all goal categories', async () => {
    const categories = ['physical', 'mental', 'skill', 'habit', 'creative', 'social', 'spiritual', 'professional'] as const;
    
    for (const category of categories) {
      const input: CreateGoalInput = {
        user_id: testUserId,
        title: `Test ${category} goal`,
        description: `A ${category} goal for testing`,
        category: category,
        target_value: 50,
        target_unit: 'points'
      };

      const result = await createGoal(input);
      expect(result.category).toEqual(category);
      expect(result.title).toEqual(`Test ${category} goal`);
    }
  });

  it('should throw error when user does not exist', async () => {
    const input = { ...testInput, user_id: 99999 }; // Non-existent user ID

    await expect(createGoal(input)).rejects.toThrow(/User with id 99999 does not exist/i);
  });

  it('should handle goals with decimal target values', async () => {
    const input: CreateGoalInput = {
      user_id: testUserId,
      title: 'Run 5.5 miles',
      description: 'Weekly running goal',
      category: 'physical',
      target_value: 5.5,
      target_unit: 'miles'
    };

    const result = await createGoal(input);
    
    expect(result.target_value).toEqual(5.5);
    expect(typeof result.target_value).toBe('number');

    // Verify in database
    const goals = await db.select()
      .from(goalsTable)
      .where(eq(goalsTable.id, result.id))
      .execute();

    expect(goals[0].target_value).toEqual(5.5);
  });
});