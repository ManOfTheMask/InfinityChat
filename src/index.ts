// src/index.ts
import express, { Request, Response } from 'express';
import path from 'path'; // Import the 'path' module
import { engine } from 'express-handlebars'; // Import express-handlebars

const app = express();
const port = process.env.PORT || 3000;

// Set up Handlebars as the template engine
app.engine('handlebars', engine());
app.set('view engine', 'handlebars');
app.set('views', path.join(__dirname, 'public' ,'views'));

// Serve static files from the 'src/public' directory
// The path.join() method is used to construct a platform-specific path.
app.use(express.static(path.join(__dirname, 'public')));

// Serve the index.html for / route
app.get('/', (req: Request, res: Response) => {
    res.render('home', { title: 'Home' });
});

app.get('/profile', (req: Request, res: Response) => {
    res.render('profile', { title: 'Profile' });
});

// You can still add other API routes if needed, for example:
app.get('/api/data', (req: Request, res: Response) => {
  res.json({ message: 'This is an API endpoint!' });
});

app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
  console.log(`Serving static files from: ${path.join(__dirname, 'public')}`);
});