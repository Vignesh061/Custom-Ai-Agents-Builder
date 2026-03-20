import express from 'express';
import cors from 'cors';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { ObjectId } from 'mongodb';
import multer from 'multer';
import { connectDB, agentsCollection, memoryCollection, usersCollection, knowledgeBaseCollection } from './db.js';
import { generateAgentConfig } from './ai.js';
import { sendToSlack } from './integrations.js'; 

const upload = multer({ storage: multer.memoryStorage() });


const app = express();
const PORT = 5000;
const JWT_SECRET = "agentforge_hackathon_super_secret"; // The key to minting tokens

app.use(cors());
app.use(express.json());

// ==========================================
// 🔐 AUTHENTICATION ROUTES
// ==========================================

app.post('/api/auth/signup', async (req, res) => {
    try {
        const { name, email, password } = req.body;
        
        // 1. Check if user exists
        const existing = await usersCollection.findOne({ email });
        if (existing) return res.status(400).json({ error: "Email already in use." });

        // 2. Hash password & Save
        const hashedPassword = await bcrypt.hash(password, 10);
        const { insertedId } = await usersCollection.insertOne({ name, email, password: hashedPassword });

        // 3. Mint JWT Token
        const token = jwt.sign({ id: insertedId, name }, JWT_SECRET);
        res.json({ success: true, token, user: { id: insertedId, name } });
    } catch (err) {
        res.status(500).json({ error: "Signup failed." });
    }
});

app.post('/api/auth/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        
        const user = await usersCollection.findOne({ email });
        if (!user) return res.status(404).json({ error: "User not found." });

        const validPass = await bcrypt.compare(password, user.password);
        if (!validPass) return res.status(401).json({ error: "Invalid credentials." });

        const token = jwt.sign({ id: user._id, name: user.name }, JWT_SECRET);
        res.json({ success: true, token, user: { id: user._id, name: user.name } });
    } catch (err) {
        res.status(500).json({ error: "Login failed." });
    }
});

// ==========================================
// 🛡️ THE GATEKEEPER MIDDLEWARE
// ==========================================
// Any route using this function requires a valid login token
function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Extract token from "Bearer <token>"
    
    if (!token) return res.status(401).json({ error: "Access Denied. Please log in." });

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) return res.status(403).json({ error: "Invalid or expired token." });
        req.user = user; // Attach the user info to the request
        next(); // Let them pass
    });
}

// ==========================================
// 🚀 CORE APP ROUTES (Now Protected!)
// ==========================================

// GET ALL AGENTS (For the future Marketplace - Open to everyone)
app.get('/api/agents', async (req, res) => {
    const agents = await (await agentsCollection.find()).toArray();
    res.json({ success: true, agents: agents.sort((a, b) => new Date(b.created_at) - new Date(a.created_at)) });
});

// GET MY AGENTS (For the Sidebar - Requires Login)
app.get('/api/my-agents', authenticateToken, async (req, res) => {
    // Only fetch agents where creator_id matches the logged-in user
    const agents = await (await agentsCollection.find({ creator_id: req.user.id })).toArray();
    res.json({ success: true, agents: agents.sort((a, b) => new Date(b.created_at) - new Date(a.created_at)) });
});

// THE BUILDER ROUTE (Requires Login)
app.post('/api/build', authenticateToken, async (req, res) => {
    try {
        const { prompt } = req.body;
        if (!prompt) return res.status(400).json({ error: "Prompt is required" });

        const agentConfig = await generateAgentConfig(prompt);
        
        // Tag the agent with the user's ID so they own it!
        const newAgent = { 
            ...agentConfig, 
            creator_id: req.user.id, 
            creator_name: req.user.name,
            status: "active", 
            created_at: new Date().toISOString() 
        };

        await agentsCollection.insertOne(newAgent);
        res.json({ success: true, agent: newAgent });
    } catch (error) {
        res.status(500).json({ error: "Failed to build agent." });
    }
});

