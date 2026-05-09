<p align="center">
   <img src="/src/public/img/LogoFull.png" alt="KeepQuiet logo" />
</p>

# KeepQuiet

> **⚠ Work in progress — not yet at v1.0**

KeepQuiet is a self-hostable, end-to-end encrypted messaging application. All encryption and decryption happens entirely in the browser using [OpenPGP.js](https://openpgpjs.org/). The server never sees plaintext messages or private keys — it only stores ciphertext and public keys.

---

## Features

- **End-to-end encrypted DMs** — messages are encrypted in the browser before being sent; the server only stores ciphertext
- **PGP challenge-response login** — no passwords; authentication is proven by decrypting a server challenge with your private key
- **Real-time messaging** — WebSocket delivery so messages appear instantly without refreshing
- **Real-time notifications** — in-app notification bell for new messages and friend requests, pushed via WebSocket
- **Friends system** — send, accept, and decline friend requests by sharing your public key
- **Conversation management** — pin conversations, close a DM (with the option to delete all messages), and re-open it later by messaging the same friend again
- **Message deletion** — soft-delete individual messages; deleted messages show a placeholder to all participants

---

## How It Works

### Authentication
KeepQuiet uses a **PGP challenge-response** flow instead of passwords:

1. On signup, the browser generates a PGP key pair. The private key is downloaded to your device and never leaves it. The public key is registered with the server.
2. On login, you upload your private key file and enter your passphrase. The client extracts the public key, requests an encrypted challenge from the server, decrypts it locally, and returns the solution to prove ownership of the private key.
3. Once authenticated, a session is established server-side.
4. If PGP credentials are not already in `sessionStorage`, an unlock overlay prompts you to re-enter them so messages can be decrypted without logging out.

### Messaging
- Conversations are 1-to-1 DMs between friends.
- Messages are encrypted in the browser with the recipient's public key (and your own, so you can read your sent messages) before being sent.
- Real-time delivery is handled via **WebSockets**. The server stores only encrypted ciphertext.
- You can soft-delete any message you sent.
- You can close a conversation (hide it from your sidebar). When closing, you are prompted to either keep the messages or permanently delete them. Opening a new chat with the same friend restores the conversation.

### Friends
- Users find each other by sharing their PGP public key.
- Friend requests can be sent, accepted, or declined from the Friends page.
- The friends list is used in the chat friend picker to start new conversations.

### Notifications
- A bell icon in the navbar shows unread notifications with a live badge count.
- Notifications are pushed in real time via WebSocket when a friend request is received or a new message arrives.
- Each notification has a **Mark read** button and a **Dismiss** button (permanently deletes the notification).
- **Mark all read** clears the badge in one click.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Server | Node.js, Express 5, TypeScript |
| Templating | Express Handlebars |
| Database | MongoDB (Mongoose) |
| Real-time | WebSockets (`ws`) |
| Encryption | OpenPGP.js (client-side) |
| Styling | Tailwind CSS v4, DaisyUI v5 |
| Bundler | Vite |
| Testing | Vitest |

---

## Database Schema

### User
| Field | Type | Notes |
|---|---|---|
| `username` | string | unique |
| `publicKey` | string | fingerprint; unique |
| `publicKeyArmored` | string | full ASCII-armored public key |
| `friends` | ObjectId[] | references User |
| `createdAt` | datetime | |
| `updatedAt` | datetime | |

### Conversation
| Field | Type | Notes |
|---|---|---|
| `participants` | ObjectId[] | exactly 2; references User |
| `lastMessageAt` | datetime | used for sorting |
| `pinnedBy` | ObjectId[] | users who pinned this conversation |
| `hiddenBy` | ObjectId[] | users who closed/hid this conversation |
| `createdAt` | datetime | |

### Message
| Field | Type | Notes |
|---|---|---|
| `conversationId` | ObjectId | references Conversation |
| `senderId` | ObjectId | references User |
| `content` | string | PGP-encrypted ciphertext |
| `deletedAt` | datetime | set when soft-deleted; `null` otherwise |
| `createdAt` | datetime | |

### FriendRequest
| Field | Type | Notes |
|---|---|---|
| `fromUserId` | ObjectId | references User |
| `toUserId` | ObjectId | references User |
| `status` | enum | `pending`, `accepted`, `declined` |
| `createdAt` | datetime | |

### Notification
| Field | Type | Notes |
|---|---|---|
| `userId` | ObjectId | recipient; references User |
| `type` | enum | `friend_request`, `message` |
| `title` | string | short heading shown in the bell dropdown |
| `body` | string | optional detail text |
| `link` | string | where the "Open" button navigates |
| `read` | boolean | `false` until marked read |
| `createdAt` | datetime | |

---

## API Routes

### Auth / User
| Method | Path | Description |
|---|---|---|
| `GET` | `/login` | Login page |
| `GET` | `/signup` | Sign-up landing |
| `GET` | `/signup/generate` | Generate a new PGP key pair |
| `GET` | `/signup/import` | Import an existing PGP key |
| `POST` | `/signup/generate` | Register with a generated key |
| `POST` | `/signup/import` | Register with an imported key |
| `POST` | `/logout` | Destroy session |

### Friends
| Method | Path | Description |
|---|---|---|
| `POST` | `/friends/request` | Send a friend request (by public key) |
| `POST` | `/friends/accept/:requestId` | Accept a friend request |
| `POST` | `/friends/decline/:requestId` | Decline a friend request |
| `GET` | `/friends/list` | JSON list of friends (used by friend picker) |

### Chat
| Method | Path | Description |
|---|---|---|
| `GET` | `/chat` | Chat page (lists all conversations) |
| `POST` | `/chat/start` | Get or create a conversation with a friend |
| `GET` | `/chat/:id/messages` | Load messages for a conversation |
| `POST` | `/chat/:id/messages` | Send a message |
| `DELETE` | `/chat/:id/messages/:msgId` | Soft-delete a message |
| `POST` | `/chat/:id/pin` | Toggle pin for a conversation |
| `DELETE` | `/chat/:id` | Close (and optionally delete messages in) a conversation |
| `GET` | `/chat/:id/recipient-key` | Fetch the recipient's public key for encryption |

### Notifications
| Method | Path | Description |
|---|---|---|
| `GET` | `/notifications` | List all notifications for the current user |
| `POST` | `/notifications/read-all` | Mark all notifications as read |
| `POST` | `/notifications/:id/read` | Mark a single notification as read |
| `DELETE` | `/notifications/:id` | Dismiss (permanently delete) a notification |

---

## How To Run

### Prerequisites
- Node.js 18+
- A running MongoDB instance

### Setup

1. **Clone the repository and install dependencies:**
   ```bash
   git clone https://github.com/ManOfTheMask/KeepQuiet.git
   cd KeepQuiet
   npm install
   ```

2. **Create a `.env` file** in the project root:
   ```env
   MONGO_URI="mongodb://localhost:27017/KeepQuiet"
   SESSION_SECRET="your-session-secret"
   ```

3. **Run the application:**

   | Command | Description |
   |---|---|
   | `npm run dev` | Start in development mode with file watching |
   | `npm run build` | Compile and bundle for production |
   | `npm run start` | Start the production build |
   | `npm run test` | Build and run the test suite |
   | `npm run clean` | Delete the `dist/` directory |

---

## Upcoming Features

- **Theme picker** — let users choose from DaisyUI's built-in themes or customise accent colours
- **Group chats** — multi-participant conversations with shared group key management
- **Message reactions** — emoji reactions on individual messages
- **Read receipts** — show when a message has been seen by the recipient
- **File / image sharing** — encrypted attachment support
- **Notification preferences** — per-conversation mute and global notification settings
- **Mobile app** — a native wrapper (e.g. Capacitor or Tauri) around the existing web UI

---

## Contributing

Contributions are welcome as long as they align with the goal of the project: private, self-hosted, end-to-end encrypted messaging that is simple to use.
