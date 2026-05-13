// ── Profile picture crop & upload ─────────────────────────────────────────────

const CROP_SIZE = 300;   // visible canvas dimensions (px)
const OUT_SIZE  = 256;   // exported image dimensions (px)

const modal        = document.getElementById('avatarModal')        as HTMLDialogElement;
const changeBtn    = document.getElementById('changeAvatarBtn')    as HTMLButtonElement;
const fileInput    = document.getElementById('avatarFileInput')    as HTMLInputElement;
const filePicker   = document.getElementById('avatarFilePicker')   as HTMLDivElement;
const cropArea     = document.getElementById('avatarCropArea')     as HTMLDivElement;
const canvas       = document.getElementById('avatarCropCanvas')   as HTMLCanvasElement;
const ctx          = canvas.getContext('2d')!;
const zoomInBtn    = document.getElementById('avatarZoomIn')       as HTMLButtonElement;
const zoomOutBtn   = document.getElementById('avatarZoomOut')      as HTMLButtonElement;
const saveBtn      = document.getElementById('avatarSaveBtn')      as HTMLButtonElement;
const cancelBtn    = document.getElementById('avatarCancelBtn')    as HTMLButtonElement;
const errorEl      = document.getElementById('avatarError')        as HTMLParagraphElement;
const profileImg   = document.getElementById('profilePicImg')      as HTMLImageElement;

// Crop state
let cropImg: HTMLImageElement | null = null;
let offsetX = 0;
let offsetY = 0;
let scale   = 1;
let minScale = 1;

// Drag state
let isDragging = false;
let dragStartX = 0;
let dragStartY = 0;
let dragOriginX = 0;
let dragOriginY = 0;

function showError(msg: string) {
    errorEl.textContent = msg;
    errorEl.classList.remove('hidden');
}
function clearError() {
    errorEl.textContent = '';
    errorEl.classList.add('hidden');
}

function clampOffsets() {
    if (!cropImg) return;
    const w = cropImg.width * scale;
    const h = cropImg.height * scale;
    // Ensure the image covers the full canvas (no blank areas visible inside the circle)
    const maxX = 0;
    const minX = CROP_SIZE - w;
    const maxY = 0;
    const minY = CROP_SIZE - h;
    offsetX = Math.min(maxX, Math.max(offsetX, Math.min(minX, 0)));
    offsetY = Math.min(maxY, Math.max(offsetY, Math.min(minY, 0)));
}

function drawCrop() {
    if (!cropImg) return;
    ctx.clearRect(0, 0, CROP_SIZE, CROP_SIZE);

    // Draw image
    ctx.drawImage(cropImg, offsetX, offsetY, cropImg.width * scale, cropImg.height * scale);

    // Draw dark overlay outside the circle
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.beginPath();
    ctx.rect(0, 0, CROP_SIZE, CROP_SIZE);
    ctx.arc(CROP_SIZE / 2, CROP_SIZE / 2, CROP_SIZE / 2, 0, Math.PI * 2, true);
    ctx.fill('evenodd');

    // Draw circle border guide
    ctx.beginPath();
    ctx.arc(CROP_SIZE / 2, CROP_SIZE / 2, CROP_SIZE / 2 - 1, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255,255,255,0.5)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.restore();
}

function initCrop(img: HTMLImageElement) {
    cropImg = img;
    // Fit image so the shorter dimension fills the canvas
    const fitScale = Math.max(CROP_SIZE / img.width, CROP_SIZE / img.height);
    minScale = fitScale;
    scale    = fitScale;
    offsetX  = (CROP_SIZE - img.width * scale) / 2;
    offsetY  = (CROP_SIZE - img.height * scale) / 2;
    drawCrop();
}

function applyZoom(delta: number, cx = CROP_SIZE / 2, cy = CROP_SIZE / 2) {
    if (!cropImg) return;
    const newScale = Math.max(minScale, Math.min(scale * delta, scale * 8));
    const ratio = newScale / scale;
    offsetX = cx - ratio * (cx - offsetX);
    offsetY = cy - ratio * (cy - offsetY);
    scale   = newScale;
    clampOffsets();
    drawCrop();
}

// File selection
fileInput.addEventListener('change', () => {
    clearError();
    const file = fileInput.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
        showError('Please select an image file.');
        return;
    }
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
        filePicker.classList.add('hidden');
        cropArea.classList.remove('hidden');
        saveBtn.classList.remove('hidden');
        initCrop(img);
    };
    img.onerror = () => showError('Failed to load image.');
    img.src = url;
});

// Mouse drag
canvas.addEventListener('mousedown', (e) => {
    isDragging = true;
    dragStartX = e.clientX;
    dragStartY = e.clientY;
    dragOriginX = offsetX;
    dragOriginY = offsetY;
});
window.addEventListener('mousemove', (e) => {
    if (!isDragging) return;
    offsetX = dragOriginX + (e.clientX - dragStartX);
    offsetY = dragOriginY + (e.clientY - dragStartY);
    clampOffsets();
    drawCrop();
});
window.addEventListener('mouseup', () => { isDragging = false; });

// Touch drag
canvas.addEventListener('touchstart', (e) => {
    if (e.touches.length !== 1) return;
    isDragging = true;
    dragStartX = e.touches[0].clientX;
    dragStartY = e.touches[0].clientY;
    dragOriginX = offsetX;
    dragOriginY = offsetY;
}, { passive: true });
canvas.addEventListener('touchmove', (e) => {
    if (!isDragging || e.touches.length !== 1) return;
    e.preventDefault();
    offsetX = dragOriginX + (e.touches[0].clientX - dragStartX);
    offsetY = dragOriginY + (e.touches[0].clientY - dragStartY);
    clampOffsets();
    drawCrop();
}, { passive: false });
canvas.addEventListener('touchend', () => { isDragging = false; });

