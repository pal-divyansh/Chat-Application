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
  senderId!: string;

  @prop({ type: String, required: true })
  receiverId!: string;

  @prop({ type: String, required: true })
  encryptedContent!: string;

  @prop({ type: Boolean, default: false })
  isRead?: boolean;

  @prop({ type: Date, default: Date.now })
  createdAt?: Date;

  @prop({ type: Date, default: Date.now })
  updatedAt?: Date;
}

// Create models
export const UserModel = getModelForClass(UserSchema);
export const MessageModel = getModelForClass(MessageSchema);

// Schema validations
export const insertUserSchema = z.object({
  username: z.string().min(2, "Username must be at least 2 characters"),
  password: z.string().min(6, "Password must be at least 6 characters"),
  firstName: z.string().min(1, "First name is required"),
  lastName: z.string().min(1, "Last name is required"),
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

export const userValidationSchema = z.object({
  username: z.string().min(2, "Username must be at least 2 characters"),
  password: z.string().min(6, "Password must be at least 6 characters"),
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  profileImageUrl: z.string().optional(),
  bio: z.string().optional(),
  status: z.string().default('online')
});

export const insertMessageSchema = z.object({
  chatId: z.string(),
  senderId: z.string(),
  content: z.string().min(1, "Message content is required"),
  isRead: z.boolean().default(false)
});

export const messageValidationSchema = z.object({
  chatId: z.string(),
  senderId: z.string(),
  content: z.string(),
  isRead: z.boolean().default(false)
});

// Export types
export type User = InstanceType<typeof UserModel>;
// Define a clean Message type for the client
export interface Message {
  _id?: string; // Use string for client-side ID representation
  chatId: string;
  sender: {
    _id: string;
    username: string;
    profileImageUrl?: string;
  };
  content: string; // Decrypted content for client
  isRead?: boolean;
  createdAt?: Date | string; // Allow Date or string for flexibility
  updatedAt?: Date | string; // Allow Date or string for flexibility
}

export type UpsertUser = z.infer<typeof userValidationSchema>;
// For backward compatibility - update if still used elsewhere with old structure
// export type InsertMessage = Omit<z.infer<typeof insertMessageSchema>, '_id' | 'createdAt' | 'updatedAt'>;
export type InsertMessage = z.infer<typeof insertMessageSchema>;
export type UpdateUser = Partial<Omit<UpsertUser, 'username' | 'password'>>;
