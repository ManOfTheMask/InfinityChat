// @ts-ignore
import { encryptChatMessage, encryptGroupMessage, decryptMessageWithKey } from '../jslibs/PGPUtils.js';

// ── Avatar cache ──────────────────────────────────────────────────────────────
const avatarCache = new Map<string, string | null>();

async function fetchAvatar(userId: string): Promise<string | null> {
    if (avatarCache.has(userId)) return avatarCache.get(userId)!;
    try {
        const res = await fetch(`/user/${userId}/avatar`);
        const data = await res.json();
        const url: string | null = data.success && data.profilePicture ? data.profilePicture : null;
        avatarCache.set(userId, url);
        return url;
    } catch {
        avatarCache.set(userId, null);
        return null;
    }
}

// ── State ─────────────────────────────────────────────────────────────────────
let activeConversationId: string | null = null;
let activeConversationType: 'dm' | 'group' = 'dm';
let activeReceiverPublicKey: string | null = null;
let activeGroupKeyring: string[] = [];   // all members' armored public keys
let activeGroupAdminId: string | null = null;
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

        if (data.type === 'new_group_message') {
            if (renderedMessageIds.has(data.message.id)) return;
            renderedMessageIds.add(data.message.id);
            if (data.groupId === activeConversationId) {
                const el = await buildMessageEl(data.message);
                messagesContainer.appendChild(el);
                messagesContainer.scrollTop = messagesContainer.scrollHeight;
            }
        }

        if (data.type === 'group_message_deleted') {
            if (data.groupId === activeConversationId) {
                const el = messagesContainer.querySelector<HTMLElement>(`[data-message-id="${data.messageId}"]`);
                if (el) {
                    const bubble = el.querySelector('div')!;
                    bubble.className = 'relative max-w-sm px-4 py-2 rounded-2xl text-sm shadow bg-base-200 text-base-content/40 italic';
                    bubble.innerHTML = '<span class="block text-xs font-semibold mb-1 opacity-70">Deleted</span><span>This message was deleted.</span>';
                }
            }
        }

        // A new member was added to the current group — refresh keyring and member panel
        if (data.type === 'group_member_added' && data.groupId === activeConversationId && activeConversationId) {
            await refreshGroupKeyring(activeConversationId);
            renderMembersPanel(activeConversationId);
        }

        // A member was removed from the current group
        if (data.type === 'group_member_removed' && data.groupId === activeConversationId && activeConversationId) {
            if (data.memberId === currentUserId) {
                // Current user was kicked — close the group view
                closeActiveConversation();
                const item = conversationList.querySelector<HTMLElement>(`.conversation-item[data-id="${data.groupId}"]`);
                item?.remove();
            } else {
                await refreshGroupKeyring(activeConversationId);
                renderMembersPanel(activeConversationId);
            }
        }

        // Group was deleted by admin
        if (data.type === 'group_deleted') {
            const item = conversationList.querySelector<HTMLElement>(`.conversation-item[data-id="${data.groupId}"]`);
            item?.remove();
            if (data.groupId === activeConversationId) closeActiveConversation();
        }

        // Group was renamed
        if (data.type === 'group_renamed') {
            const item = conversationList.querySelector<HTMLElement>(`.conversation-item[data-id="${data.groupId}"]`);
            const fallback = item?.querySelector<HTMLElement>('.font-medium')?.dataset.memberList ?? 'Group Chat';
            const displayName = data.name ?? fallback;
            if (item) {
                const nameSpan = item.querySelector<HTMLElement>('.font-medium');
                if (nameSpan) nameSpan.textContent = displayName;
            }
            if (data.groupId === activeConversationId) {
                chatHeaderName.textContent = displayName;
                membersPanelTitle.textContent = displayName;
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
const newGroupBtn        = document.getElementById('newGroupBtn')          as HTMLButtonElement;
const friendPicker       = document.getElementById('friendPicker')         as HTMLDivElement;
const friendPickerList   = document.getElementById('friendPickerList')     as HTMLUListElement;
const chatHeaderName     = document.getElementById('chatHeaderName')       as HTMLSpanElement;
const messagesContainer  = document.getElementById('messagesContainer')    as HTMLDivElement;
const messagesPlaceholder = document.getElementById('messagesPlaceholder') as HTMLDivElement | null;
const messageInput       = document.getElementById('messageInput')         as HTMLTextAreaElement;
const sendBtn            = document.getElementById('sendBtn')              as HTMLButtonElement;
const closeChatBtn       = document.getElementById('closeChatBtn')         as HTMLButtonElement;
const closeChatModal     = document.getElementById('closeChatModal')       as HTMLDialogElement;
const closeChatDeleteBtn = document.getElementById('closeChatDeleteBtn')   as HTMLButtonElement;
const closeChatOnlyBtn   = document.getElementById('closeChatOnlyBtn')     as HTMLButtonElement;
const closeChatCancelBtn = document.getElementById('closeChatCancelBtn')   as HTMLButtonElement;
const groupMembersBtn    = document.getElementById('groupMembersBtn')      as HTMLButtonElement;
const renameGroupHeaderBtn = document.getElementById('renameGroupHeaderBtn') as HTMLButtonElement;
const groupMembersPanel  = document.getElementById('groupMembersPanel')    as HTMLElement;
const closeMembersPanel  = document.getElementById('closeMembersPanel')    as HTMLButtonElement;
const membersList        = document.getElementById('membersList')          as HTMLUListElement;
const addMemberBtn       = document.getElementById('addMemberBtn')         as HTMLButtonElement;
const leaveGroupBtn      = document.getElementById('leaveGroupBtn')        as HTMLButtonElement;
const newGroupModal      = document.getElementById('newGroupModal')        as HTMLDialogElement;
const groupNameInput     = document.getElementById('groupNameInput')       as HTMLInputElement;
const groupFriendPickerList = document.getElementById('groupFriendPickerList') as HTMLUListElement;
const groupCreateBtn     = document.getElementById('groupCreateBtn')       as HTMLButtonElement;
const groupCreateCancelBtn = document.getElementById('groupCreateCancelBtn') as HTMLButtonElement;
const groupCreateError   = document.getElementById('groupCreateError')     as HTMLParagraphElement;
const addMemberModal     = document.getElementById('addMemberModal')       as HTMLDialogElement;
const addMemberUsernameInput = document.getElementById('addMemberUsernameInput') as HTMLInputElement;
const addMemberFriendList = document.getElementById('addMemberFriendList') as HTMLUListElement;
const addMemberConfirmBtn = document.getElementById('addMemberConfirmBtn') as HTMLButtonElement;
const addMemberCancelBtn  = document.getElementById('addMemberCancelBtn')  as HTMLButtonElement;
const addMemberError      = document.getElementById('addMemberError')      as HTMLParagraphElement;
const renameGroupModal    = document.getElementById('renameGroupModal')    as HTMLDialogElement;
const renameGroupInput    = document.getElementById('renameGroupInput')    as HTMLInputElement;
const renameGroupError    = document.getElementById('renameGroupError')    as HTMLParagraphElement;
const renameGroupConfirmBtn = document.getElementById('renameGroupConfirmBtn') as HTMLButtonElement;
const renameGroupCancelBtn  = document.getElementById('renameGroupCancelBtn')  as HTMLButtonElement;
const renameGroupBtn      = document.getElementById('renameGroupBtn')      as HTMLButtonElement;
const deleteGroupBtn      = document.getElementById('deleteGroupBtn')      as HTMLButtonElement;
const membersPanelTitle   = document.getElementById('membersPanelTitle')   as HTMLElement;

// ── Conversation list: click to open ─────────────────────────────────────────
conversationList.addEventListener('click', (e) => {
    const target = e.target as HTMLElement;

    // Pin button
    const pinBtn = target.closest<HTMLElement>('.pin-btn');
    if (pinBtn) {
        const item = pinBtn.closest<HTMLElement>('.conversation-item')!;
        togglePin(item.dataset.id!, item.dataset.type as 'dm' | 'group', item, pinBtn);
        return;
    }

    // Conversation row
    const item = target.closest<HTMLElement>('.conversation-item');
    if (!item) return;

    if (item.dataset.type === 'group') {
        openGroupConversation(item.dataset.id!, item);
    } else {
        openConversation(item.dataset.id!, item);
    }
});

async function openConversation(id: string, item: HTMLElement) {
    // Highlight active item
    document.querySelectorAll('.conversation-item').forEach(el => el.classList.remove('bg-base-200'));
    item.classList.add('bg-base-200');

    activeConversationId = id;
    activeConversationType = 'dm';
    activeReceiverPublicKey = null;
    activeGroupKeyring = [];
    activeGroupAdminId = null;
    chatHeaderName.textContent = item.querySelector('.font-medium')?.textContent ?? 'Chat';
    chatHeaderName.classList.remove('text-base-content/40', 'italic');
    closeChatBtn.classList.remove('hidden');
    groupMembersBtn.classList.add('hidden');
    renameGroupHeaderBtn.classList.add('hidden');
    groupMembersPanel.classList.add('hidden');

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
    avatarCache.clear();
    loadMessages(id);
}

async function openGroupConversation(id: string, item: HTMLElement) {
    document.querySelectorAll('.conversation-item').forEach(el => el.classList.remove('bg-base-200'));
    item.classList.add('bg-base-200');

    activeConversationId = id;
    activeConversationType = 'group';
    activeReceiverPublicKey = null;
    activeGroupKeyring = [];
    activeGroupAdminId = item.dataset.adminId ?? null;
    chatHeaderName.textContent = item.querySelector('.font-medium')?.textContent ?? 'Group Chat';
    chatHeaderName.classList.remove('text-base-content/40', 'italic');
    closeChatBtn.classList.add('hidden');        // no "close" for groups — use Leave instead
    groupMembersBtn.classList.remove('hidden');
    renameGroupHeaderBtn.classList.remove('hidden');

    messageInput.disabled = false;
    sendBtn.disabled = false;
    messageInput.focus();

    renderedMessageIds.clear();
    avatarCache.clear();

    await refreshGroupKeyring(id);
    loadGroupMessages(id);
}

// ── Group helpers ─────────────────────────────────────────────────────────────
async function refreshGroupKeyring(groupId: string) {
    try {
        const res = await fetch(`/group/${groupId}/keyring`);
        const data = await res.json();
        if (data.success) activeGroupKeyring = data.keys;
    } catch { /* non-fatal */ }
}

async function loadGroupMessages(groupId: string) {
    messagesContainer.innerHTML = '<div class="m-auto text-base-content/30 text-sm">Loading...</div>';
    try {
        const res = await fetch(`/group/${groupId}/messages`);
        const data = await res.json();
        if (!data.success) throw new Error(data.message);
        await renderMessages(data.messages);
    } catch (err: any) {
        messagesContainer.innerHTML = `<div class="m-auto text-error text-sm">${err.message}</div>`;
    }
}

async function renderMembersPanel(groupId: string) {
    groupMembersPanel.classList.remove('hidden');
    membersList.innerHTML = '<li class="text-xs text-base-content/40 italic p-2">Loading...</li>';
    try {
        const res = await fetch(`/group/${groupId}/info`);
        const data = await res.json();
        if (!data.success) throw new Error(data.message);
        const group = data.group;
        activeGroupAdminId = group.adminId?._id?.toString() ?? group.adminId?.toString() ?? null;

        // Panel title: group name or member list
        const memberNames = group.members.map((m: any) => m.userId.username).join(', ');
        membersPanelTitle.textContent = group.name ?? memberNames;

        // Show delete button only for admin
        if (currentUserId === activeGroupAdminId) {
            deleteGroupBtn.classList.remove('hidden');
        } else {
            deleteGroupBtn.classList.add('hidden');
        }

        membersList.innerHTML = '';
        for (const m of group.members) {
            const li = document.createElement('li');
            li.className = 'flex items-center justify-between gap-2 px-2 py-1 rounded hover:bg-base-200';
            const isAdmin = m.userId._id.toString() === activeGroupAdminId;
            const isSelf  = m.userId._id.toString() === currentUserId;
            const canKick = currentUserId === activeGroupAdminId && !isSelf;

            li.innerHTML = `
                <span class="text-sm truncate">${escHtml(m.userId.username)}${isAdmin ? ' <span class="text-xs opacity-50">(admin)</span>' : ''}</span>
                ${canKick ? `<button class="btn btn-xs btn-error kick-btn" data-member-id="${m.userId._id}">Kick</button>` : ''}
            `;
            membersList.appendChild(li);
        }

        // Kick buttons
        membersList.querySelectorAll<HTMLButtonElement>('.kick-btn').forEach(btn => {
            btn.onclick = () => kickMember(groupId, btn.dataset.memberId!);
        });
    } catch (err: any) {
        membersList.innerHTML = `<li class="text-xs text-error p-2">${err.message}</li>`;
    }
}

async function kickMember(groupId: string, memberId: string) {
    if (!confirm('Remove this member from the group?')) return;
    try {
        const res = await fetch(`/group/${groupId}/members/${memberId}`, { method: 'DELETE' });
        const data = await res.json();
        if (!data.success) throw new Error(data.message);
        renderMembersPanel(groupId);
    } catch (err: any) {
        alert(err.message);
    }
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

    // Fetch avatar (uses cache after first load)
    const avatarUrl = await fetchAvatar(msg.senderId);

    const li = document.createElement('div');
    li.className = `flex flex-col ${isMine ? 'items-end' : 'items-start'} group`;
    li.dataset.messageId = msg.id;

    // Row: avatar + bubble
    const row = document.createElement('div');
    row.className = `flex items-end gap-2 ${isMine ? 'flex-row-reverse' : 'flex-row'}`;

    // Avatar
    const avatar = document.createElement('img');
    avatar.className = 'w-7 h-7 rounded-full object-cover flex-shrink-0 self-end';
    avatar.alt = escHtml(msg.senderUsername);
    avatar.src = avatarUrl ?? '/img/profileplaceholder.jpg';

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

    row.appendChild(avatar);
    row.appendChild(bubble);

    const time = document.createElement('span');
    time.className = 'text-xs text-base-content/30 mt-1 px-1';
    time.textContent = msg.createdAt;

    li.appendChild(row);
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
        let payload: string;
        let url: string;

        if (activeConversationType === 'group') {
            if (!activeGroupKeyring.length) throw new Error('No encryption keys available for this group.');
            const myKey = pgpPublicKey();
            // Include current user's own key so they can decrypt their own messages
            const allKeys = myKey ? [...activeGroupKeyring, myKey] : activeGroupKeyring;
            payload = await encryptGroupMessage(content, allKeys);
            url = `/group/${activeConversationId}/messages`;
        } else {
            if (!activeReceiverPublicKey) throw new Error('Cannot send message: recipient public key is unavailable.');
            const myKey = pgpPublicKey();
            if (!myKey) throw new Error('Encryption keys not loaded. Please unlock encryption first.');
            payload = await encryptChatMessage(content, activeReceiverPublicKey, myKey);
            url = `/chat/${activeConversationId}/messages`;
        }

        const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ content: payload }),
        });
        const data = await res.json();
        if (!data.success) throw new Error(data.message);
        // WebSocket push will deliver the message to all participants in real time
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
        const url = activeConversationType === 'group'
            ? `/group/${activeConversationId}/messages/${messageId}`
            : `/chat/${activeConversationId}/messages/${messageId}`;
        const res = await fetch(url, { method: 'DELETE' });
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
async function togglePin(id: string, type: 'dm' | 'group', item: HTMLElement, btn: HTMLElement) {
    try {
        const url = type === 'group' ? `/group/${id}/pin` : `/chat/${id}/pin`;
        const res = await fetch(url, { method: 'POST' });
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
    if (target) {
        if (target.dataset.type === 'group') {
            openGroupConversation(openId, target);
        } else {
            openConversation(openId, target);
        }
    }
}

// ── Close chat ────────────────────────────────────────────────────────────────
closeChatBtn.onclick = () => {
    if (!activeConversationId) return;
    closeChatModal.showModal();
};

closeChatCancelBtn.onclick = () => closeChatModal.close();

async function doCloseChat(deleteMessages: boolean) {
    if (!activeConversationId) return;
    const convId = activeConversationId;
    closeChatModal.close();

    try {
        const res = await fetch(`/chat/${convId}`, {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ deleteMessages }),
        });
        const data = await res.json();
        if (!data.success) throw new Error(data.message);

        // Remove from sidebar
        const item = conversationList.querySelector<HTMLElement>(`.conversation-item[data-id="${convId}"]`);
        item?.remove();
        closeActiveConversation();
    } catch (err: any) {
        alert(err.message);
    }
}

