// index.js
import express from 'express';
import cors from 'cors';

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Temporary store (or connect DB later)
let lastData = { distance: 0, level: 0 };

app.post('/api/water-level', (req, res) => {
  const { distance, level } = req.body;
  if (typeof distance === 'number' && typeof level === 'number') {
    lastData = { distance, level };
    console.log('📩 Data received:', lastData);
    res.status(200).json({ message: 'Data received successfully' });
  } else {
    res.status(400).json({ error: 'Invalid payload' });
  }
});

app.get('/api/water-level', (req, res) => {
  res.json(lastData);
});

app.listen(port, () => {
  console.log(`🚀 Server running on port ${port}`);
});
