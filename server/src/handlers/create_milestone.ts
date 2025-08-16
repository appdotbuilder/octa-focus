import { db } from '../db';
import { milestonesTable, goalsTable } from '../db/schema';
import { type CreateMilestoneInput, type Milestone } from '../schema';
import { eq } from 'drizzle-orm';

export const createMilestone = async (input: CreateMilestoneInput): Promise<Milestone> => {
  try {
    // First, verify that the goal exists
    const goalExists = await db.select()
      .from(goalsTable)
      .where(eq(goalsTable.id, input.goal_id))
      .execute();

    if (goalExists.length === 0) {
      throw new Error(`Goal with ID ${input.goal_id} not found`);
    }

    // Insert milestone record
    const result = await db.insert(milestonesTable)
      .values({
        goal_id: input.goal_id,
        title: input.title,
        description: input.description,
        target_value: input.target_value, // Real columns accept numbers directly
      })
      .returning()
      .execute();

    // Return the milestone (no conversion needed for real columns)
    const milestone = result[0];
    return milestone;
  } catch (error) {
    console.error('Milestone creation failed:', error);
    throw error;
  }
};