function closeActiveConversation() {
    activeConversationId = null;
    activeConversationType = 'dm';
    activeReceiverPublicKey = null;
    activeGroupKeyring = [];
    activeGroupAdminId = null;
    chatHeaderName.textContent = 'Select a chat';
    chatHeaderName.classList.add('text-base-content/40', 'italic');
    closeChatBtn.classList.add('hidden');
    groupMembersBtn.classList.add('hidden');
    renameGroupHeaderBtn.classList.add('hidden');
    groupMembersPanel.classList.add('hidden');
    messagesContainer.innerHTML = '<div id="messagesPlaceholder" class="m-auto text-base-content/30 text-sm select-none">Open a conversation to start chatting</div>';
    messageInput.disabled = true;
    sendBtn.disabled = true;
}

closeChatDeleteBtn.onclick = () => doCloseChat(true);
closeChatOnlyBtn.onclick   = () => doCloseChat(false);

// ── Group members panel ───────────────────────────────────────────────────────
groupMembersBtn.onclick = () => {
    if (!activeConversationId) return;
    if (groupMembersPanel.classList.contains('hidden')) {
        renderMembersPanel(activeConversationId);
    } else {
        groupMembersPanel.classList.add('hidden');
    }
};
closeMembersPanel.onclick = () => groupMembersPanel.classList.add('hidden');

