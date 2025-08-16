import { db } from '../db';
import { sessionBlocksTable, sessionsTable } from '../db/schema';
import { type SessionBlock } from '../schema';
import { eq, and } from 'drizzle-orm';

export const getSessionBlocks = async (sessionId: number): Promise<SessionBlock[]> => {
  try {
    // Get session blocks with session status check
    const results = await db.select()
      .from(sessionBlocksTable)
      .innerJoin(sessionsTable, eq(sessionBlocksTable.session_id, sessionsTable.id))
      .where(
        and(
          eq(sessionBlocksTable.session_id, sessionId),
          eq(sessionBlocksTable.is_active, true),
          eq(sessionsTable.status, 'active')
        )
      )
      .execute();

    // Extract session blocks from joined results
    return results.map(result => result.session_blocks);
  } catch (error) {
    console.error('Failed to get session blocks:', error);
    throw error;
  }
};