import { 
  serial, 
  text, 
  pgTable, 
  timestamp, 
  integer, 
  boolean, 
  real,
  pgEnum 
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

// Enums
export const goalCategoryEnum = pgEnum('goal_category', [
  'physical', 
  'mental', 
  'skill', 
  'habit', 
  'creative', 
  'social', 
  'spiritual', 
  'professional'
]);

export const sessionStatusEnum = pgEnum('session_status', [
  'scheduled', 
  'active', 
  'completed', 
  'cancelled', 
  'failed'
]);

export const blockTypeEnum = pgEnum('block_type', ['app', 'website']);

export const verificationTypeEnum = pgEnum('verification_type', [
  'video', 
  'photo', 
  'sensor', 
  'manual'
]);

export const verificationStatusEnum = pgEnum('verification_status', [
  'pending', 
  'verified', 
  'rejected', 
  'expired'
]);

// Users table
export const usersTable = pgTable('users', {
  id: serial('id').primaryKey(),
  email: text('email').notNull().unique(),
  username: text('username').notNull().unique(),
  created_at: timestamp('created_at').defaultNow().notNull(),
  updated_at: timestamp('updated_at').defaultNow().notNull(),
});

// Goals table
export const goalsTable = pgTable('goals', {
  id: serial('id').primaryKey(),
  user_id: integer('user_id').notNull().references(() => usersTable.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  description: text('description'),
  category: goalCategoryEnum('category').notNull(),
  target_value: real('target_value'), // Can be null for non-quantifiable goals
  target_unit: text('target_unit'), // e.g., 'reps', 'minutes', 'pages'
  is_active: boolean('is_active').default(true).notNull(),
  created_at: timestamp('created_at').defaultNow().notNull(),
  updated_at: timestamp('updated_at').defaultNow().notNull(),
});

// Milestones table
export const milestonesTable = pgTable('milestones', {
  id: serial('id').primaryKey(),
  goal_id: integer('goal_id').notNull().references(() => goalsTable.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  description: text('description'),
  target_value: real('target_value'),
  is_completed: boolean('is_completed').default(false).notNull(),
  completed_at: timestamp('completed_at'),
  created_at: timestamp('created_at').defaultNow().notNull(),
  updated_at: timestamp('updated_at').defaultNow().notNull(),
});

// Sessions table
export const sessionsTable = pgTable('sessions', {
  id: serial('id').primaryKey(),
  user_id: integer('user_id').notNull().references(() => usersTable.id, { onDelete: 'cascade' }),
  goal_id: integer('goal_id').notNull().references(() => goalsTable.id, { onDelete: 'cascade' }),
  milestone_id: integer('milestone_id').references(() => milestonesTable.id, { onDelete: 'set null' }),
  title: text('title').notNull(),
  planned_duration: integer('planned_duration').notNull(), // Duration in minutes
  actual_duration: integer('actual_duration'), // Actual duration in minutes
  status: sessionStatusEnum('status').default('scheduled').notNull(),
  started_at: timestamp('started_at'),
  completed_at: timestamp('completed_at'),
  created_at: timestamp('created_at').defaultNow().notNull(),
  updated_at: timestamp('updated_at').defaultNow().notNull(),
});

// Session blocks table (apps/websites to block during sessions)
export const sessionBlocksTable = pgTable('session_blocks', {
  id: serial('id').primaryKey(),
  session_id: integer('session_id').notNull().references(() => sessionsTable.id, { onDelete: 'cascade' }),
  block_type: blockTypeEnum('block_type').notNull(),
  identifier: text('identifier').notNull(), // App package name or website domain
  is_active: boolean('is_active').default(true).notNull(),
  created_at: timestamp('created_at').defaultNow().notNull(),
});

// Task verification table
export const taskVerificationsTable = pgTable('task_verifications', {
  id: serial('id').primaryKey(),
  session_id: integer('session_id').notNull().references(() => sessionsTable.id, { onDelete: 'cascade' }),
  verification_type: verificationTypeEnum('verification_type').notNull(),
  task_type: text('task_type').notNull(), // e.g., 'bodyweight_squats', 'pushups'
  expected_reps: integer('expected_reps'),
  verified_reps: integer('verified_reps'),
  confidence_score: real('confidence_score'), // AI confidence (0-1)
  proof_file_path: text('proof_file_path'), // Temporary file path
  verification_status: verificationStatusEnum('verification_status').default('pending').notNull(),
  verified_at: timestamp('verified_at'),
  expires_at: timestamp('expires_at').notNull(), // When proof file will be deleted
  created_at: timestamp('created_at').defaultNow().notNull(),
});

// User stats table (for leaderboard and progress tracking)
export const userStatsTable = pgTable('user_stats', {
  id: serial('id').primaryKey(),
  user_id: integer('user_id').notNull().references(() => usersTable.id, { onDelete: 'cascade' }),
  category: text('category').notNull(),
  total_sessions: integer('total_sessions').default(0).notNull(),
  completed_sessions: integer('completed_sessions').default(0).notNull(),
  total_duration: integer('total_duration').default(0).notNull(), // Total minutes
  streak_days: integer('streak_days').default(0).notNull(),
  last_activity: timestamp('last_activity'),
  leaderboard_score: real('leaderboard_score').default(0).notNull(), // Score with decay
  last_score_update: timestamp('last_score_update').defaultNow().notNull(),
  created_at: timestamp('created_at').defaultNow().notNull(),
  updated_at: timestamp('updated_at').defaultNow().notNull(),
});

// Relations
export const usersRelations = relations(usersTable, ({ many }) => ({
  goals: many(goalsTable),
  sessions: many(sessionsTable),
  stats: many(userStatsTable),
}));

export const goalsRelations = relations(goalsTable, ({ one, many }) => ({
  user: one(usersTable, {
    fields: [goalsTable.user_id],
    references: [usersTable.id],
  }),
  milestones: many(milestonesTable),
  sessions: many(sessionsTable),
}));

export const milestonesRelations = relations(milestonesTable, ({ one, many }) => ({
  goal: one(goalsTable, {
    fields: [milestonesTable.goal_id],
    references: [goalsTable.id],
  }),
  sessions: many(sessionsTable),
}));

export const sessionsRelations = relations(sessionsTable, ({ one, many }) => ({
  user: one(usersTable, {
    fields: [sessionsTable.user_id],
    references: [usersTable.id],
  }),
  goal: one(goalsTable, {
    fields: [sessionsTable.goal_id],
    references: [goalsTable.id],
  }),
  milestone: one(milestonesTable, {
    fields: [sessionsTable.milestone_id],
    references: [milestonesTable.id],
  }),
  blocks: many(sessionBlocksTable),
  verifications: many(taskVerificationsTable),
}));

export const sessionBlocksRelations = relations(sessionBlocksTable, ({ one }) => ({
  session: one(sessionsTable, {
    fields: [sessionBlocksTable.session_id],
    references: [sessionsTable.id],
  }),
}));

export const taskVerificationsRelations = relations(taskVerificationsTable, ({ one }) => ({
  session: one(sessionsTable, {
    fields: [taskVerificationsTable.session_id],
    references: [sessionsTable.id],
  }),
}));

export const userStatsRelations = relations(userStatsTable, ({ one }) => ({
  user: one(usersTable, {
    fields: [userStatsTable.user_id],
    references: [usersTable.id],
  }),
}));

// TypeScript types for the table schemas
export type User = typeof usersTable.$inferSelect;
export type NewUser = typeof usersTable.$inferInsert;

export type Goal = typeof goalsTable.$inferSelect;
export type NewGoal = typeof goalsTable.$inferInsert;

export type Milestone = typeof milestonesTable.$inferSelect;
export type NewMilestone = typeof milestonesTable.$inferInsert;

export type Session = typeof sessionsTable.$inferSelect;
export type NewSession = typeof sessionsTable.$inferInsert;

export type SessionBlock = typeof sessionBlocksTable.$inferSelect;
export type NewSessionBlock = typeof sessionBlocksTable.$inferInsert;

export type TaskVerification = typeof taskVerificationsTable.$inferSelect;
export type NewTaskVerification = typeof taskVerificationsTable.$inferInsert;

export type UserStats = typeof userStatsTable.$inferSelect;
export type NewUserStats = typeof userStatsTable.$inferInsert;

// Export all tables for proper query building
export const tables = {
  users: usersTable,
  goals: goalsTable,
  milestones: milestonesTable,
  sessions: sessionsTable,
  sessionBlocks: sessionBlocksTable,
  taskVerifications: taskVerificationsTable,
  userStats: userStatsTable,
};