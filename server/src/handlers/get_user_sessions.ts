import { db } from '../db';
import { sessionsTable, goalsTable, milestonesTable } from '../db/schema';
import { type GetUserSessionsInput, type Session } from '../schema';
import { eq, desc, and, type SQL } from 'drizzle-orm';

export const getUserSessions = async (input: GetUserSessionsInput): Promise<Session[]> => {
  try {
    // Build base query with joins to get related data
    const baseQuery = db.select({
      id: sessionsTable.id,
      user_id: sessionsTable.user_id,
      goal_id: sessionsTable.goal_id,
      milestone_id: sessionsTable.milestone_id,
      title: sessionsTable.title,
      planned_duration: sessionsTable.planned_duration,
      actual_duration: sessionsTable.actual_duration,
      status: sessionsTable.status,
      started_at: sessionsTable.started_at,
      completed_at: sessionsTable.completed_at,
      created_at: sessionsTable.created_at,
      updated_at: sessionsTable.updated_at,
    })
    .from(sessionsTable)
    .innerJoin(goalsTable, eq(sessionsTable.goal_id, goalsTable.id))
    .leftJoin(milestonesTable, eq(sessionsTable.milestone_id, milestonesTable.id));

    // Build conditions array
    const conditions: SQL<unknown>[] = [];

    // Always filter by user_id
    conditions.push(eq(sessionsTable.user_id, input.user_id));

    // Add optional status filter
    if (input.status) {
      conditions.push(eq(sessionsTable.status, input.status));
    }

    // Build final query with all conditions and modifiers
    const finalQuery = baseQuery.where(and(...conditions))
      .orderBy(desc(sessionsTable.created_at))
      .limit(input.limit || 100); // Default limit to prevent unbounded queries

    const results = await finalQuery.execute();

    // Transform results to match Session schema
    return results.map(result => ({
      id: result.id,
      user_id: result.user_id,
      goal_id: result.goal_id,
      milestone_id: result.milestone_id,
      title: result.title,
      planned_duration: result.planned_duration,
      actual_duration: result.actual_duration,
      status: result.status,
      started_at: result.started_at,
      completed_at: result.completed_at,
      created_at: result.created_at,
      updated_at: result.updated_at,
    }));
  } catch (error) {
    console.error('Get user sessions failed:', error);
    throw error;
  }
};