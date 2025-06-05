// src/index.ts
import express, { Request, Response } from 'express';
import path from 'path'; // Import the 'path' module

const app = express();
const port = process.env.PORT || 3000;

// Serve static files from the 'src/public' directory
// The path.join() method is used to construct a platform-specific path.
app.use(express.static(path.join(__dirname, 'public')));

// Serve the index.html for / route
app.get('/', (req: Request, res: Response) => {
    res.sendFile(path.join(__dirname, 'public','pages', 'home.html'));
});

app.get('/profile', (req: Request, res: Response) => {
    res.sendFile(path.join(__dirname, 'public', 'pages', 'profile.html'));
});

// You can still add other API routes if needed, for example:
app.get('/api/data', (req: Request, res: Response) => {
  res.json({ message: 'This is an API endpoint!' });
});

app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
  console.log(`Serving static files from: ${path.join(__dirname, 'public')}`);
});