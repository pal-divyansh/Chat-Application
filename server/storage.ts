import {
  users,
  messages,
  type User,
  type UpsertUser,
  type InsertMessage,
  type Message,
  type UpdateUser,
} from "@shared/schema";
import { db } from "./db";
import { eq, or, and, desc, not } from "drizzle-orm";

// Interface for storage operations
export interface IStorage {
  // User operations
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: UpsertUser): Promise<User>;
  updateUser(id: string, updates: UpdateUser): Promise<User | undefined>;
  getAllUsers(excludeId?: string): Promise<User[]>;
  
  // Message operations
  createMessage(message: InsertMessage, encryptedContent: string): Promise<Message>;
  getMessagesBetweenUsers(userId1: string, userId2: string): Promise<Message[]>;
  markMessagesAsRead(senderId: string, receiverId: string): Promise<void>;
  getUnreadMessageCount(userId: string, fromUserId: string): Promise<number>;
  getLastMessageBetweenUsers(userId1: string, userId2: string): Promise<Message | undefined>;
}

export class DatabaseStorage implements IStorage {
  // User operations

  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.username, username));
    return user;
  }

  async createUser(userData: UpsertUser): Promise<User> {
    const [user] = await db
      .insert(users)
      .values(userData)
      .returning();
    return user;
  }

  async updateUser(id: string, updates: UpdateUser): Promise<User | undefined> {
    const [user] = await db
      .update(users)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(users.id, id))
      .returning();
    return user;
  }

  async getAllUsers(excludeId?: string): Promise<User[]> {
    if (excludeId) {
      return await db.select().from(users).where(not(eq(users.id, excludeId)));
    }
    return await db.select().from(users);
  }

  // Message operations
  async createMessage(message: InsertMessage, encryptedContent: string): Promise<Message> {
    const [newMessage] = await db
      .insert(messages)
      .values({
        ...message,
        encryptedContent,
        timestamp: new Date(),
      })
      .returning();
    return newMessage;
  }

  async getMessagesBetweenUsers(userId1: string, userId2: string): Promise<Message[]> {
    return await db
      .select()
      .from(messages)
      .where(
        or(
          and(eq(messages.senderId, userId1), eq(messages.receiverId, userId2)),
          and(eq(messages.senderId, userId2), eq(messages.receiverId, userId1))
        )
      )
      .orderBy(messages.timestamp);
  }

  async markMessagesAsRead(senderId: string, receiverId: string): Promise<void> {
    await db
      .update(messages)
      .set({ isRead: true })
      .where(
        and(
          eq(messages.senderId, senderId),
          eq(messages.receiverId, receiverId),
          eq(messages.isRead, false)
        )
      );
  }

  async getUnreadMessageCount(userId: string, fromUserId: string): Promise<number> {
    const result = await db
      .select({ count: messages.id })
      .from(messages)
      .where(
        and(
          eq(messages.receiverId, userId),
          eq(messages.senderId, fromUserId),
          eq(messages.isRead, false)
        )
      );
    return result.length;
  }

  async getLastMessageBetweenUsers(userId1: string, userId2: string): Promise<Message | undefined> {
    const [lastMessage] = await db
      .select()
      .from(messages)
      .where(
        or(
          and(eq(messages.senderId, userId1), eq(messages.receiverId, userId2)),
          and(eq(messages.senderId, userId2), eq(messages.receiverId, userId1))
        )
      )
      .orderBy(desc(messages.timestamp))
      .limit(1);
    return lastMessage;
  }
}

export const storage = new DatabaseStorage();
