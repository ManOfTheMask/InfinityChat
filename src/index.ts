// src/index.ts
import express, { Request, Response } from 'express';
import http from 'http';
import path from 'path'; // Import the 'path' module
import { engine } from 'express-handlebars'; // Import express-handlebars

import 'dotenv/config'; // Load environment variables from .env file
import mongoose from 'mongoose'; 
import UserController from './Controllers/UserController';
import FriendController from './Controllers/FriendController';
import ChatController from './Controllers/ChatController';
import ConversationModel from './Models/ConversationModel';
import dotenv from 'dotenv';
import session from 'express-session';
import openpgp from 'openpgp'; // Import OpenPGP for cryptographic operations
import crypto from 'crypto';
import { WebSocketServer, WebSocket } from 'ws';

// Extend SessionData to include custom properties
declare module 'express-session' {
    interface SessionData {
        authenticated?: boolean;
        userId?: string;
    }
}

// Define the structure of the challenge data
interface ChallengeData {
    challenge: string;
    publicKey: string;
    userId: string;
    timestamp: number;
}

// In-memory storage for challenges (expires after 5 minutes)
const pendingChallenges = new Map<string, ChallengeData>();

// Helper function to clean up expired challenges
function cleanupExpiredChallenges() {
    const now = Date.now();
    const expireTime = 5 * 60 * 1000; // 5 minutes
    
    for (const [key, data] of pendingChallenges.entries()) {
        if (now - data.timestamp > expireTime) {
            pendingChallenges.delete(key);
        }
    }
}

dotenv.config(); // Load environment variables from .env file

const app = express();
const port = process.env.PORT || 3000;

//init database connection here
const dbUri = process.env.MONGO_URI || 'mongodb://localhost:27017/infinitychat'; // Use a default URI if not set in environment variables
if (!dbUri) {
    console.error('MONGO_URI is not defined in the environment variables.');
    process.exit(1); // Exit the process if MONGO_URI is not set
}
mongoose.connect(dbUri)
.then(() => {
    console.log('Connected to MongoDB');
})

const session_secret = process.env.SESSION_SECRET || 'default-secret'; // Use a default secret if not set in environment variables
const sessionStore = new session.MemoryStore();

// ── WebSocket helpers ──────────────────────────────────────────────────────────
const connectedUsers = new Map<string, Set<WebSocket>>();

function addUserSocket(userId: string, ws: WebSocket) {
    if (!connectedUsers.has(userId)) connectedUsers.set(userId, new Set());
    connectedUsers.get(userId)!.add(ws);
}

function removeUserSocket(userId: string, ws: WebSocket) {
    connectedUsers.get(userId)?.delete(ws);
    if (connectedUsers.get(userId)?.size === 0) connectedUsers.delete(userId);
}

function broadcastToUser(userId: string, data: object) {
    const sockets = connectedUsers.get(userId);
    if (!sockets) return;
    const msg = JSON.stringify(data);
    for (const ws of sockets) {
        if (ws.readyState === WebSocket.OPEN) ws.send(msg);
    }
}

function parseCookies(header: string): Record<string, string> {
    const cookies: Record<string, string> = {};
    for (const pair of header.split(';')) {
        const [k, ...v] = pair.trim().split('=');
        if (k) cookies[k.trim()] = decodeURIComponent(v.join('='));
    }
    return cookies;
}

function unsignSessionCookie(signed: string, secret: string): string | false {
    if (!signed.startsWith('s:')) return false;
    const str = signed.slice(2);
    const dotIdx = str.lastIndexOf('.');
    if (dotIdx < 1) return false;
    const value = str.slice(0, dotIdx);
    const sig = str.slice(dotIdx + 1);
    const mac = crypto.createHmac('sha256', secret)
        .update(value)
        .digest('base64')
        .replace(/=+$/, '');
    const a = Buffer.from(sig);
    const b = Buffer.from(mac);
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b) ? value : false;
}

// Set up Handlebars as the template engine
app.engine('handlebars', engine());
app.set('view engine', 'handlebars');
app.set('views', path.join(__dirname, 'public' ,'views'));

