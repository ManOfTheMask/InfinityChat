import * as openpgp from 'openpgp';
// Note: These functions may be subject to future changes as the implementation evolves.
/**
 * Extracts the public key from a given private key file using OpenPGP.js.
 * @async
 * @param {HTMLInputElement} privateKeyFileInput - The input element containing the private key file.
 * @param {HTMLInputElement} passphraseInput - The input element containing the passphrase for the private key.
 * @param {HTMLElement} publicKeyOutput - The element where the public key will be displayed.
 * @param {HTMLElement} errorMessageDiv - The element where error messages will be displayed.
 * @returns {Promise<void>} - A promise that resolves when the public key is extracted and displayed.
 * @throws {Error} - Throws an error if the private key cannot be read, the passphrase is incorrect, or any other issue occurs during the process.
 * * @example
 *  Usage in an js file
 * <script type="module">
 * import { getgpgPublicKey } from './src/public/jslibs/PGPUtils.js';
 * document.getElementById('extractPublicKeyButton').addEventListener('click', () => {
 *   const privateKeyFileInput = document.getElementById('privateKeyFile');
 *   const passphraseInput = document.getElementById('passphrase
 *   const publicKeyOutput = document.getElementById('publicKeyOutput');
 *   const errorMessageDiv = document.getElementById('errorMessage');
 * getgpgPublicKey(privateKeyFileInput, passphraseInput, publicKeyOutput, errorMessageDiv);
 * });
 * 
 **/
export async function getgpgPublicKey(privateKeyFileInput, passphraseInput, publicKeyOutput, errorMessageDiv) {
            console.log("public key script loaded ");
        // Clear previous results and errors
        publicKeyOutput.textContent = '';
        errorMessageDiv.textContent = '';

        const privateKeyFile = privateKeyFileInput.files[0];
        const passphrase = passphraseInput.value;

        // --- Basic Validation ---
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
            // --- Read the private key file content ---
            const privateKeyArmored = await privateKeyFile.text();

            // The 'openpgp' object is available globally because we included the library via CDN
            
            // --- Parse the armored private key ---
            const privateKey = await openpgp.readPrivateKey({
                armoredKey: privateKeyArmored
            });

            // --- Decrypt the private key with the passphrase ---
            const decryptedPrivateKey = await openpgp.decryptKey({
                privateKey,
                passphrase
            });

            // --- Extract the public key from the unlocked private key ---
            // The .toPublic() method creates a public key object,
            // and .armor() formats it into the standard text-based format.
            const publicKeyArmored = decryptedPrivateKey.toPublic().armor();

            // --- Display the public key ---
            publicKeyOutput.textContent = publicKeyArmored;

        } catch (error) {
            console.error(error); // Log the full error to the console for debugging
            
            // Display a user-friendly error message
            let message = error.message;
            if (message.includes('passphrase')) {
                message = 'Incorrect passphrase or corrupt key.';
            }
            errorMessageDiv.textContent = `Error: ${message}`;
            publicKeyOutput.textContent = ''; // Clear the "Processing..." message
        }
};
/**
 * Generates a PGP key pair using OpenPGP.js and displays the public and private keys.
 * @async
 * @param {HTMLInputElement} nameInput - The input element for the user's name.
 * @param {HTMLInputElement} passphraseInput - The input element for the passphrase.
 * @param {HTMLElement} publicKeyOutput - The element where the public key will be displayed.
 * @param {HTMLElement} privateKeyOutput - The element where the private key will be displayed.
 * @param {HTMLElement} errorMessageDiv - The element where error messages will be displayed.
 * @returns {Promise<void>} - A promise that resolves when the key pair is generated and displayed.
 * @throws {Error} - Throws an error if the key generation fails or if any other issue occurs during the process.
 * @example
 * 
 * 
 * Usage in an js file
 * <script type="module">
 * import { generatePGPKeyPair } from './src/public/jslibs/PGPUtils.js';
 * document.getElementById('generateKeyPairButton').addEventListener('click', () => {
 *  const nameInput = document.getElementById('nameInput');
 * const passphraseInput = document.getElementById('passphrase
 * const publicKeyOutput = document.getElementById('publicKeyOutput');
 * const privateKeyOutput = document.getElementById('privateKeyOutput');
 * const errorMessageDiv = document.getElementById('errorMessage');
 * generatePGPKeyPair(nameInput, passphraseInput, publicKeyOutput, privateKeyOutput, errorMessageDiv);
 * output example
 * 
 * publicKeyOutput.textContent = '-----BEGIN PGP PUBLIC KEY BLOCK-----\n...\n-----END PGP PUBLIC KEY BLOCK-----';
 * privateKeyOutput.textContent = '-----BEGIN PGP PRIVATE KEY BLOCK-----\n...\n-----END PGP PRIVATE KEY BLOCK-----';
 * errorMessageDiv.textContent = 'Error: Incorrect passphrase or corrupt key.';
 * 
 * 
 * });
 * **/
export async function generatePGPKeyPair(nameInput,  passphraseInput, publicKeyOutput, privateKeyOutput, errorMessageDiv) {
    console.log("generate PGP key pair script loaded ");
    // Clear previous results and errors
    publicKeyOutput.textContent = '';
    privateKeyOutput.textContent = '';
    errorMessageDiv.textContent = '';

    const name = nameInput.value.trim();
    const passphrase = passphraseInput.value.trim();

    // --- Basic Validation ---
    if (!name || !passphrase) {
        errorMessageDiv.textContent = 'Please fill in all fields.';
        return;
    }

    publicKeyOutput.textContent = 'Generating key pair...';
    privateKeyOutput.textContent = '';

    try {
        // --- Generate the key pair ---
        const { privateKey, publicKey } = await openpgp.generateKey({
            type: 'rsa', // Type of the key
            rsaBits: 2048, // Size of the key in bits
            userIDs: [{ name }], // User ID for the key
            passphrase // Passphrase to protect the private key
        });

        // --- Display the keys ---
        publicKeyOutput.textContent = publicKey;
        privateKeyOutput.textContent = privateKey;

    } catch (error) {
        console.error(error); // Log the full error to the console for debugging
        
        // Display a user-friendly error message
        errorMessageDiv.textContent = `Error: ${error.message}`;
        publicKeyOutput.textContent = ''; // Clear the "Generating key pair..." message
        privateKeyOutput.textContent = '';
    }
}
