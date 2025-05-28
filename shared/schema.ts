import { prop, getModelForClass, modelOptions, Ref } from '@typegoose/typegoose';
import { Types } from 'mongoose';
import { z } from 'zod';

// User Schema
@modelOptions({ schemaOptions: { timestamps: true } })
class UserSchema {
  @prop({ type: () => Types.ObjectId })
  _id!: Types.ObjectId;

  @prop({ type: String, required: true, unique: true })
  username!: string;

  @prop({ type: String, required: true })
  password!: string;

  @prop({ type: String, required: false })
  firstName?: string;

  @prop({ type: String, required: false })
  lastName?: string;

  @prop({ type: String, required: false })
  profileImageUrl?: string;

  @prop({ type: String, required: false })
  bio?: string;

  @prop({ type: String, default: 'online', enum: ['online', 'offline', 'away'] })
  status?: string;
}

// Message Schema
@modelOptions({ schemaOptions: { timestamps: true } })
class MessageSchema {
  @prop({ type: () => Types.ObjectId })
  _id!: Types.ObjectId;

  @prop({ type: String, required: true })
  chatId!: string;

  @prop({ type: String, required: true })
  senderId!: string;

  @prop({ type: String, required: true })
  content!: string;

  @prop({ type: Boolean, default: false })
  isRead!: boolean;

  @prop({ type: Date, default: Date.now })
  createdAt!: Date;

  @prop({ type: Date, default: Date.now })
  updatedAt!: Date;
}

// Create models
export const UserModel = getModelForClass(UserSchema);
export const MessageModel = getModelForClass(MessageSchema);

// Schema validations
export const insertUserSchema = z.object({
  username: z.string().min(2, "Username must be at least 2 characters"),
  password: z.string().min(6, "Password must be at least 6 characters"),
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  profileImageUrl: z.string().optional(),
  bio: z.string().optional(),
  status: z.string().default('online')
});

export const updateUserSchema = z.object({
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  profileImageUrl: z.string().optional(),
  bio: z.string().optional(),
  status: z.string().optional()
});

export const insertMessageSchema = z.object({
  chatId: z.string(),
  senderId: z.string(),
  content: z.string().min(1, "Message content is required"),
  isRead: z.boolean().default(false)
});

// Export types
export interface User {
  _id: string;
  username: string;
  firstName?: string;
  lastName?: string;
  profileImageUrl?: string;
  bio?: string;
  status?: 'online' | 'offline' | 'away';
  createdAt?: Date;
  updatedAt?: Date;
}

export interface Message {
  _id: string;
  chatId: string;
  senderId: string;
  content: string;
  isRead: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface MessageWithUser extends Message {
  sender: User;
}

export interface Chat {
  _id: string;
  participants: string[];
  lastMessage?: Message;
  createdAt: Date;
  updatedAt: Date;
}

export interface ChatWithUser extends Chat {
  otherUser: User;
}

// Type exports for API
export type UpsertUser = z.infer<typeof insertUserSchema>;
export type UpdateUser = z.infer<typeof updateUserSchema>;
export type InsertMessage = z.infer<typeof insertMessageSchema>;
