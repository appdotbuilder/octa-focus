import { db } from '../db';
import { goalsTable } from '../db/schema';
import { type Goal } from '../schema';
import { eq, desc } from 'drizzle-orm';

export async function getUserGoals(userId: number): Promise<Goal[]> {
  try {
    // Query goals for the specific user, ordered by creation date (newest first)
    const results = await db.select()
      .from(goalsTable)
      .where(eq(goalsTable.user_id, userId))
      .orderBy(desc(goalsTable.created_at))
      .execute();

    // Convert numeric fields back to numbers before returning
    return results.map(goal => ({
      ...goal,
      target_value: goal.target_value ? parseFloat(goal.target_value.toString()) : null,
    }));
  } catch (error) {
    console.error('Get user goals failed:', error);
    throw error;
  }
}