const API_URL = 'http://localhost:5000/api';
let allAgents = []; 
let isLoginMode = true;
let currentTab = 'my-agents';

let currentAttachedFiles = []; // Track multiple files

// DOM Elements - Auth
const authView = document.getElementById('auth-view');
const appLayout = document.getElementById('app-layout');
const authForm = document.getElementById('auth-form');
const authName = document.getElementById('auth-name');
const authEmail = document.getElementById('auth-email');
const authPassword = document.getElementById('auth-password');
const authSubmitBtn = document.getElementById('auth-submit-btn');
const authToggleLink = document.getElementById('auth-toggle-link');
const authToggleText = document.getElementById('auth-toggle-text');
const authSubtitle = document.getElementById('auth-subtitle');
const authError = document.getElementById('auth-error');
const userGreeting = document.getElementById('user-greeting');
const logoutBtn = document.getElementById('logout-btn');

// DOM Elements - App
const agentList = document.getElementById('agent-list');
const newAgentBtn = document.getElementById('new-agent-btn');
const buildView = document.getElementById('build-view');
const runView = document.getElementById('run-view');
const activeAgentContainer = document.getElementById('active-agent-container');
const promptInput = document.getElementById('prompt-input');
const buildBtn = document.getElementById('build-btn');
const loadingState = document.getElementById('loading-state');

// DOM Elements - Tabs
const tabMyWorkspace = document.getElementById('tab-my-workspace');
const tabMarketplace = document.getElementById('tab-marketplace');

// ==========================================
// 🔐 AUTHENTICATION LOGIC
// ==========================================

function getAuthHeaders() {
    return {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${localStorage.getItem('agentforge_token')}`
    };
}

function checkAuth() {
    const token = localStorage.getItem('agentforge_token');
    const userName = localStorage.getItem('agentforge_user');
    
    if (token) {
        authView.classList.add('hidden');
        appLayout.classList.remove('hidden');
        userGreeting.innerText = `👋 Hi, ${userName}`;
        switchTab('my-agents'); // Default to personal workspace
    } else {
        authView.classList.remove('hidden');
        appLayout.classList.add('hidden');
    }
}

authToggleLink.onclick = (e) => {
    e.preventDefault();
    isLoginMode = !isLoginMode;
    authError.classList.add('hidden');
    
    if (isLoginMode) {
        authName.classList.add('hidden');
        authName.removeAttribute('required');
        authSubmitBtn.innerText = 'Sign In';
        authSubtitle.innerText = 'Sign in to your workspace';
        authToggleText.innerText = "Don't have an account?";
        authToggleLink.innerText = 'Create one';
    } else {
        authName.classList.remove('hidden');
        authName.setAttribute('required', 'true');
        authSubmitBtn.innerText = 'Create Account';
        authSubtitle.innerText = 'Start forging agents today';
        authToggleText.innerText = "Already have an account?";
        authToggleLink.innerText = 'Sign in';
    }
};

authForm.onsubmit = async (e) => {
    e.preventDefault();
    authError.classList.add('hidden');
    authSubmitBtn.innerText = 'Please wait...';

    const endpoint = isLoginMode ? '/auth/login' : '/auth/signup';
    const payload = {
        email: authEmail.value,
        password: authPassword.value,
        ...(isLoginMode ? {} : { name: authName.value })
    };

    try {
        const response = await fetch(`${API_URL}${endpoint}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const data = await response.json();

        if (data.success) {
            localStorage.setItem('agentforge_token', data.token);
            localStorage.setItem('agentforge_user', data.user.name);
            checkAuth();
        } else {
            authError.innerText = data.error;
            authError.classList.remove('hidden');
        }
    } catch (error) {
        authError.innerText = 'Server connection failed.';
        authError.classList.remove('hidden');
    } finally {
        authSubmitBtn.innerText = isLoginMode ? 'Sign In' : 'Create Account';
    }
};

logoutBtn.onclick = () => {
    localStorage.removeItem('agentforge_token');
    localStorage.removeItem('agentforge_user');
    checkAuth();
};

// ==========================================
// 🚀 TAB LOGIC (Marketplace vs Workspace)
// ==========================================

tabMyWorkspace.onclick = () => switchTab('my-agents');
tabMarketplace.onclick = () => switchTab('marketplace');

