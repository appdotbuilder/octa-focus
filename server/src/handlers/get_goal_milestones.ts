import { db } from '../db';
import { milestonesTable } from '../db/schema';
import { type Milestone } from '../schema';
import { eq, asc } from 'drizzle-orm';

export async function getGoalMilestones(goalId: number): Promise<Milestone[]> {
  try {
    // Query milestones for the specific goal
    // Order by completion status (incomplete first) then by creation date
    const results = await db.select()
      .from(milestonesTable)
      .where(eq(milestonesTable.goal_id, goalId))
      .orderBy(
        asc(milestonesTable.is_completed), // false (0) comes before true (1)
        asc(milestonesTable.created_at)
      )
      .execute();

    // Convert numeric fields back to numbers
    return results.map(milestone => ({
      ...milestone,
      target_value: milestone.target_value ? parseFloat(milestone.target_value.toString()) : null
    }));
  } catch (error) {
    console.error('Failed to get goal milestones:', error);
    throw error;
  }
}