// @ts-ignore
import { encryptChatMessage, decryptMessageWithKey } from '../jslibs/PGPUtils.js';

// ── State ─────────────────────────────────────────────────────────────────────
let activeConversationId: string | null = null;
let activeReceiverPublicKey: string | null = null;
const currentUserId: string | null =
    document.querySelector<HTMLMetaElement>('meta[name="current-user-id"]')?.content ?? null;

// Track rendered message IDs to deduplicate WebSocket pushes
const renderedMessageIds = new Set<string>();

// PGP credentials — loaded from sessionStorage (populated on login or via unlock overlay)
// Read as functions so they always reflect the latest value after an in-page unlock
function pgpPrivateKey(): string | null { return sessionStorage.getItem('pgpPrivateKey'); }
function pgpPassphrase(): string | null { return sessionStorage.getItem('pgpPassphrase'); }
function pgpPublicKey(): string | null  { return sessionStorage.getItem('pgpPublicKey'); }
function hasCredentials(): boolean { return !!pgpPrivateKey() && !!pgpPassphrase(); }

// ── WebSocket ─────────────────────────────────────────────────────────────────
const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';

let chatWs: WebSocket;
let wsReconnectDelay = 1000; // ms, doubles on each failed attempt up to 30 s

function connectChatWs() {
    chatWs = new WebSocket(`${wsProtocol}//${window.location.host}/ws`);

    chatWs.onopen = () => {
        wsReconnectDelay = 1000; // reset backoff on successful connection
    };

    chatWs.onmessage = async (event: MessageEvent) => {
        // Respond to server keep-alive pings
        if (event.data === '__ping__') {
            chatWs.send('__pong__');
            return;
        }

        let data: any;
        try { data = JSON.parse(event.data); } catch { return; }

        if (data.type === 'new_message') {
            if (renderedMessageIds.has(data.message.id)) return; // deduplicate
            renderedMessageIds.add(data.message.id);
            if (data.conversationId === activeConversationId) {
                const el = await buildMessageEl(data.message);
                messagesContainer.appendChild(el);
                messagesContainer.scrollTop = messagesContainer.scrollHeight;
            }
        }

        if (data.type === 'message_deleted') {
            if (data.conversationId === activeConversationId) {
                const el = messagesContainer.querySelector<HTMLElement>(`[data-message-id="${data.messageId}"]`);
                if (el) {
                    const bubble = el.querySelector('div')!;
                    bubble.className = 'relative max-w-sm px-4 py-2 rounded-2xl text-sm shadow bg-base-200 text-base-content/40 italic';
                    bubble.innerHTML = '<span class="block text-xs font-semibold mb-1 opacity-70">Deleted</span><span>This message was deleted.</span>';
                }
            }
        }
    };

    chatWs.onerror = () => console.warn('[WS] Connection error');
    chatWs.onclose = () => {
        console.warn(`[WS] Connection closed — reconnecting in ${wsReconnectDelay / 1000}s`);
        setTimeout(() => {
            connectChatWs();
            wsReconnectDelay = Math.min(wsReconnectDelay * 2, 30_000);
        }, wsReconnectDelay);
    };
}

connectChatWs();

// ── Element refs ──────────────────────────────────────────────────────────────
const conversationList   = document.getElementById('conversationList')    as HTMLUListElement;
const newChatBtn         = document.getElementById('newChatBtn')           as HTMLButtonElement;
const friendPicker       = document.getElementById('friendPicker')         as HTMLDivElement;
const friendPickerList   = document.getElementById('friendPickerList')     as HTMLUListElement;
const chatHeaderName     = document.getElementById('chatHeaderName')       as HTMLSpanElement;
const messagesContainer  = document.getElementById('messagesContainer')    as HTMLDivElement;
const messagesPlaceholder = document.getElementById('messagesPlaceholder') as HTMLDivElement | null;
const messageInput       = document.getElementById('messageInput')         as HTMLTextAreaElement;
const sendBtn            = document.getElementById('sendBtn')              as HTMLButtonElement;

