import FriendRequestModel from "../Models/FriendRequestModel";
import UserModel from "../Models/UserModel";
import ConversationModel from "../Models/ConversationModel";
import MessageModel from "../Models/MessageModel";
import mongoose from "mongoose";

class FriendController {
    async sendFriendRequest(fromUserId: string, targetPublicKey: string) {
        if (!fromUserId || !targetPublicKey) {
            throw new Error("Sender ID and target public key are required.");
        }

        // Normalize the public key the same way signup does
        const normalizedKey = targetPublicKey.replace(/\s/g, '');
        const targetUser = await UserModel.findOne({ publicKey: normalizedKey });
        if (!targetUser) {
            throw new Error("No user found with that public key.");
        }

        const fromId = new mongoose.Types.ObjectId(fromUserId);
        const toId = targetUser._id;

        if (fromId.equals(toId)) {
            throw new Error("You cannot send a friend request to yourself.");
        }

        // Check if they are already friends
        const sender = await UserModel.findById(fromId);
        if (sender?.friends?.some((f: any) => f.equals(toId))) {
            throw new Error("You are already friends with this user.");
        }

        // Check for existing pending request in either direction
        const existing = await FriendRequestModel.findOne({
            $or: [
                { fromUserId: fromId, toUserId: toId },
                { fromUserId: toId, toUserId: fromId },
            ],
            status: "pending",
        });
        if (existing) {
            throw new Error("A pending friend request already exists between you and this user.");
        }

        return await FriendRequestModel.create({
            fromUserId: fromId,
            toUserId: toId,
            status: "pending",
        });
    }

    async acceptFriendRequest(requestId: string, userId: string) {
        if (!requestId || !userId) {
            throw new Error("Request ID and user ID are required.");
        }

        const request = await FriendRequestModel.findById(requestId);
        if (!request) {
            throw new Error("Friend request not found.");
        }
        if (!request.toUserId.equals(new mongoose.Types.ObjectId(userId))) {
            throw new Error("Unauthorized.");
        }
        if (request.status !== "pending") {
            throw new Error("This request has already been resolved.");
        }

        // Add each user to the other's friends list
        await UserModel.findByIdAndUpdate(request.fromUserId, {
            $addToSet: { friends: request.toUserId },
        });
        await UserModel.findByIdAndUpdate(request.toUserId, {
            $addToSet: { friends: request.fromUserId },
        });

        await FriendRequestModel.findByIdAndDelete(requestId);
        return request;
    }

    async declineFriendRequest(requestId: string, userId: string) {
        if (!requestId || !userId) {
            throw new Error("Request ID and user ID are required.");
        }

        const request = await FriendRequestModel.findById(requestId);
        if (!request) {
            throw new Error("Friend request not found.");
        }
        if (!request.toUserId.equals(new mongoose.Types.ObjectId(userId))) {
            throw new Error("Unauthorized.");
        }
        if (request.status !== "pending") {
            throw new Error("This request has already been resolved.");
        }

        await FriendRequestModel.findByIdAndDelete(requestId);
        return request;
    }

    async getFriends(userId: string) {
        if (!userId) {
            throw new Error("User ID is required.");
        }
        const user = await UserModel.findById(userId).populate("friends", "username publicKey");
        return user?.friends ?? [];
    }

    async getPendingIncomingRequests(userId: string) {
        if (!userId) {
            throw new Error("User ID is required.");
        }
        return await FriendRequestModel.find({
            toUserId: new mongoose.Types.ObjectId(userId),
            status: "pending",
        }).populate("fromUserId", "username publicKey");
    }

    async removeFriend(userId: string, friendId: string) {
        if (!userId || !friendId) {
            throw new Error("User ID and friend ID are required.");
        }

        const uid = new mongoose.Types.ObjectId(userId);
        const fid = new mongoose.Types.ObjectId(friendId);

        // Remove each user from the other's friends list
        await UserModel.findByIdAndUpdate(uid, { $pull: { friends: fid } });
        await UserModel.findByIdAndUpdate(fid, { $pull: { friends: uid } });

        // Find and delete the conversation + all its messages
        const conversation = await ConversationModel.findOne({
            participants: { $all: [uid, fid] },
        });

        if (conversation) {
            await MessageModel.deleteMany({ conversationId: conversation._id });
            await ConversationModel.findByIdAndDelete(conversation._id);
        }
    }
}

export default new FriendController();
