//@ts-ignore
import { getgpgPublicKey } from '../jslibs/PGPUtils.js';
import * as openpgp from 'openpgp';

interface ChallengeResponse {
    success: boolean;
    encryptedChallenge?: string;
    challengeId?: string;
    message?: string;
}

document.addEventListener('DOMContentLoaded', () => {
    const loginButton = document.getElementById('loginButton') as HTMLButtonElement;
    const privateKeyFileInput = document.getElementById('privateKeyFile') as HTMLInputElement;
    const passphraseInput = document.getElementById('passphraseInput') as HTMLInputElement;
    const errorMessageDiv = document.getElementById('errorMessage') as HTMLDivElement;
    const resultOutput = document.getElementById('loginResultOutput') as HTMLPreElement;

    loginButton.addEventListener('click', handleLogin);

    async function handleLogin() {
        try {
            clearMessages();
            loginButton.disabled = true;
            loginButton.textContent = 'Processing...';

            const privateKeyFile = privateKeyFileInput.files?.[0];
            const passphrase = passphraseInput.value;

            if (!privateKeyFile || !passphrase) {
                throw new Error('Please select a private key file and enter your passphrase.');
            }

            resultOutput.textContent = 'Step 1: Extracting public key from private key...';

            // Step 1: Extract public key from private key file
            const publicKey = await getgpgPublicKey(privateKeyFile, passphrase);
            if (!publicKey) {
                throw new Error('Failed to extract public key from private key file.');
            }

            resultOutput.textContent += '\n✓ Public key extracted successfully';
            resultOutput.textContent += '\nStep 2: Requesting challenge from server...';

            // Step 2: Request challenge from server with public key
            const challengeResponse = await fetch(`/login/challenge?publicKey=${encodeURIComponent(publicKey)}`, {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json'
                }
            });

            if (!challengeResponse.ok) {
                const errorData = await challengeResponse.json();
                throw new Error(errorData.message || `Server error: ${challengeResponse.statusText}`);
            }

            const challengeData: ChallengeResponse = await challengeResponse.json();

            if (!challengeData.success || !challengeData.encryptedChallenge || !challengeData.challengeId) {
                throw new Error('Failed to receive valid challenge from server');
            }

            resultOutput.textContent += '\n✓ Challenge received from server';
            resultOutput.textContent += '\nStep 3: Decrypting challenge...';

            // Step 3: Decrypt the challenge using private key
            const privateKeyArmored = await privateKeyFile.text();
            const privateKey = await openpgp.readPrivateKey({
                armoredKey: privateKeyArmored
            });
            const decryptedPrivateKey = await openpgp.decryptKey({
                privateKey,
                passphrase
            });

            const encryptedMessage = await openpgp.readMessage({
                armoredMessage: challengeData.encryptedChallenge
            });

            const { data: decryptedChallenge } = await openpgp.decrypt({
                message: encryptedMessage,
                decryptionKeys: decryptedPrivateKey
            });

            console.log('Decrypted Challenge:', decryptedChallenge);
            resultOutput.textContent += '\n✓ Challenge decrypted successfully';
            resultOutput.textContent += `\nDecrypted Challenge: ${decryptedChallenge}`;

            // Step 4: Send decrypted challenge back to server for verification
            resultOutput.textContent += '\nStep 4: Verifying challenge with server...';

            const verifyResponse = await fetch('/login/verify', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    decryptedChallenge: decryptedChallenge,
                    challengeId: challengeData.challengeId
                })
            });

            const verifyData = await verifyResponse.json();

            if (verifyResponse.ok && verifyData.success) {
                resultOutput.textContent += '\n✓ Authentication successful!';
                resultOutput.textContent += '\nRedirecting to profile...';
                
                setTimeout(() => {
                    window.location.href = '/profile';
                }, 2000);
            } else {
                throw new Error(verifyData.message || 'Challenge verification failed');
            }

        } catch (error) {
            console.error('Login error:', error);
            showError(error instanceof Error ? error.message : 'Login failed');
        } finally {
            loginButton.disabled = false;
            loginButton.textContent = 'Login';
        }
    }

    function showError(message: string) {
        errorMessageDiv.textContent = message;
        errorMessageDiv.style.display = 'block';
    }

    function clearMessages() {
        errorMessageDiv.textContent = '';
        errorMessageDiv.style.display = 'none';
        resultOutput.textContent = '';
    }
});