import { z } from 'zod';

// User schema
export const userSchema = z.object({
  id: z.number(),
  email: z.string().email(),
  username: z.string(),
  created_at: z.coerce.date(),
  updated_at: z.coerce.date(),
});

export type User = z.infer<typeof userSchema>;

// Goal schema
export const goalSchema = z.object({
  id: z.number(),
  user_id: z.number(),
  title: z.string(),
  description: z.string().nullable(),
  category: z.enum(['physical', 'mental', 'skill', 'habit', 'creative', 'social', 'spiritual', 'professional']),
  target_value: z.number().nullable(), // For quantifiable goals
  target_unit: z.string().nullable(), // e.g., 'reps', 'minutes', 'pages'
  is_active: z.boolean(),
  created_at: z.coerce.date(),
  updated_at: z.coerce.date(),
});

export type Goal = z.infer<typeof goalSchema>;

// Milestone schema
export const milestoneSchema = z.object({
  id: z.number(),
  goal_id: z.number(),
  title: z.string(),
  description: z.string().nullable(),
  target_value: z.number().nullable(),
  is_completed: z.boolean(),
  completed_at: z.coerce.date().nullable(),
  created_at: z.coerce.date(),
  updated_at: z.coerce.date(),
});

export type Milestone = z.infer<typeof milestoneSchema>;

// Session schema
export const sessionSchema = z.object({
  id: z.number(),
  user_id: z.number(),
  goal_id: z.number(),
  milestone_id: z.number().nullable(),
  title: z.string(),
  planned_duration: z.number(), // Duration in minutes
  actual_duration: z.number().nullable(),
  status: z.enum(['scheduled', 'active', 'completed', 'cancelled', 'failed']),
  started_at: z.coerce.date().nullable(),
  completed_at: z.coerce.date().nullable(),
  created_at: z.coerce.date(),
  updated_at: z.coerce.date(),
});

export type Session = z.infer<typeof sessionSchema>;

// Blocked apps/websites during sessions
export const sessionBlockSchema = z.object({
  id: z.number(),
  session_id: z.number(),
  block_type: z.enum(['app', 'website']),
  identifier: z.string(), // App package name or website domain
  is_active: z.boolean(),
  created_at: z.coerce.date(),
});

export type SessionBlock = z.infer<typeof sessionBlockSchema>;

// Task verification schema
export const taskVerificationSchema = z.object({
  id: z.number(),
  session_id: z.number(),
  verification_type: z.enum(['video', 'photo', 'sensor', 'manual']),
  task_type: z.string(), // e.g., 'bodyweight_squats', 'pushups', 'meditation'
  expected_reps: z.number().nullable(),
  verified_reps: z.number().nullable(),
  confidence_score: z.number().nullable(), // AI confidence (0-1)
  proof_file_path: z.string().nullable(), // Temporary file path
  verification_status: z.enum(['pending', 'verified', 'rejected', 'expired']),
  verified_at: z.coerce.date().nullable(),
  expires_at: z.coerce.date(), // When proof file will be deleted
  created_at: z.coerce.date(),
});

export type TaskVerification = z.infer<typeof taskVerificationSchema>;

// User progress/stats schema
export const userStatsSchema = z.object({
  id: z.number(),
  user_id: z.number(),
  category: z.string(),
  total_sessions: z.number(),
  completed_sessions: z.number(),
  total_duration: z.number(), // Total minutes
  streak_days: z.number(),
  last_activity: z.coerce.date().nullable(),
  leaderboard_score: z.number(), // Score with decay
  last_score_update: z.coerce.date(),
  created_at: z.coerce.date(),
  updated_at: z.coerce.date(),
});

export type UserStats = z.infer<typeof userStatsSchema>;

// Input schemas for creating entities

export const createUserInputSchema = z.object({
  email: z.string().email(),
  username: z.string().min(3).max(50),
});

export type CreateUserInput = z.infer<typeof createUserInputSchema>;

export const createGoalInputSchema = z.object({
  user_id: z.number(),
  title: z.string().min(1).max(200),
  description: z.string().nullable(),
  category: z.enum(['physical', 'mental', 'skill', 'habit', 'creative', 'social', 'spiritual', 'professional']),
  target_value: z.number().positive().nullable(),
  target_unit: z.string().nullable(),
});

export type CreateGoalInput = z.infer<typeof createGoalInputSchema>;

export const createMilestoneInputSchema = z.object({
  goal_id: z.number(),
  title: z.string().min(1).max(200),
  description: z.string().nullable(),
  target_value: z.number().positive().nullable(),
});

export type CreateMilestoneInput = z.infer<typeof createMilestoneInputSchema>;

export const createSessionInputSchema = z.object({
  user_id: z.number(),
  goal_id: z.number(),
  milestone_id: z.number().nullable(),
  title: z.string().min(1).max(200),
  planned_duration: z.number().positive().max(480), // Max 8 hours
  blocked_apps: z.array(z.string()).optional(),
  blocked_websites: z.array(z.string()).optional(),
});

export type CreateSessionInput = z.infer<typeof createSessionInputSchema>;

export const startSessionInputSchema = z.object({
  session_id: z.number(),
});

export type StartSessionInput = z.infer<typeof startSessionInputSchema>;

export const submitVerificationInputSchema = z.object({
  session_id: z.number(),
  verification_type: z.enum(['video', 'photo', 'sensor', 'manual']),
  task_type: z.string(),
  expected_reps: z.number().positive().nullable(),
  proof_file_data: z.string().optional(), // Base64 encoded file data
});

export type SubmitVerificationInput = z.infer<typeof submitVerificationInputSchema>;

export const completeSessionInputSchema = z.object({
  session_id: z.number(),
  actual_duration: z.number().positive().nullable(),
});

export type CompleteSessionInput = z.infer<typeof completeSessionInputSchema>;

// Update schemas

export const updateGoalInputSchema = z.object({
  id: z.number(),
  title: z.string().min(1).max(200).optional(),
  description: z.string().nullable().optional(),
  target_value: z.number().positive().nullable().optional(),
  target_unit: z.string().nullable().optional(),
  is_active: z.boolean().optional(),
});

export type UpdateGoalInput = z.infer<typeof updateGoalInputSchema>;

export const updateMilestoneInputSchema = z.object({
  id: z.number(),
  title: z.string().min(1).max(200).optional(),
  description: z.string().nullable().optional(),
  target_value: z.number().positive().nullable().optional(),
  is_completed: z.boolean().optional(),
});

export type UpdateMilestoneInput = z.infer<typeof updateMilestoneInputSchema>;

// Query schemas

export const getUserStatsInputSchema = z.object({
  user_id: z.number(),
  category: z.string().optional(),
});

export type GetUserStatsInput = z.infer<typeof getUserStatsInputSchema>;

export const getLeaderboardInputSchema = z.object({
  category: z.string().optional(),
  limit: z.number().positive().max(100).optional(),
});

export type GetLeaderboardInput = z.infer<typeof getLeaderboardInputSchema>;

export const getUserSessionsInputSchema = z.object({
  user_id: z.number(),
  status: z.enum(['scheduled', 'active', 'completed', 'cancelled', 'failed']).optional(),
  limit: z.number().positive().max(100).optional(),
});

export type GetUserSessionsInput = z.infer<typeof getUserSessionsInputSchema>;