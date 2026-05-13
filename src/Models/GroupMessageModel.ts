import mongoose from "mongoose";

const groupMessageSchema = new mongoose.Schema({
    groupId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "GroupConversation",
        required: true,
    },

    senderId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true,
    },

    content: {
        type: String,
        required: true,
    },

    deletedAt: {
        type: Date,
        default: null,
    },

    createdAt: {
        type: Date,
        default: Date.now,
    },
});

const GroupMessageModel = mongoose.model("GroupMessage", groupMessageSchema);

export default GroupMessageModel;
