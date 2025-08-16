import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { usersTable, goalsTable, milestonesTable } from '../db/schema';
import { getGoalMilestones } from '../handlers/get_goal_milestones';
import { eq } from 'drizzle-orm';

// Test data setup
const testUser = {
  email: 'test@example.com',
  username: 'testuser'
};

const testGoal = {
  user_id: 1,
  title: 'Test Goal',
  description: 'A goal for testing',
  category: 'physical' as const,
  target_value: null,
  target_unit: null
};

const testMilestones = [
  {
    goal_id: 1,
    title: 'First Milestone',
    description: 'First milestone description',
    target_value: 10.5
  },
  {
    goal_id: 1,
    title: 'Second Milestone',
    description: 'Second milestone description',
    target_value: 20.0
  },
  {
    goal_id: 1,
    title: 'Completed Milestone',
    description: 'Already completed milestone',
    target_value: 5.0
  }
];

describe('getGoalMilestones', () => {
  beforeEach(createDB);
  afterEach(resetDB);

  it('should return empty array for goal with no milestones', async () => {
    // Create user and goal but no milestones
    await db.insert(usersTable).values(testUser).execute();
    await db.insert(goalsTable).values(testGoal).execute();

    const result = await getGoalMilestones(1);

    expect(result).toEqual([]);
  });

  it('should return milestones for a specific goal', async () => {
    // Create test data
    await db.insert(usersTable).values(testUser).execute();
    await db.insert(goalsTable).values(testGoal).execute();
    await db.insert(milestonesTable).values(testMilestones).execute();

    const result = await getGoalMilestones(1);

    expect(result).toHaveLength(3);
    
    // Check that all milestones belong to the correct goal
    result.forEach(milestone => {
      expect(milestone.goal_id).toEqual(1);
    });

    // Check field types and values
    expect(result[0].id).toBeDefined();
    expect(result[0].title).toEqual('First Milestone');
    expect(result[0].description).toEqual('First milestone description');
    expect(typeof result[0].target_value).toEqual('number');
    expect(result[0].target_value).toEqual(10.5);
    expect(result[0].is_completed).toEqual(false);
    expect(result[0].created_at).toBeInstanceOf(Date);
    expect(result[0].updated_at).toBeInstanceOf(Date);
  });

  it('should convert numeric fields correctly', async () => {
    // Create test data
    await db.insert(usersTable).values(testUser).execute();
    await db.insert(goalsTable).values(testGoal).execute();
    await db.insert(milestonesTable).values([testMilestones[0]]).execute();

    const result = await getGoalMilestones(1);

    expect(result).toHaveLength(1);
    expect(typeof result[0].target_value).toEqual('number');
    expect(result[0].target_value).toEqual(10.5);
  });

  it('should handle null target_value correctly', async () => {
    // Create milestone with null target_value
    const milestoneWithNullTarget = {
      goal_id: 1,
      title: 'No Target Milestone',
      description: 'Milestone without target value',
      target_value: null
    };

    await db.insert(usersTable).values(testUser).execute();
    await db.insert(goalsTable).values(testGoal).execute();
    await db.insert(milestonesTable).values([milestoneWithNullTarget]).execute();

    const result = await getGoalMilestones(1);

    expect(result).toHaveLength(1);
    expect(result[0].target_value).toBeNull();
    expect(result[0].title).toEqual('No Target Milestone');
  });

  it('should order milestones correctly - incomplete first, then by creation date', async () => {
    // Create test data with different creation times
    await db.insert(usersTable).values(testUser).execute();
    await db.insert(goalsTable).values(testGoal).execute();

    // Insert milestones one by one to ensure different creation times
    const firstMilestone = await db.insert(milestonesTable)
      .values({
        goal_id: 1,
        title: 'First Created',
        description: 'Created first',
        target_value: 10.0
      })
      .returning()
      .execute();

    // Mark first milestone as completed
    await db.update(milestonesTable)
      .set({ 
        is_completed: true,
        completed_at: new Date()
      })
      .where(eq(milestonesTable.id, firstMilestone[0].id))
      .execute();

    // Insert second milestone (will be incomplete)
    await db.insert(milestonesTable)
      .values({
        goal_id: 1,
        title: 'Second Created',
        description: 'Created second, but incomplete',
        target_value: 20.0
      })
      .execute();

    const result = await getGoalMilestones(1);

    expect(result).toHaveLength(2);
    
    // Incomplete milestone should come first
    expect(result[0].is_completed).toEqual(false);
    expect(result[0].title).toEqual('Second Created');
    
    // Completed milestone should come second
    expect(result[1].is_completed).toEqual(true);
    expect(result[1].title).toEqual('First Created');
    expect(result[1].completed_at).toBeInstanceOf(Date);
  });

  it('should not return milestones from other goals', async () => {
    // Create two goals with milestones
    await db.insert(usersTable).values(testUser).execute();
    
    const goals = await db.insert(goalsTable)
      .values([
        testGoal,
        { ...testGoal, title: 'Second Goal' }
      ])
      .returning()
      .execute();

    // Create milestones for both goals
    await db.insert(milestonesTable)
      .values([
        { goal_id: goals[0].id, title: 'Goal 1 Milestone', description: 'For first goal', target_value: 10.0 },
        { goal_id: goals[1].id, title: 'Goal 2 Milestone', description: 'For second goal', target_value: 20.0 }
      ])
      .execute();

    // Get milestones for first goal only
    const result = await getGoalMilestones(goals[0].id);

    expect(result).toHaveLength(1);
    expect(result[0].goal_id).toEqual(goals[0].id);
    expect(result[0].title).toEqual('Goal 1 Milestone');
  });

  it('should return empty array for non-existent goal', async () => {
    // Don't create any data
    const result = await getGoalMilestones(999);

    expect(result).toEqual([]);
  });

  it('should preserve milestone completion status and timestamps', async () => {
    const completedDate = new Date('2024-01-15T10:00:00Z');
    
    await db.insert(usersTable).values(testUser).execute();
    await db.insert(goalsTable).values(testGoal).execute();
    
    // Insert completed milestone
    const milestone = await db.insert(milestonesTable)
      .values({
        goal_id: 1,
        title: 'Completed Test',
        description: 'Test completed milestone',
        target_value: 15.5
      })
      .returning()
      .execute();

    // Mark as completed
    await db.update(milestonesTable)
      .set({ 
        is_completed: true,
        completed_at: completedDate
      })
      .where(eq(milestonesTable.id, milestone[0].id))
      .execute();

    const result = await getGoalMilestones(1);

    expect(result).toHaveLength(1);
    expect(result[0].is_completed).toEqual(true);
    expect(result[0].completed_at).toBeInstanceOf(Date);
    expect(result[0].completed_at?.getTime()).toEqual(completedDate.getTime());
  });
});