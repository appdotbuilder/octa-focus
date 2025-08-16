import { db } from '../db';
import { userStatsTable, sessionsTable } from '../db/schema';
import { type GetUserStatsInput, type UserStats } from '../schema';
import { eq, and, desc, gte, SQL } from 'drizzle-orm';

export async function getUserStats(input: GetUserStatsInput): Promise<UserStats[]> {
  try {
    // Calculate streak update threshold (24 hours ago)
    const streakThreshold = new Date();
    streakThreshold.setDate(streakThreshold.getDate() - 1);

    // Build conditions array
    const conditions: SQL<unknown>[] = [];
    conditions.push(eq(userStatsTable.user_id, input.user_id));

    if (input.category) {
      conditions.push(eq(userStatsTable.category, input.category));
    }

    // Build query with all conditions applied
    const query = db.select()
      .from(userStatsTable)
      .where(conditions.length === 1 ? conditions[0] : and(...conditions))
      .orderBy(desc(userStatsTable.category));

    const results = await query.execute();

    // Update streaks for stats that need it and convert numeric fields
    const updatedStats = await Promise.all(
      results.map(async (stat) => {
        let updatedStat = { ...stat };

        // Check if streak needs updating (last activity was more than 24 hours ago)
        if (stat.last_activity && stat.last_activity < streakThreshold) {
          // Check for recent completed sessions to maintain streak
          const recentSessions = await db.select()
            .from(sessionsTable)
            .where(
              and(
                eq(sessionsTable.user_id, input.user_id),
                eq(sessionsTable.status, 'completed'),
                gte(sessionsTable.completed_at, streakThreshold)
              )
            )
            .execute();

          // If no recent activity, reset streak
          if (recentSessions.length === 0 && stat.streak_days > 0) {
            const [updated] = await db.update(userStatsTable)
              .set({ 
                streak_days: 0,
                last_score_update: new Date()
              })
              .where(eq(userStatsTable.id, stat.id))
              .returning()
              .execute();
            
            updatedStat = updated;
          }
        }

        // Return the updated stat (leaderboard_score is already a number from real column)
        return updatedStat;
      })
    );

    return updatedStats;
  } catch (error) {
    console.error('Get user stats failed:', error);
    throw error;
  }
}