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
