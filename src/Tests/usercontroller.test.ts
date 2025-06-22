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
  it('creates a user', async () => {
    const user = await UserController.createUser('testPublicKey', 'testUser');
    expect(user.publicKey).toBe('testPublicKey');
    expect(user.username).toBe('testUser');
  });

  it('gets user by public key', async () => {
    await UserController.createUser('key2', 'user2');
    const user = await UserController.getUserByPublicKey('key2');
    expect(user?.username).toBe('user2');
  });

  it('gets user by username', async () => {
    await UserController.createUser('key3', 'user3');
    const user = await UserController.getUserByUsername('user3');
    expect(user?.publicKey).toBe('key3');
  });

  it('updates username', async () => {
    await UserController.createUser('key4', 'user4');
    const updated = await UserController.updateUsername('user4', 'user4new');
    expect(updated?.username).toBe('user4new');
  });
});
