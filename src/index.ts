// src/index.ts
import express, { Request, Response, Router } from 'express';
import path from 'path'; // Import the 'path' module
import { engine } from 'express-handlebars'; // Import express-handlebars

import 'dotenv/config'; // Load environment variables from .env file
import mongoose from 'mongoose'; 
import UserController from './Controllers/UserController';
import dotenv from 'dotenv';
import session from 'express-session';
import openpgp from 'openpgp'; // Import OpenPGP for cryptographic operations
import { a } from 'vitest/dist/chunks/suite.d.FvehnV49';

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

app.get('/profile', (req: Request, res: Response) => {
    res.render('profile', { title: 'Profile', script: 'profile' });
});

app.get('/friends', (req: Request, res: Response) => {
    res.render('friends', { title: 'Friends List', script: 'friends' });
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
    }
    // Call UserController to create a new user with the provided public key and username
    UserController.createUser(publicKey, username)
        .then(() => {
            console.log('User created successfully with public key:', publicKey);
            res.redirect('/profile'); // Redirect to profile after import
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
    if (!publicKey) {
        res.status(400).json({ success: false, message: 'Public key is required.' });
        return;
    }
    try {
        const user = await UserController.getUserByPublicKey(publicKey as string);
        if (!user) {
            res.status(404).json({ success: false, message: 'User not found.' });
            return;
        }
        
        // Clean up expired challenges
        cleanupExpiredChallenges();
        
        // Generate a random challenge
        const challenge = `auth-token-${Date.now()}-${Math.random()}`;
        const challengeId = `challenge-${Date.now()}-${Math.random()}`;
        
        // Store challenge data
        pendingChallenges.set(challengeId, {
            challenge,
            publicKey: user.publicKey,
            userId: user._id.toString(),
            timestamp: Date.now()
        });
        
        // Auto-cleanup after 5 minutes
        setTimeout(() => {
            pendingChallenges.delete(challengeId);
        }, 5 * 60 * 1000);
        
        // Encrypt challenge with user's public key
        const message = await openpgp.createMessage({ text: challenge });
        const userPublicKey = await openpgp.readKey({ armoredKey: user.publicKey });
        const encrypted = await openpgp.encrypt({
            message: message,
            encryptionKeys: userPublicKey,
        });
        
        res.json({ 
            success: true, 
            encryptedChallenge: encrypted,
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


app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
  console.log(`Serving static files from: ${path.join(__dirname, 'public')}`);
});