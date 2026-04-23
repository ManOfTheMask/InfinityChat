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
 * @returns {Promise<openpgp.CleartextMessage>} - The signed message.
 * @throws {Error} - Throws an error if signing fails.
 */
export async function signMessage(message, privateKeyFile, passphrase) {
    if (!message || !privateKeyFile || !passphrase) {
        throw new Error('Message, private key file, and passphrase are required.');
    }
    try {
        const privateKeyArmored = await privateKeyFile.text();
        const privateKey = await openpgp.readPrivateKey({
            armoredKey: privateKeyArmored,
        });
        const decryptedPrivateKey = await openpgp.decryptKey({
            privateKey,
            passphrase
        });
        const messageObject = await openpgp.createCleartextMessage({ text: message });

        const cleartextMessage = await openpgp.sign({
            message: messageObject,
            signingKeys: decryptedPrivateKey,
        });
        

        const signedMessage = await openpgp.readCleartextMessage({
            cleartextMessage
        });
        console.log('Signed message:', signedMessage.text);
        return signedMessage;

    } catch (error) {
        throw new Error(`Failed to sign message: ${error.message}`);
    }
}
/**
 * Verifies a signed message using OpenPGP.js.
 * @async
 * @param {openpgp.CleartextMessage} signedMessage - The signed message to verify.
 * @param {File} publicKeyFile - The public key file used for verification.
 * @returns {Promise<boolean>} - Returns true if the signature is valid, false otherwise.
 * @throws {Error} - Throws an error if verification fails.
 */