// Scroll to zoom
canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    const rect = canvas.getBoundingClientRect();
    const cx = e.clientX - rect.left;
    const cy = e.clientY - rect.top;
    applyZoom(e.deltaY < 0 ? 1.1 : 0.9, cx, cy);
}, { passive: false });

// Button zoom
zoomInBtn.addEventListener('click',  () => applyZoom(1.15));
zoomOutBtn.addEventListener('click', () => applyZoom(1 / 1.15));

// Open / close modal
changeBtn.addEventListener('click', () => {
    clearError();
    filePicker.classList.remove('hidden');
    cropArea.classList.add('hidden');
    saveBtn.classList.add('hidden');
    fileInput.value = '';
    cropImg = null;
    modal.showModal();
});

cancelBtn.addEventListener('click', () => modal.close());

// Save: export cropped circle and upload
saveBtn.addEventListener('click', async () => {
    if (!cropImg) return;
    clearError();
    saveBtn.disabled = true;
    saveBtn.textContent = 'Saving…';

    try {
        // Render to OUT_SIZE x OUT_SIZE output canvas with circular clip
        const out = document.createElement('canvas');
        out.width  = OUT_SIZE;
        out.height = OUT_SIZE;
        const octx = out.getContext('2d')!;
        const ratio = OUT_SIZE / CROP_SIZE;

        octx.save();
        octx.beginPath();
        octx.arc(OUT_SIZE / 2, OUT_SIZE / 2, OUT_SIZE / 2, 0, Math.PI * 2);
        octx.clip();
        octx.drawImage(
            cropImg,
            offsetX * ratio,
            offsetY * ratio,
            cropImg.width  * scale * ratio,
            cropImg.height * scale * ratio,
        );
        octx.restore();

        const dataUrl = out.toDataURL('image/jpeg', 0.88);

        const res = await fetch('/profile/avatar', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ dataUrl }),
        });
        const data = await res.json();
        if (!data.success) throw new Error(data.message ?? 'Upload failed.');

        // Update the visible profile picture immediately
        profileImg.src = dataUrl;
        modal.close();
    } catch (err: any) {
        showError(err.message ?? 'Something went wrong.');
    } finally {
        saveBtn.disabled = false;
        saveBtn.textContent = 'Save';
    }
});

// ── Delete account ────────────────────────────────────────────────────────────
const deleteAccountModal      = document.getElementById('deleteAccountModal')      as HTMLDialogElement;
const deleteAccountBtn        = document.getElementById('deleteAccountBtn')        as HTMLButtonElement;
const deleteAccountConfirmBtn = document.getElementById('deleteAccountConfirmBtn') as HTMLButtonElement;
const deleteAccountCancelBtn  = document.getElementById('deleteAccountCancelBtn')  as HTMLButtonElement;
const deleteKeyFile           = document.getElementById('deleteKeyFile')           as HTMLInputElement;
const deletePassphrase        = document.getElementById('deletePassphrase')        as HTMLInputElement;
const deleteAccountError      = document.getElementById('deleteAccountError')      as HTMLParagraphElement;

deleteAccountBtn.addEventListener('click', () => {
    deleteKeyFile.value = '';
    deletePassphrase.value = '';
    deleteAccountError.classList.add('hidden');
    deleteAccountModal.showModal();
});

deleteAccountCancelBtn.addEventListener('click', () => deleteAccountModal.close());

deleteAccountConfirmBtn.addEventListener('click', async () => {
    deleteAccountError.classList.add('hidden');

    const file = deleteKeyFile.files?.[0];
    const passphrase = deletePassphrase.value;

    if (!file) {
        deleteAccountError.textContent = 'Please select your private key file.';
        deleteAccountError.classList.remove('hidden');
        return;
    }
    if (!passphrase) {
        deleteAccountError.textContent = 'Please enter your passphrase.';
        deleteAccountError.classList.remove('hidden');
        return;
    }

    let privateKeyArmored: string;
    try {
        privateKeyArmored = await file.text();
    } catch {
        deleteAccountError.textContent = 'Failed to read key file.';
        deleteAccountError.classList.remove('hidden');
        return;
    }

    deleteAccountConfirmBtn.disabled = true;
    deleteAccountConfirmBtn.textContent = 'Deleting…';

    try {
        const res = await fetch('/profile/account', {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ privateKeyArmored, passphrase }),
        });
        const data = await res.json();
        if (!data.success) throw new Error(data.message);

        // Replace modal content with success message + countdown
        deleteAccountModal.querySelector('.modal-box')!.innerHTML = `
            <h3 class="font-bold text-lg">Account Deleted</h3>
            <p class="text-sm text-base-content/70 mt-2">
                Your account and all associated data have been permanently deleted.
            </p>
            <div class="alert alert-warning mt-4 text-sm">
                <span>⚠️ <strong>Remember to delete your private key file</strong> from your device — it can no longer be used to log in but should still be kept off disk.</span>
            </div>
            <p class="text-sm text-base-content/50 mt-4">Redirecting to home in <span id="deleteCountdown">30</span>s…</p>
        `;

        let remaining = 30;
        const countdownEl = deleteAccountModal.querySelector<HTMLSpanElement>('#deleteCountdown')!;
        const interval = setInterval(() => {
            remaining -= 1;
            countdownEl.textContent = String(remaining);
            if (remaining <= 0) {
                clearInterval(interval);
                window.location.href = '/';
            }
        }, 1000);
    } catch (err: any) {
        deleteAccountError.textContent = err.message ?? 'Failed to delete account.';
        deleteAccountError.classList.remove('hidden');
        deleteAccountConfirmBtn.disabled = false;
        deleteAccountConfirmBtn.textContent = 'Delete My Account';
    }
});