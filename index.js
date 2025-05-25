import express from 'express';
import cors from 'cors';

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// 🌊 In-memory store for latest data
let lastData = { distance: 0, level: 0, timestamp: null };

// 📩 POST: Receive data from ESP32
app.post('/api/water-level', (req, res) => {
  const { distance, level } = req.body;
  if (typeof distance === 'number' && typeof level === 'number') {
    lastData = { distance, level, timestamp: new Date() };
    console.log('📩 Data received:', lastData);
    res.status(200).json({ message: 'Data received and stored temporarily' });
  } else {
    res.status(400).json({ error: 'Invalid data format' });
  }
});

// 📤 GET: Latest single reading
app.get('/api/water-level', (req, res) => {
  res.json(lastData);
});

// 🚀 Start server
app.listen(port, () => {
  console.log(`✅ Server running on port ${port}`);
});
