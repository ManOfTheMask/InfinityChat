import mongoose from "mongoose";

const friendRequestSchema = new mongoose.Schema({
    fromUserId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true,
    },
    toUserId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true,
    },
    status: {
        type: String,
        enum: ["pending", "accepted", "declined"],
        default: "pending",
    },
    createdAt: {
        type: Date,
        default: Date.now,
    },
});

// Prevent duplicate pending requests between the same two users
friendRequestSchema.index({ fromUserId: 1, toUserId: 1 }, { unique: true });

const FriendRequestModel = mongoose.model("FriendRequest", friendRequestSchema);

export default FriendRequestModel;