// ── Conversation list: click to open ─────────────────────────────────────────
conversationList.addEventListener('click', (e) => {
    const target = e.target as HTMLElement;

    // Pin button
    const pinBtn = target.closest<HTMLElement>('.pin-btn');
    if (pinBtn) {
        const item = pinBtn.closest<HTMLElement>('.conversation-item')!;
        togglePin(item.dataset.id!, item, pinBtn);
        return;
    }

    // Conversation row
    const item = target.closest<HTMLElement>('.conversation-item');
    if (item) openConversation(item.dataset.id!, item);
});

async function openConversation(id: string, item: HTMLElement) {
    // Highlight active item
    document.querySelectorAll('.conversation-item').forEach(el => el.classList.remove('bg-base-200'));
    item.classList.add('bg-base-200');

    activeConversationId = id;
    activeReceiverPublicKey = null;
    chatHeaderName.textContent = item.querySelector('.font-medium')?.textContent ?? 'Chat';
    chatHeaderName.classList.remove('text-base-content/40', 'italic');

    messageInput.disabled = false;
    sendBtn.disabled = false;
    messageInput.focus();

    // Fetch recipient public key from server (avoids HTML-attribute encoding issues)
    try {
        const keyRes = await fetch(`/chat/${id}/recipient-key`);
        const keyData = await keyRes.json();
        if (keyData.success && keyData.publicKeyArmored) {
            activeReceiverPublicKey = keyData.publicKeyArmored;
        }
    } catch {
        // Non-fatal: send will show an error if key is still null
    }

    renderedMessageIds.clear();
    loadMessages(id);
}

// ── Load messages ─────────────────────────────────────────────────────────────
async function loadMessages(conversationId: string) {
    messagesContainer.innerHTML = '<div class="m-auto text-base-content/30 text-sm">Loading...</div>';

    try {
        const res = await fetch(`/chat/${conversationId}/messages`);
        const data = await res.json();
        if (!data.success) throw new Error(data.message);

        await renderMessages(data.messages);
    } catch (err: any) {
        messagesContainer.innerHTML = `<div class="m-auto text-error text-sm">${err.message}</div>`;
    }
}

async function renderMessages(messages: any[]) {
    if (messages.length === 0) {
        messagesContainer.innerHTML = '<div class="m-auto text-base-content/30 text-sm">No messages yet. Say hi!</div>';
        return;
    }
    messagesContainer.innerHTML = '';
    for (const msg of messages) {
        renderedMessageIds.add(msg.id); // track so WS pushes don't duplicate
        const el = await buildMessageEl(msg);
        messagesContainer.appendChild(el);
    }
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

async function buildMessageEl(msg: {
    id: string;
    senderUsername: string;
    senderId: string;
    content: string | null;
    deleted: boolean;
    createdAt: string;
}) {
    const isMine = currentUserId && msg.senderId === currentUserId;

    // Attempt to decrypt the message content
    let displayContent: string;
    let decryptFailed = false;
    if (msg.deleted || msg.content === null) {
        displayContent = 'This message was deleted.';
    } else if (hasCredentials()) {
        try {
            const decrypted = await decryptMessageWithKey(msg.content, pgpPrivateKey()!, pgpPassphrase()!);
            displayContent = decrypted !== null ? decrypted : msg.content; // null = plaintext legacy
        } catch {
            displayContent = msg.content;
            decryptFailed = true;
        }
    } else {
        displayContent = msg.content;
        decryptFailed = true;
    }

    const li = document.createElement('div');
    li.className = `flex flex-col ${isMine ? 'items-end' : 'items-start'} group`;
    li.dataset.messageId = msg.id;

    const bubble = document.createElement('div');
    bubble.className = `relative max-w-sm px-4 py-2 rounded-2xl text-sm shadow
        ${msg.deleted ? 'bg-base-200 text-base-content/40 italic' : isMine ? 'bg-primary text-primary-content' : 'bg-base-100 text-base-content'}`;

    bubble.innerHTML = `
        <span class="block text-xs font-semibold mb-1 opacity-70">${escHtml(msg.senderUsername)}</span>
        <span>${msg.deleted ? 'This message was deleted.' : escHtml(displayContent)}</span>
        ${decryptFailed ? '<span class="block text-xs opacity-50 mt-1">⚠ Could not decrypt</span>' : ''}
    `;

    // Delete button (own messages only, not already deleted)
    if (isMine && !msg.deleted) {
        const delBtn = document.createElement('button');
        delBtn.className = 'absolute -top-2 -right-2 btn btn-xs btn-error opacity-0 group-hover:opacity-100 transition-opacity rounded-full';
        delBtn.title = 'Delete message';
        delBtn.textContent = '✕';
        delBtn.onclick = () => deleteMessage(msg.id, li);
        bubble.appendChild(delBtn);
    }

    const time = document.createElement('span');
    time.className = 'text-xs text-base-content/30 mt-1 px-1';
    time.textContent = msg.createdAt;

    li.appendChild(bubble);
    li.appendChild(time);
    return li;
}

// ── Send message ──────────────────────────────────────────────────────────────
async function doSend() {
    const content = messageInput.value.trim();
    if (!content || !activeConversationId) return;

    messageInput.value = '';
    messageInput.style.height = 'auto';
    sendBtn.disabled = true;

    try {
        if (!activeReceiverPublicKey) throw new Error('Cannot send message: recipient public key is unavailable.');
        const myKey = pgpPublicKey();
        if (!myKey) throw new Error('Encryption keys not loaded. Please unlock encryption first.');

        const payload = await encryptChatMessage(content, activeReceiverPublicKey, myKey);

        const res = await fetch(`/chat/${activeConversationId}/messages`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ content: payload }),
        });
        const data = await res.json();
        if (!data.success) throw new Error(data.message);
        // WebSocket push will deliver the message to both participants in real time
    } catch (err: any) {
        messageInput.value = content; // restore on failure
        alert(err.message);
    } finally {
        sendBtn.disabled = false;
        messageInput.focus();
    }
}

