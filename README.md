# Infinity Chat

Infinity Chat is a client-based chat application where all encryption is performed in the browser. The platform stores only encrypted messages and public keys—your private keys remain secure and are never saved.

# WARNING
THIS PROJECT IS A WIP UNTIL v1.0 GETS RELEASED

### The Plan
This is a selfhostable chat app meant for small to medium size groups who want to talk to each other with pgp with the convenience of the encryption being integrated into the chat.

It will use pocketbase to have a portable small db to hold encrypted messages, public keys/users, and chatroom/dm data such as title of chat etc.
It will use openpgp.js mainly on the client side to handle encryption/decryption, private keys, and other sensitive stuff while the server side will only have functions need for connecting people through websockets, db handling, security challenges with public key etc.
It will also have tailwindcss for styling and expressjs for a minimal webserver with express handlebars for html templating and all while using typescript

### Planned Database Schema

#### User
- `id`: int (primary key)
- `username`: string (unique)
- `public_key`: string (unique, stored server-side, served to clients for encryption)
- `created_at`: datetime
- `updated_at`: datetime

#### Chatroom
- `id`: int (primary key)
- `name`: string (unique)
- `creator_id`: int (foreign key to User)
- `type`: enum (`dm`, `group`)
- `created_at`: datetime
- `updated_at`: datetime

#### Membership
- `id`: int (primary key)
- `user_id`: int (foreign key to User)
- `chatroom_id`: int (foreign key to Chatroom)
- `joined_at`: datetime

#### Message
- `id`: int (primary key)
- `chatroom_id`: int (foreign key to Chatroom)
- `sender_id`: int (foreign key to User)
- `content`: string (encrypted)
- `created_at`: datetime

#### Friendship
- `id`: int (primary key)
- `user_id`: int (foreign key to User)
- `friend_id`: int (foreign key to User)
- `created_at`: datetime

**Notes:**
- The `public_key` field in the User table is stored server-side and served to clients, allowing users to encrypt messages for others and decrypt messages client-side.
- Membership table efficiently manages users in chatrooms (many-to-many).
- Friendship table manages user connections.
- All sensitive data (messages, public keys) remain encrypted or are only public keys.
- Chatroom type uses an enum for clarity (`dm` for direct message, `group` for group chat).
- Timestamps help with auditing and ordering.
- Idk how pocketbase will support this but it's whatever I'll figure it out

### How To Run
Run "npm install"
Use "npm run build" and then "npm run start" for production version.
Use "npm run dev" to start application in dev mode.
Use "npm run clean" to delete dist directory

### Contributions
Contributions to make things better are always welcome as long as they have the goal of the application in mind
