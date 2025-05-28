import { UserModel, MessageModel, type User, type Message, type InsertMessage, type UpdateUser } from "@shared/schema";
import mongoose from 'mongoose';

export class DatabaseStorage {
  // User operations
  async getUser(id: string): Promise<User | null> {
    if (!mongoose.Types.ObjectId.isValid(id)) return null;
    const user = await UserModel.findById(id).lean().exec();
    return user ? this.mapUserToClient(user) : null;
  }

  async getUserByUsername(username: string): Promise<User | null> {
    const user = await UserModel.findOne({ username }).lean().exec();
    return user ? this.mapUserToClient(user) : null;
  }

  async createUser(userData: Omit<User, '_id'>): Promise<User> {
    const user = new UserModel(userData);
    const savedUser = await user.save();
    return this.mapUserToClient(savedUser.toObject());
  }

  async updateUser(id: string, updates: UpdateUser): Promise<User | null> {
    if (!mongoose.Types.ObjectId.isValid(id)) return null;
    const user = await UserModel.findByIdAndUpdate(
      id,
      { ...updates, updatedAt: new Date() },
      { new: true }
    ).lean().exec();
    return user ? this.mapUserToClient(user) : null;
  }

  async getAllUsers(excludeId?: string): Promise<User[]> {
    const query = excludeId ? UserModel.find({ _id: { $ne: excludeId } }) : UserModel.find();
    const users = await query.lean().exec();
    return users.map(user => this.mapUserToClient(user));
  }

  // Message operations
  async createMessage(messageData: InsertMessage): Promise<Message> {
    const message = new MessageModel(messageData);
    const savedMessage = await message.save();
    return this.mapMessageToClient(savedMessage.toObject());
  }

  async getMessagesByChatId(chatId: string): Promise<Message[]> {
    const messages = await MessageModel.find({ chatId })
      .sort({ createdAt: 1 })
      .populate('senderId', 'username profileImageUrl')
      .lean()
      .exec();
    return messages.map(message => this.mapMessageToClient(message));
  }

  async markMessagesInChatAsRead(chatId: string, userId: string): Promise<void> {
    await MessageModel.updateMany(
      {
        chatId,
        senderId: { $ne: userId },
        isRead: false
      },
      { isRead: true }
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
    try {
      const message = await MessageModel.findOne({
        $or: [
          { senderId: userId1, chatId: { $regex: `.*${userId2}.*` } },
          { senderId: userId2, chatId: { $regex: `.*${userId1}.*` } }
        ]
      }).sort({ createdAt: -1 });
      
      return message ? this.mapMessageToClient(message) : null;
    } catch (error) {
      console.error('Error getting last message:', error);
      return null;
    }
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
    const users = await UserModel.find(searchQuery).lean().exec();
    return users.map(user => this.mapUserToClient(user));
  }

  async getUserChats(userId: string): Promise<Array<{ user: User; lastMessage: Message | null }>> {
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
      senderId: userId
    }).exec();
    
    return result.deletedCount > 0;
  }

  async deleteMessages(messageIds: string[], userId: string): Promise<number> {
    if (messageIds.length === 0) return 0;

    const validObjectIds = messageIds.filter(id => mongoose.Types.ObjectId.isValid(id));
    if (validObjectIds.length === 0) return 0;

    const result = await MessageModel.deleteMany({
      _id: { $in: validObjectIds },
      senderId: userId
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

  // Helper methods to map database objects to client types
  private mapUserToClient(user: any): User {
    return {
      _id: user._id.toString(),
      username: user.username,
      firstName: user.firstName,
      lastName: user.lastName,
      profileImageUrl: user.profileImageUrl,
      bio: user.bio,
      status: user.status,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt
    };
  }

  private mapMessageToClient(message: any): Message {
    return {
      _id: message._id.toString(),
      chatId: message.chatId,
      senderId: message.senderId.toString(),
      content: message.content,
      isRead: message.isRead,
      createdAt: message.createdAt,
      updatedAt: message.updatedAt
    };
  }
}

export const storage = new DatabaseStorage();
