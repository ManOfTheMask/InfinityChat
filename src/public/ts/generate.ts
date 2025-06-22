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

// Hide download button initially
if (downloadBtn) downloadBtn.style.display = 'none';

generateKeyButton.addEventListener('click', async () => {
  keyPairOutput.textContent = '';
  errorMessage.textContent = '';
  const name = userNameInput?.value || 'User';
  const passphrase = passphraseInput?.value || '';
  if (!name || !passphrase) {
    errorMessage.textContent = 'Please fill in all fields.';
    return;
  }
  keyPairOutput.textContent = 'Generating key pair...';
  try {
    const { publicKey, privateKey } = await generatePGPKeyPair(name, passphrase);
    keyPairOutput.textContent = `Public Key:\n${publicKey}\n\nPrivate Key:\n${privateKey}`;
    lastPrivateKey = privateKey;
    if (downloadBtn) downloadBtn.style.display = '';
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    errorMessage.textContent = `Error: ${errMsg}`;
    keyPairOutput.textContent = '';
    lastPrivateKey = '';
    if (downloadBtn) downloadBtn.style.display = 'none';
  }
});

downloadBtn.addEventListener('click', () => {
  if (!lastPrivateKey) return;
  const username = userNameInput?.value.trim().replace(/[^a-zA-Z0-9_-]/g, '_') || 'user';
  const blob = new Blob([lastPrivateKey], { type: 'application/pgp-keys' });
  downloadLink.href = URL.createObjectURL(blob);
  downloadLink.download = `${username}_privatekey.asc`;
  downloadLink.style.display = '';
  downloadLink.click();
  downloadLink.style.display = 'none';
});