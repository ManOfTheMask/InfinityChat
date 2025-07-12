// src/index.ts
import express, { Request, Response } from 'express';
import path from 'path'; // Import the 'path' module
import { engine } from 'express-handlebars'; // Import express-handlebars

import 'dotenv/config'; // Load environment variables from .env file
import mongoose from 'mongoose'; 
import UserController from './Controllers/UserController';
import dotenv from 'dotenv';
import session from 'express-session';

dotenv.config(); // Load environment variables from .env file

const app = express();
const port = process.env.PORT || 3000;

//init database connection here
const dbUri = process.env.MONGO_URI
if (!dbUri) {
    console.error('MONGO_URI is not defined in the environment variables.');
    process.exit(1); // Exit the process if MONGO_URI is not set
}
mongoose.connect(dbUri)
.then(() => {
    console.log('Connected to MongoDB');
})

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
    secret: '', //add your secret here, it should be a long random string and in environment variables
    resave: false,
    saveUninitialized: true,
    cookie: {
        secure: false, // Set to true in production (requires HTTPS)
        httpOnly: true,
        maxAge: 1000 * 60 * 60 // 1 hour
    }
}));

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


app.get('/test', (req: Request, res: Response) => {
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