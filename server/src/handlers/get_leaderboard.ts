import { db } from '../db';
import { userStatsTable } from '../db/schema';
import { type GetLeaderboardInput, type UserStats } from '../schema';
import { eq, desc, and, SQL } from 'drizzle-orm';

export async function getLeaderboard(input: GetLeaderboardInput): Promise<UserStats[]> {
  try {
    // Apply limit (default to 10 if not specified)
    const limit = input.limit || 10;

    // Build the query with conditional where clause
    const baseQuery = db.select().from(userStatsTable);
    
    let results;
    
    if (input.category) {
      // Query with category filter
      results = await baseQuery
        .where(eq(userStatsTable.category, input.category))
        .orderBy(desc(userStatsTable.leaderboard_score))
        .limit(limit)
        .execute();
    } else {
      // Query without filter
      results = await baseQuery
        .orderBy(desc(userStatsTable.leaderboard_score))
        .limit(limit)
        .execute();
    }

    // Convert numeric fields and return
    return results.map(result => ({
      ...result,
      leaderboard_score: parseFloat(result.leaderboard_score.toString())
    }));
  } catch (error) {
    console.error('Get leaderboard failed:', error);
    throw error;
  }
}