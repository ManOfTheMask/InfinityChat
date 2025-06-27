import * as openpgp from 'openpgp';

/**
 * Extracts the public key from a given private key file using OpenPGP.js.
 * @async
 * @param {File} privateKeyFile - The private key file.
 * @param {string} passphrase - The passphrase for the private key.
 * @returns {Promise<string>} - The extracted public key.
 * @throws {Error} - Throws an error if extraction fails.
 */
export async function getgpgPublicKey(privateKeyFile, passphrase) {
    if (!privateKeyFile) {
        throw new Error('Please select a private key file.');
    }
    if (!passphrase) {
        throw new Error('Please enter a passphrase.');
    }
    try {
        const privateKeyArmored = await privateKeyFile.text();
        const privateKey = await openpgp.readPrivateKey({
            armoredKey: privateKeyArmored
        });
        const decryptedPrivateKey = await openpgp.decryptKey({
            privateKey,
            passphrase
        });
        const publicKeyArmored = decryptedPrivateKey.toPublic().armor();
        return publicKeyArmored;
    } catch (error) {
        let message = error.message;
        if (message.includes('passphrase')) {
            message = 'Incorrect passphrase or corrupt key.';
        }
        throw new Error(message);
    }
}

/**
 * Generates a PGP key pair using OpenPGP.js.
 * @async
 * @param {string} name - The user's name.
 * @param {string} passphrase - The passphrase for the private key.
 * @returns {Promise<{ publicKey: string, privateKey: string }>} - The generated key pair.
 * @throws {Error} - Throws an error if key generation fails.
 */
export async function generatePGPKeyPair(name, passphrase) {
    if (!name || !passphrase) {
        throw new Error('Please fill in all fields.');
    }
    try {
        const { privateKey, publicKey } = await openpgp.generateKey({
            type: 'rsa',
            rsaBits: 2048,
            userIDs: [{ name }],
            passphrase
        });
        return { publicKey, privateKey };
    } catch (error) {
        throw new Error(error.message);
    }
}

/**
 * Signs a message with a private key using OpenPGP.js.
 * @async
 * @param {string} message - The message to sign.
 * @param {File} privateKeyFile - The private key file.
 * @param {string} passphrase - The passphrase for the private key.
 * @returns {Promise<string>} - The signed message.
 * @throws {Error} - Throws an error if signing fails.
 */
export async function signMessage(message, privateKeyFile, passphrase) {
    if (!message || !privateKeyFile || !passphrase) {
        throw new Error('Message, private key file, and passphrase are required.');
    }
    try {
        const privateKeyArmored = await privateKeyFile.text();
        const privateKey = await openpgp.readPrivateKey({
            armoredKey: privateKeyArmored
        });
        const decryptedPrivateKey = await openpgp.decryptKey({
            privateKey,
            passphrase
        });
        
        const signedMessage = await openpgp.sign({
            message: await openpgp.createMessage({ text: message }),
            signingKeys: decryptedPrivateKey,
            detached: true
        });
        
        return signedMessage;
    } catch (error) {
        throw new Error(`Failed to sign message: ${error.message}`);
    }
}

/**
 * Extracts the user ID (name) from a public key.
 * @async
 * @param {string} publicKeyArmored - The armored public key.
 * @returns {Promise<string>} - The user ID/name from the key.
 * @throws {Error} - Throws an error if extraction fails.
 */
export async function extractUserIdFromPublicKey(publicKeyArmored) {
    try {
        const publicKey = await openpgp.readKey({
            armoredKey: publicKeyArmored
        });
        const userId = publicKey.getUserIDs()[0];
        return userId;
    } catch (error) {
        throw new Error(`Failed to extract user ID: ${error.message}`);
    }
}