export async function verifyMessage(signedMessage, publicKeyFile) {
    if (!signedMessage || !publicKeyFile) {
        throw new Error('Signed message and public key are required.');
    }
    try {
        const publicKeyArmored = await publicKeyFile.text();

        const publicKey = await openpgp.readKey({
            armoredKey: publicKeyArmored
        });

        const verified = await openpgp.verify({
            message: signedMessage,
            verificationKeys: publicKey
        });
        // Check if the signature is valid
        const { valid, keyID } = verified.signatures[0];
        console.log('Signature valid:', keyID);
        
        if (keyID) {
            //return the message    
            return true; // Return the verified message text
            }
        else {
            return false;
        }
    } catch (error) {
        throw new Error(`Failed to verify signature: ${error.message}`);
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
/**
 * Encrypts a message using an armored public key string.
 * @async
 * @param {string} message - The message to encrypt.
 * @param {string} publicKeyArmored - The armored public key string.
 * @returns {Promise<string>} - The encrypted message (armored).
 * @throws {Error} - Throws an error if encryption fails.
 */
export async function encryptMessageWithKey(message, publicKeyArmored) {
    if (!message || !publicKeyArmored) {
        throw new Error('Message and public key are required.');
    }
    try {
        const publicKey = await openpgp.readKey({ armoredKey: publicKeyArmored });
        const encryptedMessage = await openpgp.encrypt({
            message: await openpgp.createMessage({ text: message }),
            encryptionKeys: publicKey,
        });
        return encryptedMessage;
    } catch (error) {
        throw new Error(`Failed to encrypt message: ${error.message}`);
    }
}

/**
 * Decrypts an armored PGP message using an armored private key string.
 * Returns null if the message is not a valid PGP message (e.g. plaintext legacy message).
 * @async
 * @param {string} encryptedMessage - The armored encrypted message.
 * @param {string} privateKeyArmored - The armored private key string.
 * @param {string} passphrase - The passphrase for the private key.
 * @returns {Promise<string|null>} - The decrypted plaintext, or null if not decryptable.
 * @throws {Error} - Throws an error if decryption fails for a reason other than non-PGP content.
 */
export async function decryptMessageWithKey(encryptedMessage, privateKeyArmored, passphrase) {
    if (!encryptedMessage || !privateKeyArmored || !passphrase) {
        throw new Error('Encrypted message, private key, and passphrase are required.');
    }
    // Bail out early if this is clearly not a PGP message
    if (!encryptedMessage.includes('-----BEGIN PGP MESSAGE-----')) {
        return null;
    }
    try {
        const privateKey = await openpgp.readPrivateKey({ armoredKey: privateKeyArmored });
        const decryptedPrivateKey = await openpgp.decryptKey({ privateKey, passphrase });
        const message = await openpgp.readMessage({ armoredMessage: encryptedMessage });
        const { data } = await openpgp.decrypt({
            message,
            decryptionKeys: decryptedPrivateKey,
        });
        return data;
    } catch (error) {
        throw new Error(`Failed to decrypt message: ${error.message}`);
    }
}
export async function encryptMessage(message, publicKeyFile) {
    if (!message || !publicKeyFile) {
        throw new Error('Message and public key file are required.');
    }
    try {
        const publicKeyArmored = await publicKeyFile.text();
        const publicKey = await openpgp.readKey({
            armoredKey: publicKeyArmored
        });
        const encryptedMessage = await openpgp.encrypt({
            message: await openpgp.createMessage({ text: message }),
            encryptionKeys: publicKey
        });
        return encryptedMessage;
    } catch (error) {
        throw new Error(`Failed to encrypt message: ${error.message}`);
    }
}
/**
 * @param {string} encryptedMessage 
 * @param {File} privateKeyFile 
 * @param {string} passphrase 
 * @returns {Promise<string>} - The decrypted message.
 * @throws {Error} - Throws an error if decryption fails.
 */
export async function decryptMessage(encryptedMessage, privateKeyFile, passphrase) {
    if (!encryptedMessage || !privateKeyFile || !passphrase) {
        throw new Error('Encrypted message, private key file, and passphrase are required.');
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
        const decryptedMessage = await openpgp.decrypt({
            message: await openpgp.readMessage({ armoredMessage: encryptedMessage }),
            decryptionKeys: decryptedPrivateKey
        });
        return decryptedMessage.data;
    } catch (error) {
        throw new Error(`Failed to decrypt message: ${error.message}`);
    }
}

/**
 * Encrypts a chat message to both the recipient and the sender,
 * so both parties can decrypt the message with their own private key.
 * @async
 * @param {string} message - The plaintext message.
 * @param {string} recipientPublicKeyArmored - The recipient's armored PGP public key.
 * @param {string} senderPublicKeyArmored - The sender's armored PGP public key.
 * @returns {Promise<string>} - The armored encrypted message.
 */
export async function encryptChatMessage(message, recipientPublicKeyArmored, senderPublicKeyArmored) {
    if (!message || !recipientPublicKeyArmored || !senderPublicKeyArmored) {
        throw new Error('Message, recipient key, and sender key are required.');
    }
    const recipientKey = await openpgp.readKey({ armoredKey: recipientPublicKeyArmored });
    const senderKey = await openpgp.readKey({ armoredKey: senderPublicKeyArmored });
    return await openpgp.encrypt({
        message: await openpgp.createMessage({ text: message }),
        encryptionKeys: [recipientKey, senderKey],
    });
}

/**
 * Decrypts a chat message using an armored private key string and passphrase.
 * @async
 * @param {string} armoredMessage - The armored encrypted message.
 * @param {string} privateKeyArmored - The armored private key string.
 * @param {string} passphrase - The passphrase for the private key.
 * @returns {Promise<string>} - The decrypted plaintext.
 */
export async function decryptChatMessage(armoredMessage, privateKeyArmored, passphrase) {
    if (!armoredMessage || !privateKeyArmored || !passphrase) {
        throw new Error('Encrypted message, private key, and passphrase are required.');
    }
    const privateKey = await openpgp.readPrivateKey({ armoredKey: privateKeyArmored });
    const decryptedKey = await openpgp.decryptKey({ privateKey, passphrase });
    const message = await openpgp.readMessage({ armoredMessage });
    const { data } = await openpgp.decrypt({
        message,
        decryptionKeys: decryptedKey,
    });
    return data;
}
