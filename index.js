import express from 'express';
import cors from 'cors';
import mongoose from 'mongoose';

// 🌍 MongoDB connection URI
const mongoURI = 'mongodb+srv://esp32user:yourStrongPassword123@cluster0.3v4lu.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0';

mongoose.connect(mongoURI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
})
  .then(() => console.log('✅ Connected to MongoDB'))
  .catch((err) => console.error('❌ MongoDB connection error:', err));

// 💾 MongoDB schema (no tankFull here)
const waterLevelSchema = new mongoose.Schema({
  distance: Number,
  level: Number,
  timestamp: {
    type: Date,
    default: Date.now
  }
});

const WaterLevel = mongoose.model('WaterLevel', waterLevelSchema);

// 🌐 App setup
const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// 🌊 In-memory latest data (includes tankFull for live view)
let lastData = { distance: 0, level: 0, tankFull: false, timestamp: null };

// 📩 POST: Receive data from ESP32 & save only distance + level
app.post('/api/water-level', async (req, res) => {
  const { distance, level, tankFull } = req.body;

  if (typeof distance === 'number' && typeof level === 'number') {
    const timestamp = new Date();

    // Store tankFull only in memory
    lastData = { distance, level, tankFull: !!tankFull, timestamp };

    try {
      // Save only distance + level + timestamp to MongoDB
      const entry = new WaterLevel({ distance, level, timestamp });
      await entry.save();

      console.log('📩 Data saved:', entry);
      console.log(`💧 Tank full status (live): ${tankFull ? 'FULL' : 'NOT full'}`);

      // Respond with live data including tankFull
      res.status(200).json(lastData);
    } catch (err) {
      console.error('❌ DB save error:', err);
      res.status(500).json({ error: 'Failed to save data' });
    }
  } else {
    res.status(400).json({ error: 'Invalid data format' });
  }
});

// 📤 GET: Latest single reading (includes tankFull live)
app.get('/api/water-level', (req, res) => {
  res.json(lastData);
});

// 📊 GET: Historical data by interval (5m, 1h, 24h)
app.get('/api/water-level/history', async (req, res) => {
  const { interval } = req.query;
  const now = new Date();
  let past;

  switch (interval) {
    case '5m':
      past = new Date(now.getTime() - 5 * 60 * 1000);
      break;
    case '1h':
      past = new Date(now.getTime() - 60 * 60 * 1000);
      break;
    case '24h':
      past = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      break;
    default:
      return res.status(400).json({ error: 'Invalid interval. Use 5m, 1h, or 24h' });
  }

  try {
    const data = await WaterLevel.find({ timestamp: { $gte: past } }).sort({ timestamp: 1 });
    res.json(data);
  } catch (err) {
    console.error('❌ Fetch error:', err);
    res.status(500).json({ error: 'Failed to fetch historical data' });
  }
});

// 🚀 Start server
app.listen(port, () => {
  console.log(`✅ Server running on port ${port}`);
});
