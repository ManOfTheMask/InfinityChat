import ConversationModel from "../Models/ConversationModel";
import MessageModel from "../Models/MessageModel";
import mongoose from "mongoose";

class ChatController {
    /** Get or create a 1-to-1 conversation between two users. */
    async getOrCreateConversation(userIdA: string, userIdB: string) {
        const a = new mongoose.Types.ObjectId(userIdA);
        const b = new mongoose.Types.ObjectId(userIdB);

        const existing = await ConversationModel.findOne({
            participants: { $all: [a, b], $size: 2 },
        });
        if (existing) return existing;

        return await ConversationModel.create({ participants: [a, b] });
    }

    /** Return all conversations for a user, pinned ones first then by latest message. */
    async getConversationsForUser(userId: string) {
        const uid = new mongoose.Types.ObjectId(userId);

        const conversations = await ConversationModel.find({ participants: uid })
            .populate("participants", "username publicKey")
            .sort({ lastMessageAt: -1 })
            .lean();

        return conversations
            .map((c: any) => ({
                ...c,
                pinned: c.pinnedBy.some((p: any) => p.equals(uid)),
                other: c.participants.find((p: any) => !p._id.equals(uid)),
            }))
            .sort((a: any, b: any) => {
                if (a.pinned && !b.pinned) return -1;
                if (!a.pinned && b.pinned) return 1;
                return 0;
            });
    }

    /** Send a message in a conversation. */
    async sendMessage(conversationId: string, senderId: string, content: string) {
        if (!content?.trim()) throw new Error("Message content cannot be empty.");

        const cid = new mongoose.Types.ObjectId(conversationId);
        const sid = new mongoose.Types.ObjectId(senderId);

        const conv = await ConversationModel.findById(cid);
        if (!conv) throw new Error("Conversation not found.");
        if (!conv.participants.some((p: any) => p.equals(sid))) {
            throw new Error("Unauthorized.");
        }

        const message = await MessageModel.create({
            conversationId: cid,
            senderId: sid,
            content: content.trim(),
        });

        conv.lastMessageAt = new Date();
        await conv.save();

        return message;
    }

    /** Get messages for a conversation (excludes permanently deleted). */
    async getMessages(conversationId: string, userId: string) {
        const cid = new mongoose.Types.ObjectId(conversationId);
        const uid = new mongoose.Types.ObjectId(userId);

        const conv = await ConversationModel.findById(cid).lean();
        if (!conv) throw new Error("Conversation not found.");
        if (!(conv.participants as any[]).some((p: any) => p.equals(uid))) {
            throw new Error("Unauthorized.");
        }

        return await MessageModel.find({ conversationId: cid })
            .populate("senderId", "username")
            .sort({ createdAt: 1 })
            .lean();
    }

    /** Soft-delete a message (only the sender can delete it). */
    async deleteMessage(messageId: string, userId: string) {
        const msg = await MessageModel.findById(messageId);
        if (!msg) throw new Error("Message not found.");
        if (!msg.senderId.equals(new mongoose.Types.ObjectId(userId))) {
            throw new Error("Unauthorized.");
        }
        msg.deletedAt = new Date();
        await msg.save();
        return msg;
    }

    /** Toggle pin for the calling user on a conversation. */
    async togglePin(conversationId: string, userId: string) {
        const cid = new mongoose.Types.ObjectId(conversationId);
        const uid = new mongoose.Types.ObjectId(userId);

        const conv = await ConversationModel.findById(cid);
        if (!conv) throw new Error("Conversation not found.");
        if (!(conv.participants as any[]).some((p: any) => p.equals(uid))) {
            throw new Error("Unauthorized.");
        }

        const isPinned = (conv.pinnedBy as any[]).some((p: any) => p.equals(uid));
        if (isPinned) {
            await ConversationModel.findByIdAndUpdate(cid, { $pull: { pinnedBy: uid } });
            return { pinned: false };
        } else {
            await ConversationModel.findByIdAndUpdate(cid, { $addToSet: { pinnedBy: uid } });
            return { pinned: true };
        }
    }
}

export default new ChatController();
