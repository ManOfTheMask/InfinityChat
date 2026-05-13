// ── Add-friend modal ─────────────────────────────────────────────────────────
{
const addFriendBtn = document.getElementById('add-friend-btn');
const modal = document.getElementById('add-friend-modal') as HTMLDialogElement | null;
const sendRequestBtn = document.getElementById('send-request-btn');
const addFriendKey = document.getElementById('add-friend-key') as HTMLTextAreaElement | null;

addFriendBtn?.addEventListener('click', () => modal?.showModal());

sendRequestBtn?.addEventListener('click', async () => {
    const publicKey = addFriendKey?.value.trim();
    if (!publicKey) return;
    sendRequestBtn.textContent = 'Sending…';
    (sendRequestBtn as HTMLButtonElement).disabled = true;
    try {
        const res = await fetch('/friends/request', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ publicKey }),
        });
        const data = await res.json();
        if (data.success) {
            modal?.close();
            if (addFriendKey) addFriendKey.value = '';
            showToast('Friend request sent!', 'success');
        } else {
            showToast(data.message ?? 'Failed to send request.', 'error');
        }
    } catch {
        showToast('Network error.', 'error');
    } finally {
        sendRequestBtn.textContent = 'Send Request';
        (sendRequestBtn as HTMLButtonElement).disabled = false;
    }
});
} // end add-friend block

// ── Accept / Decline friend requests ─────────────────────────────────────────
document.getElementById('pending-list')?.addEventListener('click', async (e) => {
    const target = e.target as HTMLElement;
    const btn = target.closest<HTMLButtonElement>('.accept-btn, .decline-btn');
    if (!btn) return;
    const id = btn.dataset.id;
    if (!id) return;

    const isAccept = btn.classList.contains('accept-btn');
    const endpoint = isAccept ? `/friends/accept/${id}` : `/friends/decline/${id}`;
    btn.disabled = true;

    try {
        const res = await fetch(endpoint, { method: 'POST' });
        const data = await res.json();
        if (data.success) {
            const li = document.querySelector<HTMLLIElement>(`[data-request-id="${id}"]`);
            li?.remove();
            const remaining = document.querySelectorAll('#pending-list li').length;
            if (remaining === 0) {
                const list = document.getElementById('pending-list');
                list?.closest('.bg-base-200')?.querySelector('ul')?.replaceWith(emptyState('No pending requests'));
            }
            showToast(isAccept ? 'Friend request accepted!' : 'Request declined.', 'success');
        } else {
            showToast(data.message ?? 'Something went wrong.', 'error');
            btn.disabled = false;
        }
    } catch {
        showToast('Network error.', 'error');
        btn.disabled = false;
    }
});

// ── Mark all notifications read ───────────────────────────────────────────────
document.getElementById('mark-all-read-btn')?.addEventListener('click', async () => {
    try {
        const res = await fetch('/notifications/read-all', { method: 'POST' });
        if (!res.ok) throw new Error();
        const notifList = document.getElementById('notif-list');
        if (notifList) {
            notifList.replaceWith(emptyState('All caught up'));
        }
        document.getElementById('mark-all-read-btn')?.remove();
        showToast('All notifications marked as read.', 'success');
    } catch {
        showToast('Network error.', 'error');
    }
});

// ── Helpers ───────────────────────────────────────────────────────────────────
function emptyState(msg: string): HTMLParagraphElement {
    const p = document.createElement('p');
    p.className = 'text-sm text-base-content/30 py-6 text-center';
    p.textContent = msg;
    return p;
}

function showToast(message: string, type: 'success' | 'error') {
    const toast = document.createElement('div');
    toast.className = `toast toast-end toast-bottom z-[999]`;
    toast.innerHTML = `<div class="alert alert-${type} text-sm py-2 px-4 shadow-lg">${message}</div>`;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
}
