import { db } from '../db';
import { goalsTable } from '../db/schema';
import { type UpdateGoalInput, type Goal } from '../schema';
import { eq } from 'drizzle-orm';

export const updateGoal = async (input: UpdateGoalInput): Promise<Goal> => {
  try {
    // First, check if the goal exists
    const existingGoal = await db.select()
      .from(goalsTable)
      .where(eq(goalsTable.id, input.id))
      .execute();

    if (existingGoal.length === 0) {
      throw new Error(`Goal with id ${input.id} not found`);
    }

    // Build the update object with only provided fields
    const updateData: any = {
      updated_at: new Date(),
    };

    if (input.title !== undefined) {
      updateData.title = input.title;
    }

    if (input.description !== undefined) {
      updateData.description = input.description;
    }

    if (input.target_value !== undefined) {
      updateData.target_value = input.target_value;
    }

    if (input.target_unit !== undefined) {
      updateData.target_unit = input.target_unit;
    }

    if (input.is_active !== undefined) {
      updateData.is_active = input.is_active;
    }

    // Update the goal
    const result = await db.update(goalsTable)
      .set(updateData)
      .where(eq(goalsTable.id, input.id))
      .returning()
      .execute();

    const updatedGoal = result[0];

    // Return the goal with proper types (real columns are already numbers)
    return {
      ...updatedGoal,
      target_value: updatedGoal.target_value,
    };
  } catch (error) {
    console.error('Goal update failed:', error);
    throw error;
  }
};