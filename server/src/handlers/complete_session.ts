import { db } from '../db';
import { sessionsTable, sessionBlocksTable, userStatsTable, goalsTable } from '../db/schema';
import { type CompleteSessionInput, type Session } from '../schema';
import { eq, and } from 'drizzle-orm';

export async function completeSession(input: CompleteSessionInput): Promise<Session> {
  try {
    // First, verify the session exists and is in 'active' status
    const existingSessions = await db.select()
      .from(sessionsTable)
      .where(eq(sessionsTable.id, input.session_id))
      .execute();

    if (existingSessions.length === 0) {
      throw new Error(`Session with id ${input.session_id} not found`);
    }

    const session = existingSessions[0];

    if (session.status !== 'active') {
      throw new Error(`Session with id ${input.session_id} is not active (current status: ${session.status})`);
    }

    // Update the session to completed status
    const completedAt = new Date();
    const updatedSessions = await db.update(sessionsTable)
      .set({
        status: 'completed',
        completed_at: completedAt,
        actual_duration: input.actual_duration || session.planned_duration,
        updated_at: completedAt
      })
      .where(eq(sessionsTable.id, input.session_id))
      .returning()
      .execute();

    const updatedSession = updatedSessions[0];

    // Deactivate all session blocks for this session
    await db.update(sessionBlocksTable)
      .set({
        is_active: false
      })
      .where(eq(sessionBlocksTable.session_id, input.session_id))
      .execute();

    // Update user statistics
    await updateUserStats(session.user_id, updatedSession);

    return {
      ...updatedSession
    };
  } catch (error) {
    console.error('Session completion failed:', error);
    throw error;
  }
}

async function updateUserStats(userId: number, session: any): Promise<void> {
  try {
    // Get the goal to determine category
    const goalResults = await db.select()
      .from(goalsTable)
      .where(eq(goalsTable.id, session.goal_id))
      .execute();

    if (goalResults.length === 0) {
      console.warn(`Could not find goal for session ${session.id}`);
      return;
    }

    const goal = goalResults[0];
    const category = goal.category;

    // Check if user stats exist for this category
    const existingStats = await db.select()
      .from(userStatsTable)
      .where(and(
        eq(userStatsTable.user_id, userId),
        eq(userStatsTable.category, category)
      ))
      .execute();

    const actualDuration = session.actual_duration || session.planned_duration;
    const now = new Date();

    if (existingStats.length === 0) {
      // Create new stats record
      await db.insert(userStatsTable)
        .values({
          user_id: userId,
          category: category,
          total_sessions: 1,
          completed_sessions: 1,
          total_duration: actualDuration,
          streak_days: 1,
          last_activity: now,
          leaderboard_score: calculateLeaderboardScore(1, actualDuration),
          last_score_update: now
        })
        .execute();
    } else {
      // Update existing stats
      const stats = existingStats[0];
      const newTotalSessions = stats.total_sessions + 1;
      const newCompletedSessions = stats.completed_sessions + 1;
      const newTotalDuration = stats.total_duration + actualDuration;
      
      // Calculate streak (simple implementation: +1 if last activity was yesterday or today)
      let newStreak = stats.streak_days;
      if (stats.last_activity) {
        const lastActivity = new Date(stats.last_activity);
        const daysDiff = Math.floor((now.getTime() - lastActivity.getTime()) / (1000 * 60 * 60 * 24));
        
        if (daysDiff <= 1) {
          newStreak = stats.streak_days + (daysDiff === 1 ? 1 : 0);
        } else {
          newStreak = 1; // Reset streak
        }
      } else {
        newStreak = 1;
      }

      const newScore = calculateLeaderboardScore(newCompletedSessions, newTotalDuration, newStreak);

      await db.update(userStatsTable)
        .set({
          total_sessions: newTotalSessions,
          completed_sessions: newCompletedSessions,
          total_duration: newTotalDuration,
          streak_days: newStreak,
          last_activity: now,
          leaderboard_score: newScore,
          last_score_update: now,
          updated_at: now
        })
        .where(and(
          eq(userStatsTable.user_id, userId),
          eq(userStatsTable.category, category)
        ))
        .execute();
    }
  } catch (error) {
    console.error('Failed to update user stats:', error);
    // Don't throw - stats update failure shouldn't prevent session completion
  }
}

function calculateLeaderboardScore(completedSessions: number, totalDuration: number, streakDays: number = 1): number {
  // Simple scoring algorithm: base score from sessions and duration, bonus for streaks
  const baseScore = completedSessions * 10 + Math.floor(totalDuration / 10);
  const streakBonus = Math.min(streakDays * 5, 100); // Cap streak bonus at 100
  return baseScore + streakBonus;
}