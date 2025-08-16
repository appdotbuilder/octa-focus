import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { usersTable, goalsTable } from '../db/schema';
import { type UpdateGoalInput } from '../schema';
import { updateGoal } from '../handlers/update_goal';
import { eq } from 'drizzle-orm';

describe('updateGoal', () => {
  beforeEach(createDB);
  afterEach(resetDB);

  let testUserId: number;
  let testGoalId: number;

  beforeEach(async () => {
    // Create test user
    const users = await db.insert(usersTable)
      .values({
        email: 'test@example.com',
        username: 'testuser',
      })
      .returning()
      .execute();
    testUserId = users[0].id;

    // Create test goal
    const goals = await db.insert(goalsTable)
      .values({
        user_id: testUserId,
        title: 'Original Goal',
        description: 'Original description',
        category: 'physical',
        target_value: 100,
        target_unit: 'reps',
        is_active: true,
      })
      .returning()
      .execute();
    testGoalId = goals[0].id;
  });

  it('should update goal title', async () => {
    const input: UpdateGoalInput = {
      id: testGoalId,
      title: 'Updated Goal Title',
    };

    const result = await updateGoal(input);

    expect(result.id).toEqual(testGoalId);
    expect(result.title).toEqual('Updated Goal Title');
    expect(result.description).toEqual('Original description'); // Should remain unchanged
    expect(result.category).toEqual('physical');
    expect(result.target_value).toEqual(100);
    expect(result.target_unit).toEqual('reps');
    expect(result.is_active).toEqual(true);
    expect(result.updated_at).toBeInstanceOf(Date);
  });

  it('should update goal description', async () => {
    const input: UpdateGoalInput = {
      id: testGoalId,
      description: 'Updated description',
    };

    const result = await updateGoal(input);

    expect(result.description).toEqual('Updated description');
    expect(result.title).toEqual('Original Goal'); // Should remain unchanged
  });

  it('should set description to null', async () => {
    const input: UpdateGoalInput = {
      id: testGoalId,
      description: null,
    };

    const result = await updateGoal(input);

    expect(result.description).toBeNull();
  });

  it('should update target_value and target_unit', async () => {
    const input: UpdateGoalInput = {
      id: testGoalId,
      target_value: 150,
      target_unit: 'minutes',
    };

    const result = await updateGoal(input);

    expect(result.target_value).toEqual(150);
    expect(typeof result.target_value).toEqual('number');
    expect(result.target_unit).toEqual('minutes');
  });

  it('should set target_value to null', async () => {
    const input: UpdateGoalInput = {
      id: testGoalId,
      target_value: null,
    };

    const result = await updateGoal(input);

    expect(result.target_value).toBeNull();
  });

  it('should update is_active status', async () => {
    const input: UpdateGoalInput = {
      id: testGoalId,
      is_active: false,
    };

    const result = await updateGoal(input);

    expect(result.is_active).toEqual(false);
  });

  it('should update multiple fields at once', async () => {
    const input: UpdateGoalInput = {
      id: testGoalId,
      title: 'Multi-Update Goal',
      description: 'Multi-update description',
      target_value: 200,
      target_unit: 'pages',
      is_active: false,
    };

    const result = await updateGoal(input);

    expect(result.title).toEqual('Multi-Update Goal');
    expect(result.description).toEqual('Multi-update description');
    expect(result.target_value).toEqual(200);
    expect(result.target_unit).toEqual('pages');
    expect(result.is_active).toEqual(false);
  });

  it('should persist changes to database', async () => {
    const input: UpdateGoalInput = {
      id: testGoalId,
      title: 'Persisted Goal',
      target_value: 75,
    };

    await updateGoal(input);

    // Query database directly to verify changes were persisted
    const goals = await db.select()
      .from(goalsTable)
      .where(eq(goalsTable.id, testGoalId))
      .execute();

    expect(goals).toHaveLength(1);
    expect(goals[0].title).toEqual('Persisted Goal');
    expect(goals[0].target_value).toEqual(75);
    expect(goals[0].updated_at).toBeInstanceOf(Date);
  });

  it('should update updated_at timestamp', async () => {
    // Get original updated_at
    const originalGoal = await db.select()
      .from(goalsTable)
      .where(eq(goalsTable.id, testGoalId))
      .execute();
    
    const originalUpdatedAt = originalGoal[0].updated_at;

    // Wait a moment to ensure timestamp difference
    await new Promise(resolve => setTimeout(resolve, 10));

    const input: UpdateGoalInput = {
      id: testGoalId,
      title: 'Updated Title',
    };

    const result = await updateGoal(input);

    expect(result.updated_at).toBeInstanceOf(Date);
    expect(result.updated_at.getTime()).toBeGreaterThan(originalUpdatedAt.getTime());
  });

  it('should throw error for non-existent goal', async () => {
    const input: UpdateGoalInput = {
      id: 99999, // Non-existent ID
      title: 'This should fail',
    };

    await expect(updateGoal(input)).rejects.toThrow(/Goal with id 99999 not found/i);
  });

  it('should handle decimal target values correctly', async () => {
    const input: UpdateGoalInput = {
      id: testGoalId,
      target_value: 23.75,
    };

    const result = await updateGoal(input);

    expect(result.target_value).toEqual(23.75);
    expect(typeof result.target_value).toEqual('number');

    // Verify in database
    const goals = await db.select()
      .from(goalsTable)
      .where(eq(goalsTable.id, testGoalId))
      .execute();

    expect(goals[0].target_value).toEqual(23.75);
  });

  it('should only update provided fields leaving others unchanged', async () => {
    const input: UpdateGoalInput = {
      id: testGoalId,
      title: 'Only Title Update',
    };

    const result = await updateGoal(input);

    // Verify only title changed, all other fields remain the same
    expect(result.title).toEqual('Only Title Update');
    expect(result.description).toEqual('Original description');
    expect(result.category).toEqual('physical');
    expect(result.target_value).toEqual(100);
    expect(result.target_unit).toEqual('reps');
    expect(result.is_active).toEqual(true);
    expect(result.user_id).toEqual(testUserId);
  });
});