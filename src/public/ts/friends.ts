const addFriendBtn = document.getElementById('addFriendBtn') as HTMLButtonElement;
const addFriendModal = document.getElementById('addFriendModal') as HTMLDivElement;
const closeModalBtn = document.getElementById('closeModalBtn') as HTMLButtonElement;
const mainContent = document.getElementById('mainContent') as HTMLDivElement;
const publicKeyInput = document.getElementById('publicKeyInput') as HTMLTextAreaElement;
const sendRequestBtn = document.getElementById('sendRequestBtn') as HTMLButtonElement;
const modalMessage = document.getElementById('modalMessage') as HTMLParagraphElement;

function showModal() {
    addFriendModal.classList.remove('hidden');
    mainContent.classList.add('blur-sm');
    modalMessage.classList.add('hidden');
    modalMessage.textContent = '';
    publicKeyInput.value = '';
}

function hideModal() {
    addFriendModal.classList.add('hidden');
    mainContent.classList.remove('blur-sm');
}

addFriendBtn.onclick = showModal;
closeModalBtn.onclick = hideModal;

// Close modal when clicking the overlay backdrop
addFriendModal.addEventListener('click', (e) => {
    if (e.target === addFriendModal) hideModal();
});

sendRequestBtn.onclick = async () => {
    const publicKey = publicKeyInput.value.trim();
    if (!publicKey) {
        setModalMessage('Please paste a public key.', 'error');
        return;
    }

    sendRequestBtn.disabled = true;
    sendRequestBtn.textContent = 'Sending...';

    try {
        const res = await fetch('/friends/request', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ publicKey }),
        });
        const data = await res.json();
        if (data.success) {
            setModalMessage('Friend request sent!', 'success');
            setTimeout(hideModal, 1500);
        } else {
            setModalMessage(data.message || 'Failed to send request.', 'error');
        }
    } catch {
        setModalMessage('Network error. Please try again.', 'error');
    } finally {
        sendRequestBtn.disabled = false;
        sendRequestBtn.textContent = 'Send Request';
    }
};

function setModalMessage(text: string, type: 'success' | 'error') {
    modalMessage.textContent = text;
    modalMessage.className = `text-sm mb-3 ${type === 'success' ? 'text-success' : 'text-error'}`;
}

// Accept / Decline buttons for pending requests
document.querySelectorAll<HTMLLIElement>('[data-request-id]').forEach((item) => {
    const requestId = item.dataset.requestId!;

    item.querySelector<HTMLButtonElement>('.acceptBtn')!.onclick = async () => {
        await respondToRequest(requestId, 'accept', item);
    };

    item.querySelector<HTMLButtonElement>('.declineBtn')!.onclick = async () => {
        await respondToRequest(requestId, 'decline', item);
    };
});

// Message buttons: open/start a chat with this friend
document.querySelectorAll<HTMLButtonElement>('.messageBtn').forEach((btn) => {
    const item = btn.closest<HTMLElement>('[data-friend-id]')!;
    const friendId = item.dataset.friendId!;
    btn.onclick = async () => {
        btn.disabled = true;
        btn.textContent = '...';
        try {
            const res = await fetch('/chat/start', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ friendId }),
            });
            const data = await res.json();
            if (data.success) {
                window.location.href = `/chat?open=${data.conversationId}`;
            } else {
                alert(data.message || 'Failed to open chat.');
                btn.disabled = false;
                btn.textContent = 'Message';
            }
        } catch {
            alert('Network error.');
            btn.disabled = false;
            btn.textContent = 'Message';
        }
    };
});

async function respondToRequest(requestId: string, action: 'accept' | 'decline', item: HTMLElement) {
    try {
        const res = await fetch(`/friends/${action}/${requestId}`, { method: 'POST' });
        const data = await res.json();
        if (data.success) {
            item.remove();
            if (action === 'accept') {
                // Reload to update the friends list
                window.location.reload();
            }
        } else {
            alert(data.message || 'Something went wrong.');
        }
    } catch {
        alert('Network error. Please try again.');
    }
}