# Infinity Chat

Infinity Chat is a client-based chat application where all encryption is performed in the browser. The platform stores only encrypted messages and public keys—your private keys remain secure and are never saved.

# WARNING
THIS PROJECT IS A WIP UNTIL v1.0 GETS RELEASED

### The Plan
This is a selfhostable chat app meant for small to medium size groups who want to talk to each other with pgp with the convenience of the encryption being integrated into the chat.

It will use pocketbase to have a portable small db to hold encrypted messages, public keys/users, and chatroom/dm data such as title of chat etc.
It will use openpgp.js mainly on the client side to handle encryption/decryption, private keys, and other sensitive stuff while the server side will only have functions need for connecting people through websockets, db handling, security challenges with public key etc.
It will also have tailwindcss for styling and expressjs for a minimal webserver with express handlebars for html templating and all while using typescript

Planned db schema:
Chatroom:
    chatroom_name: string (unique)
    creator: string 
    messages: list of dicts (each dict contains content, username, date)
    list of members: list of public keys
    dm: boolean (true if direct message, false if group chat)

User:
    public_key: string
    dms: list of chatroom names (for direct messages)
    groups: list of group names (for group chats)
    friends: list of usernames
    created_at: datetime
    updated_at: datetime


### How To Run
Run "npm install"
Use "npm run build" and then "npm run start" for production version.
Use "npm run dev" to start application in dev mode.
Use "npm run clean" to delete dist directory

### Contributions
Contributions to make things better are always welcome as long as they have the goal of the application in mind
