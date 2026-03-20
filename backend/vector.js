// backend/vector.js
// A lightweight, completely in-memory Vector RAG Engine

/**
 * Splits a massive string of text into highly manageable chunks.
 * We include some mathematical overlap so we don't accidentally cut a sentence in half.
 */
export function chunkText(text, chunkSize = 1000, overlap = 200) {
    if (!text) return [];
    
    const chunks = [];
    let i = 0;
    while (i < text.length) {
        chunks.push(text.slice(i, i + chunkSize));
        i += chunkSize - overlap;
    }
    return chunks;
}

/**
 * Calls the local Ollama instance to generate an embedding for a specific string of text.
 * Requires the 'nomic-embed-text' model to be pulled!
 */
export async function generateEmbedding(text) {
    try {
        const response = await fetch('http://127.0.0.1:11434/api/embeddings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: 'nomic-embed-text',
                prompt: text
            })
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Ollama embedding model failed to respond (Status: ${response.status}). Body: ${errorText}`);
        }

        const data = await response.json();
        return data.embedding; // This is a massive array of floats [0.012, -0.443, ...]
    } catch (error) {
        if (error.name === 'TypeError' && error.message.includes('fetch failed')) {
            console.error("🔴 Vector Error: Connection to Ollama failed. Is Ollama running on http://127.0.0.1:11434?");
        } else {
            console.error("🔴 Vector Error:", error.message);
        }
        throw error;
    }
}

/**
 * Calculates the Cosine Similarity between two identical-length mathematical vectors.
 * Returns a score between -1 and 1. (1 is a perfect match).
 */
export function cosineSimilarity(vecA, vecB) {
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < vecA.length; i++) {
        dotProduct += vecA[i] * vecB[i];
        normA += vecA[i] ** 2;
        normB += vecB[i] ** 2;
    }

    if (normA === 0 || normB === 0) return 0;
    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * The core RAG function. Takes a user prompt, compares it mathematically to all document chunks,
 * and returns the top matches.
 */
export async function retrieveRelevantChunks(prompt, documentChunks, topK = 3) {
    // 1. Embed the user's prompt
    const promptEmbedding = await generateEmbedding(prompt);
    console.log(`🧠 Generated embedding for user prompt...`);

    // 2. We need to embed every single chunk of the uploaded document (this is the heavy lifting part)
    // We do it sequentially or in parallel batches to not overload Ollama
    const chunkEmbeddings = [];
    for (let i = 0; i < documentChunks.length; i++) {
        const chunk = documentChunks[i];
        console.log(`⚙️ Embedding document chunk ${i + 1}/${documentChunks.length}...`);
        const embedding = await generateEmbedding(chunk);
        chunkEmbeddings.push({ chunk, embedding });
    }

    // 3. Compute cosine similarity for each chunk against the prompt
    console.log(`🔎 Calculating mathematical relevance...`);
    const results = chunkEmbeddings.map(item => {
        const similarity = cosineSimilarity(promptEmbedding, item.embedding);
        return {
            chunk: item.chunk,
            similarity: similarity
        };
    });

    // 4. Sort by highest similarity first and grab the top results
    results.sort((a, b) => b.similarity - a.similarity);
    
    return results.slice(0, topK).map(res => res.chunk);
}

/**
 * Searches the PERSISTENT Knowledge Base stored in MongoDB.
 * This is the "fast path" — embeddings are already computed and saved.
 * We only need to embed the user's prompt and compare.
 */
export async function searchStoredKnowledge(prompt, knowledgeBaseCollection, agentId, topK = 3) {
    // 1. Get all stored chunks for this agent from MongoDB
    const storedChunks = await (await knowledgeBaseCollection.find({ agent_id: agentId })).toArray();
    
    if (storedChunks.length === 0) {
        console.log(`📭 No knowledge base found for this agent.`);
        return [];
    }

    console.log(`📚 Knowledge Base: Found ${storedChunks.length} stored chunks. Searching...`);

    // 2. Embed the user's prompt (this is the ONLY embedding call we need!)
    const promptEmbedding = await generateEmbedding(prompt);

    // 3. Run cosine similarity against all pre-stored embeddings
    const results = storedChunks.map(item => ({
        chunk: item.chunk_text,
        source: item.source_filename,
        similarity: cosineSimilarity(promptEmbedding, item.embedding)
    }));

    // 4. Sort by highest similarity and return top matches
    results.sort((a, b) => b.similarity - a.similarity);
    
    const topResults = results.slice(0, topK);
    topResults.forEach((r, i) => {
        console.log(`  🎯 Match ${i + 1}: ${r.source} (score: ${r.similarity.toFixed(4)})`);
    });

    return topResults.map(res => `[Source: ${res.source}]\n${res.chunk}`);
}