function switchTab(tabName) {
    currentTab = tabName;
    
    // UI Styling for active tab
    if (tabName === 'my-agents') {
        tabMyWorkspace.style.background = '#5e6ad2';
        tabMyWorkspace.style.color = '#fff';
        tabMarketplace.style.background = '#222';
        tabMarketplace.style.color = '#aaa';
    } else {
        tabMarketplace.style.background = '#5e6ad2';
        tabMarketplace.style.color = '#fff';
        tabMyWorkspace.style.background = '#222';
        tabMyWorkspace.style.color = '#aaa';
    }

    loadAgents(); // Fetch the right data based on tab
}

// ==========================================
// 🚀 APP LOGIC
// ==========================================

async function loadAgents() {
    try {
        // Fetch from the correct route based on the active tab!
        const endpoint = currentTab === 'my-agents' ? '/my-agents' : '/agents';
        const response = await fetch(`${API_URL}${endpoint}`, { headers: getAuthHeaders() });
        const data = await response.json();
        
        if (response.status === 401 || response.status === 403) return logoutBtn.click();

        if (data.success) {
            allAgents = data.agents;
            renderSidebar();
        }
    } catch (error) {
        console.error("Failed to load agents.");
    }
}

// 🎨 1. The Bulletproof Sidebar Renderer
function renderSidebar() {
    agentList.innerHTML = '';
    
    if (allAgents.length === 0) {
        const emptyMsg = currentTab === 'my-agents' ? 'No agents yet.<br>Build one!' : 'Marketplace is empty.';
        agentList.innerHTML = `<div style="color:#666; font-size:0.85rem; text-align:center; margin-top:20px;">${emptyMsg}</div>`;
        return;
    }

    allAgents.forEach(agent => {
        const item = document.createElement('div');
        item.className = 'sidebar-item';
        
        const textWrapper = document.createElement('div');
        textWrapper.style.flexGrow = "1";
        textWrapper.style.overflow = "hidden";
        textWrapper.style.textOverflow = "ellipsis";

        if (currentTab === 'marketplace') {
            textWrapper.innerHTML = `<div>${agent.agent_name}</div><div style="font-size:0.75rem; color:#666; margin-top:3px;">by ${agent.creator_name}</div>`;
        } else {
            textWrapper.innerText = agent.agent_name;
        }
        item.appendChild(textWrapper);

        if (currentTab === 'my-agents') {
            const deleteBtn = document.createElement('button');
            deleteBtn.className = 'delete-btn';
            deleteBtn.title = "Delete Agent";
            deleteBtn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>`;
            
            deleteBtn.onclick = (e) => deleteAgent(agent._id, e);
            item.appendChild(deleteBtn);
        }

        // THE FIX: Simple, clean click assignment. 
        // (The delete button's stopPropagation will prevent this from firing if the trash icon is clicked).
        item.onclick = () => selectAgent(agent, item);
        
        agentList.appendChild(item);
    });
}

// 🧠 2. The Crash-Proof Agent Selector
// 🧠 The Crash-Proof & Dynamic Agent Selector
function selectAgent(agent, element) {
    document.querySelectorAll('.sidebar-item').forEach(el => el.classList.remove('active'));
    if (element) element.classList.add('active');

    buildView.classList.add('hidden');
    runView.classList.remove('hidden');
    
    // Clear any old files hanging around
    currentAttachedFiles = []; 

    const tools = agent.required_tools || [];

    if (currentTab === 'marketplace') {
        activeAgentContainer.innerHTML = `
            <div class="agent-card">
                <div class="agent-header">
                    <div class="agent-title">${agent.agent_name}</div>
                    <div class="tool-badge">Created by ${agent.creator_name}</div>
                </div>
                <div class="agent-task">${agent.task_description}</div>
                <div class="run-section" style="text-align: center; padding: 30px;">
                    <p style="color: #aaa; margin-bottom: 20px;">Add this agent to your personal workspace to use it.</p>
                    <button class="run-btn" id="clone-btn" style="background: #28a745; max-width: 250px; margin: 0 auto;">Clone to My Workspace</button>
                </div>
            </div>
        `;
        document.getElementById('clone-btn').onclick = () => cloneAgent(agent._id, document.getElementById('clone-btn'));
    } else {
        const placeholderText = tools.includes('Slack') ? "Paste data to send to Slack..." : "Enter text prompt here...";
        
        // 🔮 DYNAMIC UI: Only build the Dropzone if the AI flagged it!
        const fileUploadHTML = agent.accepts_files ? `
            <label class="section-label">📎 Attach File <small class="zone-hint">— One-time input for this run only</small></label>
            <div class="file-drop-zone" id="drop-zone">
                <input type="file" id="file-input" class="file-input-hidden" accept=".txt,.pdf" multiple>
                <div id="drop-zone-text">📄 Drop a file to process now (not saved permanently)</div>
                <div id="file-preview-container"></div>
            </div>
        ` : '';

        activeAgentContainer.innerHTML = `
            <div class="agent-card">
                <div class="agent-header">
                    <div class="agent-title">${agent.agent_name}</div>
                    <div class="tool-badge">⟎ ${tools.join(', ') || 'Native Agent'}</div>
                </div>
                <div class="agent-task">${agent.task_description}</div>
                
                <!-- 📚 KNOWLEDGE BASE SECTION -->
                <div class="kb-section">
                    <div class="kb-header" onclick="toggleKBPanel()">
                        <span>📚 Knowledge Base <small class="kb-subtitle">— Permanent Reference Docs</small></span>
                        <span id="kb-badge" class="kb-badge">Loading...</span>
                        <span class="kb-toggle" id="kb-toggle-icon">▼</span>
                    </div>
                    <div id="kb-panel" class="kb-panel">
                        <p class="kb-description">Upload company handbooks, policies, guidelines, or any reference material here. These files are <strong>stored permanently</strong> — the agent will automatically search and reference them on <strong>every future run</strong>.</p>
                        <div class="kb-upload-zone" id="kb-drop-zone">
                            <input type="file" id="kb-file-input" class="file-input-hidden" accept=".txt,.pdf,.doc,.docx" multiple>
                            <div class="kb-upload-icon">📁</div>
                            <div class="kb-upload-text">Drag & drop reference documents here</div>
                            <div class="kb-upload-hint">Uploaded once, referenced forever · PDF, TXT, DOC</div>
                        </div>
                        <div id="kb-upload-status" class="hidden" style="color:#5e6ad2; font-size:0.8rem; margin:8px 0;">Uploading...</div>
                        <div id="kb-file-list" class="kb-file-list"></div>
                    </div>
                </div>

                <div class="run-section">
                    <label class="section-label">💬 Input Data</label>
                    <textarea id="run-input" placeholder="${placeholderText}"></textarea>
                    ${fileUploadHTML} <button class="run-btn" id="execute-btn">Run Agent</button>
                </div>
                <div class="output-box" id="run-output" style="display: none;"></div>
            </div>
        `;

        document.getElementById('execute-btn').onclick = () => executeAgent(agent);

        // 📚 Wire up Knowledge Base UI
        setupKnowledgeBase(agent);

        // 🖱️ Wire up the Drag & Drop mechanics if the zone exists
        if (agent.accepts_files) {
            setupDragAndDrop();
        }
    }
}

// 🖱️ Drag & Drop Handlers
function setupDragAndDrop() {
    const dropZone = document.getElementById('drop-zone');
    const fileInput = document.getElementById('file-input');
    const previewContainer = document.getElementById('file-preview-container');
    const dropText = document.getElementById('drop-zone-text');

    // Click to open file browser
    dropZone.onclick = () => fileInput.click();

    // Prevent default browser behavior (opening the file)
    dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropZone.classList.add('dragover');
    });

    dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragover'));

    dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropZone.classList.remove('dragover');
        if (e.dataTransfer.files.length) {
            handleFileSelection(Array.from(e.dataTransfer.files), dropText, previewContainer);
        }
    });

    // Handle standard click upload
    fileInput.addEventListener('change', (e) => {
        if (e.target.files.length) {
            handleFileSelection(Array.from(e.target.files), dropText, previewContainer);
        }
    });
}

function handleFileSelection(files, textEl, previewEl) {
    let validFiles = files.filter(f => f.type === "application/pdf" || f.type === "text/plain");
    
    if (validFiles.length < files.length) {
        alert("Some files were ignored. Only .pdf and .txt files are supported.");
    }
    
    if (validFiles.length === 0) return;

    currentAttachedFiles.push(...validFiles);
    textEl.style.display = 'none'; // Hide the "Drag & Drop" text
    
    renderFileBadges(previewEl, textEl.id);
}

function renderFileBadges(previewEl, textElId) {
    if (currentAttachedFiles.length === 0) {
        previewEl.innerHTML = '';
        document.getElementById(textElId).style.display = 'block';
        return;
    }

    previewEl.innerHTML = currentAttachedFiles.map((file, index) => `
        <div class="file-badge">
            <span>📎 ${file.name}</span>
            <button class="file-remove-btn" onclick="removeFile(event, ${index}, '${textElId}', '${previewEl.id}')">×</button>
        </div>
    `).join('');
}

// Ensure this function is attached to the window so the inline onclick can find it
window.removeFile = function(event, index, textElId, previewElId) {
    event.stopPropagation(); // Stop the click from opening the file browser again
    currentAttachedFiles.splice(index, 1);
    
    document.getElementById('file-input').value = ""; // Reset hidden input
    renderFileBadges(document.getElementById(previewElId), textElId);
};

// 🏃 The Execution Process (Now handles FormData!)
async function executeAgent(agent) {
    const inputData = document.getElementById('run-input').value;
    const outputBox = document.getElementById('run-output');
    const runBtn = document.getElementById('execute-btn');

    if (!inputData && currentAttachedFiles.length === 0) {
        alert("Please provide text instructions or upload files.");
        return;
    }

    runBtn.innerText = 'Running...';
    runBtn.disabled = true;
    outputBox.style.display = 'none';

    // 📦 Pack data into FormData (required for sending files)
    const formData = new FormData();
    formData.append('agent_name', agent.agent_name);
    formData.append('input_data', inputData);
    
    currentAttachedFiles.forEach(file => {
        formData.append('files', file); 
    });

    // 🛑 CRITICAL HACKATHON RULE: When using FormData, DO NOT set 'Content-Type'. 
    // The browser will automatically set it to 'multipart/form-data' with the correct boundary.
    const headers = {
        'Authorization': `Bearer ${localStorage.getItem('agentforge_token')}`
    };

    try {
        const response = await fetch(`${API_URL}/run`, {
            method: 'POST',
            headers: headers, 
            body: formData
        });
        const data = await response.json();
        
        if (data.success) {
            outputBox.innerHTML = marked.parse(data.output);
            outputBox.style.display = 'block';
        } else {
            outputBox.innerText = data.error || 'Execution failed.';
            outputBox.style.display = 'block';
        }
    } catch (error) {
        outputBox.innerText = 'Execution failed. Check connection.';
        outputBox.style.display = 'block';
    } finally {
        runBtn.innerText = 'Run Agent';
        runBtn.disabled = false;
    }
}


// 🧬 THE CLONE FUNCTION
async function cloneAgent(agentId, btnElement) {
    btnElement.innerText = 'Cloning...';
    btnElement.disabled = true;

    try {
        const response = await fetch(`${API_URL}/clone`, {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify({ agent_id: agentId })
        });
        const data = await response.json();

        if (data.success) {
            btnElement.innerText = 'Cloned!';
            btnElement.style.background = '#5e6ad2';
            
            // Switch back to workspace after 1 second to see the new agent
            setTimeout(() => {
                switchTab('my-agents');
                // Auto-select the newly cloned agent (it will be at the top)
                setTimeout(() => {
                    const firstItem = document.querySelector('.sidebar-item');
                    if(firstItem) firstItem.click();
                }, 300);
            }, 1000);
        } else {
            alert(data.error);
            btnElement.innerText = 'Clone Failed';
        }
    } catch (error) {
        alert("Failed to clone.");
        btnElement.innerText = 'Clone Agent';
        btnElement.disabled = false;
    }
}

newAgentBtn.onclick = () => {
    document.querySelectorAll('.sidebar-item').forEach(el => el.classList.remove('active'));
    runView.classList.add('hidden');
    buildView.classList.remove('hidden');
    promptInput.value = '';
    promptInput.focus();
};

buildBtn.onclick = async () => {
    const prompt = promptInput.value.trim();
    if (!prompt) return;

    promptInput.value = '';
    loadingState.classList.remove('hidden');

    try {
        const response = await fetch(`${API_URL}/build`, {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify({ prompt })
        });
        const data = await response.json();
        
        if (data.success) {
            switchTab('my-agents'); // Ensure we are in workspace
            setTimeout(() => {
                const firstItem = document.querySelector('.sidebar-item');
                if (firstItem) firstItem.click(); // Select the newest one
            }, 300);
        } else {
            alert(data.error || 'Build failed.');
        }
    } catch (error) {
        alert('Build failed. Check server console.');
    } finally {
        loadingState.classList.add('hidden');
    }
};

promptInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') buildBtn.click();
});



// 🗑️ THE DELETE LOGIC
async function deleteAgent(agentId, event) {
    event.stopPropagation(); // Stops the click from triggering the agent card opening

    // Optional: Add a quick confirmation so they don't accidentally delete a masterpiece
    if (!confirm("Are you sure you want to permanently delete this agent?")) return;

    const btn = event.currentTarget;
    btn.style.opacity = '0.5';
    btn.style.pointerEvents = 'none';

    try {
        const response = await fetch(`${API_URL}/agents/${agentId}`, {
            method: 'DELETE',
            headers: getAuthHeaders()
        });
        const data = await response.json();

        if (data.success) {
            // Remove from local memory immediately for snappy UI
            allAgents = allAgents.filter(a => a._id !== agentId);
            renderSidebar();

            // Kick them back to the Build View so they aren't looking at a dead agent
            runView.classList.add('hidden');
            buildView.classList.remove('hidden');
        } else {
            alert(data.error || "Failed to delete agent.");
            btn.style.opacity = '1';
            btn.style.pointerEvents = 'auto';
        }
    } catch (error) {
        alert("Server error while deleting.");
        btn.style.opacity = '1';
        btn.style.pointerEvents = 'auto';
    }
}
// ==========================================
// 📚 KNOWLEDGE BASE LOGIC
// ==========================================

window.toggleKBPanel = function() {
    const panel = document.getElementById('kb-panel');
    const icon = document.getElementById('kb-toggle-icon');
    if (panel.style.display === 'none') {
        panel.style.display = 'block';
        icon.innerText = '▲';
    } else {
        panel.style.display = 'none';
        icon.innerText = '▼';
    }
};

function setupKnowledgeBase(agent) {
    const agentId = agent._id;
    
    // Load existing KB files
    loadKBFiles(agentId);

    // Wire up the KB upload zone
    const kbDropZone = document.getElementById('kb-drop-zone');
    const kbFileInput = document.getElementById('kb-file-input');

    kbDropZone.onclick = () => kbFileInput.click();

    kbDropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        kbDropZone.classList.add('dragover');
    });
    kbDropZone.addEventListener('dragleave', () => kbDropZone.classList.remove('dragover'));

    kbDropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        kbDropZone.classList.remove('dragover');
        if (e.dataTransfer.files.length) {
            uploadToKnowledgeBase(agentId, Array.from(e.dataTransfer.files));
        }
    });

    kbFileInput.addEventListener('change', (e) => {
        if (e.target.files.length) {
            uploadToKnowledgeBase(agentId, Array.from(e.target.files));
        }
    });
}

async function loadKBFiles(agentId) {
    try {
        const response = await fetch(`${API_URL}/knowledge/${agentId}`, { headers: getAuthHeaders() });
        const data = await response.json();

        const badge = document.getElementById('kb-badge');
        const fileList = document.getElementById('kb-file-list');

        if (data.success && data.files.length > 0) {
            badge.innerText = `${data.totalChunks} chunks from ${data.files.length} file(s)`;
            badge.classList.add('active');
            
            fileList.innerHTML = data.files.map(f => `
                <div class="kb-file-item">
                    <span>📄 ${f.filename} <small>(${f.chunks} chunks)</small></span>
                    <button class="file-remove-btn" onclick="deleteKBFile('${agentId}', '${encodeURIComponent(f.filename)}')">×</button>
                </div>
            `).join('');
        } else {
            badge.innerText = 'Empty';
            badge.classList.remove('active');
            fileList.innerHTML = '<div style="color:#666; font-size:0.8rem; text-align:center; padding:10px;">No documents uploaded yet</div>';
        }
    } catch (error) {
        console.error("Failed to load KB files:", error);
    }
}

async function uploadToKnowledgeBase(agentId, files) {
    const statusEl = document.getElementById('kb-upload-status');
    statusEl.classList.remove('hidden');
    statusEl.innerText = `⏳ Processing ${files.length} file(s)... This may take a moment.`;

    const formData = new FormData();
    formData.append('agent_id', agentId);
    files.forEach(f => formData.append('files', f));

    try {
        const response = await fetch(`${API_URL}/knowledge/upload`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${localStorage.getItem('agentforge_token')}` },
            body: formData
        });
        const data = await response.json();

        if (data.success) {
            statusEl.innerText = `✅ ${data.message}`;
            loadKBFiles(agentId); // Refresh the file list
            setTimeout(() => statusEl.classList.add('hidden'), 3000);
        } else {
            statusEl.innerText = `❌ ${data.error}`;
        }
    } catch (error) {
        statusEl.innerText = '❌ Upload failed. Check server connection.';
    }
}

window.deleteKBFile = async function(agentId, encodedFilename) {
    if (!confirm("Remove this file from the knowledge base?")) return;
    
    try {
        const response = await fetch(`${API_URL}/knowledge/${agentId}/${encodedFilename}`, {
            method: 'DELETE',
            headers: getAuthHeaders()
        });
        const data = await response.json();
        if (data.success) {
            loadKBFiles(agentId); // Refresh
        } else {
            alert(data.error);
        }
    } catch (error) {
        alert("Failed to delete file from knowledge base.");
    }
};

// 🎬 Start the app
checkAuth();
