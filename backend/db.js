import { MongoClient } from 'mongodb';
import dotenv from 'dotenv';

// Load our secret .env file
dotenv.config();

const uri = process.env.MONGO_URI;

if (!uri) {
    console.error("🔴 CRITICAL ERROR: MONGO_URI is missing from your .env file!");
    process.exit(1);
}

const client = new MongoClient(uri);

// We will export these so server.js can use them exactly like before
export let agentsCollection;
export let memoryCollection;
export let usersCollection;
export let knowledgeBaseCollection;

export async function connectDB() {
    try {
        console.log("🟡 Connecting to MongoDB...");
        await client.connect();
        
        // Connect to our specific database
        const db = client.db('agentforge');
        
        // Link our collections
        agentsCollection = db.collection('agents');
        memoryCollection = db.collection('memory');
        usersCollection = db.collection('users');
        knowledgeBaseCollection = db.collection('knowledgeBase');

        console.log("🟢 MONGODB CONNECTED: The Global Marketplace is Live!");
        return true;
    } catch (error) {
        console.error("🔴 MONGODB CONNECTION FAILED. Is your local MongoDB server running?");
        console.error(error.message);
        process.exit(1); // Kill the server if the DB can't connect
    }
}