// 🧬 THE CLONE ROUTE (Marketplace Magic)
app.post('/api/clone', authenticateToken, async (req, res) => {
    try {
        const { agent_id } = req.body;
        
        // 1. Find the original agent in the global database
        const originalAgent = await agentsCollection.findOne({ _id: new ObjectId(agent_id) });
        if (!originalAgent) return res.status(404).json({ error: "Agent not found" });

        // 2. Strip the old ID and stamp it with the NEW user's ID
        const clonedAgent = {
            agent_name: `${originalAgent.agent_name} (Copy)`,
            task_description: originalAgent.task_description,
            required_tools: originalAgent.required_tools,
            output_format_rules: originalAgent.output_format_rules,
            creator_id: req.user.id,        // The person cloning it
            creator_name: req.user.name,    // Their name
            status: "active",
            created_at: new Date().toISOString()
        };

        // 3. Save it to their personal workspace
        await agentsCollection.insertOne(clonedAgent);
        res.json({ success: true, agent: clonedAgent });
        
    } catch (error) {
        console.error("Clone Error:", error);
        res.status(500).json({ error: "Failed to clone agent." });
    }
});

// 🗑️ THE DELETE ROUTE
app.delete('/api/agents/:id', authenticateToken, async (req, res) => {
    try {
        const agentId = req.params.id;

        // 1. Find the agent to verify ownership
        const agent = await agentsCollection.findOne({ _id: new ObjectId(agentId) });
        if (!agent) return res.status(404).json({ error: "Agent not found." });

        // 2. SECURITY CHECK: Ensure the logged-in user is the creator
        if (agent.creator_id !== req.user.id) {
            return res.status(403).json({ error: "Unauthorized to delete this agent." });
        }

        // 3. Delete from Atlas
        await agentsCollection.deleteOne({ _id: new ObjectId(agentId) });

        // (Optional) Clean up the agent's memory so it doesn't float around
        await memoryCollection.deleteMany({ agent_name: agent.agent_name });

        res.json({ success: true, message: "Agent deleted." });
    } catch (error) {
        console.error("Delete Error:", error);
        res.status(500).json({ error: "Failed to delete agent." });
    }
});

// ==========================================
// 📚 KNOWLEDGE BASE ROUTES
// ==========================================

// UPLOAD documents to an agent's Knowledge Base
app.post('/api/knowledge/upload', authenticateToken, upload.array('files'), async (req, res) => {
    try {
        const { agent_id } = req.body;
        if (!agent_id) return res.status(400).json({ error: "agent_id is required." });
        if (!req.files || req.files.length === 0) return res.status(400).json({ error: "No files uploaded." });

        // Verify agent exists and belongs to the user
        const agent = await agentsCollection.findOne({ _id: new ObjectId(agent_id) });
        if (!agent) return res.status(404).json({ error: "Agent not found." });
        if (agent.creator_id !== req.user.id) return res.status(403).json({ error: "Unauthorized." });

        // Import our vector tools
        const { chunkText, generateEmbedding } = await import('./vector.js');

        let totalChunks = 0;

        for (const file of req.files) {
            let fileText = '';

            if (file.mimetype === 'application/pdf') {
                const pdfModule = await import('pdf-extraction');
                const extractPdf = pdfModule.default || pdfModule;
                const pdfData = await extractPdf(file.buffer);
                fileText = pdfData.text;
            } else if (file.mimetype === 'text/plain') {
                fileText = file.buffer.toString('utf-8');
            } else {
                console.log(`⚠️ Skipping unsupported file: ${file.originalname}`);
                continue;
            }

            // Chunk the text
            const chunks = chunkText(fileText, 1000, 200);
            console.log(`📄 ${file.originalname}: ${chunks.length} chunks generated.`);

            // Embed each chunk and save to MongoDB
            for (let i = 0; i < chunks.length; i++) {
                console.log(`⚙️ Embedding chunk ${i + 1}/${chunks.length} from ${file.originalname}...`);
                const embedding = await generateEmbedding(chunks[i]);

                await knowledgeBaseCollection.insertOne({
                    agent_id: agent_id,
                    chunk_text: chunks[i],
                    embedding: embedding,
                    source_filename: file.originalname,
                    uploaded_at: new Date().toISOString()
                });
            }
            totalChunks += chunks.length;
        }

        console.log(`✅ Knowledge Base updated: ${totalChunks} total chunks stored.`);
        res.json({ success: true, message: `${totalChunks} chunks indexed from ${req.files.length} file(s).`, totalChunks });
    } catch (error) {
        console.error("Knowledge Upload Error:", error);
        res.status(500).json({ error: "Failed to process knowledge base upload." });
    }
});

