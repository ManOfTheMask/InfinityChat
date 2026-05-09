import { describe, it, expect, beforeAll } from 'vitest';
import {
  generatePGPKeyPair,
  getgpgPublicKey,
  signMessage,
  verifyMessage,
  encryptMessage,
  decryptMessage,
  encryptMessageWithKey,
  decryptMessageWithKey,
  encryptChatMessage,
  decryptChatMessage,
  extractUserIdFromPublicKey,
} from '../public/jslibs/PGPUtils.js';

// Shared key material — generated once to avoid per-test RSA keygen overhead
let sharedPublicKey;
let sharedPrivateKey;
let sharedPassphrase;

beforeAll(async () => {
  sharedPassphrase = 'shared-test-passphrase';
  ({ publicKey: sharedPublicKey, privateKey: sharedPrivateKey } =
    await generatePGPKeyPair('Shared User', sharedPassphrase));
});

// ── generatePGPKeyPair ────────────────────────────────────────────────────────
describe('generatePGPKeyPair', () => {
  it('returns armored public and private key strings', async () => {
    const { publicKey, privateKey } = await generatePGPKeyPair('Test User', 'passphrase');
    expect(typeof publicKey).toBe('string');
    expect(typeof privateKey).toBe('string');
    expect(publicKey).toContain('-----BEGIN PGP PUBLIC KEY BLOCK-----');
    expect(privateKey).toContain('-----BEGIN PGP PRIVATE KEY BLOCK-----');
  });

  it('throws when name or passphrase is missing', async () => {
    await expect(generatePGPKeyPair('', 'pass')).rejects.toThrow('Please fill in all fields.');
    await expect(generatePGPKeyPair('Name', '')).rejects.toThrow('Please fill in all fields.');
  });
});

// ── getgpgPublicKey ───────────────────────────────────────────────────────────
describe('getgpgPublicKey', () => {
  it('extracts an armored public key from a private key file', async () => {
    const file = new File([sharedPrivateKey], 'private.asc', { type: 'text/plain' });
    const extracted = await getgpgPublicKey(file, sharedPassphrase);
    expect(extracted).toContain('-----BEGIN PGP PUBLIC KEY BLOCK-----');
    expect(extracted.length).toBeGreaterThan(100);
  });

  it('throws when no private key file is provided', async () => {
    await expect(getgpgPublicKey(null, 'pass')).rejects.toThrow('Please select a private key file.');
  });

  it('throws when no passphrase is provided', async () => {
    const file = new File([sharedPrivateKey], 'private.asc', { type: 'text/plain' });
    await expect(getgpgPublicKey(file, '')).rejects.toThrow('Please enter a passphrase.');
  });

  it('throws on wrong passphrase', async () => {
    const file = new File([sharedPrivateKey], 'private.asc', { type: 'text/plain' });
    await expect(getgpgPublicKey(file, 'wrong-pass')).rejects.toThrow();
  });
});

// ── extractUserIdFromPublicKey ────────────────────────────────────────────────
describe('extractUserIdFromPublicKey', () => {
  it('returns the user name embedded in the key', async () => {
    const userId = await extractUserIdFromPublicKey(sharedPublicKey);
    expect(userId).toContain('Shared User');
  });

  it('throws on invalid armored key', async () => {
    await expect(extractUserIdFromPublicKey('not-a-key')).rejects.toThrow();
  });
});

// ── signMessage / verifyMessage ───────────────────────────────────────────────
describe('signMessage and verifyMessage', () => {
  it('signs a message and verifies the signature', async () => {
    const privateFile = new File([sharedPrivateKey], 'private.asc', { type: 'text/plain' });
    const publicFile  = new File([sharedPublicKey],  'public.asc',  { type: 'text/plain' });

    const signed = await signMessage('Hello world!', privateFile, sharedPassphrase);
    expect(signed.text).toBe('Hello world!');

    const valid = await verifyMessage(signed, publicFile);
    expect(valid).toBe(true);
  });

  it('throws when signMessage arguments are missing', async () => {
    const privateFile = new File([sharedPrivateKey], 'private.asc', { type: 'text/plain' });
    await expect(signMessage('', privateFile, sharedPassphrase)).rejects.toThrow();
    await expect(signMessage('msg', null, sharedPassphrase)).rejects.toThrow();
    await expect(signMessage('msg', privateFile, '')).rejects.toThrow();
  });

  it('throws when verifyMessage arguments are missing', async () => {
    await expect(verifyMessage(null, null)).rejects.toThrow();
  });
});

