// @ts-ignore
import { getgpgPublicKey } from '../jslibs/PGPUtils';

document.addEventListener('DOMContentLoaded', () => {
    const privateKeyFileInput = document.getElementById('privateKeyFile') as HTMLInputElement;
    const passphraseInput = document.getElementById('passphraseInput') as HTMLInputElement;
    const usernameInput = document.getElementById('usernameInput') as HTMLInputElement;
    const signupForm = document.getElementById('signupForm') as HTMLFormElement;
    const errorMessageDiv = document.getElementById('errorMessage') as HTMLDivElement;

    if (!signupForm) return;

    signupForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        let publicKeyOutput: string = '';
        errorMessageDiv.textContent = '';
        const privateKeyFile = privateKeyFileInput.files?.[0];
        const passphrase = passphraseInput.value;
        const username = usernameInput.value.replace(/[^a-zA-Z0-9_]/g, '');

        if (!privateKeyFile) {
            errorMessageDiv.textContent = 'Please select a private key file.';
            return;
        }
        if (!passphrase) {
            errorMessageDiv.textContent = 'Please enter a passphrase.';
            return;
        }

        if (!username) {
            errorMessageDiv.textContent = 'Please enter a username.';
            return;
        }

        try {
            const publicKey = await getgpgPublicKey(privateKeyFile, passphrase);
            publicKeyOutput = publicKey;
            if (!publicKeyOutput) {
                errorMessageDiv.textContent = 'Failed to extract public key from the private key file.';
                return;
            }

            const response = await fetch('/signup/import', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    publicKey: publicKeyOutput,
                    username: username
                }),
            });

            if (!response.ok) {
                throw new Error(`Server error: ${response.statusText}`);
            }

            const result = await response.json();

            if (result.success) {
                window.location.href = '/profile';
            } else {
                errorMessageDiv.textContent = `Error: ${result.message}`;
            }
            
        } catch (error) {
            const errMsg = error instanceof Error ? error.message : String(error);
            errorMessageDiv.textContent = `Error: ${errMsg}`;
            publicKeyOutput = '';
        }
    });
});