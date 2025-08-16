import { db } from '../db';
import { userStatsTable } from '../db/schema';
import { sql, lt } from 'drizzle-orm';

export async function updateLeaderboardScores(): Promise<{ updatedCount: number }> {
  try {
    const now = new Date();
    
    // Apply decay to scores that haven't been updated in the last 24 hours
    // Decay rate: 2% per day (0.98 multiplier)
    // This creates an adversarial system where maintaining rank requires ongoing activity
    const daysSinceUpdate = sql<number>`EXTRACT(EPOCH FROM (${now} - last_score_update)) / 86400`;
    const decayFactor = sql<number>`POWER(0.98, ${daysSinceUpdate})`;
    const newScore = sql<number>`leaderboard_score * ${decayFactor}`;
    
    // Only update records that haven't been updated in the last 24 hours
    // and have a positive score to decay
    const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    
    const result = await db
      .update(userStatsTable)
      .set({
        leaderboard_score: newScore,
        last_score_update: now,
      })
      .where(
        sql`last_score_update < ${twentyFourHoursAgo} AND leaderboard_score > 0`
      )
      .execute();

    return { updatedCount: result.rowCount || 0 };
  } catch (error) {
    console.error('Leaderboard score update failed:', error);
    throw error;
  }
}