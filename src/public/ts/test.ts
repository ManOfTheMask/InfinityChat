// @ts-ignore
import { getgpgPublicKey } from '../jslibs/PGPUtils';
console.log('Testing PGP Utils...');
const privateKeyFileInput = document.getElementById('privateKeyFile') as HTMLInputElement;
const passphraseInput = document.getElementById('passphraseInput') as HTMLInputElement;
const unlockButton = document.getElementById('unlockButton') as HTMLButtonElement;
const publicKeyOutput = document.getElementById('publicKeyOutput') as HTMLPreElement;
const errorMessageDiv = document.getElementById('errorMessage') as HTMLDivElement;

unlockButton.addEventListener('click', () => {
    getgpgPublicKey(privateKeyFileInput,
                    passphraseInput,
                    publicKeyOutput,
                    errorMessageDiv
                    );
});