import { db } from '../db';
import { sessionsTable, sessionBlocksTable } from '../db/schema';
import { type StartSessionInput, type Session } from '../schema';
import { eq, and } from 'drizzle-orm';

export const startSession = async (input: StartSessionInput): Promise<Session> => {
  try {
    // First, validate the session exists and is in 'scheduled' status
    const existingSessions = await db.select()
      .from(sessionsTable)
      .where(and(
        eq(sessionsTable.id, input.session_id),
        eq(sessionsTable.status, 'scheduled')
      ))
      .execute();

    if (existingSessions.length === 0) {
      throw new Error('Session not found or not in scheduled status');
    }

    const currentTime = new Date();

    // Update session status to 'active' and set started_at timestamp
    const updatedSessions = await db.update(sessionsTable)
      .set({
        status: 'active',
        started_at: currentTime,
        updated_at: currentTime
      })
      .where(eq(sessionsTable.id, input.session_id))
      .returning()
      .execute();

    // Activate all associated session blocks
    await db.update(sessionBlocksTable)
      .set({
        is_active: true
      })
      .where(eq(sessionBlocksTable.session_id, input.session_id))
      .execute();

    // Return the updated session
    const session = updatedSessions[0];
    return session;
  } catch (error) {
    console.error('Session start failed:', error);
    throw error;
  }
};