import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { milestonesTable, goalsTable, usersTable } from '../db/schema';
import { type CreateMilestoneInput } from '../schema';
import { createMilestone } from '../handlers/create_milestone';
import { eq } from 'drizzle-orm';

describe('createMilestone', () => {
  beforeEach(createDB);
  afterEach(resetDB);

  let testUserId: number;
  let testGoalId: number;

  beforeEach(async () => {
    // Create a test user first
    const userResult = await db.insert(usersTable)
      .values({
        email: 'test@example.com',
        username: 'testuser'
      })
      .returning()
      .execute();
    testUserId = userResult[0].id;

    // Create a test goal
    const goalResult = await db.insert(goalsTable)
      .values({
        user_id: testUserId,
        title: 'Test Goal',
        description: 'A goal for testing',
        category: 'physical',
        target_value: 100, // Real columns accept numbers directly
        target_unit: 'reps'
      })
      .returning()
      .execute();
    testGoalId = goalResult[0].id;
  });

  it('should create a milestone with all fields', async () => {
    const testInput: CreateMilestoneInput = {
      goal_id: testGoalId,
      title: 'First Milestone',
      description: 'Complete 25 reps',
      target_value: 25
    };

    const result = await createMilestone(testInput);

    // Basic field validation
    expect(result.goal_id).toEqual(testGoalId);
    expect(result.title).toEqual('First Milestone');
    expect(result.description).toEqual('Complete 25 reps');
    expect(result.target_value).toEqual(25);
    expect(typeof result.target_value).toBe('number');
    expect(result.is_completed).toBe(false);
    expect(result.completed_at).toBeNull();
    expect(result.id).toBeDefined();
    expect(result.created_at).toBeInstanceOf(Date);
    expect(result.updated_at).toBeInstanceOf(Date);
  });

  it('should create a milestone with minimal fields', async () => {
    const testInput: CreateMilestoneInput = {
      goal_id: testGoalId,
      title: 'Simple Milestone',
      description: null,
      target_value: null
    };

    const result = await createMilestone(testInput);

    // Basic field validation
    expect(result.goal_id).toEqual(testGoalId);
    expect(result.title).toEqual('Simple Milestone');
    expect(result.description).toBeNull();
    expect(result.target_value).toBeNull();
    expect(result.is_completed).toBe(false);
    expect(result.completed_at).toBeNull();
    expect(result.id).toBeDefined();
    expect(result.created_at).toBeInstanceOf(Date);
    expect(result.updated_at).toBeInstanceOf(Date);
  });

  it('should save milestone to database correctly', async () => {
    const testInput: CreateMilestoneInput = {
      goal_id: testGoalId,
      title: 'Database Test Milestone',
      description: 'Testing database persistence',
      target_value: 50
    };

    const result = await createMilestone(testInput);

    // Query database to verify persistence
    const milestones = await db.select()
      .from(milestonesTable)
      .where(eq(milestonesTable.id, result.id))
      .execute();

    expect(milestones).toHaveLength(1);
    expect(milestones[0].goal_id).toEqual(testGoalId);
    expect(milestones[0].title).toEqual('Database Test Milestone');
    expect(milestones[0].description).toEqual('Testing database persistence');
    expect(milestones[0].target_value).toEqual(50); // Real columns return numbers directly
    expect(milestones[0].is_completed).toBe(false);
    expect(milestones[0].completed_at).toBeNull();
    expect(milestones[0].created_at).toBeInstanceOf(Date);
    expect(milestones[0].updated_at).toBeInstanceOf(Date);
  });

  it('should handle numeric target_value conversion correctly', async () => {
    const testInput: CreateMilestoneInput = {
      goal_id: testGoalId,
      title: 'Numeric Test',
      description: null,
      target_value: 123.45
    };

    const result = await createMilestone(testInput);

    // Verify numeric conversion
    expect(result.target_value).toEqual(123.45);
    expect(typeof result.target_value).toBe('number');

    // Verify database storage and retrieval
    const milestones = await db.select()
      .from(milestonesTable)
      .where(eq(milestonesTable.id, result.id))
      .execute();

    expect(milestones[0].target_value).toEqual(123.45); // Real columns return numbers directly
  });

  it('should throw error when goal does not exist', async () => {
    const testInput: CreateMilestoneInput = {
      goal_id: 99999, // Non-existent goal ID
      title: 'Invalid Goal Milestone',
      description: null,
      target_value: null
    };

    await expect(createMilestone(testInput)).rejects.toThrow(/Goal with ID 99999 not found/i);
  });

  it('should create multiple milestones for the same goal', async () => {
    const firstInput: CreateMilestoneInput = {
      goal_id: testGoalId,
      title: 'First Milestone',
      description: 'First step',
      target_value: 25
    };

    const secondInput: CreateMilestoneInput = {
      goal_id: testGoalId,
      title: 'Second Milestone',
      description: 'Second step',
      target_value: 50
    };

    const firstResult = await createMilestone(firstInput);
    const secondResult = await createMilestone(secondInput);

    // Verify both milestones were created
    expect(firstResult.id).toBeDefined();
    expect(secondResult.id).toBeDefined();
    expect(firstResult.id).not.toEqual(secondResult.id);

    // Verify both milestones reference the same goal
    expect(firstResult.goal_id).toEqual(testGoalId);
    expect(secondResult.goal_id).toEqual(testGoalId);

    // Verify database contains both milestones
    const milestones = await db.select()
      .from(milestonesTable)
      .where(eq(milestonesTable.goal_id, testGoalId))
      .execute();

    expect(milestones).toHaveLength(2);
  });
});