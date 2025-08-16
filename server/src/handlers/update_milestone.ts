import { db } from '../db';
import { milestonesTable } from '../db/schema';
import { type UpdateMilestoneInput, type Milestone } from '../schema';
import { eq } from 'drizzle-orm';

export const updateMilestone = async (input: UpdateMilestoneInput): Promise<Milestone> => {
  try {
    // First verify the milestone exists
    const existingMilestone = await db.select()
      .from(milestonesTable)
      .where(eq(milestonesTable.id, input.id))
      .execute();

    if (existingMilestone.length === 0) {
      throw new Error(`Milestone with id ${input.id} not found`);
    }

    // Build update object with only provided fields
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
      updateData.target_value = input.target_value !== null ? input.target_value.toString() : null;
    }

    if (input.is_completed !== undefined) {
      updateData.is_completed = input.is_completed;
      // Set completed_at timestamp when marking as completed, clear it when marking as incomplete
      updateData.completed_at = input.is_completed ? new Date() : null;
    }

    // Perform the update
    const result = await db.update(milestonesTable)
      .set(updateData)
      .where(eq(milestonesTable.id, input.id))
      .returning()
      .execute();

    // Return the updated milestone
    return result[0];
  } catch (error) {
    console.error('Milestone update failed:', error);
    throw error;
  }
};