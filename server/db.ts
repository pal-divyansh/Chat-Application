import mongoose from 'mongoose';

if (!process.env.MONGODB_URI) {
  throw new Error('MONGODB_URI must be defined in your .env file');
}

const MONGODB_URI = process.env.MONGODB_URI;

// Enable mongoose debug mode in development
mongoose.set('debug', process.env.NODE_ENV === 'development');

// Cache the connection to prevent multiple connections
export const db = mongoose.connection;

// Handle connection events
db.on('error', (error) => {
  console.error('MongoDB connection error:', error);
  process.exit(1);
});

db.once('open', () => {
  console.log('MongoDB connected successfully');
});

db.on('disconnected', () => {
  console.log('MongoDB disconnected');});

export const connectDB = async () => {
  if (mongoose.connection.readyState >= 1) {
    return; // Return if already connected
  }

  try {
    await mongoose.connect(MONGODB_URI, {
      serverSelectionTimeoutMS: 5000, // 5 seconds timeout
      socketTimeoutMS: 45000, // 45 seconds socket timeout
    });
  } catch (error) {
    console.error('MongoDB connection error:', error);
    process.exit(1);
  }
};

export * from '@shared/schema';