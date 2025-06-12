import * as openpgp from 'openpgp';
//testing the import of openpgp and making sure it works on the browser
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
