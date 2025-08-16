import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { usersTable, goalsTable, milestonesTable } from '../db/schema';
import { type UpdateMilestoneInput } from '../schema';
import { updateMilestone } from '../handlers/update_milestone';
import { eq } from 'drizzle-orm';

describe('updateMilestone', () => {
  beforeEach(createDB);
  afterEach(resetDB);

  let testUserId: number;
  let testGoalId: number;
  let testMilestoneId: number;

  beforeEach(async () => {
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
      })
      .returning()
      .execute();
    testGoalId = goalResult[0].id;

    // Create test milestone
    const milestoneResult = await db.insert(milestonesTable)
      .values({
        goal_id: testGoalId,
        title: 'Original Milestone',
        description: 'Original description',
        target_value: 25,
      })
      .returning()
      .execute();
    testMilestoneId = milestoneResult[0].id;
  });

  it('should update milestone title', async () => {
    const input: UpdateMilestoneInput = {
      id: testMilestoneId,
      title: 'Updated Milestone Title',
    };

    const result = await updateMilestone(input);

    expect(result.id).toEqual(testMilestoneId);
    expect(result.title).toEqual('Updated Milestone Title');
    expect(result.description).toEqual('Original description'); // Should remain unchanged
    expect(typeof result.target_value).toBe('number');
    expect(result.target_value).toEqual(25);
    expect(result.is_completed).toBe(false);
    expect(result.updated_at).toBeInstanceOf(Date);
  });

  it('should update milestone description', async () => {
    const input: UpdateMilestoneInput = {
      id: testMilestoneId,
      description: 'Updated description',
    };

    const result = await updateMilestone(input);

    expect(result.description).toEqual('Updated description');
    expect(result.title).toEqual('Original Milestone'); // Should remain unchanged
  });

  it('should update milestone description to null', async () => {
    const input: UpdateMilestoneInput = {
      id: testMilestoneId,
      description: null,
    };

    const result = await updateMilestone(input);

    expect(result.description).toBeNull();
    expect(result.title).toEqual('Original Milestone');
  });

  it('should update milestone target_value', async () => {
    const input: UpdateMilestoneInput = {
      id: testMilestoneId,
      target_value: 50,
    };

    const result = await updateMilestone(input);

    expect(typeof result.target_value).toBe('number');
    expect(result.target_value).toEqual(50);
    expect(result.title).toEqual('Original Milestone');
  });

  it('should update milestone target_value to null', async () => {
    const input: UpdateMilestoneInput = {
      id: testMilestoneId,
      target_value: null,
    };

    const result = await updateMilestone(input);

    expect(result.target_value).toBeNull();
  });

  it('should mark milestone as completed and set completed_at timestamp', async () => {
    const beforeUpdate = new Date();
    
    const input: UpdateMilestoneInput = {
      id: testMilestoneId,
      is_completed: true,
    };

    const result = await updateMilestone(input);

    expect(result.is_completed).toBe(true);
    expect(result.completed_at).toBeInstanceOf(Date);
    expect(result.completed_at!.getTime()).toBeGreaterThanOrEqual(beforeUpdate.getTime());
    expect(result.completed_at!.getTime()).toBeLessThanOrEqual(new Date().getTime());
  });

  it('should mark milestone as incomplete and clear completed_at timestamp', async () => {
    // First mark as completed
    await db.update(milestonesTable)
      .set({ 
        is_completed: true, 
        completed_at: new Date(),
      })
      .where(eq(milestonesTable.id, testMilestoneId))
      .execute();

    const input: UpdateMilestoneInput = {
      id: testMilestoneId,
      is_completed: false,
    };

    const result = await updateMilestone(input);

    expect(result.is_completed).toBe(false);
    expect(result.completed_at).toBeNull();
  });

  it('should update multiple fields at once', async () => {
    const input: UpdateMilestoneInput = {
      id: testMilestoneId,
      title: 'Multi-update Title',
      description: 'Multi-update description',
      target_value: 75,
      is_completed: true,
    };

    const result = await updateMilestone(input);

    expect(result.title).toEqual('Multi-update Title');
    expect(result.description).toEqual('Multi-update description');
    expect(typeof result.target_value).toBe('number');
    expect(result.target_value).toEqual(75);
    expect(result.is_completed).toBe(true);
    expect(result.completed_at).toBeInstanceOf(Date);
  });

  it('should save changes to database', async () => {
    const input: UpdateMilestoneInput = {
      id: testMilestoneId,
      title: 'Database Test Title',
      is_completed: true,
    };

    await updateMilestone(input);

    // Verify changes were persisted
    const milestones = await db.select()
      .from(milestonesTable)
      .where(eq(milestonesTable.id, testMilestoneId))
      .execute();

    expect(milestones).toHaveLength(1);
    expect(milestones[0].title).toEqual('Database Test Title');
    expect(milestones[0].is_completed).toBe(true);
    expect(milestones[0].completed_at).toBeInstanceOf(Date);
    expect(milestones[0].updated_at).toBeInstanceOf(Date);
  });

  it('should update updated_at timestamp', async () => {
    const originalMilestone = await db.select()
      .from(milestonesTable)
      .where(eq(milestonesTable.id, testMilestoneId))
      .execute();
    
    const originalUpdatedAt = originalMilestone[0].updated_at;

    // Wait a moment to ensure timestamp difference
    await new Promise(resolve => setTimeout(resolve, 10));

    const input: UpdateMilestoneInput = {
      id: testMilestoneId,
      title: 'Timestamp Test',
    };

    const result = await updateMilestone(input);

    expect(result.updated_at.getTime()).toBeGreaterThan(originalUpdatedAt.getTime());
  });

  it('should throw error for non-existent milestone', async () => {
    const input: UpdateMilestoneInput = {
      id: 99999,
      title: 'Non-existent Milestone',
    };

    await expect(updateMilestone(input)).rejects.toThrow(/Milestone with id 99999 not found/i);
  });

  it('should preserve original values for unspecified fields', async () => {
    const input: UpdateMilestoneInput = {
      id: testMilestoneId,
      title: 'Only Title Update',
    };

    const result = await updateMilestone(input);

    // Check that original values are preserved
    expect(result.goal_id).toEqual(testGoalId);
    expect(result.description).toEqual('Original description');
    expect(typeof result.target_value).toBe('number');
    expect(result.target_value).toEqual(25);
    expect(result.is_completed).toBe(false);
    expect(result.completed_at).toBeNull();
    expect(result.created_at).toBeInstanceOf(Date);
  });
});