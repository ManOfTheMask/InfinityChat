// @ts-ignore
import { generatePGPKeyPair } from '../jslibs/PGPUtils';

const generateKeyButton = document.getElementById('generateKeyButton') as HTMLButtonElement;
const keyPairOutput = document.getElementById('keyPairOutput') as HTMLPreElement;
const errorMessage = document.getElementById('errorMessage') as HTMLDivElement;
const downloadBtn = document.getElementById('downloadPrivateKeyBtn') as HTMLButtonElement;
const downloadLink = document.getElementById('privateKeyDownloadLink') as HTMLAnchorElement;
const userNameInput = document.getElementById('username') as HTMLInputElement;
const passphraseInput = document.getElementById('passphrase') as HTMLInputElement;

let lastPrivateKey = '';

generateKeyButton.addEventListener('click', async () => {
  // You may want to prompt for a name and passphrase here, or use defaults for demo
    const nameInput = { value: userNameInput.value };
    const passphrase = { value: passphraseInput.value };
    const publicKeyOutput = { textContent: '' };
    const privateKeyOutput = { textContent: '' };

await generatePGPKeyPair(
    nameInput,
    passphrase,
    publicKeyOutput,
    privateKeyOutput,
    errorMessage
);

keyPairOutput.textContent = `Public Key:\n${publicKeyOutput.textContent}\n\nPrivate Key:\n${privateKeyOutput.textContent}`;
lastPrivateKey = privateKeyOutput.textContent || '';

if (lastPrivateKey) {
    downloadBtn.style.display = '';
}
});

downloadBtn.addEventListener('click', () => {
if (!lastPrivateKey) return;
  // Sanitize username for filename
    const username = userNameInput.value.trim().replace(/[^a-zA-Z0-9_-]/g, '_') || 'user';
    const blob = new Blob([lastPrivateKey], { type: 'application/pgp-keys' });
    downloadLink.href = URL.createObjectURL(blob);
    downloadLink.download = `${username}_privatekey.asc`;
    downloadLink.style.display = '';
    downloadLink.click();
    downloadLink.style.display = 'none';
});