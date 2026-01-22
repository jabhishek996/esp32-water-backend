import express from 'express';
import cors from 'cors';
import mongoose from 'mongoose';
import twilio from 'twilio';

/* =========================
   🌍 MongoDB Connection
========================= */
const mongoURI =
  'mongodb+srv://esp32user:yourStrongPassword123@cluster0.3v4lu.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0';

mongoose
  .connect(mongoURI, {
    useNewUrlParser: true,
    useUnifiedTopology: true
  })
  .then(() => console.log('✅ Connected to MongoDB'))
  .catch((err) => console.error('❌ MongoDB connection error:', err));

/* =========================
   💾 MongoDB Schema
========================= */
const waterLevelSchema = new mongoose.Schema({
  distance: Number,
  level: Number,
  timestamp: {
    type: Date,
    default: Date.now
  }
});

const WaterLevel = mongoose.model('WaterLevel', waterLevelSchema);

/* =========================
   🌐 Express App Setup
========================= */
const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

/* =========================
   🌊 Runtime State
========================= */
let lastData = {
  distance: 0,
  level: 0,
  tankFull: false,
  timestamp: null
};

let hasCalled = false; // Prevent duplicate alerts

/* =========================
   📞 Twilio Account #1
========================= */
const accountSid1 = 'AC94fa918b243ed08bff3240bf15371eab';
const authToken1 = 'fd6ac29fb9ca5c8f03efd863c85dd79f';
const client1 = twilio(accountSid1, authToken1);

const flowSid1 = 'FW65001dbcccca5ebbce2173aa188c6c15';
const fromNumber1 = '+12183876708';
const toNumber1 = '+919423262188';

/* =========================
   📞 Twilio Account #2
========================= */
const accountSid2 = 'AC8e592b16401c28a298844d0a7614a6ad';
const authToken2 = '3bd6fd6cd47fe8ee28a88b6de6c02698';
const client2 = twilio(accountSid2, authToken2);

const flowSid2 = 'FW3d089e7d66c44a13177f00ad892744f2';
const fromNumber2 = '+12627627374';
const toNumber2 = '+919423287988';

/* =========================
   📩 POST: ESP32 Data
========================= */
app.post('/api/water-level', async (req, res) => {
  const { distance, level, tankFull } = req.body;

  if (typeof distance !== 'number' || typeof level !== 'number') {
    return res.status(400).json({ error: 'Invalid data format' });
  }

  const timestamp = new Date();
  lastData = {
    distance,
    level,
    tankFull: !!tankFull,
    timestamp
  };

  try {
    // 💾 Save to MongoDB
    const entry = new WaterLevel({ distance, level, timestamp });
    await entry.save();

    console.log('📩 Data saved:', entry);
    console.log(`💧 Tank status: ${tankFull ? 'FULL' : 'NOT FULL'}`);

    /* =========================
       🔔 Trigger Alerts
    ========================= */
    if (tankFull) {
      if (!hasCalled) {
        try {
          // 📞 Twilio Account 1
          const exec1 = await client1.studio.v2
            .flows(flowSid1)
            .executions.create({
              to: toNumber1,
              from: fromNumber1
            });

          console.log('📞 Twilio Account 1 Flow SID:', exec1.sid);

          // 📞 Twilio Account 2
          const exec2 = await client2.studio.v2
            .flows(flowSid2)
            .executions.create({
              to: toNumber2,
              from: fromNumber2
            });

          console.log('📞 Twilio Account 2 Flow SID:', exec2.sid);

          hasCalled = true;
        } catch (err) {
          console.error('❌ Twilio error:', err.message);
        }
      } else {
        console.log('⚠ Alert already sent. Skipping duplicate.');
      }
    } else {
      if (hasCalled) {
        console.log('🔄 Tank no longer full. Resetting alert flag.');
      }
      hasCalled = false;
    }

    res.status(200).json(lastData);
  } catch (err) {
    console.error('❌ Server error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/* =========================
   📤 GET: Latest Data
========================= */
app.get('/api/water-level', (req, res) => {
  res.json(lastData);
});

/* =========================
   📊 GET: History
========================= */
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
      return res
        .status(400)
        .json({ error: 'Invalid interval. Use 5m, 1h, or 24h' });
  }

  try {
    const data = await WaterLevel.find({
      timestamp: { $gte: past }
    }).sort({ timestamp: 1 });

    res.json(data);
  } catch (err) {
    console.error('❌ Fetch error:', err);
    res.status(500).json({ error: 'Failed to fetch data' });
  }
});

/* =========================
   🚀 Start Server
========================= */
app.listen(port, () => {
  console.log(`✅ Server running on port ${port}`);
});
