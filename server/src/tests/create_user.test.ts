import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { usersTable } from '../db/schema';
import { type CreateUserInput } from '../schema';
import { createUser } from '../handlers/create_user';
import { eq } from 'drizzle-orm';

// Test input data
const testInput: CreateUserInput = {
  email: 'test@example.com',
  username: 'testuser'
};

const secondUserInput: CreateUserInput = {
  email: 'test2@example.com',
  username: 'testuser2'
};

describe('createUser', () => {
  beforeEach(createDB);
  afterEach(resetDB);

  it('should create a user with valid input', async () => {
    const result = await createUser(testInput);

    // Validate returned user object
    expect(result.email).toEqual('test@example.com');
    expect(result.username).toEqual('testuser');
    expect(result.id).toBeDefined();
    expect(typeof result.id).toBe('number');
    expect(result.created_at).toBeInstanceOf(Date);
    expect(result.updated_at).toBeInstanceOf(Date);
  });

  it('should save user to database', async () => {
    const result = await createUser(testInput);

    // Verify user exists in database
    const users = await db.select()
      .from(usersTable)
      .where(eq(usersTable.id, result.id))
      .execute();

    expect(users).toHaveLength(1);
    expect(users[0].email).toEqual('test@example.com');
    expect(users[0].username).toEqual('testuser');
    expect(users[0].created_at).toBeInstanceOf(Date);
    expect(users[0].updated_at).toBeInstanceOf(Date);
  });

  it('should create multiple users with different emails and usernames', async () => {
    const user1 = await createUser(testInput);
    const user2 = await createUser(secondUserInput);

    expect(user1.id).not.toEqual(user2.id);
    expect(user1.email).toEqual('test@example.com');
    expect(user2.email).toEqual('test2@example.com');
    expect(user1.username).toEqual('testuser');
    expect(user2.username).toEqual('testuser2');
  });

  it('should enforce email uniqueness', async () => {
    // Create first user
    await createUser(testInput);

    // Try to create another user with the same email
    const duplicateEmailInput: CreateUserInput = {
      email: 'test@example.com', // Same email
      username: 'different_username'
    };

    await expect(createUser(duplicateEmailInput)).rejects.toThrow(/duplicate key value violates unique constraint/i);
  });

  it('should enforce username uniqueness', async () => {
    // Create first user
    await createUser(testInput);

    // Try to create another user with the same username
    const duplicateUsernameInput: CreateUserInput = {
      email: 'different@example.com',
      username: 'testuser' // Same username
    };

    await expect(createUser(duplicateUsernameInput)).rejects.toThrow(/duplicate key value violates unique constraint/i);
  });

  it('should handle special characters in email and username', async () => {
    const specialInput: CreateUserInput = {
      email: 'user+tag@sub-domain.co.uk',
      username: 'user_name-123'
    };

    const result = await createUser(specialInput);

    expect(result.email).toEqual('user+tag@sub-domain.co.uk');
    expect(result.username).toEqual('user_name-123');
  });

  it('should set created_at and updated_at timestamps', async () => {
    const beforeCreation = new Date();
    const result = await createUser(testInput);
    const afterCreation = new Date();

    expect(result.created_at).toBeInstanceOf(Date);
    expect(result.updated_at).toBeInstanceOf(Date);
    expect(result.created_at.getTime()).toBeGreaterThanOrEqual(beforeCreation.getTime());
    expect(result.created_at.getTime()).toBeLessThanOrEqual(afterCreation.getTime());
    expect(result.updated_at.getTime()).toBeGreaterThanOrEqual(beforeCreation.getTime());
    expect(result.updated_at.getTime()).toBeLessThanOrEqual(afterCreation.getTime());
  });
});