leaveGroupBtn.onclick = async () => {
    if (!activeConversationId) return;
    if (!confirm('Leave this group? Your messages will be deleted.')) return;
    const groupId = activeConversationId;
    try {
        const res = await fetch(`/group/${groupId}/leave`, { method: 'POST' });
        const data = await res.json();
        if (!data.success) throw new Error(data.message);
        const item = conversationList.querySelector<HTMLElement>(`.conversation-item[data-id="${groupId}"]`);
        item?.remove();
        closeActiveConversation();
    } catch (err: any) {
        alert(err.message);
    }
};

// Delete group (admin only)
deleteGroupBtn.onclick = async () => {
    if (!activeConversationId) return;
    if (!confirm('Delete this group for everyone? This cannot be undone.')) return;
    const groupId = activeConversationId;
    try {
        const res = await fetch(`/group/${groupId}`, { method: 'DELETE' });
        const data = await res.json();
        if (!data.success) throw new Error(data.message);
        const item = conversationList.querySelector<HTMLElement>(`.conversation-item[data-id="${groupId}"]`);
        item?.remove();
        closeActiveConversation();
    } catch (err: any) {
        alert(err.message);
    }
};

// Rename group — called from both header button and members panel ✏️ button
function openRenameModal() {
    if (!activeConversationId) return;
    renameGroupInput.value = '';
    renameGroupError.classList.add('hidden');
    renameGroupModal.showModal();
    renameGroupInput.focus();
}