// GET list of knowledge base files for an agent
app.get('/api/knowledge/:agent_id', authenticateToken, async (req, res) => {
    try {
        const { agent_id } = req.params;

        // Get unique filenames and their chunk counts
        const allChunks = await (await knowledgeBaseCollection.find({ agent_id })).toArray();
        
        const fileMap = {};
        allChunks.forEach(chunk => {
            if (!fileMap[chunk.source_filename]) {
                fileMap[chunk.source_filename] = { filename: chunk.source_filename, chunks: 0, uploaded_at: chunk.uploaded_at };
            }
            fileMap[chunk.source_filename].chunks++;
        });

        res.json({ success: true, files: Object.values(fileMap), totalChunks: allChunks.length });
    } catch (error) {
        console.error("Knowledge List Error:", error);
        res.status(500).json({ error: "Failed to retrieve knowledge base." });
    }
});

// DELETE a specific file from an agent's knowledge base
app.delete('/api/knowledge/:agent_id/:filename', authenticateToken, async (req, res) => {
    try {
        const { agent_id, filename } = req.params;
        const decodedFilename = decodeURIComponent(filename);

        const result = await knowledgeBaseCollection.deleteMany({ agent_id, source_filename: decodedFilename });
        console.log(`🗑️ Deleted ${result.deletedCount} chunks for "${decodedFilename}"`);

        res.json({ success: true, message: `Removed "${decodedFilename}" (${result.deletedCount} chunks deleted).` });
    } catch (error) {
        console.error("Knowledge Delete Error:", error);
        res.status(500).json({ error: "Failed to delete knowledge base file." });
    }
});

