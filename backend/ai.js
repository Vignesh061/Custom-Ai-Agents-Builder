// backend/ai.js
export async function generateAgentConfig(userPrompt) {
    const systemPrompt = `You are a top-tier, no-code AI platform builder. A user will describe a task. 
    Extract the configuration and reply ONLY in valid JSON format like this: 
    {
        "agent_name": "Name", 
        "task_description": "What the agent does", 
        "required_tools": ["Tool1"],
        "output_format_rules": "Strict instructions on how the final output must look visually.",
        "accepts_files": true
    }
    
    CRITICAL RULES:
    1. For "required_tools", choose ONLY from: ["Slack", "Gmail", "Google Sheets", "Jira"].
    2. "accepts_files" MUST be a boolean (true/false). Set to TRUE *ONLY* if the user's description implies the agent needs to read documents, resumes, PDFs, or raw text files. Otherwise, set to FALSE.
    3. DO NOT use line breaks or newlines inside your string values. Keep all text on a single line.
    
    User request: "${userPrompt}"`;

    try {
        const response = await fetch('http://127.0.0.1:11434/api/generate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: 'mistral',
                stream: false,
                prompt: systemPrompt
            })
        });

        if (!response.ok) throw new Error("Ollama is not responding");

        const data = await response.json();
        let rawText = data.response.trim();

        // 🛡️ THE SANITIZER PIPELINE
        // 1. Strip out markdown code block wrappers if Mistral added them
        rawText = rawText.replace(/^```json/i, '').replace(/^```/, '').replace(/```$/, '').trim();
        
        // 2. Eradicate literal newlines, carriage returns, and tabs that break JSON.parse
        rawText = rawText.replace(/[\n\r]/g, ' ').replace(/\t/g, ' ');

        // 3. Find the first '{' and last '}' to extract ONLY the JSON object
        const startIndex = rawText.indexOf('{');
        const endIndex = rawText.lastIndexOf('}');
        
        if (startIndex === -1 || endIndex === -1) {
            throw new Error("LLM did not return a valid JSON object.");
        }
        
        const cleanJsonString = rawText.substring(startIndex, endIndex + 1);

        return JSON.parse(cleanJsonString);
        
    } catch (error) {
        console.error("🔴 AI Generation Error:", error.message);
        throw error;
    }
}