// ── encryptMessage / decryptMessage (File-based) ──────────────────────────────
describe('encryptMessage and decryptMessage (File API)', () => {
  it('round-trips a message via File objects', async () => {
    const publicFile  = new File([sharedPublicKey],  'public.asc',  { type: 'text/plain' });
    const privateFile = new File([sharedPrivateKey], 'private.asc', { type: 'text/plain' });
    const plaintext = 'Hello, encrypted world!';

    const ciphertext = await encryptMessage(plaintext, publicFile);
    expect(ciphertext).toContain('-----BEGIN PGP MESSAGE-----');

    const decrypted = await decryptMessage(ciphertext, privateFile, sharedPassphrase);
    expect(decrypted).toBe(plaintext);
  });

  it('encryptMessage throws when arguments are missing', async () => {
    const publicFile = new File([sharedPublicKey], 'public.asc', { type: 'text/plain' });
    await expect(encryptMessage('', publicFile)).rejects.toThrow();
    await expect(encryptMessage('msg', null)).rejects.toThrow();
  });

  it('decryptMessage throws when arguments are missing', async () => {
    const privateFile = new File([sharedPrivateKey], 'private.asc', { type: 'text/plain' });
    await expect(decryptMessage('', privateFile, sharedPassphrase)).rejects.toThrow();
    await expect(decryptMessage('msg', null, sharedPassphrase)).rejects.toThrow();
    await expect(decryptMessage('msg', privateFile, '')).rejects.toThrow();
  });
});

// ── encryptMessageWithKey / decryptMessageWithKey (string-based) ──────────────
describe('encryptMessageWithKey and decryptMessageWithKey', () => {
  it('round-trips a message via armored key strings', async () => {
    const plaintext = 'String-key round-trip test';

    const ciphertext = await encryptMessageWithKey(plaintext, sharedPublicKey);
    expect(ciphertext).toContain('-----BEGIN PGP MESSAGE-----');

    const decrypted = await decryptMessageWithKey(ciphertext, sharedPrivateKey, sharedPassphrase);
    expect(decrypted).toBe(plaintext);
  });

  it('decryptMessageWithKey returns null for non-PGP content', async () => {
    const result = await decryptMessageWithKey('just plain text', sharedPrivateKey, sharedPassphrase);
    expect(result).toBeNull();
  });

  it('encryptMessageWithKey throws when arguments are missing', async () => {
    await expect(encryptMessageWithKey('', sharedPublicKey)).rejects.toThrow();
    await expect(encryptMessageWithKey('msg', '')).rejects.toThrow();
  });

  it('decryptMessageWithKey throws when arguments are missing', async () => {
    await expect(decryptMessageWithKey('', sharedPrivateKey, sharedPassphrase)).rejects.toThrow();
    await expect(decryptMessageWithKey('msg', '', sharedPassphrase)).rejects.toThrow();
    await expect(decryptMessageWithKey('msg', sharedPrivateKey, '')).rejects.toThrow();
  });
});

// ── encryptChatMessage ────────────────────────────────────────────────────────
describe('encryptChatMessage', () => {
  it('produces a ciphertext decryptable by both recipient and sender keys', async () => {
    // Create a second key pair to act as the recipient
    const recipientPass = 'recipient-pass';
    const { publicKey: recipientPublicKey, privateKey: recipientPrivateKey } =
      await generatePGPKeyPair('Recipient', recipientPass);

    const plaintext = 'Chat message for both parties';
    const ciphertext = await encryptChatMessage(plaintext, recipientPublicKey, sharedPublicKey);
    expect(ciphertext).toContain('-----BEGIN PGP MESSAGE-----');

    // Recipient can decrypt
    const decryptedByRecipient = await decryptChatMessage(ciphertext, recipientPrivateKey, recipientPass);
    expect(decryptedByRecipient).toBe(plaintext);

    // Sender can decrypt their own message
    const decryptedBySender = await decryptChatMessage(ciphertext, sharedPrivateKey, sharedPassphrase);
    expect(decryptedBySender).toBe(plaintext);
  });

  it('throws when any argument is missing', async () => {
    await expect(encryptChatMessage('', sharedPublicKey, sharedPublicKey)).rejects.toThrow();
    await expect(encryptChatMessage('msg', '', sharedPublicKey)).rejects.toThrow();
    await expect(encryptChatMessage('msg', sharedPublicKey, '')).rejects.toThrow();
  });
});