// Serve static files from the 'src/public' directory
// The path.join() method is used to construct a platform-specific path.
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.urlencoded({ extended: true })); // Middleware to parse URL-encoded bodies
app.use(express.json()); // Middleware to parse JSON bodies
app.use(session({
    secret: session_secret, //add your secret here, it should be a long random string and in environment variables
    store: sessionStore,
    resave: false,
    saveUninitialized: true,
    cookie: {
        secure: false, // Set to true in production (requires HTTPS)
        httpOnly: true,
        maxAge: 1000 * 60 * 60 // 1 hour
    }
}));

// Middleware to protect routes
function requireAuth(req: Request, res: Response, next: any) {
    if (req.session.authenticated) {
        next();
    } else {
        res.redirect('/login');
    }
}

// Serve the index.html for / route
app.get('/', (req: Request, res: Response) => {
    res.render('home', { title: 'Home', script: 'home' });
});

app.get('/profile', requireAuth, async (req: Request, res: Response) => {
    try {
        const user = await UserController.getUserById(req.session.userId!);
        if (!user) {
            res.status(404).render('404', { title: '404 Not Found' });
            return;
        }
        res.render('profile', {
            title: 'Profile',
            script: 'profile',
            username: user.username,
            publicKey: user.publicKey,
            createdAt: user.createdAt.toLocaleDateString(),
        });
    } catch (error) {
        console.error('Error fetching profile:', error);
        res.status(500).send('Internal server error.');
    }
});

app.get('/friends', requireAuth, async (req: Request, res: Response) => {
    try {
        const userId = req.session.userId!;
        const [friends, incomingRequests] = await Promise.all([
            FriendController.getFriends(userId),
            FriendController.getPendingIncomingRequests(userId),
        ]);
        res.render('friends', {
            title: 'Friends List',
            script: 'friends',
            friends: (friends as any[]).map(f => ({
                id: f._id.toString(),
                username: f.username,
                publicKey: f.publicKey,
            })),
            incomingRequests: incomingRequests.map((r: any) => ({
                requestId: r._id.toString(),
                username: (r.fromUserId as any).username,
                publicKey: (r.fromUserId as any).publicKey,
            })),
        });
    } catch (error) {
        console.error('Error loading friends page:', error);
        res.status(500).send('Internal server error.');
    }
});

app.post('/friends/request', requireAuth, async (req: Request, res: Response) => {
    const { publicKey } = req.body;
    if (!publicKey) {
        res.status(400).json({ success: false, message: 'Public key is required.' });
        return;
    }
    try {
        await FriendController.sendFriendRequest(req.session.userId!, publicKey);
        res.json({ success: true, message: 'Friend request sent.' });
    } catch (error: any) {
        res.status(400).json({ success: false, message: error.message });
    }
});

app.post('/friends/accept/:requestId', requireAuth, async (req: Request, res: Response) => {
    try {
        await FriendController.acceptFriendRequest(req.params.requestId, req.session.userId!);
        res.json({ success: true, message: 'Friend request accepted.' });
    } catch (error: any) {
        res.status(400).json({ success: false, message: error.message });
    }
});

app.post('/friends/decline/:requestId', requireAuth, async (req: Request, res: Response) => {
    try {
        await FriendController.declineFriendRequest(req.params.requestId, req.session.userId!);
        res.json({ success: true, message: 'Friend request declined.' });
    } catch (error: any) {
        res.status(400).json({ success: false, message: error.message });
    }
});

