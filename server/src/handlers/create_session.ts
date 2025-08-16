import { db } from '../db';
import { sessionsTable, sessionBlocksTable, goalsTable, milestonesTable } from '../db/schema';
import { type CreateSessionInput, type Session } from '../schema';
import { eq } from 'drizzle-orm';

export const createSession = async (input: CreateSessionInput): Promise<Session> => {
  try {
    // Validate goal exists and belongs to the user
    const goals = await db.select()
      .from(goalsTable)
      .where(eq(goalsTable.id, input.goal_id))
      .execute();

    if (goals.length === 0) {
      throw new Error('Goal not found');
    }

    const goal = goals[0];
    if (goal.user_id !== input.user_id) {
      throw new Error('Goal does not belong to user');
    }

    // Validate milestone exists and belongs to the goal (if provided)
    if (input.milestone_id) {
      const milestones = await db.select()
        .from(milestonesTable)
        .where(eq(milestonesTable.id, input.milestone_id))
        .execute();

      if (milestones.length === 0) {
        throw new Error('Milestone not found');
      }

      const milestone = milestones[0];
      if (milestone.goal_id !== input.goal_id) {
        throw new Error('Milestone does not belong to goal');
      }
    }

    // Create session
    const sessionResult = await db.insert(sessionsTable)
      .values({
        user_id: input.user_id,
        goal_id: input.goal_id,
        milestone_id: input.milestone_id || null,
        title: input.title,
        planned_duration: input.planned_duration,
        actual_duration: null,
        status: 'scheduled',
        started_at: null,
        completed_at: null,
      })
      .returning()
      .execute();

    const session = sessionResult[0];

    // Create session blocks for apps
    if (input.blocked_apps && input.blocked_apps.length > 0) {
      const appBlockValues = input.blocked_apps.map(app => ({
        session_id: session.id,
        block_type: 'app' as const,
        identifier: app,
        is_active: true,
      }));

      await db.insert(sessionBlocksTable)
        .values(appBlockValues)
        .execute();
    }

    // Create session blocks for websites
    if (input.blocked_websites && input.blocked_websites.length > 0) {
      const websiteBlockValues = input.blocked_websites.map(website => ({
        session_id: session.id,
        block_type: 'website' as const,
        identifier: website,
        is_active: true,
      }));

      await db.insert(sessionBlocksTable)
        .values(websiteBlockValues)
        .execute();
    }

    return session;
  } catch (error) {
    console.error('Session creation failed:', error);
    throw error;
  }
};