describe('PGPUtils', () => {
    describe('generatePGPKeyPair', () => {
        it('should generate a valid PGP key pair', async () => {
            const name = 'Test User';
            const passphrase = 'test-passphrase';

            const { publicKey, privateKey } = await generatePGPKeyPair(name, passphrase);

            expect(typeof publicKey).toBe('string');
            expect(typeof privateKey).toBe('string');
            expect(publicKey).toMatch(/-----BEGIN PGP PUBLIC KEY BLOCK-----/);
            expect(privateKey).toMatch(/-----BEGIN PGP PRIVATE KEY BLOCK-----/);
        });
    });

    describe('getgpgPublicKey', () => {
        it('should extract the public key from the private key file', async () => {
            const name = 'Test User';
            const passphrase = 'test-passphrase';

            // Generate key pair
            const { privateKey, publicKey } = await generatePGPKeyPair(name, passphrase);

            // Simulate a File object for getgpgPublicKey
            const privateKeyFile = new File([privateKey], 'private.asc', { type: 'text/plain' });

            // Extract public key from private key file
            const extractedPublicKey = await getgpgPublicKey(privateKeyFile, passphrase);

            expect(extractedPublicKey).toContain('-----BEGIN PGP PUBLIC KEY BLOCK-----');
            expect(extractedPublicKey.length).toBeGreaterThan(100);
            expect(extractedPublicKey).toContain(publicKey.trim().split('\n')[1].trim().slice(0, 10)); // crude check for matching key
        });

        it('should throw if no private key file is provided', async () => {
            await expect(getgpgPublicKey(null, 'pass')).rejects.toThrow('Please select a private key file.');
        });

        it('should throw if no passphrase is provided', async () => {
            // Generate key pair for test
            const { privateKey } = await generatePGPKeyPair('Test', 'pass');
            const privateKeyFile = new File([privateKey], 'private.asc', { type: 'text/plain' });
            await expect(getgpgPublicKey(privateKeyFile, '')).rejects.toThrow('Please enter a passphrase.');
        });
    });
    describe('sign and verify messages', () => {
        it('should sign a message with a private key', async () => {
            const name = 'Test User';
            const passphrase = 'test-passphrase';
            const message = 'Hello, this is a test message.';

            // Generate key pair
            const { privateKey, publicKey} = await generatePGPKeyPair(name, passphrase);

            // Simulate a File object for signing
            const privateKeyFile = new File([privateKey], 'private.asc', { type: 'text/plain' });

            const publicKeyFile = new File([publicKey], 'public.asc', { type: 'text/plain' });

            // Sign the message
            const signedMessage = await signMessage(message, privateKeyFile, passphrase);
            
            expect(signedMessage.text).toBeDefined();
            expect(typeof signedMessage.text).toBe('string');
            //verify the signed message
            const isVerified = await verifyMessage(signedMessage, publicKeyFile);
            expect(isVerified).toBe(true);

            
        });
    });
    describe('encrypt and decrypt messages', () => {
        it('should encrypt a message with a public key', async () => {
            const name = 'Test User';
            const passphrase = 'test-passphrase';
            const message = 'Hello, this is a test message.';

            // Generate key pair
            const { privateKey, publicKey } = await generatePGPKeyPair(name, passphrase);

            // Simulate a File object for encryption
            const publicKeyFile = new File([publicKey], 'public.asc', { type: 'text/plain' });

            // Encrypt the message
            const encryptedMessage = await encryptMessage(message, publicKeyFile);
            
            expect(encryptedMessage).toBeDefined();
            expect(typeof encryptedMessage).toBe('string');
            expect(encryptedMessage).toContain('-----BEGIN PGP MESSAGE-----');
        });

        it('should decrypt a message with a private key', async () => {
            const name = 'Test User';
            const passphrase = 'test-passphrase';
            const message = 'Hello, this is a test message.';

            // Generate key pair
            const { privateKey, publicKey } = await generatePGPKeyPair(name, passphrase);

            // Simulate a File object for decryption
            const privateKeyFile = new File([privateKey], 'private.asc', { type: 'text/plain' });

            // Encrypt the message first
            const encryptedMessage = await encryptMessage(message, new File([publicKey], 'public.asc', { type: 'text/plain' }));

            // Decrypt the message
            const decryptedMessage = await decryptMessage(encryptedMessage, privateKeyFile, passphrase);
            
            expect(decryptedMessage).toBeDefined();
            expect(decryptedMessage).toBe(message);
        });
    });
});
