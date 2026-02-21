// Editor logic and Socket.IO integration

let socket = null;
let currentNoteId = null;
let typingTimeout = null;

const editorTitle = document.getElementById('editor-title');
const syncStatus = document.getElementById('sync-status');
const embedsContainer = document.getElementById('embeds-container');
const shareModal = document.getElementById('share-modal');

// Initialize Quill
const quill = new Quill('#note-editor', {
    theme: 'snow',
    placeholder: 'Start typing your premium note...',
    modules: {
        toolbar: [
            [{ 'header': [1, 2, 3, false] }],
            ['bold', 'italic', 'underline', 'strike'],
            [{ 'list': 'ordered' }, { 'list': 'bullet' }],
            ['link', 'image', 'blockquote', 'code-block'],
            ['clean']
        ]
    }
});

// Expose openNote to app.js
window.openEditorForNote = async function (id) {
    currentNoteId = id;

    // Fetch note details
    const note = await apiCall(`/notes/${id}`);
    if (!note) return alert("Failed to load note");

    // UI Update
    document.getElementById('workspace-view').classList.add('hidden');
    document.getElementById('editor-view').classList.remove('hidden');

    const shareBtn = document.getElementById('share-note-btn');
    if (note.is_owner) {
        shareBtn.style.display = 'inline-flex';
    } else {
        shareBtn.style.display = 'none';
    }

    editorTitle.value = note.title;
    quill.root.innerHTML = note.content || '';

    renderEmbeds(note.attachments);

    // Connect Socket
    if (!socket) {
        socket = io('http://127.0.0.1:5000');

        socket.on('connect', () => {
            console.log('Connected to socket server');
        });

        socket.on('user_joined', (data) => {
            showNotification(`User ${data.user_id} joined the document.`);
        });

        socket.on('document_updated', (data) => {
            if (data.document_id == currentNoteId && data.user_id !== (currentUser ? currentUser.id : 'Anonymous')) {
                // Save selection, replace content, restore selection
                const selection = quill.getSelection();
                quill.root.innerHTML = data.content;
                if (selection) {
                    quill.setSelection(selection.index, selection.length);
                }
            }
        });
    }

    // Join room
    socket.emit('join_document', {
        document_id: id,
        user_id: currentUser ? currentUser.id : 'Anonymous'
    });
};

document.getElementById('close-editor').addEventListener('click', () => {
    if (socket && currentNoteId) {
        socket.emit('leave_document', { document_id: currentNoteId });
    }
    currentNoteId = null;

    document.getElementById('editor-view').classList.add('hidden');
    document.getElementById('workspace-view').classList.remove('hidden');
    loadWorkspaceData(); // refresh dashboard
});

// Auto-save & Real-time emit
quill.on('text-change', (delta, oldDelta, source) => {
    if (source === 'user') {
        const content = quill.root.innerHTML;
        syncStatus.textContent = 'Saving...';

        // Emit to other users
        if (socket && currentNoteId) {
            socket.emit('edit_document', {
                document_id: currentNoteId,
                content: content,
                user_id: currentUser ? currentUser.id : 'Anonymous'
            });
        }

        // Debounce save to database
        clearTimeout(typingTimeout);
        typingTimeout = setTimeout(async () => {
            await apiCall(`/notes/${currentNoteId}`, 'PUT', { content: content });
            syncStatus.textContent = 'Saved';
        }, 1000);
    }
});

editorTitle.addEventListener('change', async () => {
    if (currentNoteId) {
        await apiCall(`/notes/${currentNoteId}`, 'PUT', { title: editorTitle.value });
    }
});

// Share Note Action
document.getElementById('share-note-btn').addEventListener('click', async () => {
    if (currentNoteId) {
        shareModal.classList.remove('hidden');
        await loadCollaborators();
    }
});

document.getElementById('cancel-share-btn').addEventListener('click', () => {
    shareModal.classList.add('hidden');
});

