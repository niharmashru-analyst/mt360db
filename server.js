// Production server — serves the built React app.
// Deploy this on Render exactly as you deploy EKA Dashboard:
//   Build Command: npm install && npm run build
//   Start Command: npm start
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, 'dist')));

// SPA fallback — any route not matched serves index.html so React Router can handle it
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`MT 360 Dashboard running on port ${PORT}`);
});