renameGroupHeaderBtn.onclick = openRenameModal;

// Rename group
renameGroupBtn.onclick = openRenameModal;

renameGroupCancelBtn.onclick = () => renameGroupModal.close();

renameGroupConfirmBtn.onclick = async () => {
    if (!activeConversationId) return;
    const groupId = activeConversationId;
    const newName = renameGroupInput.value.trim() || null;
    renameGroupError.classList.add('hidden');
    try {
        const res = await fetch(`/group/${groupId}/name`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: newName }),
        });
        const data = await res.json();
        if (!data.success) throw new Error(data.message);
        renameGroupModal.close();
        // Update sidebar and header inline (WS broadcast will also update for other members)
        const item = conversationList.querySelector<HTMLElement>(`.conversation-item[data-id="${groupId}"]`);
        const fallback = item?.querySelector<HTMLElement>('.font-medium')?.dataset.memberList ?? 'Group Chat';
        const displayName = data.name ?? fallback;
        if (item) {
            const nameSpan = item.querySelector<HTMLElement>('.font-medium');
            if (nameSpan) nameSpan.textContent = displayName;
        }
        if (groupId === activeConversationId) {
            chatHeaderName.textContent = displayName;
        }
        membersPanelTitle.textContent = displayName;
    } catch (err: any) {
        renameGroupError.textContent = err.message;
        renameGroupError.classList.remove('hidden');
    }
};


