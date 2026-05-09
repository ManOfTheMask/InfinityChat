import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import UserController from '../Controllers/UserController';
import UserModel from '../Models/UserModel';

let mongoServer: MongoMemoryServer;

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri(), { dbName: 'test' });
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

beforeEach(async () => {
  await UserModel.deleteMany({});
});

describe('UserController', () => {
  describe('createUser', () => {
    it('creates a user with required fields', async () => {
      const user = await UserController.createUser('testPublicKey', 'testUser');
      expect(user.publicKey).toBe('testPublicKey');
      expect(user.username).toBe('testUser');
      expect(user.publicKeyArmored).toBeNull();
      expect(user.friends).toEqual([]);
    });

    it('stores publicKeyArmored when provided', async () => {
      const user = await UserController.createUser('key', 'user', 'armoredKey');
      expect(user.publicKeyArmored).toBe('armoredKey');
    });

    it('throws when duplicate public key is used', async () => {
      await UserController.createUser('dupKey', 'user1');
      await expect(UserController.createUser('dupKey', 'user2')).rejects.toThrow(
        'User with this public key already exists',
      );
    });

    it('throws when public key is missing', async () => {
      await expect(UserController.createUser('', 'user')).rejects.toThrow();
    });

    it('throws when username is missing', async () => {
      await expect(UserController.createUser('somekey', '')).rejects.toThrow();
    });
  });

  describe('getUserByPublicKey', () => {
    it('returns the user for a known key', async () => {
      await UserController.createUser('key2', 'user2');
      const user = await UserController.getUserByPublicKey('key2');
      expect(user?.username).toBe('user2');
    });

    it('returns null for an unknown key', async () => {
      const user = await UserController.getUserByPublicKey('nonexistent');
      expect(user).toBeNull();
    });
  });

  describe('getUserByUsername', () => {
    it('returns the user for a known username', async () => {
      await UserController.createUser('key3', 'user3');
      const user = await UserController.getUserByUsername('user3');
      expect(user?.publicKey).toBe('key3');
    });

    it('returns null for an unknown username', async () => {
      const user = await UserController.getUserByUsername('ghost');
      expect(user).toBeNull();
    });

    it('throws when username argument is empty', async () => {
      await expect(UserController.getUserByUsername('')).rejects.toThrow('Username is required');
    });
  });

  describe('getUserById', () => {
    it('returns the user by ObjectId', async () => {
      const created = await UserController.createUser('key5', 'user5');
      const found = await UserController.getUserById(created._id.toString());
      expect(found?.username).toBe('user5');
    });

    it('returns null for an unknown id', async () => {
      const fakeId = new mongoose.Types.ObjectId().toString();
      const found = await UserController.getUserById(fakeId);
      expect(found).toBeNull();
    });
  });

  describe('updateUsername', () => {
    it('updates the username and returns the new document', async () => {
      await UserController.createUser('key4', 'user4');
      const updated = await UserController.updateUsername('user4', 'user4new');
      expect(updated?.username).toBe('user4new');
    });

    it('returns null when the original username does not exist', async () => {
      const result = await UserController.updateUsername('nobody', 'newname');
      expect(result).toBeNull();
    });

    it('throws when either argument is empty', async () => {
      await expect(UserController.updateUsername('', 'new')).rejects.toThrow();
      await expect(UserController.updateUsername('old', '')).rejects.toThrow();
    });
  });
});
