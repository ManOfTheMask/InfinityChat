import mongoose from "mongoose";

const userSchema = new mongoose.Schema({
    publicKey: {
        type: String,
        required: true,
        unique: true,
    },

    // Original armored PGP public key (with line breaks) used for encryption.
    // publicKey above is the whitespace-stripped version used for deduplication lookups.
    publicKeyArmored: {
        type: String,
        default: null,
    },

    username: {
        type: String,
        required: true,
        unique: true,
    },

    createdAt: {
        type: Date,
        default: Date.now,
    },

    updatedAt: {
        type: Date,
        default: Date.now,
    },

    friends: {
        type: [mongoose.Schema.Types.ObjectId],
        ref: "User",
        default: [],
    },
});

const UserModel = mongoose.model("User", userSchema);

export default UserModel;