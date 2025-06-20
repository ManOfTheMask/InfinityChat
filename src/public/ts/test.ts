// @ts-ignore
import { getgpgPublicKey } from '../jslibs/PGPUtils';
const privateKeyFileInput = document.getElementById('privateKeyFile') as HTMLInputElement;
const passphraseInput = document.getElementById('passphraseInput') as HTMLInputElement;
const unlockButton = document.getElementById('unlockButton') as HTMLButtonElement;
const publicKeyOutput = document.getElementById('publicKeyOutput') as HTMLPreElement;
const errorMessageDiv = document.getElementById('errorMessage') as HTMLDivElement;

unlockButton.addEventListener('click', async () => {
    publicKeyOutput.textContent = '';
    errorMessageDiv.textContent = '';
    const privateKeyFile = privateKeyFileInput.files?.[0];
    const passphrase = passphraseInput.value;
    if (!privateKeyFile) {
        errorMessageDiv.textContent = 'Please select a private key file.';
        return;
    }
    if (!passphrase) {
        errorMessageDiv.textContent = 'Please enter a passphrase.';
        return;
    }
    publicKeyOutput.textContent = 'Processing...';
    try {
        const publicKey = await getgpgPublicKey(privateKeyFile, passphrase);
        publicKeyOutput.textContent = publicKey;
    } catch (error) {
        const errMsg = error instanceof Error ? error.message : String(error);
        errorMessageDiv.textContent = `Error: ${errMsg}`;
        publicKeyOutput.textContent = '';
    }
});