sendBtn.onclick = doSend;

messageInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        doSend();
    }
});

// Auto-grow textarea
messageInput.addEventListener('input', () => {
    messageInput.style.height = 'auto';
    messageInput.style.height = messageInput.scrollHeight + 'px';
});

// ── Delete message ────────────────────────────────────────────────────────────
async function deleteMessage(messageId: string, el: HTMLElement) {
    if (!activeConversationId) return;
    try {
        const res = await fetch(`/chat/${activeConversationId}/messages/${messageId}`, {
            method: 'DELETE',
        });
        const data = await res.json();
        if (!data.success) throw new Error(data.message);
        // Re-render the bubble as deleted in place
        const bubble = el.querySelector('div')!;
        bubble.className = 'relative max-w-sm px-4 py-2 rounded-2xl text-sm shadow bg-base-200 text-base-content/40 italic';
        bubble.innerHTML = `<span class="block text-xs font-semibold mb-1 opacity-70">You</span><span>This message was deleted.</span>`;
    } catch (err: any) {
        alert(err.message);
    }
}

// ── Pin / Unpin ───────────────────────────────────────────────────────────────
async function togglePin(conversationId: string, item: HTMLElement, btn: HTMLElement) {
    try {
        const res = await fetch(`/chat/${conversationId}/pin`, { method: 'POST' });
        const data = await res.json();
        if (!data.success) throw new Error(data.message);

        item.dataset.pinned = data.pinned ? 'true' : 'false';
        btn.textContent = data.pinned ? 'Unpin' : 'Pin';
        btn.title = data.pinned ? 'Unpin' : 'Pin';

        // Update pin icon
        const nameDiv = item.querySelector('.flex.items-center.gap-1') as HTMLElement;
        const existingIcon = nameDiv.querySelector('span.text-warning');
        if (data.pinned && !existingIcon) {
            const icon = document.createElement('span');
            icon.className = 'text-warning text-xs';
            icon.title = 'Pinned';
            icon.textContent = '📌';
            nameDiv.prepend(icon);
        } else if (!data.pinned && existingIcon) {
            existingIcon.remove();
        }

        // Re-sort the list: pinned at top
        const items = Array.from(conversationList.querySelectorAll<HTMLElement>('.conversation-item'));
        items.sort((a, b) => {
            const ap = a.dataset.pinned === 'true' ? 0 : 1;
            const bp = b.dataset.pinned === 'true' ? 0 : 1;
            return ap - bp;
        });
        items.forEach(i => conversationList.appendChild(i));
    } catch (err: any) {
        alert(err.message);
    }
}

