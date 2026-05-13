import mongoose from "mongoose";

const notificationSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true,
    },
    type: {
        type: String,
        enum: ["friend_request", "message", "group_invite"],
        required: true,
    },
    title: {
        type: String,
        required: true,
    },
    body: {
        type: String,
        default: "",
    },
    link: {
        type: String,
        default: "",
    },
    read: {
        type: Boolean,
        default: false,
    },
    createdAt: {
        type: Date,
        default: Date.now,
    },
});

notificationSchema.index({ userId: 1, createdAt: -1 });

const NotificationModel = mongoose.model("Notification", notificationSchema);

export default NotificationModel;