let selectedAddMemberUserId: string | null = null;

addMemberBtn.onclick = async () => {
    if (!activeConversationId) return;
    selectedAddMemberUserId = null;
    addMemberUsernameInput.value = '';
    addMemberError.classList.add('hidden');
    addMemberFriendList.innerHTML = '<li class="text-xs text-base-content/40 italic">Loading...</li>';
    addMemberModal.showModal();

    try {
        const res = await fetch('/friends/list');
        const data = await res.json();
        addMemberFriendList.innerHTML = '';
        if (!data.success || !data.friends.length) {
            addMemberFriendList.innerHTML = '<li class="text-xs text-base-content/40 italic">No friends.</li>';
            return;
        }
        for (const f of data.friends) {
            const li = document.createElement('li');
            li.className = 'flex items-center gap-2 px-2 py-1 rounded cursor-pointer hover:bg-base-300';
            li.dataset.userId = f.id;
            li.innerHTML = `<span class="text-sm">${escHtml(f.username)}</span>`;
            li.onclick = () => {
                addMemberFriendList.querySelectorAll('li').forEach(el => el.classList.remove('bg-primary/20'));
                li.classList.add('bg-primary/20');
                selectedAddMemberUserId = f.id;
                addMemberUsernameInput.value = '';
            };
            addMemberFriendList.appendChild(li);
        }
    } catch {
        addMemberFriendList.innerHTML = '<li class="text-xs text-error">Failed to load friends.</li>';
    }
};

