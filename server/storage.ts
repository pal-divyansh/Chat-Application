import { UserModel, MessageModel, type User, type UpsertUser, type InsertMessage, type Message, type UpdateUser } from "@shared/schema";
import mongoose from 'mongoose';
import { decrypt } from '../client/src/lib/encryption';

export class DatabaseStorage {
  // User operations
  async getUser(id: string): Promise<User | null> {
    if (!mongoose.Types.ObjectId.isValid(id)) return null;
    return await UserModel.findById(id).lean().exec();
  }

  async getUserByUsername(username: string): Promise<User | null> {
    return await UserModel.findOne({ username }).lean().exec();
  }

  async createUser(userData: UpsertUser): Promise<User> {
    const user = new UserModel(userData);
    user._id = new mongoose.Types.ObjectId();
    const savedUser = await user.save();
    return savedUser.toObject();
  }

  async updateUser(id: string, updates: UpdateUser): Promise<User | null> {
    if (!mongoose.Types.ObjectId.isValid(id)) return null;
    return await UserModel.findByIdAndUpdate(
      id,
      { ...updates, updatedAt: new Date() },
      { new: true }
    ).lean().exec();
  }

  async getAllUsers(excludeId?: string): Promise<User[]> {
    const query = excludeId ? UserModel.find({ _id: { $ne: excludeId } }) : UserModel.find();
    return await query.lean().exec();
  }

  // Message operations
  async createMessage(messageData: InsertMessage): Promise<Message> {
    const newMessage = new MessageModel({
      _id: new mongoose.Types.ObjectId(),
      senderId: messageData.senderId,
      receiverId: messageData.receiverId,
      encryptedContent: messageData.content, // The content is already encrypted when it reaches this point
      isRead: messageData.isRead
    });
    return await newMessage.save();
  }

  async getMessagesBetweenUsers(userId1: string, userId2: string): Promise<Message[]> {
    const messages = await MessageModel.find({
      $or: [
        { senderId: userId1, receiverId: userId2 },
        { senderId: userId2, receiverId: userId1 }
      ]
    }).sort({ createdAt: 1 }).lean().exec();

    return messages.map(message => ({
      ...message,
      content: decrypt(message.encryptedContent)
    }));
  }

  async markMessagesAsRead(senderId: string, receiverId: string): Promise<void> {
    await MessageModel.updateMany(
      {
        senderId,
        receiverId,
        isRead: false
      },
      { $set: { isRead: true } }
    ).exec();
  }

  async getUnreadMessageCount(userId: string, fromUserId: string): Promise<number> {
    return await MessageModel.countDocuments({
      senderId: fromUserId,
      receiverId: userId,
      isRead: false
    }).exec();
  }

  async getLastMessageBetweenUsers(userId1: string, userId2: string): Promise<Message | null> {
    return await MessageModel.findOne({
      $or: [
        { senderId: userId1, receiverId: userId2 },
        { senderId: userId2, receiverId: userId1 }
      ]
    }).sort({ createdAt: -1 }).lean().exec();
  }

  async searchUsers(query: string, excludeId: string): Promise<User[]> {
    const searchQuery = {
      _id: { $ne: excludeId },
      $or: [
        { username: { $regex: query, $options: 'i' } },
        { firstName: { $regex: query, $options: 'i' } },
        { lastName: { $regex: query, $options: 'i' } }
      ]
    };
    return await UserModel.find(searchQuery).lean().exec();
  }

  async getUserChats(userId: string): Promise<Array<{ user: User; lastMessage: Message | null }>> {
    // Get all unique user IDs that the current user has chatted with
    const userMessages = await MessageModel.find({
      $or: [
        { senderId: userId },
        { receiverId: userId }
      ]
    }).lean().exec();

    const chatUserIds = new Set<string>();
    userMessages.forEach(msg => {
      const otherUserId = msg.senderId.toString() === userId ? 
        msg.receiverId.toString() : 
        msg.senderId.toString();
      if (otherUserId) {
        chatUserIds.add(otherUserId);
      }
    });

    // Get user details and their last message
    const chats = await Promise.all(
      Array.from(chatUserIds).map(async (otherUserId) => {
        const user = await this.getUser(otherUserId);
        if (!user) return null;

        const lastMessage = await this.getLastMessageBetweenUsers(userId, otherUserId);
        return { user, lastMessage };
      })
    );

    return chats.filter((chat): chat is { user: User; lastMessage: Message | null } => chat !== null);
  }

  async deleteMessage(messageId: string, userId: string): Promise<boolean> {
    if (!mongoose.Types.ObjectId.isValid(messageId)) return false;
    
    const result = await MessageModel.deleteOne({
      _id: messageId,
      $or: [
        { senderId: userId },
        { receiverId: userId }
      ]
    }).exec();
    
    return result.deletedCount > 0;
  }

  // Add function to delete multiple messages
  async deleteMessages(messageIds: string[], userId: string): Promise<number> {
    if (messageIds.length === 0) return 0;

    // Ensure all IDs are valid ObjectIds (optional but good practice)
    const validObjectIds = messageIds.filter(id => mongoose.Types.ObjectId.isValid(id));
    
    if (validObjectIds.length === 0) return 0; // No valid IDs to delete

    const result = await MessageModel.deleteMany({
      _id: { $in: validObjectIds },
      // Optional: Only allow deletion if the user is either sender or receiver of ALL messages
      // For simpler implementation, we'll allow deletion if user is sender/receiver of ANY of the messages.
      // A more robust check might involve iterating or using aggregation.
      $or: [
        { senderId: userId },
        { receiverId: userId }
      ]
    }).exec();
    
    return result.deletedCount;
  }

  async updateUserStatus(userId: string, status: string): Promise<void> {
    if (!mongoose.Types.ObjectId.isValid(userId)) return;
    await UserModel.findByIdAndUpdate(userId, { 
      status,
      updatedAt: new Date() 
    }).exec();
  }
}

export const storage = new DatabaseStorage();