// JSON endpoint used by the chat friend-picker
app.get('/friends/list', requireAuth, async (req: Request, res: Response) => {
    try {
        const friends = await FriendController.getFriends(req.session.userId!);
        res.json({
            success: true,
            friends: (friends as any[]).map(f => ({ id: f._id.toString(), username: f.username })),
        });
    } catch (error: any) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// ── Chat routes ─────────────────────────────────────────────────────────────

app.get('/chat', requireAuth, async (req: Request, res: Response) => {
    try {
        const userId = req.session.userId!;
        const conversations = await ChatController.getConversationsForUser(userId);
        const serialized = conversations.map((c: any) => ({
            id: c._id.toString(),
            otherUsername: c.other?.username ?? 'Unknown',
            lastMessageAt: c.lastMessageAt
                ? new Date(c.lastMessageAt).toLocaleString()
                : null,
            pinned: c.pinned,
        }));
        res.render('chat', { title: 'Chat', script: 'chat', conversations: serialized, currentUserId: userId });
    } catch (error) {
        console.error('Error loading chat page:', error);
        res.status(500).send('Internal server error.');
    }
});

// Start or open a conversation with a friend by their userId
app.post('/chat/start', requireAuth, async (req: Request, res: Response) => {
    const { friendId } = req.body;
    if (!friendId) {
        res.status(400).json({ success: false, message: 'friendId is required.' });
        return;
    }
    try {
        const conv = await ChatController.getOrCreateConversation(req.session.userId!, friendId);
        res.json({ success: true, conversationId: conv._id.toString() });
    } catch (error: any) {
        res.status(400).json({ success: false, message: error.message });
    }
});

// Get messages for a conversation
app.get('/chat/:conversationId/messages', requireAuth, async (req: Request, res: Response) => {
    try {
        const messages = await ChatController.getMessages(
            req.params.conversationId,
            req.session.userId!
        );
        const serialized = messages.map((m: any) => ({
            id: m._id.toString(),
            senderUsername: m.senderId?.username ?? 'Unknown',
            senderId: m.senderId?._id?.toString(),
            content: m.deletedAt ? null : m.content,
            deleted: !!m.deletedAt,
            createdAt: new Date(m.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        }));
        res.json({ success: true, messages: serialized });
    } catch (error: any) {
        res.status(400).json({ success: false, message: error.message });
    }
});

// Send a message
app.post('/chat/:conversationId/messages', requireAuth, async (req: Request, res: Response) => {
    const { content } = req.body;
    if (!content) {
        res.status(400).json({ success: false, message: 'content is required.' });
        return;
    }
    try {
        const message = await ChatController.sendMessage(
            req.params.conversationId,
            req.session.userId!,
            content
        );

        // Broadcast new message to all participants via WebSocket
        const conv = await ConversationModel.findById(req.params.conversationId);
        const sender = await UserController.getUserById(req.session.userId!);
        if (conv && sender) {
            const wsMsg = {
                type: 'new_message',
                conversationId: req.params.conversationId,
                message: {
                    id: message._id.toString(),
                    senderUsername: sender.username,
                    senderId: req.session.userId!,
                    content,
                    deleted: false,
                    createdAt: new Date(message.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                },
            };
            for (const participantId of conv.participants as any[]) {
                broadcastToUser(participantId.toString(), wsMsg);
            }
        }

        res.json({ success: true, messageId: message._id.toString() });
    } catch (error: any) {
        res.status(400).json({ success: false, message: error.message });
    }
});

// Soft-delete a message
app.delete('/chat/:conversationId/messages/:messageId', requireAuth, async (req: Request, res: Response) => {
    try {
        await ChatController.deleteMessage(req.params.messageId, req.session.userId!);

        // Broadcast deletion to all participants via WebSocket
        const conv = await ConversationModel.findById(req.params.conversationId);
        if (conv) {
            const wsMsg = {
                type: 'message_deleted',
                conversationId: req.params.conversationId,
                messageId: req.params.messageId,
            };
            for (const participantId of conv.participants as any[]) {
                broadcastToUser(participantId.toString(), wsMsg);
            }
        }

        res.json({ success: true });
    } catch (error: any) {
        res.status(400).json({ success: false, message: error.message });
    }
});

// Toggle pin
app.post('/chat/:conversationId/pin', requireAuth, async (req: Request, res: Response) => {
    try {
        const result = await ChatController.togglePin(
            req.params.conversationId,
            req.session.userId!
        );
        res.json({ success: true, ...result });
    } catch (error: any) {
        res.status(400).json({ success: false, message: error.message });
    }
});

// Get the other participant's armored public key for E2E encryption
app.get('/chat/:conversationId/recipient-key', requireAuth, async (req: Request, res: Response) => {
    try {
        const userId = req.session.userId!;
        const conv = await ConversationModel.findById(req.params.conversationId)
            .populate('participants', 'publicKeyArmored username');
        if (!conv) {
            res.status(404).json({ success: false, message: 'Conversation not found.' });
            return;
        }
        const other = (conv.participants as any[]).find(
            (p: any) => p._id.toString() !== userId
        );
        if (!other) {
            res.status(404).json({ success: false, message: 'Recipient not found.' });
            return;
        }
        if (!other.publicKeyArmored) {
            res.status(400).json({ success: false, message: 'Recipient has no armored public key stored. They must re-register.' });
            return;
        }
        res.json({ success: true, publicKeyArmored: other.publicKeyArmored });
    } catch (error: any) {
        res.status(500).json({ success: false, message: error.message });
    }
});

app.post('/logout', (req: Request, res: Response) => {
    req.session.destroy((err) => {
        if (err) console.error('Error destroying session:', err);
        res.redirect('/');
    });
});

app.get('/login', (req: Request, res: Response) => {
    res.render('login', { title: 'Login', script: 'login' });
});

app.get('/signup', (req: Request, res: Response) => {
    res.render('signup', { title: 'Sign Up' });
});

app.get('/signup/generate', (req: Request, res: Response) => {
    res.render('generate', { title: 'Generate PGP Key', script: 'generate' });
});

app.post('/signup/generate', (req: Request, res: Response) => {
    const { publicKey, username } = req.body;
    if (!publicKey || !username) {
        res.status(400).json({ success: false, message: 'Public key and username are required.' });
        return;
    }
    // Normalize the public key by removing all whitespace (for dedup lookup)
    const normalizedPublicKey = publicKey.replace(/\s/g, '');

    UserController.createUser(normalizedPublicKey, username, publicKey)
        .then(() => {
            console.log('User created successfully with public key:', normalizedPublicKey);
            res.json({ success: true }); // Respond with JSON on success
        })
        .catch((error) => {
            console.error('Error creating user:', error);
            res.status(500).json({ success: false, message: 'Failed to create user.' });
        });
});

app.get('/signup/import', (req: Request, res: Response) => {
    res.render('import', { title: 'PGP Sign Up', script: 'import' }); 
    // Render the import page with a form to submit PGP key
});

// Handle POST request for importing PGP key
app.post('/signup/import', (req: Request, res: Response) => {
    console.log('body:', req.body); // Log the request body for debugging
    // Access form data from req.body
    const publicKey = req.body.publicKey; // Assuming public key is sent in the body
    const username = req.body.username; // Assuming username is sent in the body
    if (!publicKey || !username) {
        res.status(400).json({ success: false, message: 'Public key and username are required.' });
        return;
    }
    // Call UserController to create a new user with the provided public key and username
    const normalizedImportKey = publicKey.replace(/\s/g, '');
    UserController.createUser(normalizedImportKey, username, publicKey)
        .then(() => {
            console.log('User created successfully with public key:', publicKey);
            res.json({ success: true });
        })
        .catch((error) => {
            console.error('Error creating user:', error);
            res.status(500).json({ success: false, message: 'Failed to create user.' });
        });
});

app.get('/login', async (req: Request, res: Response) => {
    // Render the login page with a form to submit PGP key
    res.render('login', { title: 'Login', script: 'login' });
});

app.get('/login/challenge', async (req: Request, res: Response) => {
    const { publicKey } = req.query; // Use query parameters for GET requests
    if (!publicKey || typeof publicKey !== 'string') {
        res.status(400).json({ success: false, message: 'Public key is required.' });
        return;
    }
    try {
        // Normalize the public key for database lookup
        const normalizedPublicKey = publicKey.replace(/\s/g, '');
        const user = await UserController.getUserByPublicKey(normalizedPublicKey);
        if (!user) {
            res.status(404).json({ success: false, message: 'User not found.' });
            return;
        }

        // Generate a random challenge
        const challenge = crypto.randomBytes(32).toString('hex');
        const challengeId = crypto.randomBytes(16).toString('hex');

        // Encrypt the challenge with the user's public key
        // Use the original, non-normalized publicKey from the request for encryption
        const pgpPublicKey = await openpgp.readKey({ armoredKey: publicKey });
        const message = await openpgp.createMessage({ text: challenge });
        const encryptedChallenge = await openpgp.encrypt({
            message,
            encryptionKeys: pgpPublicKey,
        });

        // Store the challenge data
        pendingChallenges.set(challengeId, {
            challenge,
            publicKey: user.publicKey, // This is the normalized key, which is fine for storage here
            userId: user._id.toString(),
            timestamp: Date.now(),
        });

        // Auto-cleanup after 5 minutes
        setTimeout(() => {
            pendingChallenges.delete(challengeId);
        }, 5 * 60 * 1000);
        
        res.json({ 
            success: true, 
            encryptedChallenge: encryptedChallenge,
            challengeId: challengeId // Send this back to client
        });
    } catch (error) {
        console.error('Error creating challenge:', error);
        res.status(500).json({ success: false, message: 'Internal server error.' });
    }
});

app.post('/login/verify', async (req: Request, res: Response) => {
    const { decryptedChallenge, challengeId } = req.body;
    
    if (!decryptedChallenge || !challengeId) {
        res.status(400).json({ success: false, message: 'Invalid challenge response.' });
        return;
    }
    
    try {
        // Get challenge data
        const challengeData = pendingChallenges.get(challengeId);
        if (!challengeData) {
            res.status(401).json({ success: false, message: 'Challenge not found or expired.' });
            return;
        }
        
        // Verify the decrypted challenge matches the stored challenge
        if (decryptedChallenge === challengeData.challenge) {
            // Set authenticated session
            req.session.authenticated = true;
            req.session.userId = challengeData.userId;
            
            // Remove the used challenge
            pendingChallenges.delete(challengeId);
            
            res.json({ success: true, message: 'Authentication successful.' });
        } else {
            res.status(401).json({ success: false, message: 'Challenge verification failed.' });
        }
    } catch (error) {
        console.error('Error verifying challenge:', error);
        res.status(500).json({ success: false, message: 'Internal server error.' });
    }
});

//create protected route by using middleware
app.use('/protected', requireAuth, (req: Request, res: Response) => {
    res.render('test', { title: 'Test PGP', script: 'test' });
});

// Serve the 404 page for any unmatched routes
app.use((req: Request, res: Response) => {
    res.status(404).render('404', { title: '404 Not Found' });
});


// You can still add other API routes if needed, for example:
app.get('/api/data', (req: Request, res: Response) => {
  res.json({ message: 'This is an API endpoint!' });
});


// ── HTTP + WebSocket server ───────────────────────────────────────────────────
const server = http.createServer(app);

const wss = new WebSocketServer({ server, path: '/ws' });

wss.on('connection', (ws, req) => {
    const cookies = parseCookies(req.headers.cookie || '');
    const rawSid = cookies['connect.sid'];
    if (!rawSid) { ws.close(1008, 'Unauthorized'); return; }

    const sessionId = unsignSessionCookie(rawSid, session_secret);
    if (!sessionId) { ws.close(1008, 'Unauthorized'); return; }

    sessionStore.get(sessionId, (err, sess) => {
        if (err || !sess?.authenticated || !sess?.userId) {
            ws.close(1008, 'Unauthorized');
            return;
        }
        const userId = sess.userId;
        addUserSocket(userId, ws);

        // Track whether this client is still alive between pings
        (ws as any).isAlive = true;
        ws.on('message', (data) => {
            if (data.toString() === '__pong__') (ws as any).isAlive = true;
        });

        ws.on('close', () => removeUserSocket(userId, ws));
        ws.on('error', () => removeUserSocket(userId, ws));
    });
});

// Ping all clients every 30 s; terminate any that haven't responded since the last ping
const wsPingInterval = setInterval(() => {
    for (const ws of wss.clients) {
        if ((ws as any).isAlive === false) {
            ws.terminate();
            continue;
        }
        (ws as any).isAlive = false;
        ws.send('__ping__');
    }
}, 30_000);

wss.on('close', () => clearInterval(wsPingInterval));

server.listen(port, () => {
    console.log(`Server is running on http://localhost:${port}`);
    console.log(`Serving static files from: ${path.join(__dirname, 'public')}`);
});