const API_BASE = '/api';
const AUTH_BASE = '/auth';

// State Management
let currentUser = null;
let currentNotes = [];
let currentFolders = [];
let currentTasks = [];
let currentSelectedFolderId = null;
let splashCompleted = false;

// DOM Elements
const authView = document.getElementById('auth-view');
const workspaceView = document.getElementById('workspace-view');
const editorView = document.getElementById('editor-view');

const loginForm = document.getElementById('login-form');

// ═══════════════════════════════════════════
// SLIDE-OUT MENU LOGIC
// ═══════════════════════════════════════════
function openMenu() {
    document.getElementById('slide-menu').classList.add('open');
    const overlay = document.getElementById('menu-overlay');
    overlay.classList.remove('hidden');
    overlay.classList.add('visible');
}
function closeMenu() {
    document.getElementById('slide-menu').classList.remove('open');
    const overlay = document.getElementById('menu-overlay');
    overlay.classList.remove('visible');
    setTimeout(() => overlay.classList.add('hidden'), 300);
}
function openFolders() {
    document.getElementById('slide-folders').classList.add('open');
    const overlay = document.getElementById('folder-overlay');
    overlay.classList.remove('hidden');
    overlay.classList.add('visible');
}
function closeFolders() {
    document.getElementById('slide-folders').classList.remove('open');
    const overlay = document.getElementById('folder-overlay');
    overlay.classList.remove('visible');
    setTimeout(() => overlay.classList.add('hidden'), 300);
}

// Bind menu buttons (after DOM ready)
document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('open-menu-btn')?.addEventListener('click', openMenu);
    document.getElementById('close-menu-btn')?.addEventListener('click', closeMenu);
    document.getElementById('menu-overlay')?.addEventListener('click', closeMenu);
    document.getElementById('open-folders-btn')?.addEventListener('click', openFolders);
    document.getElementById('close-folders-btn')?.addEventListener('click', closeFolders);
    document.getElementById('folder-overlay')?.addEventListener('click', closeFolders);
});

// ═══════════════════════════════════════════
// SPLASH SCREEN ORCHESTRATION
// ═══════════════════════════════════════════
function runSplashAnimation() {
    const splash = document.getElementById('splash-screen');
    const content = document.getElementById('splash-content');
    if (!splash || !content) { revealAuth(); return; }

    // Phase 1: Logo grows (handled by CSS animation, ~1.6s)
    // Phase 2: After 1.8s, logo flies to top-right
    setTimeout(() => {
        content.classList.add('fly');
    }, 1800);

    // Phase 3: After 2.5s, fade out overlay and reveal auth
    setTimeout(() => {
        splash.classList.add('fade-out');
        revealAuth();
    }, 2500);

    // Cleanup: remove splash from DOM
    setTimeout(() => {
        splash.remove();
        splashCompleted = true;
    }, 3200);
}

function skipSplash() {
    const splash = document.getElementById('splash-screen');
    if (splash) splash.remove();
    splashCompleted = true;
}

function revealAuth() {
    authView.style.opacity = '1';
    authView.style.transition = 'opacity 0.5s ease-out';
}

// Helper to handle API requests
async function apiCall(endpoint, method = 'GET', body = null) {
    const config = {
        method,
        headers: { 'Content-Type': 'application/json' },
        // include credentials for cookies/session
        credentials: 'include'
    };
    if (body) config.body = JSON.stringify(body);

    try {
        const response = await fetch(`${API_BASE}${endpoint}`, config);
        if (response.status === 401) {
            handleLogout();
            throw new Error('Unauthorized');
        }
        return await response.json();
    } catch (error) {
        console.error('API Error:', error);
        return null;
    }
}

// Authentication
async function checkAuth() {
    try {
        const res = await fetch(`${AUTH_BASE}/me`, { credentials: 'include' });
        if (res.ok) {
            const data = await res.json();
            currentUser = data.user;
            skipSplash();
            showWorkspace();
            loadWorkspaceData();
        } else {
            runSplashAnimation();
            showAuth();
        }
    } catch (e) {
        runSplashAnimation();
        showAuth();
    }
}

loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;
    const submitBtn = loginForm.querySelector('button[type="submit"]');
    const originalText = submitBtn.textContent;
    submitBtn.textContent = 'Signing in...';
    submitBtn.disabled = true;

    try {
        const res = await fetch(`${AUTH_BASE}/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password }),
            credentials: 'include'
        });

        if (res.ok) {
            const data = await res.json();
            currentUser = data.user;
            showWorkspace();
            loadWorkspaceData();
        } else {
            const errData = await res.json();
            alert(`Login failed: ${errData.error || 'Please check credentials.'}`);
        }
    } catch (err) {
        alert('Server connection error.');
    } finally {
        submitBtn.textContent = originalText;
        submitBtn.disabled = false;
    }
});

// Registration Logic
const registerForm = document.getElementById('register-form');
registerForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = document.getElementById('reg-username').value;
    const email = document.getElementById('reg-email').value;
    const password = document.getElementById('reg-password').value;

    const submitBtn = registerForm.querySelector('button[type="submit"]');
    const originalText = submitBtn.textContent;
    submitBtn.textContent = 'Creating account...';
    submitBtn.disabled = true;

    try {
        const res = await fetch(`${AUTH_BASE}/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, email, password }),
            credentials: 'include'
        });

        if (res.ok) {
            // Auto login after registration
            const loginRes = await fetch(`${AUTH_BASE}/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password }),
                credentials: 'include'
            });

            if (loginRes.ok) {
                const data = await loginRes.json();
                currentUser = data.user;
                showWorkspace();
                loadWorkspaceData();
            }
        } else {
            const errData = await res.json();
            alert(`Registration failed: ${errData.error || 'Server error.'}`);
        }
    } catch (err) {
        alert('Server connection error.');
    } finally {
        submitBtn.textContent = originalText;
        submitBtn.disabled = false;
    }
});

document.getElementById('switch-to-register').addEventListener('click', (e) => {
    e.preventDefault();
    const isLogin = !loginForm.classList.contains('hidden');

    if (isLogin) {
        showRegisterForm();
    }
});

function showRegisterForm() {
    loginForm.classList.add('hidden');
    registerForm.classList.remove('hidden');
    document.getElementById('auth-form-title').textContent = 'Create an account';
    document.getElementById('auth-form-subtitle').textContent = 'Get started with your free workspace';
    document.getElementById('auth-switch-text').innerHTML = 'Already have an account? <a href="#" id="switch-to-login">Sign in</a>';
    setTimeout(() => {
        const sl = document.getElementById('switch-to-login');
        if (sl) sl.addEventListener('click', toggleAuthForm);
    }, 0);
}

function toggleAuthForm(e) {
    if (e) e.preventDefault();
    loginForm.classList.remove('hidden');
    registerForm.classList.add('hidden');
    document.getElementById('auth-form-title').textContent = 'Welcome back';
    document.getElementById('auth-form-subtitle').textContent = 'Sign in to continue to your workspace';
    document.getElementById('auth-switch-text').innerHTML = 'Don\'t have an account? <a href="#" id="switch-to-register">Sign up</a>';
    setTimeout(() => {
        const sr = document.getElementById('switch-to-register');
        if (sr) {
            sr.addEventListener('click', (ev) => {
                ev.preventDefault();
                showRegisterForm();
            });
        }
    }, 0);
}

document.getElementById('logout-btn').addEventListener('click', handleLogout);

async function handleLogout() {
    await fetch(`${AUTH_BASE}/logout`, { method: 'POST', credentials: 'include' });
    currentUser = null;
    showAuth();
}

// View Routing
function showAuth() {
    authView.classList.remove('hidden');
    workspaceView.classList.add('hidden');
    editorView.classList.add('hidden');
}

function showWorkspace() {
    authView.classList.add('hidden');
    workspaceView.classList.remove('hidden');
    editorView.classList.add('hidden');

    if (currentUser) {
        document.getElementById('user-name-display').textContent = currentUser.username;
        document.getElementById('greeting-msg').textContent = `Good ${getGreeting()}, ${currentUser.username.split(' ')[0]}`;
        document.getElementById('user-avatar').textContent = currentUser.username.substring(0, 2).toUpperCase();
    }
}

function getGreeting() {
    const hour = new Date().getHours();
    if (hour < 12) return 'Morning';
    if (hour < 18) return 'Afternoon';
    return 'Evening';
}

// Data Loading
async function loadWorkspaceData() {
    // Load Folders
    currentFolders = await apiCall('/folders') || [];
    renderFolders();

    // Load Notes
    currentNotes = await apiCall('/notes') || [];
    renderRecentNotes();

    // Load Tasks
    currentTasks = await apiCall('/tasks') || [];
    renderTasks();
}

function renderFolders() {
    const list = document.getElementById('sidebar-folders');
    list.innerHTML = '';

    // Helper to render recursively
    function renderFolderNode(folder, depth = 0) {
        const li = document.createElement('li');
        li.className = 'folder-item';
        li.style.paddingLeft = `${12 + (depth * 20)}px`;
        li.style.display = 'flex';
        li.style.justifyContent = 'space-between';

        li.innerHTML = `
            <div>
                <i class="ph ph-folder" style="margin-right: 8px;"></i>${folder.name}
            </div>
            <button class="icon-btn add-subfolder-btn" title="Add Subfolder" style="padding: 2px;" data-id="${folder.id}">
                <i class="ph ph-plus" style="font-size: 14px;"></i>
            </button>
        `;

        li.addEventListener('click', (e) => {
            if (e.target.closest('.add-subfolder-btn')) return; // handled separately

            currentSelectedFolderId = folder.id;
            document.getElementById('greeting-msg').textContent = `Folder: ${folder.name}`;
            const filteredNotes = currentNotes.filter(n => n.folder_id === folder.id);
            renderSpecificNotes(filteredNotes);

            document.querySelectorAll('.nav-item').forEach(nav => nav.classList.remove('active'));
            document.getElementById('recent-notes').parentElement.style.display = 'block';
            document.getElementById('new-task-btn').parentElement.style.display = 'none';
            document.getElementById('dashboard-tasks').style.display = 'none';
        });

        const addBtn = li.querySelector('.add-subfolder-btn');
        addBtn.addEventListener('click', async (e) => {
            e.stopPropagation();
            const name = prompt(`Enter a name for the new subfolder under '${folder.name}':`);
            if (name) {
                await apiCall('/folders', 'POST', { name, parent_id: folder.id });
                await loadWorkspaceData();
            }
        });

        list.appendChild(li);

        // Render children
        const children = currentFolders.filter(f => f.parent_id === folder.id);
        children.forEach(c => renderFolderNode(c, depth + 1));
    }

    const rootFolders = currentFolders.filter(f => !f.parent_id);
    rootFolders.forEach(f => renderFolderNode(f, 0));
}

function renderSpecificNotes(notesToRender) {
    const grid = document.getElementById('recent-notes');
    grid.innerHTML = '';
    if (notesToRender.length === 0) {
        grid.innerHTML = '<div class="note-card-placeholder">No notes found. Create one!</div>';
        return;
    }

    notesToRender.forEach(note => {
        const card = document.createElement('div');
        card.className = 'note-card glass-panel';

        let folderName = 'General';
        if (note.folder_id) {
            const f = currentFolders.find(fold => fold.id === note.folder_id);
            if (f) folderName = f.name;
        }

        // Build collaborator badges for shared notes
        let collabHtml = '';
        if (note.is_shared && note.collaborators && note.collaborators.length > 0) {
            const badges = note.collaborators.map(c =>
                `<span class="collab-badge" title="${c.email} (${c.permission})"><i class="ph ph-user"></i> ${c.username || c.email}</span>`
            ).join('');
            collabHtml = `<div class="collab-list">${badges}</div>`;
        }

        card.innerHTML = `
            <div class="note-title">
                ${note.note_type === 'link' ? '<i class="ph ph-link" style="margin-right: 5px; color: var(--accent-secondary);"></i>' : '<i class="ph ph-file-text" style="margin-right: 5px; color: var(--accent-primary);"></i>'}
                ${note.title}
            </div>
            <div class="note-excerpt">${note.note_type === 'link' ? '<a href="' + note.link_url + '" target="_blank">' + note.link_url + '</a>' : 'Click to view contents...'}</div>
            ${collabHtml}
            <div class="note-footer" style="display: flex; justify-content: space-between; align-items: center;">
                <div>
                    <span><i class="ph ph-folder"></i> ${folderName}</span>
                    ${note.is_shared ? '<i class="ph ph-users" style="margin-left: 8px;"></i>' : ''}
                </div>
                <div>
                    ${note.is_owner ? `
                    <button class="icon-btn move-note-btn" title="Move Note" style="padding: 4px;" data-id="${note.id}">
                        <i class="ph ph-arrows-out-line-horizontal"></i>
                    </button>
                    ` : ''}
                    <button class="icon-btn delete-note-btn" title="Delete Note" style="color: var(--danger-color); padding: 4px;" data-id="${note.id}">
                        <i class="ph ph-trash"></i>
                    </button>
                </div>
            </div>
        `;
        card.addEventListener('click', (e) => {
            // Prevent opening editor if clicking action buttons or link
            if (e.target.closest('.delete-note-btn') || e.target.closest('.move-note-btn') || e.target.tagName.toLowerCase() === 'a') return;

            if (note.note_type === 'link') {
                window.open(note.link_url, '_blank');
            } else {
                openNote(note.id);
            }
        });

        const delBtn = card.querySelector('.delete-note-btn');
        delBtn.addEventListener('click', async (e) => {
            e.stopPropagation();
            if (confirm("Are you sure you want to delete this specific item?")) {
                await apiCall(`/notes/${note.id}`, 'DELETE');
                await loadWorkspaceData();
            }
        });

        const moveBtn = card.querySelector('.move-note-btn');
        if (moveBtn) {
            moveBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                openMoveModal(note.id);
            });
        }

        grid.appendChild(card);
    });
}

// Move Item Logic
let movingNoteId = null;
function openMoveModal(noteId) {
    movingNoteId = noteId;
    const select = document.getElementById('move-target-folder');
    select.innerHTML = '<option value="">Root Folder</option>';

    // Add all current folders
    currentFolders.forEach(f => {
        const opt = document.createElement('option');
        opt.value = f.id;
        opt.textContent = f.name;
        select.appendChild(opt);
    });

    document.getElementById('move-item-modal').classList.remove('hidden');
}

document.getElementById('cancel-move-item').addEventListener('click', () => {
    document.getElementById('move-item-modal').classList.add('hidden');
    movingNoteId = null;
});

document.getElementById('confirm-move-item').addEventListener('click', async () => {
    if (!movingNoteId) return;
    const targetFolderId = document.getElementById('move-target-folder').value;

    const payload = {
        folder_id: targetFolderId ? parseInt(targetFolderId) : null
    };

    const res = await apiCall(`/notes/${movingNoteId}`, 'PUT', payload);
    if (res && !res.error) {
        document.getElementById('move-item-modal').classList.add('hidden');
        movingNoteId = null;
        await loadWorkspaceData();
    } else {
        alert("Failed to move item.");
    }
});

function renderRecentNotes() {
    renderSpecificNotes(currentNotes);
}

function renderTasks() {
    const dashboardContainer = document.getElementById('dashboard-tasks');
    dashboardContainer.innerHTML = '';

    if (currentTasks.length === 0) {
        dashboardContainer.innerHTML = '<div class="task-item-placeholder">No tasks found. Create one!</div>';
        renderTaskChart();
        return;
    }

    // Group by category
    const tasksByCategory = {};
    currentTasks.forEach(task => {
        const cat = task.category || 'General';
        if (!tasksByCategory[cat]) tasksByCategory[cat] = [];
        tasksByCategory[cat].push(task);
    });

    const statusIcons = {
        'pending': '⏳',
        'working': '🔨',
        'completed': '✅'
    };

    for (const [category, tasks] of Object.entries(tasksByCategory)) {
        const catHeader = document.createElement('h4');
        catHeader.textContent = category;
        catHeader.style.cssText = 'margin: 15px 0 10px; color: var(--accent-primary); font-size: 13px; letter-spacing: 1px; text-transform: uppercase;';
        dashboardContainer.appendChild(catHeader);

        tasks.forEach(task => {
            const status = task.status || 'pending';
            const el = document.createElement('div');
            el.className = 'task-item glass-panel';
            el.innerHTML = `
                <div class="task-status-btn" onclick="cycleTaskStatus(${task.id}, '${status}')" title="Click to change status" style="cursor:pointer; font-size:18px; min-width:28px; text-align:center;">${statusIcons[status] || '⏳'}</div>
                <div class="task-info" style="flex:1;">
                    <div class="task-title" style="${status === 'completed' ? 'text-decoration: line-through; color: var(--text-secondary);' : ''}">${task.title}</div>
                    <div class="task-meta" style="display:flex; gap:10px; font-size:12px; color: var(--text-secondary); margin-top:2px;">
                        ${task.due_date ? `<span><i class="ph ph-calendar"></i> ${task.due_date}</span>` : ''}
                        ${task.due_time ? `<span><i class="ph ph-clock"></i> ${task.due_time}</span>` : ''}
                        <span class="task-status-label" style="color: ${status === 'completed' ? 'var(--success)' : status === 'working' ? 'var(--accent-primary)' : 'var(--text-secondary)'}; font-weight: 500;">${status.charAt(0).toUpperCase() + status.slice(1)}</span>
                    </div>
                </div>
                <button class="icon-btn" onclick="deleteTask(${task.id})"><i class="ph ph-trash"></i></button>
            `;
            dashboardContainer.appendChild(el);
        });
    }

    renderTaskChart();
}

// ═══════════════════════════════════════════
// TASK STATUS CHART
// ═══════════════════════════════════════════
let taskChartInstance = null;

function renderTaskChart() {
    const canvas = document.getElementById('task-status-chart');
    if (!canvas) return;

    // Destroy old chart
    if (taskChartInstance) {
        taskChartInstance.destroy();
        taskChartInstance = null;
    }

    const tasksWithDates = currentTasks.filter(t => t.due_date);
    if (tasksWithDates.length === 0) {
        canvas.parentElement.style.display = 'none';
        return;
    }
    canvas.parentElement.style.display = 'block';

    const statusMap = { 'pending': 0, 'working': 1, 'completed': 2 };

    // Color palette by category
    const categoryColors = {};
    const palette = [
        '#f59e0b', '#ef4444', '#3b82f6', '#10b981', '#8b5cf6',
        '#ec4899', '#06b6d4', '#f97316', '#84cc16', '#6366f1'
    ];
    let colorIdx = 0;
    tasksWithDates.forEach(t => {
        const cat = t.category || 'General';
        if (!categoryColors[cat]) {
            categoryColors[cat] = palette[colorIdx % palette.length];
            colorIdx++;
        }
    });

    // Build datasets per category for legend
    const datasets = [];
    for (const [cat, color] of Object.entries(categoryColors)) {
        const points = tasksWithDates
            .filter(t => (t.category || 'General') === cat)
            .map(t => ({
                x: t.due_date,
                y: statusMap[t.status || 'pending'] || 0,
                title: t.title
            }));

        datasets.push({
            label: cat,
            data: points,
            backgroundColor: color,
            borderColor: color,
            pointRadius: 8,
            pointHoverRadius: 11,
            pointStyle: 'circle',
            showLine: false
        });
    }

    taskChartInstance = new Chart(canvas, {
        type: 'scatter',
        data: { datasets },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: true,
                    position: 'top',
                    labels: {
                        color: '#a0aabf',
                        font: { family: 'Inter', size: 11 },
                        usePointStyle: true,
                        pointStyle: 'circle',
                        padding: 12
                    }
                },
                tooltip: {
                    callbacks: {
                        label: function (ctx) {
                            const p = ctx.raw;
                            const statusNames = ['Pending', 'Working', 'Completed'];
                            return `${p.title} — ${statusNames[p.y]} (${p.x})`;
                        }
                    },
                    backgroundColor: 'rgba(15,17,26,0.9)',
                    titleColor: '#f59e0b',
                    bodyColor: '#f8f9fa',
                    borderColor: 'rgba(245,158,11,0.3)',
                    borderWidth: 1
                }
            },
            scales: {
                x: {
                    type: 'time',
                    time: { unit: 'day', tooltipFormat: 'MMM dd, yyyy' },
                    title: { display: true, text: 'Due Date', color: '#a0aabf', font: { family: 'Inter', size: 12 } },
                    grid: { color: 'rgba(255,255,255,0.05)' },
                    ticks: { color: '#a0aabf', font: { size: 10 } }
                },
                y: {
                    min: -0.5,
                    max: 2.5,
                    title: { display: true, text: 'Status', color: '#a0aabf', font: { family: 'Inter', size: 12 } },
                    grid: { color: 'rgba(255,255,255,0.05)' },
                    ticks: {
                        color: '#a0aabf',
                        stepSize: 1,
                        callback: function (value) {
                            const labels = ['⏳ Pending', '🔨 Working', '✅ Completed'];
                            return labels[value] || '';
                        }
                    }
                }
            }
        }
    });
}

// Tasks Actions
async function cycleTaskStatus(id, currentStatus) {
    const cycle = { 'pending': 'working', 'working': 'completed', 'completed': 'pending' };
    const newStatus = cycle[currentStatus] || 'pending';
    await apiCall(`/tasks/${id}`, 'PUT', { status: newStatus });
    loadWorkspaceData();
}

// Keep toggleTask for backward compat
async function toggleTask(id, is_completed) {
    await apiCall(`/tasks/${id}`, 'PUT', { status: is_completed ? 'completed' : 'pending' });
    loadWorkspaceData();
}

async function deleteTask(id) {
    await apiCall(`/tasks/${id}`, 'DELETE');
    loadWorkspaceData();
}

document.getElementById('new-task-btn').addEventListener('click', () => {
    document.getElementById('task-modal').classList.remove('hidden');
});

document.getElementById('cancel-task').addEventListener('click', () => {
    document.getElementById('task-modal').classList.add('hidden');
});

document.getElementById('save-task').addEventListener('click', async () => {
    const title = document.getElementById('task-title').value;
    const category = document.getElementById('task-category').value || 'General';
    const status = document.getElementById('task-status').value || 'pending';
    const due_date = document.getElementById('task-date').value;
    const due_time = document.getElementById('task-time').value;

    if (!title) return alert("Task description required!");

    await apiCall('/tasks', 'POST', { title, category, status, due_date, due_time });
    document.getElementById('task-modal').classList.add('hidden');
    document.getElementById('task-title').value = '';
    loadWorkspaceData();
});

// New Item Modal Logic
let currentNewItemType = 'text';

document.getElementById('new-note-btn').addEventListener('click', () => {
    document.getElementById('new-item-modal').classList.remove('hidden');
    document.getElementById('type-note-btn').click(); // default to note
});

document.getElementById('type-note-btn').addEventListener('click', () => {
    currentNewItemType = 'text';
    document.getElementById('type-note-btn').className = 'btn primary';
    document.getElementById('type-link-btn').className = 'btn secondary';
    document.getElementById('new-link-wrap').style.display = 'none';
});

document.getElementById('type-link-btn').addEventListener('click', () => {
    currentNewItemType = 'link';
    document.getElementById('type-link-btn').className = 'btn primary';
    document.getElementById('type-note-btn').className = 'btn secondary';
    document.getElementById('new-link-wrap').style.display = 'block';
});

document.getElementById('cancel-new-item').addEventListener('click', () => {
    document.getElementById('new-item-modal').classList.add('hidden');
    document.getElementById('new-item-title').value = '';
    document.getElementById('new-item-link').value = '';
});

document.getElementById('save-new-item').addEventListener('click', async () => {
    const title = document.getElementById('new-item-title').value;
    const linkUrl = document.getElementById('new-item-link').value;

    if (!title) return alert("Title required!");
    if (currentNewItemType === 'link' && !linkUrl) return alert("Link URL required!");

    const payload = {
        title: title,
        note_type: currentNewItemType,
        folder_id: currentSelectedFolderId
    };
    if (currentNewItemType === 'link') {
        payload.link_url = linkUrl;
    }

    const res = await apiCall('/notes', 'POST', payload);
    if (res) {
        document.getElementById('new-item-modal').classList.add('hidden');
        document.getElementById('new-item-title').value = '';
        document.getElementById('new-item-link').value = '';
        await loadWorkspaceData();
        if (currentNewItemType === 'text') {
            openNote(res.id);
        }
    }
});

// Sidebar Navigation Logic
const navItems = document.querySelectorAll('.nav-item');
navItems.forEach(item => {
    item.addEventListener('click', () => {
        // Close the slide-out menu
        closeMenu();

        // Update styling
        navItems.forEach(nav => nav.classList.remove('active'));
        item.classList.add('active');

        const target = item.getAttribute('data-target');

        // Filter the UI rendering based on tab
        currentSelectedFolderId = null; // Reset folder selection when navigating sidebar
        if (target === 'dashboard') {
            document.getElementById('tasks-section-title').textContent = 'My Tasks';
            document.getElementById('greeting-msg').textContent = `Good ${getGreeting()}, ${currentUser.username.split(' ')[0]}`;
            renderSpecificNotes(currentNotes);
            document.getElementById('new-task-btn').parentElement.style.display = 'flex';
            document.getElementById('dashboard-tasks').style.display = 'block';
        }
        else if (target === 'notes') {
            document.getElementById('greeting-msg').textContent = 'All Notes';
            renderSpecificNotes(currentNotes);
            document.getElementById('new-task-btn').parentElement.style.display = 'none';
            document.getElementById('dashboard-tasks').style.display = 'none';
        }
        else if (target === 'tasks') {
            document.getElementById('tasks-section-title').textContent = 'My Tasks';
            document.getElementById('greeting-msg').textContent = 'Tasks';
            // Hide notes, show only tasks (simple CSS toggle trick for dashboard section)
            document.getElementById('recent-notes').parentElement.style.display = 'none';
            document.getElementById('new-task-btn').parentElement.style.display = 'flex';
            document.getElementById('dashboard-tasks').style.display = 'block';
        }
        else if (target === 'shared') {
            document.getElementById('greeting-msg').textContent = 'Shared Notes';
            const sharedNotes = currentNotes.filter(n => n.is_shared);
            renderSpecificNotes(sharedNotes);
            document.getElementById('recent-notes').parentElement.style.display = 'block';
            document.getElementById('new-task-btn').parentElement.style.display = 'none';
            document.getElementById('dashboard-tasks').style.display = 'none';
        }

        if (target !== 'tasks') {
            document.getElementById('recent-notes').parentElement.style.display = 'block';
        }
    });
});

// Folder Creation
document.getElementById('new-folder-btn').addEventListener('click', async () => {
    const name = prompt('Enter a name for the new folder:');
    if (name) {
        // Optionally pass parent_id for subfolders
        await apiCall('/folders', 'POST', { name, parent_id: null });
        currentFolders = await apiCall('/folders') || [];
        renderFolders();
    }
});

// Note Opening stub (Implementation in editor.js)
function openNote(id) {
    if (window.openEditorForNote) window.openEditorForNote(id);
}

// Initialization
checkAuth();
