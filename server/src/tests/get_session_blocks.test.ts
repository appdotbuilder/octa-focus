import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { usersTable, goalsTable, sessionsTable, sessionBlocksTable } from '../db/schema';
import { getSessionBlocks } from '../handlers/get_session_blocks';

describe('getSessionBlocks', () => {
  beforeEach(createDB);
  afterEach(resetDB);

  it('should return active blocks for active session', async () => {
    // Create test user
    const user = await db.insert(usersTable)
      .values({
        email: 'test@example.com',
        username: 'testuser'
      })
      .returning()
      .execute();

    // Create test goal
    const goal = await db.insert(goalsTable)
      .values({
        user_id: user[0].id,
        title: 'Test Goal',
        description: 'A test goal',
        category: 'physical'
      })
      .returning()
      .execute();

    // Create active session
    const session = await db.insert(sessionsTable)
      .values({
        user_id: user[0].id,
        goal_id: goal[0].id,
        title: 'Test Session',
        planned_duration: 30,
        status: 'active'
      })
      .returning()
      .execute();

    // Create session blocks
    const blocks = await db.insert(sessionBlocksTable)
      .values([
        {
          session_id: session[0].id,
          block_type: 'app',
          identifier: 'com.facebook.katana',
          is_active: true
        },
        {
          session_id: session[0].id,
          block_type: 'website',
          identifier: 'youtube.com',
          is_active: true
        }
      ])
      .returning()
      .execute();

    const result = await getSessionBlocks(session[0].id);

    expect(result).toHaveLength(2);
    expect(result[0].session_id).toEqual(session[0].id);
    expect(result[0].block_type).toEqual('app');
    expect(result[0].identifier).toEqual('com.facebook.katana');
    expect(result[0].is_active).toBe(true);
    expect(result[1].block_type).toEqual('website');
    expect(result[1].identifier).toEqual('youtube.com');
  });

  it('should return empty array for inactive session', async () => {
    // Create test user
    const user = await db.insert(usersTable)
      .values({
        email: 'test@example.com',
        username: 'testuser'
      })
      .returning()
      .execute();

    // Create test goal
    const goal = await db.insert(goalsTable)
      .values({
        user_id: user[0].id,
        title: 'Test Goal',
        description: 'A test goal',
        category: 'physical'
      })
      .returning()
      .execute();

    // Create scheduled session (not active)
    const session = await db.insert(sessionsTable)
      .values({
        user_id: user[0].id,
        goal_id: goal[0].id,
        title: 'Test Session',
        planned_duration: 30,
        status: 'scheduled'
      })
      .returning()
      .execute();

    // Create session blocks
    await db.insert(sessionBlocksTable)
      .values([
        {
          session_id: session[0].id,
          block_type: 'app',
          identifier: 'com.facebook.katana',
          is_active: true
        }
      ])
      .execute();

    const result = await getSessionBlocks(session[0].id);

    expect(result).toHaveLength(0);
  });

  it('should not return inactive blocks', async () => {
    // Create test user
    const user = await db.insert(usersTable)
      .values({
        email: 'test@example.com',
        username: 'testuser'
      })
      .returning()
      .execute();

    // Create test goal
    const goal = await db.insert(goalsTable)
      .values({
        user_id: user[0].id,
        title: 'Test Goal',
        description: 'A test goal',
        category: 'physical'
      })
      .returning()
      .execute();

    // Create active session
    const session = await db.insert(sessionsTable)
      .values({
        user_id: user[0].id,
        goal_id: goal[0].id,
        title: 'Test Session',
        planned_duration: 30,
        status: 'active'
      })
      .returning()
      .execute();

    // Create blocks with mixed active status
    await db.insert(sessionBlocksTable)
      .values([
        {
          session_id: session[0].id,
          block_type: 'app',
          identifier: 'com.facebook.katana',
          is_active: true
        },
        {
          session_id: session[0].id,
          block_type: 'website',
          identifier: 'youtube.com',
          is_active: false
        }
      ])
      .execute();

    const result = await getSessionBlocks(session[0].id);

    expect(result).toHaveLength(1);
    expect(result[0].identifier).toEqual('com.facebook.katana');
    expect(result[0].is_active).toBe(true);
  });

  it('should return empty array for non-existent session', async () => {
    const result = await getSessionBlocks(999);
    expect(result).toHaveLength(0);
  });

  it('should handle completed session correctly', async () => {
    // Create test user
    const user = await db.insert(usersTable)
      .values({
        email: 'test@example.com',
        username: 'testuser'
      })
      .returning()
      .execute();

    // Create test goal
    const goal = await db.insert(goalsTable)
      .values({
        user_id: user[0].id,
        title: 'Test Goal',
        description: 'A test goal',
        category: 'physical'
      })
      .returning()
      .execute();

    // Create completed session
    const session = await db.insert(sessionsTable)
      .values({
        user_id: user[0].id,
        goal_id: goal[0].id,
        title: 'Test Session',
        planned_duration: 30,
        status: 'completed'
      })
      .returning()
      .execute();

    // Create session blocks
    await db.insert(sessionBlocksTable)
      .values([
        {
          session_id: session[0].id,
          block_type: 'app',
          identifier: 'com.instagram.android',
          is_active: true
        }
      ])
      .execute();

    const result = await getSessionBlocks(session[0].id);

    // Should return empty array since session is not active
    expect(result).toHaveLength(0);
  });

  it('should handle multiple block types correctly', async () => {
    // Create test user
    const user = await db.insert(usersTable)
      .values({
        email: 'test@example.com',
        username: 'testuser'
      })
      .returning()
      .execute();

    // Create test goal
    const goal = await db.insert(goalsTable)
      .values({
        user_id: user[0].id,
        title: 'Test Goal',
        description: 'A test goal',
        category: 'mental'
      })
      .returning()
      .execute();

    // Create active session
    const session = await db.insert(sessionsTable)
      .values({
        user_id: user[0].id,
        goal_id: goal[0].id,
        title: 'Meditation Session',
        planned_duration: 20,
        status: 'active'
      })
      .returning()
      .execute();

    // Create diverse blocks
    await db.insert(sessionBlocksTable)
      .values([
        {
          session_id: session[0].id,
          block_type: 'app',
          identifier: 'com.twitter.android',
          is_active: true
        },
        {
          session_id: session[0].id,
          block_type: 'app',
          identifier: 'com.snapchat.android',
          is_active: true
        },
        {
          session_id: session[0].id,
          block_type: 'website',
          identifier: 'reddit.com',
          is_active: true
        },
        {
          session_id: session[0].id,
          block_type: 'website',
          identifier: 'facebook.com',
          is_active: true
        }
      ])
      .execute();

    const result = await getSessionBlocks(session[0].id);

    expect(result).toHaveLength(4);
    
    // Check that we have both app and website blocks
    const appBlocks = result.filter(block => block.block_type === 'app');
    const websiteBlocks = result.filter(block => block.block_type === 'website');
    
    expect(appBlocks).toHaveLength(2);
    expect(websiteBlocks).toHaveLength(2);
    
    // Verify all blocks belong to the correct session
    result.forEach(block => {
      expect(block.session_id).toEqual(session[0].id);
      expect(block.is_active).toBe(true);
      expect(block.created_at).toBeInstanceOf(Date);
    });
  });
});