addMemberCancelBtn.onclick = () => addMemberModal.close();

addMemberConfirmBtn.onclick = async () => {
    if (!activeConversationId) return;
    const byUsername = addMemberUsernameInput.value.trim();
    const targetUserId = byUsername ? null : selectedAddMemberUserId;

    addMemberError.classList.add('hidden');
    addMemberConfirmBtn.disabled = true;

    try {
        // Resolve username → userId if provided
        let resolvedId = targetUserId;
        if (byUsername) {
            const searchRes = await fetch(`/user/search?username=${encodeURIComponent(byUsername)}`);
            const searchData = await searchRes.json();
            if (!searchData.success || !searchData.userId) throw new Error('User not found.');
            resolvedId = searchData.userId;
        }
        if (!resolvedId) throw new Error('Please select a friend or enter a username.');

        const res = await fetch(`/group/${activeConversationId}/invite`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ targetUserId: resolvedId }),
        });
        const data = await res.json();
        if (!data.success) throw new Error(data.message);
        addMemberModal.close();
        renderMembersPanel(activeConversationId!);
    } catch (err: any) {
        addMemberError.textContent = err.message;
        addMemberError.classList.remove('hidden');
    } finally {
        addMemberConfirmBtn.disabled = false;
    }
};

// ── New group modal ───────────────────────────────────────────────────────────
newGroupBtn.onclick = async () => {
    groupNameInput.value = '';
    groupCreateError.classList.add('hidden');
    groupFriendPickerList.innerHTML = '<li class="text-xs text-base-content/40 italic">Loading friends...</li>';
    newGroupModal.showModal();

    try {
        const res = await fetch('/friends/list');
        const data = await res.json();
        groupFriendPickerList.innerHTML = '';
        if (!data.success || !data.friends.length) {
            groupFriendPickerList.innerHTML = '<li class="text-xs text-base-content/40 italic">No friends to add.</li>';
            return;
        }
        for (const f of data.friends) {
            const li = document.createElement('li');
            li.className = 'flex items-center gap-2 px-2 py-1 rounded';
            const cb = document.createElement('input');
            cb.type = 'checkbox';
            cb.value = f.id;
            cb.id = `gf-${f.id}`;
            cb.className = 'checkbox checkbox-sm';
            const label = document.createElement('label');
            label.htmlFor = cb.id;
            label.textContent = f.username;
            label.className = 'text-sm cursor-pointer';
            li.appendChild(cb);
            li.appendChild(label);
            groupFriendPickerList.appendChild(li);
        }
    } catch {
        groupFriendPickerList.innerHTML = '<li class="text-xs text-error">Failed to load friends.</li>';
    }
};

groupCreateCancelBtn.onclick = () => newGroupModal.close();

groupCreateBtn.onclick = async () => {
    groupCreateError.classList.add('hidden');
    const name = groupNameInput.value.trim() || null;
    const checked = Array.from(groupFriendPickerList.querySelectorAll<HTMLInputElement>('input[type=checkbox]:checked'));
    const memberIds = checked.map(cb => cb.value);

    if (memberIds.length < 1) {
        groupCreateError.textContent = 'Select at least one friend.';
        groupCreateError.classList.remove('hidden');
        return;
    }
    if (memberIds.length > 9) {
        groupCreateError.textContent = 'Maximum 9 additional members (10 total including you).';
        groupCreateError.classList.remove('hidden');
        return;
    }

    groupCreateBtn.disabled = true;
    try {
        const res = await fetch('/group/create', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, memberIds }),
        });
        const data = await res.json();
        if (!data.success) throw new Error(data.message);
        newGroupModal.close();
        window.location.href = `/chat?open=${data.groupId}`;
    } catch (err: any) {
        groupCreateError.textContent = err.message;
        groupCreateError.classList.remove('hidden');
    } finally {
        groupCreateBtn.disabled = false;
    }
};

// ── Helpers ───────────────────────────────────────────────────────────────────
function escHtml(str: string) {
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function buildFallbackName(item: HTMLElement): string {
    return item.querySelector<HTMLElement>('.font-medium')?.textContent ?? 'Group Chat';
}
