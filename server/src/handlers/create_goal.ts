import { db } from '../db';
import { goalsTable, usersTable } from '../db/schema';
import { type CreateGoalInput, type Goal } from '../schema';
import { eq } from 'drizzle-orm';

export const createGoal = async (input: CreateGoalInput): Promise<Goal> => {
  try {
    // Validate that the user exists first to prevent foreign key constraint violation
    const user = await db.select()
      .from(usersTable)
      .where(eq(usersTable.id, input.user_id))
      .limit(1)
      .execute();

    if (user.length === 0) {
      throw new Error(`User with id ${input.user_id} does not exist`);
    }

    // Insert goal record
    const result = await db.insert(goalsTable)
      .values({
        user_id: input.user_id,
        title: input.title,
        description: input.description,
        category: input.category,
        target_value: input.target_value, // real() columns accept numbers directly
        target_unit: input.target_unit
      })
      .returning()
      .execute();

    // Return the goal - no numeric conversion needed for real() columns
    return result[0];
  } catch (error) {
    console.error('Goal creation failed:', error);
    throw error;
  }
};