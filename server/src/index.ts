import { initTRPC } from '@trpc/server';
import { createHTTPServer } from '@trpc/server/adapters/standalone';
import 'dotenv/config';
import cors from 'cors';
import superjson from 'superjson';
import { z } from 'zod';

// Import schemas
import {
  createUserInputSchema,
  createGoalInputSchema,
  updateGoalInputSchema,
  createMilestoneInputSchema,
  updateMilestoneInputSchema,
  createSessionInputSchema,
  startSessionInputSchema,
  completeSessionInputSchema,
  submitVerificationInputSchema,
  getUserStatsInputSchema,
  getLeaderboardInputSchema,
  getUserSessionsInputSchema,
} from './schema';

// Import handlers
import { createUser } from './handlers/create_user';
import { createGoal } from './handlers/create_goal';
import { getUserGoals } from './handlers/get_user_goals';
import { updateGoal } from './handlers/update_goal';
import { createMilestone } from './handlers/create_milestone';
import { getGoalMilestones } from './handlers/get_goal_milestones';
import { updateMilestone } from './handlers/update_milestone';
import { createSession } from './handlers/create_session';
import { startSession } from './handlers/start_session';
import { getUserSessions } from './handlers/get_user_sessions';
import { submitVerification } from './handlers/submit_verification';
import { completeSession } from './handlers/complete_session';
import { getUserStats } from './handlers/get_user_stats';
import { getLeaderboard } from './handlers/get_leaderboard';
import { getSessionBlocks } from './handlers/get_session_blocks';
import { processVerification } from './handlers/process_verification';
import { cleanupExpiredProofs } from './handlers/cleanup_expired_proofs';
import { updateLeaderboardScores } from './handlers/update_leaderboard_scores';

const t = initTRPC.create({
  transformer: superjson,
});

const publicProcedure = t.procedure;
const router = t.router;

const appRouter = router({
  // Health check
  healthcheck: publicProcedure.query(() => {
    return { status: 'ok', timestamp: new Date().toISOString() };
  }),

  // User management
  createUser: publicProcedure
    .input(createUserInputSchema)
    .mutation(({ input }) => createUser(input)),

  // Goal management
  createGoal: publicProcedure
    .input(createGoalInputSchema)
    .mutation(({ input }) => createGoal(input)),

  getUserGoals: publicProcedure
    .input(z.object({ userId: z.number() }))
    .query(({ input }) => getUserGoals(input.userId)),

  updateGoal: publicProcedure
    .input(updateGoalInputSchema)
    .mutation(({ input }) => updateGoal(input)),

  // Milestone management
  createMilestone: publicProcedure
    .input(createMilestoneInputSchema)
    .mutation(({ input }) => createMilestone(input)),

  getGoalMilestones: publicProcedure
    .input(z.object({ goalId: z.number() }))
    .query(({ input }) => getGoalMilestones(input.goalId)),

  updateMilestone: publicProcedure
    .input(updateMilestoneInputSchema)
    .mutation(({ input }) => updateMilestone(input)),

  // Session management
  createSession: publicProcedure
    .input(createSessionInputSchema)
    .mutation(({ input }) => createSession(input)),

  startSession: publicProcedure
    .input(startSessionInputSchema)
    .mutation(({ input }) => startSession(input)),

  completeSession: publicProcedure
    .input(completeSessionInputSchema)
    .mutation(({ input }) => completeSession(input)),

  getUserSessions: publicProcedure
    .input(getUserSessionsInputSchema)
    .query(({ input }) => getUserSessions(input)),

  getSessionBlocks: publicProcedure
    .input(z.object({ sessionId: z.number() }))
    .query(({ input }) => getSessionBlocks(input.sessionId)),

  // Task verification
  submitVerification: publicProcedure
    .input(submitVerificationInputSchema)
    .mutation(({ input }) => submitVerification(input)),

  processVerification: publicProcedure
    .input(z.object({ verificationId: z.number() }))
    .mutation(({ input }) => processVerification(input.verificationId)),

  // Statistics and leaderboard
  getUserStats: publicProcedure
    .input(getUserStatsInputSchema)
    .query(({ input }) => getUserStats(input)),

  getLeaderboard: publicProcedure
    .input(getLeaderboardInputSchema)
    .query(({ input }) => getLeaderboard(input)),

  // Background jobs (admin endpoints)
  cleanupExpiredProofs: publicProcedure
    .mutation(() => cleanupExpiredProofs()),

  updateLeaderboardScores: publicProcedure
    .mutation(() => updateLeaderboardScores()),
});

export type AppRouter = typeof appRouter;

async function start() {
  const port = process.env['SERVER_PORT'] || 2022;
  const server = createHTTPServer({
    middleware: (req, res, next) => {
      cors()(req, res, next);
    },
    router: appRouter,
    createContext() {
      return {};
    },
  });
  server.listen(port);
  console.log(`🚀 Self-Improvement TRPC server listening at port: ${port}`);
  console.log(`📊 Available endpoints: ${Object.keys(appRouter._def.procedures).join(', ')}`);
}

start();