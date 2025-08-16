import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { usersTable, goalsTable } from '../db/schema';
import { getUserGoals } from '../handlers/get_user_goals';

describe('getUserGoals', () => {
  beforeEach(createDB);
  afterEach(resetDB);

  it('should return empty array for user with no goals', async () => {
    // Create user but no goals
    const userResult = await db.insert(usersTable)
      .values({
        email: 'test@example.com',
        username: 'testuser'
      })
      .returning()
      .execute();

    const userId = userResult[0].id;
    const result = await getUserGoals(userId);

    expect(result).toEqual([]);
  });

  it('should return goals for specific user', async () => {
    // Create user
    const userResult = await db.insert(usersTable)
      .values({
        email: 'test@example.com',
        username: 'testuser'
      })
      .returning()
      .execute();

    const userId = userResult[0].id;

    // Create goals for this user - insert separately to ensure different timestamps
    await db.insert(goalsTable)
      .values({
        user_id: userId,
        title: 'First Goal',
        description: 'Description for first goal',
        category: 'physical',
        target_value: 100.5,
        target_unit: 'reps',
        is_active: true
      })
      .execute();

    // Small delay to ensure different timestamps
    await new Promise(resolve => setTimeout(resolve, 10));

    await db.insert(goalsTable)
      .values({
        user_id: userId,
        title: 'Second Goal',
        description: null,
        category: 'mental',
        target_value: null,
        target_unit: null,
        is_active: false
      })
      .execute();

    const result = await getUserGoals(userId);

    expect(result).toHaveLength(2);
    
    // Check that we have both goals with proper data (order may vary due to timestamps)
    const goalTitles = result.map(g => g.title);
    expect(goalTitles).toContain('First Goal');
    expect(goalTitles).toContain('Second Goal');

    // Find specific goals to test their properties
    const firstGoal = result.find(g => g.title === 'First Goal')!;
    expect(firstGoal.description).toEqual('Description for first goal');
    expect(firstGoal.category).toEqual('physical');
    expect(firstGoal.target_value).toEqual(100.5);
    expect(typeof firstGoal.target_value).toBe('number');
    expect(firstGoal.target_unit).toEqual('reps');
    expect(firstGoal.is_active).toBe(true);
    expect(firstGoal.created_at).toBeInstanceOf(Date);

    const secondGoal = result.find(g => g.title === 'Second Goal')!;
    expect(secondGoal.category).toEqual('mental');
    expect(secondGoal.target_value).toBeNull();
    expect(secondGoal.target_unit).toBeNull();
    expect(secondGoal.is_active).toBe(false);
    expect(secondGoal.created_at).toBeInstanceOf(Date);

    // Verify ordering - second goal should be first since it was created later
    expect(result[0].title).toEqual('Second Goal');
    expect(result[1].title).toEqual('First Goal');
  });

  it('should only return goals for the specified user', async () => {
    // Create two users
    const user1Result = await db.insert(usersTable)
      .values({
        email: 'user1@example.com',
        username: 'user1'
      })
      .returning()
      .execute();

    const user2Result = await db.insert(usersTable)
      .values({
        email: 'user2@example.com',
        username: 'user2'
      })
      .returning()
      .execute();

    const user1Id = user1Result[0].id;
    const user2Id = user2Result[0].id;

    // Create goals for both users
    await db.insert(goalsTable)
      .values([
        {
          user_id: user1Id,
          title: 'User 1 Goal',
          category: 'physical'
        },
        {
          user_id: user2Id,
          title: 'User 2 Goal',
          category: 'mental'
        }
      ])
      .execute();

    const user1Goals = await getUserGoals(user1Id);
    const user2Goals = await getUserGoals(user2Id);

    expect(user1Goals).toHaveLength(1);
    expect(user1Goals[0].title).toEqual('User 1 Goal');
    expect(user1Goals[0].user_id).toEqual(user1Id);

    expect(user2Goals).toHaveLength(1);
    expect(user2Goals[0].title).toEqual('User 2 Goal');
    expect(user2Goals[0].user_id).toEqual(user2Id);
  });

  it('should order goals by creation date descending', async () => {
    // Create user
    const userResult = await db.insert(usersTable)
      .values({
        email: 'test@example.com',
        username: 'testuser'
      })
      .returning()
      .execute();

    const userId = userResult[0].id;

    // Create goals with slight time delay to ensure different timestamps
    const goal1Result = await db.insert(goalsTable)
      .values({
        user_id: userId,
        title: 'Older Goal',
        category: 'physical'
      })
      .returning()
      .execute();

    // Small delay to ensure different timestamps
    await new Promise(resolve => setTimeout(resolve, 10));

    const goal2Result = await db.insert(goalsTable)
      .values({
        user_id: userId,
        title: 'Newer Goal',
        category: 'mental'
      })
      .returning()
      .execute();

    const result = await getUserGoals(userId);

    expect(result).toHaveLength(2);
    expect(result[0].title).toEqual('Newer Goal'); // Should be first (newest)
    expect(result[1].title).toEqual('Older Goal'); // Should be second (oldest)
    expect(result[0].created_at.getTime()).toBeGreaterThanOrEqual(result[1].created_at.getTime());
  });

  it('should handle numeric conversion correctly', async () => {
    // Create user
    const userResult = await db.insert(usersTable)
      .values({
        email: 'test@example.com',
        username: 'testuser'
      })
      .returning()
      .execute();

    const userId = userResult[0].id;

    // Create goal with various numeric values
    await db.insert(goalsTable)
      .values({
        user_id: userId,
        title: 'Numeric Goal',
        category: 'physical',
        target_value: 42.75
      })
      .execute();

    const result = await getUserGoals(userId);

    expect(result).toHaveLength(1);
    expect(typeof result[0].target_value).toBe('number');
    expect(result[0].target_value).toEqual(42.75);
  });

  it('should include all goal categories', async () => {
    // Create user
    const userResult = await db.insert(usersTable)
      .values({
        email: 'test@example.com',
        username: 'testuser'
      })
      .returning()
      .execute();

    const userId = userResult[0].id;

    // Create goals with different categories
    const categories = ['physical', 'mental', 'skill', 'habit', 'creative', 'social', 'spiritual', 'professional'] as const;
    
    await db.insert(goalsTable)
      .values(categories.map((category, index) => ({
        user_id: userId,
        title: `${category} Goal`,
        category: category
      })))
      .execute();

    const result = await getUserGoals(userId);

    expect(result).toHaveLength(categories.length);
    
    // Verify all categories are present
    const resultCategories = result.map(goal => goal.category).sort();
    expect(resultCategories).toEqual([...categories].sort());
  });
});