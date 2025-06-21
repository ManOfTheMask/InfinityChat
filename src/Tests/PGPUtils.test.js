import { describe, it, expect } from 'vitest';
import { generatePGPKeyPair, getgpgPublicKey } from '../../dist/public/jslibs/PGPUtils.js';

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
});
