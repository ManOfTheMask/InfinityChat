import UserModel from "../Models/UserModel";

class UserController {
    //TODO: make sure that createUser is only called once per public key to prevent duplicates
    async createUser(publicKey: string, username: string) {
        const user = new UserModel({ publicKey, username });
        return await user.save();
    }

    async getUserByPublicKey(publicKey: string) {
        if (!publicKey) {
            throw new Error("Public key is required");
        }
        return await UserModel.findOne({ publicKey });
    }

    async getUserByUsername(username: string) {
        if (!username) {
            throw new Error("Username is required");
        }
        return await UserModel.findOne({ username });
    }
    async updateUsername(username: string, newUsername: string) {
        if (!username || !newUsername) {
            throw new Error("Both username and new username are required");
        }
        return await UserModel.findOneAndUpdate(
            { username },
            { username: newUsername, updatedAt: Date.now() },
            { new: true }
        );
    }
}

export default new UserController();