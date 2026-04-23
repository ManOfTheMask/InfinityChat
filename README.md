# InfinityChat

> **⚠ Work in progress — not yet at v1.0**

InfinityChat is a self-hostable, end-to-end encrypted messaging application for small to medium groups. All encryption and decryption happens entirely in the browser using [OpenPGP.js](https://openpgpjs.org/). The server never sees plaintext messages or private keys — it only stores ciphertext and public keys.

---

## How It Works

### Authentication
InfinityChat uses a **PGP challenge-response** authentication flow instead of passwords:

1. On signup, the browser generates a PGP key pair. The private key is downloaded to your device and never leaves it. The public key is registered with the server.
2. On login, you upload your private key file and enter your passphrase. The client extracts the public key, requests an encrypted challenge from the server, decrypts it locally, and returns the solution to prove ownership of the private key.
3. Once authenticated, a session is established server-side.

### Messaging
- Conversations are 1-to-1 DMs between friends.
- Messages are encrypted in the browser before being sent and decrypted in the browser after being received.
- Real-time delivery is handled via **WebSockets**.
- The server stores only the encrypted ciphertext and relays messages to connected clients.

### Friends
- Users can send, accept, and decline friend requests by username.
- The friends list shows each friend's public key, which is used for encrypting messages to them.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Server | Node.js, Express 5, TypeScript |
| Templating | Express Handlebars |
| Database | MongoDB (Mongoose) |
| Real-time | WebSockets (`ws`) |
| Encryption | OpenPGP.js (client-side) |
| Styling | Tailwind CSS, DaisyUI |
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
| `createdAt` | datetime | |
| `updatedAt` | datetime | |

### Conversation
| Field | Type | Notes |
|---|---|---|
| `participants` | ObjectId[] | references User |
| `lastMessageAt` | datetime | used for sorting |
| `pinnedBy` | ObjectId[] | users who pinned this conversation |

### Message
| Field | Type | Notes |
|---|---|---|
| `conversationId` | ObjectId | references Conversation |
| `senderId` | ObjectId | references User |
| `content` | string | PGP-encrypted ciphertext |
| `createdAt` | datetime | |

### FriendRequest
| Field | Type | Notes |
|---|---|---|
| `fromUserId` | ObjectId | references User |
| `toUserId` | ObjectId | references User |
| `status` | enum | `pending`, `accepted`, `declined` |
| `createdAt` | datetime | |

---

## How To Run

### Prerequisites
- Node.js 18+
- A running MongoDB instance

### Setup

1. **Clone the repository and install dependencies:**
   ```bash
   git clone https://github.com/ManOfTheMask/InfinityChat.git
   cd InfinityChat
   npm install
   ```

2. **Create a `.env` file** in the project root:
   ```env
   MONGO_URI="mongodb://localhost:27017/infinitychat"
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

## Contributing

Contributions are welcome as long as they align with the goal of the project: private, self-hosted, end-to-end encrypted messaging that is simple to use.