// THE RUNNER ROUTE (Requires Login)
// THE RUNNER ROUTE (Now with Multiple File Support!)
// Notice we changed `upload.single('file')` to `upload.array('files')`
app.post('/api/run', authenticateToken, upload.array('files'), async (req, res) => {
    try {
        // Since we might be sending a file, the frontend will send FormData instead of raw JSON
        const agent_name = req.body.agent_name;
        let input_data = req.body.input_data || "";

        let file_text = "";
        
        // 📄 FILE PARSING LOGIC
        if (req.files && req.files.length > 0) {
            console.log(`📁 Received ${req.files.length} files.`);
            
            for (const file of req.files) {
                console.log(`📄 Processing: ${file.originalname}`);

                if (file.mimetype === 'application/pdf') {
                    // 🛡️ THE MODERN FORK BYPASS
                    const pdfModule = await import('pdf-extraction');
                    const extractPdf = pdfModule.default || pdfModule; 
                    
                    const pdfData = await extractPdf(file.buffer);
                    file_text += `\n\n--- DOCUMENT: ${file.originalname} ---\n${pdfData.text}`;
                } 
                else if (file.mimetype === 'text/plain') {
                    const textContent = file.buffer.toString('utf-8');
                    file_text += `\n\n--- DOCUMENT: ${file.originalname} ---\n${textContent}`;
                } 
            }
        }

        // 🔍 Fetch Agent details earlier (Need it to set up RAG anchor)
        const agent = await agentsCollection.findOne({ agent_name: agent_name });
        if (!agent) return res.status(404).json({ error: "Agent not found" });

        // 📚 KNOWLEDGE BASE SEARCH (Persistent RAG — pre-stored embeddings)
        let kbContext = '';
        try {
            const { searchStoredKnowledge } = await import('./vector.js');
            const agentId = agent._id.toString();
            const searchAnchor = req.body.input_data || agent.task_description;
            const kbResults = await searchStoredKnowledge(searchAnchor, knowledgeBaseCollection, agentId, 3);
            if (kbResults.length > 0) {
                kbContext = `\n\n--- KNOWLEDGE BASE CONTEXT ---\n${kbResults.join('\n\n')}\n--- END KNOWLEDGE BASE ---\n`;
            }
        } catch (kbError) {
            console.error("⚠️ Knowledge Base search failed (non-fatal):", kbError.message);
        }

        // 🧠 RAG ENGINE KICKS IN (If a file was uploaded at runtime)
        if (file_text) {
            const documentLength = file_text.length;
            
            // If the document is massive (e.g., > 1500 chars), we trigger mathematical RAG chunking
            if (documentLength > 1500) {
                console.log(`📚 Massive document detected (${documentLength} chars). Activating RAG Engine...`);
                
                // Dynamically import vector logic
                const { chunkText, retrieveRelevantChunks } = await import('./vector.js');
                
                // 1. Chunk the document
                const chunks = chunkText(file_text, 1000, 200);
                
                // 2. Use the user's prompt as the mathematical anchor. If empty, use the agent's core task description!
                const searchAnchor = req.body.input_data || agent.task_description;
                
                // 3. Grab the 3 most relevant chunks
                const relevantChunks = await retrieveRelevantChunks(searchAnchor, chunks, 3);
                
                // 4. Inject ONLY the relevant chunks 
                input_data += `\n\n--- RELEVANT FILE EXCERPTS (Via RAG) ---\n${relevantChunks.join('\n\n[...skip...]\n\n')}`;
            } else {
                // For tiny files, just inject it normally
                console.log(`📝 Small document detected (${documentLength} chars). Normal injection.`);
                input_data += `\n\n--- EXTRACTED FILE CONTENT ---\n${file_text}`;
            }
        }

        if (!input_data.trim()) {
            return res.status(400).json({ error: "Please provide text or upload a file." });
        }

        // 🧠 Memory Context
        const memoryQuery = await (await memoryCollection.find({ agent_name })).toArray();
        const pastMemories = memoryQuery.slice(-2); 
        const memoryContext = pastMemories.map(m => `Old Input: ${m.input}\nOld Output: ${m.output}`).join('\n\n');

        const executionPrompt = `You are an AI agent named "${agent.agent_name}".
Your specific task is: "${agent.task_description}".

CRITICAL RULES:
1. You must execute your task ONLY on the "NEW INPUT" provided below.
2. YOU MUST FORMAT YOUR OUTPUT EXACTLY LIKE THIS: ${agent.output_format_rules || 'Keep it clear, professional, and concise.'}
3. Do NOT copy, repeat, or process the "PAST MEMORY". 
4. If a "KNOWLEDGE BASE CONTEXT" is provided, use it as reference material to assist your task.

${kbContext}
${memoryContext ? `--- PAST MEMORY (Do not process this again) ---\n${memoryContext}\n-----------------------------------------------\n` : ''}

--- NEW INPUT (Process this data) ---
${input_data}
-------------------------------------

Execute your task and format the output now:`;

        const response = await fetch('http://127.0.0.1:11434/api/generate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ model: 'mistral', stream: false, prompt: executionPrompt })
        });

        const data = await response.json();
        const aiOutput = data.response.trim();

        await memoryCollection.insertOne({
            agent_name: agent.agent_name,
            input: input_data.substring(0, 50) + '...',
            output: aiOutput,
            timestamp: new Date().toISOString()
        });

        res.json({ success: true, output: aiOutput });
    } catch (error) {
        console.error("Run Error:", error);
        res.status(500).json({ error: "Failed to run agent." });
    }
});


async function startServer() {
    await connectDB();
    app.listen(PORT, () => {
        console.log(`🚀 AgentForge Secure Server running on http://localhost:${PORT}`);
    });
}
startServer();