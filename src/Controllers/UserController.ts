import UserModel from "../Models/UserModel";

class UserController {
    //TODO: make sure that createUser is only called once per public key to prevent duplicates
    async createUser(publicKey: string, username: string, publicKeyArmored?: string) {
        //check if user already exists
        const existingUser = await UserModel.findOne({ publicKey });
        if (existingUser) {
            throw new Error("User with this public key already exists");
        }
        if (!publicKey || !username) {
            throw new Error("Public key and username are required");
        }
        const user = new UserModel({ publicKey, username, publicKeyArmored: publicKeyArmored ?? null });
        return await user.save();
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

    async getUserByPublicKey(publicKey: string) {
        try {
            const user = await UserModel.findOne({ publicKey: publicKey });
            return user;
        } catch (error) {
            console.error('Error finding user by public key:', error);
            throw error;
        }
    }

    async getUserById(id: string) {
        try {
            return await UserModel.findById(id);
        } catch (error) {
            console.error('Error finding user by id:', error);
            throw error;
        }
    }
}

export default new UserController();