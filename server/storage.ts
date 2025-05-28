import { UserModel, MessageModel, type User, type UpsertUser, type InsertMessage, type Message, type UpdateUser } from "@shared/schema";
import mongoose from 'mongoose';
import { decrypt } from '../client/src/lib/encryption';
import { User } from '@shared/schema'; // Ensure User type is imported if needed

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

  // Chat operations

  // Message operations
  async createMessage(messageData: { chatId: string; senderId: string; content: string; isRead: boolean }): Promise<Message> {
    console.log('[Storage] createMessage called with:', messageData);
    
    try {
      // Derive receiverId from chatId and senderId
      const userIds = messageData.chatId.split('_');
      const receiverId = userIds.find(id => id !== messageData.senderId);

      if (!receiverId) {
        throw new Error('Could not derive receiverId from chatId');
      }

      const newMessage = new MessageModel({
        chatId: messageData.chatId,
        senderId: messageData.senderId, // Set senderId
        receiverId: receiverId, // Set derived receiverId
        encryptedContent: messageData.content, // Set encrypted content
        isRead: messageData.isRead
      });
      
      console.log('[Storage] New MessageModel instance created:', newMessage);

      // Save the message
      console.log('[Storage] Attempting to save newMessage...', newMessage);
      console.log('[Storage] Values before save - senderId:', newMessage.senderId);
      console.log('[Storage] Values before save - receiverId:', newMessage.receiverId);
      console.log('[Storage] Values before save - encryptedContent:', newMessage.encryptedContent);
      const savedMessage = await newMessage.save();
      console.log('[Storage] newMessage saved successfully:', savedMessage);
      
      // Populate sender details for the returned message object
      console.log('[Storage] Populating sender details...');
      // Populate sender as the client expects a 'sender' object
      const populatedMessage = await savedMessage.populate('senderId', 'username profileImageUrl');
      console.log('[Storage] Sender details populated.', populatedMessage);
      
      // Return the populated and lean version to match previous return types if necessary
      const result = populatedMessage.toObject();
      // Ensure the client-side 'content' field is the decrypted content for immediate display
      result.content = decrypt(result.encryptedContent); 
      console.log('[Storage] createMessage returning:', result);
      return result;
    } catch (error) {
      console.error('[Storage] Error in createMessage:', error);
      throw error; // Re-throw the error so the caller can handle it
    }
  }

  async getMessagesByChatId(chatId: string): Promise<Message[]> {
    // Find messages with the given chatId and sort by creation date
    const messages = await MessageModel.find({ chatId })
      .sort({ createdAt: 1 })
      .populate('sender', 'username profileImageUrl') // Populate sender details
      .lean()
      .exec();

    // Decrypt content for all messages
    return messages.map(message => ({
      ...message,
      content: decrypt(message.content) // Decrypt the content field
    }));
  }

  async markMessagesInChatAsRead(chatId: string, receiverId: string): Promise<void> {
    // Mark messages as read in a specific chat for a specific receiver
    await MessageModel.updateMany(
      {
        chatId: chatId,
        sender: { $ne: receiverId }, // Only mark messages sent BY others
        readBy: { $ne: receiverId } // Only mark if not already read by this receiver
      },
      { $addToSet: { readBy: receiverId } } // Add receiverId to readBy array
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
