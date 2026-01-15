import mongoose from 'mongoose';

const MONGODB_URI = process.env.MONGODB_URI

const connectDB = async () => {
    try {
        // MongoDB connection URI

        // Connect to MongoDB
        await mongoose.connect(MONGODB_URI);

        console.log('MongoDB connected');
    } catch (error) {
        console.error('MongoDB connection error:');
        process.exit(1); // Exit process with failure
    }
};

export default connectDB;