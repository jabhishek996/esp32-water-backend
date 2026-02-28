import express from 'express';
import cors from 'cors';
import mongoose from 'mongoose';
import twilio from 'twilio';

// 🌍 MongoDB connection
const mongoURI = 'mongodb+srv://esp32user:yourStrongPassword123@cluster0.3v4lu.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0';
mongoose.connect(mongoURI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
})
  .then(() => console.log('✅ Connected to MongoDB'))
  .catch(err => console.error('❌ MongoDB connection error:', err));

// 💾 Schemas

// WaterLevel readings (auto-delete after 15 days)
const waterLevelSchema = new mongoose.Schema({
  distance: Number,
  level: Number,
  timestamp: { type: Date, default: Date.now }
});
waterLevelSchema.index({ timestamp: 1 }, { expireAfterSeconds: 15 * 24 * 60 * 60 }); // 15 days TTL
const WaterLevel = mongoose.model('WaterLevel', waterLevelSchema);

// TankFull events (auto-delete after 15 days)
const tankFullSchema = new mongoose.Schema({
  timestamp: { type: Date, default: Date.now }
});
tankFullSchema.index({ timestamp: 1 }, { expireAfterSeconds: 15 * 24 * 60 * 60 }); // 15 days TTL
const TankFullEvent = mongoose.model('TankFullEvent', tankFullSchema);

// 🌐 App setup
const app = express();
const port = process.env.PORT || 3000;
app.use(cors());
app.use(express.json());

// 🌊 In-memory latest data & Twilio flag
let lastData = { distance: 0, level: 0, tankFull: false, timestamp: null };
let hasCalled = false;

// Twilio setup
const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const client = twilio(accountSid, authToken);
const flowSid = 'FW3d089e7d66c44a13177f00ad892744f2';
const toNumber = '+919423287988';
const fromNumber = '+12627627374';

// 📩 POST: Receive ESP32 data
app.post('/api/water-level', async (req, res) => {
  const { distance, level, tankFull } = req.body;

  if (typeof distance !== 'number' || typeof level !== 'number') {
    return res.status(400).json({ error: 'Invalid data format' });
  }

  const timestamp = new Date();
  lastData = { distance, level, tankFull: !!tankFull, timestamp };

  try {
    // Save all readings
    const entry = new WaterLevel({ distance, level, timestamp });
    await entry.save();
    console.log('📩 Water level saved:', entry);

    if (tankFull) {
      // Trigger Twilio Flow only once per fill
      if (!hasCalled) {
        try {
          const execution = await client.studio.v2.flows(flowSid)
            .executions
            .create({ to: toNumber, from: fromNumber });

          console.log('📞 Twilio Flow triggered! Execution SID:', execution.sid);
        } catch (err) {
          console.error('❌ Twilio trigger error:', err.message);
        }

        // Save tank full event only if not already saved in last 5 min
        const recentEvent = await TankFullEvent.findOne({
          timestamp: { $gte: new Date(Date.now() - 5 * 60 * 1000) }
        });
        if (!recentEvent) {
          const fullEvent = new TankFullEvent({ timestamp });
          await fullEvent.save();
          console.log('💾 Tank full event saved!');
        }

        hasCalled = true;
      } else {
        console.log('⚠ Tank full alert already sent. Skipping duplicate.');
      }
    } else {
      if (hasCalled) console.log('🔄 Tank no longer full. Resetting alert flag.');
      hasCalled = false;
    }

    res.status(200).json(lastData);
  } catch (err) {
    console.error('❌ DB save error:', err);
    res.status(500).json({ error: 'Failed to save data' });
  }
});

// 📤 GET: Latest reading
app.get('/api/water-level', (req, res) => {
  res.json(lastData);
});

// 📊 GET: Historical water level data by interval
app.get('/api/water-level/history', async (req, res) => {
  const { interval } = req.query;
  const now = new Date();
  let past;

  switch (interval) {
    case '5m': past = new Date(now.getTime() - 5 * 60 * 1000); break;
    case '1h': past = new Date(now.getTime() - 60 * 60 * 1000); break;
    case '24h': past = new Date(now.getTime() - 24 * 60 * 60 * 1000); break;
    default: return res.status(400).json({ error: 'Invalid interval. Use 5m, 1h, or 24h' });
  }

  try {
    const data = await WaterLevel.find({ timestamp: { $gte: past } }).sort({ timestamp: 1 });
    res.json(data);
  } catch (err) {
    console.error('❌ Fetch error:', err);
    res.status(500).json({ error: 'Failed to fetch historical data' });
  }
});

// 📊 GET: Tank full events
app.get('/api/water-level/full-events', async (req, res) => {
  try {
    const events = await TankFullEvent.find().sort({ timestamp: -1 });
    res.json(events);
  } catch (err) {
    console.error('❌ Fetch error:', err);
    res.status(500).json({ error: 'Failed to fetch tank full events' });
  }
});

// 🚀 Start server
app.listen(port, () => {
  console.log(`✅ Server running on port ${port}`);
});