// ── New chat: friend picker ───────────────────────────────────────────────────
newChatBtn.onclick = async () => {
    if (!friendPicker.classList.contains('hidden')) {
        friendPicker.classList.add('hidden');
        return;
    }
    friendPickerList.innerHTML = '<li class="text-xs text-base-content/40 italic">Loading...</li>';
    friendPicker.classList.remove('hidden');

    try {
        const res = await fetch('/friends/list');
        const data = await res.json();
        if (!data.success || !data.friends.length) {
            friendPickerList.innerHTML = '<li class="text-xs text-base-content/40 italic">No friends yet.</li>';
            return;
        }
        friendPickerList.innerHTML = '';
        for (const f of data.friends) {
            const li = document.createElement('li');
            li.className = 'btn btn-ghost btn-sm justify-start text-left w-full';
            li.textContent = f.username;
            li.onclick = () => startChat(f.id);
            friendPickerList.appendChild(li);
        }
    } catch {
        friendPickerList.innerHTML = '<li class="text-xs text-error">Failed to load friends.</li>';
    }
};

async function startChat(friendId: string) {
    friendPicker.classList.add('hidden');
    try {
        const res = await fetch('/chat/start', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ friendId }),
        });
        const data = await res.json();
        if (!data.success) throw new Error(data.message);
        // Redirect to chat page (which will load all convos including the new one)
        window.location.href = `/chat?open=${data.conversationId}`;
    } catch (err: any) {
        alert(err.message);
    }
}

// ── Unlock overlay ────────────────────────────────────────────────────────────
const unlockOverlay   = document.getElementById('unlockOverlay')   as HTMLDivElement;
const unlockKeyFile   = document.getElementById('unlockKeyFile')   as HTMLInputElement;
const unlockPassphrase = document.getElementById('unlockPassphrase') as HTMLInputElement;
const unlockBtn       = document.getElementById('unlockBtn')       as HTMLButtonElement;
const unlockError     = document.getElementById('unlockError')     as HTMLParagraphElement;

function showUnlockError(msg: string) {
    unlockError.textContent = msg;
    unlockError.classList.remove('hidden');
}

// Show overlay on load if credentials are missing
if (!hasCredentials()) {
    unlockOverlay.classList.remove('hidden');
}

unlockBtn.onclick = async () => {
    unlockError.classList.add('hidden');
    const file = unlockKeyFile.files?.[0];
    const pass = unlockPassphrase.value;
    if (!file) return showUnlockError('Please select your private key file.');
    if (!pass)  return showUnlockError('Please enter your passphrase.');

    unlockBtn.disabled = true;
    unlockBtn.textContent = 'Verifying…';
    try {
        // @ts-ignore
        const { getgpgPublicKey } = await import('../jslibs/PGPUtils.js');
        const privateKeyArmored = await file.text();
        const publicKeyArmored = await getgpgPublicKey(file, pass); // throws if passphrase wrong

        sessionStorage.setItem('pgpPrivateKey', privateKeyArmored);
        sessionStorage.setItem('pgpPassphrase', pass);
        sessionStorage.setItem('pgpPublicKey', publicKeyArmored);

        unlockOverlay.classList.add('hidden');
        // Re-render open conversation with decrypted messages
        if (activeConversationId) loadMessages(activeConversationId);
    } catch (err: any) {
        showUnlockError(err.message ?? 'Incorrect passphrase or invalid key file.');
    } finally {
        unlockBtn.disabled = false;
        unlockBtn.textContent = 'Unlock';
    }
};

// ── Auto-open conversation from URL param (?open=id) ─────────────────────────
const urlParams = new URLSearchParams(window.location.search);
const openId = urlParams.get('open');
if (openId) {
    const target = conversationList.querySelector<HTMLElement>(`.conversation-item[data-id="${openId}"]`);
    if (target) openConversation(openId, target);
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function escHtml(str: string) {
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