document.getElementById('send-share-btn').addEventListener('click', async () => {
    const email = document.getElementById('share-email').value;
    const permission = document.getElementById('share-permission').value;

    if (!email) return alert('Enter an email address');

    const res = await apiCall(`/notes/${currentNoteId}/share`, 'POST', { email, permission });
    if (res && !res.error) {
        document.getElementById('share-email').value = '';
        shareModal.classList.add('hidden');
        alert(`Shared successfully to ${email}`);
        await loadCollaborators();
    } else {
        alert("Error: " + (res ? res.error : "Failed to share"));
    }
});

async function loadCollaborators() {
    const list = document.getElementById('collaborators-manage-list');
    list.innerHTML = 'Loading...';

    const collabs = await apiCall(`/notes/${currentNoteId}/share`, 'GET');
    if (!collabs || collabs.error) {
        list.innerHTML = '<div class="task-item-placeholder">Failed to load collaborators</div>';
        return;
    }

    list.innerHTML = '';
    if (collabs.length === 0) {
        list.innerHTML = '<div class="task-item-placeholder">Note is not shared with anyone yet.</div>';
        return;
    }

    collabs.forEach(c => {
        const item = document.createElement('div');
        item.className = 'flex-row';
        item.style.justifyContent = 'space-between';
        item.style.alignItems = 'center';
        item.style.padding = '8px 0';
        item.style.borderBottom = '1px solid var(--border-color)';

        item.innerHTML = `
            <div>
                <span style="font-weight: 500">${c.email}</span>
                <span style="font-size: 0.8em; color: var(--text-secondary); margin-left: 10px;">${c.permission === 'write' ? 'Can Edit' : 'Can View'}</span>
            </div>
            <div style="display: flex; gap: 5px;">
                <button class="btn secondary" style="padding: 4px 8px; font-size: 0.8em;" onclick="updateCollab('${c.email}', '${c.permission === 'write' ? 'read' : 'write'}')">
                    ${c.permission === 'write' ? 'Downgrade to View' : 'Upgrade to Edit'}
                </button>
                <button class="icon-btn" style="color: var(--danger-color);" onclick="removeCollab(${c.id})"><i class="ph ph-trash"></i></button>
            </div>
        `;
        list.appendChild(item);
    });
}

window.updateCollab = async function (email, newPermission) {
    await apiCall(`/notes/${currentNoteId}/share`, 'POST', { email, permission: newPermission });
    await loadCollaborators();
};

window.removeCollab = async function (collabId) {
    if (confirm('Revoke access for this user?')) {
        await apiCall(`/notes/${currentNoteId}/share`, 'DELETE', { collab_id: collabId });
        await loadCollaborators();
    }
};

// Embed Actions (Google Docs/Sheets)
document.getElementById('add-embed-btn').addEventListener('click', async () => {
    const url = prompt("Enter Google Doc/Sheet public or shared link:", "");
    if (url && currentNoteId) {
        const att = await apiCall(`/notes/${currentNoteId}/attachments`, 'POST', {
            url: url,
            name: 'Embedded Document',
            type: 'google_doc'
        });
        if (att) {
            const note = await apiCall(`/notes/${currentNoteId}`);
            renderEmbeds(note.attachments);
        }
    }
});

function renderEmbeds(attachments) {
    embedsContainer.innerHTML = '';
    if (!attachments || attachments.length === 0) return;

    attachments.forEach(att => {
        const frame = document.createElement('iframe');
        frame.className = 'embed-frame';
        frame.src = att.url;
        frame.allowFullscreen = true;
        embedsContainer.appendChild(frame);
    });
}

// Global UI utility
function showNotification(msg) {
    console.log(msg);
    // Could attach to an actual toast notification UI in index.html
    const toast = document.createElement('div');
    toast.style.position = 'fixed';
    toast.style.bottom = '20px';
    toast.style.right = '20px';
    toast.style.background = 'var(--accent-primary)';
    toast.style.color = 'white';
    toast.style.padding = '12px 24px';
    toast.style.borderRadius = '8px';
    toast.style.zIndex = '9999';
    toast.textContent = msg;
    document.body.appendChild(toast);

    setTimeout(() => {
        toast.remove();
    }, 3000);
}

// Allow dashboard to create new note
document.getElementById('new-note-btn').addEventListener('click', async () => {
    const note = await apiCall('/notes', 'POST', { title: 'Untitled Note', content: '' });
    if (note) {
        window.openEditorForNote(note.id);
    }
});
