import express from 'express';
import cors from 'cors';
import mongoose from 'mongoose';
import twilio from 'twilio';

// =======================
// 🌍 MongoDB Connection
// =======================

const mongoURI = 'mongodb+srv://esp32user:yourStrongPassword123@cluster0.3v4lu.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0';

mongoose.connect(mongoURI)
  .then(() => console.log('✅ Connected to MongoDB'))
  .catch(err => console.error('❌ MongoDB connection error:', err));


// =======================
// 💾 Schemas
// =======================

// Water Level Schema (auto delete after 15 days)
const waterLevelSchema = new mongoose.Schema({
  distance: Number,
  level: Number,
  timestamp: { type: Date, default: Date.now }
});

waterLevelSchema.index(
  { timestamp: 1 },
  { expireAfterSeconds: 15 * 24 * 60 * 60 }
);

const WaterLevel = mongoose.model('WaterLevel', waterLevelSchema);


// Tank Full Events Schema (auto delete after 15 days)
const tankFullSchema = new mongoose.Schema({
  timestamp: { type: Date, default: Date.now }
});

tankFullSchema.index(
  { timestamp: 1 },
  { expireAfterSeconds: 15 * 24 * 60 * 60 }
);

const TankFullEvent = mongoose.model('TankFullEvent', tankFullSchema);


// =======================
// 🌐 App Setup
// =======================

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());


// =======================
// 🌊 In-Memory Data
// =======================

let lastData = {
  distance: 0,
  level: 0,
  tankFull: false,
  timestamp: null
};

let hasCalled = false;


// =======================
// 🔔 TWILIO SETUP
// =======================

// First Twilio Account
const client1 = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);

const flowSid1 = 'FW3d089e7d66c44a13177f00ad892744f2';
const toNumber1 = '+919423287988';
const fromNumber1 = '+12627627374';


// Second Twilio Account (Safe Initialization)
let client2 = null;

if (
  process.env.TWILIO_ACCOUNT_SID_2 &&
  process.env.TWILIO_AUTH_TOKEN_2
) {
  client2 = twilio(
    process.env.TWILIO_ACCOUNT_SID_2,
    process.env.TWILIO_AUTH_TOKEN_2
  );
  console.log("✅ Second Twilio initialized");
} else {
  console.log("⚠ Second Twilio credentials missing");
}

const flowSid2 = 'FW65001dbcccca5ebbce2173aa188c6c15';
const toNumber2 = '+919423262188';
const fromNumber2 = '+12183876708';


// =======================
// 📩 POST: Receive ESP32 Data
// =======================

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

    // Save reading
    await new WaterLevel({ distance, level, timestamp }).save();

    if (tankFull) {

      if (!hasCalled) {

        // 🔔 FIRST TWILIO CALL
        try {
          const execution1 = await client1.studio.v2
            .flows(flowSid1)
            .executions.create({
              to: toNumber1,
              from: fromNumber1
            });

          console.log('📞 First Twilio call:', execution1.sid);
        } catch (err) {
          console.error('❌ First Twilio error:', err.message);
        }

        // 🔔 SECOND TWILIO CALL
        if (client2) {
          try {
            const execution2 = await client2.studio.v2
              .flows(flowSid2)
              .executions.create({
                to: toNumber2,
                from: fromNumber2
              });

            console.log('📞 Second Twilio call:', execution2.sid);
          } catch (err) {
            console.error('❌ Second Twilio error:', err.message);
          }
        }

        // Save tank full event (avoid duplicates within 5 min)
        const recentEvent = await TankFullEvent.findOne({
          timestamp: { $gte: new Date(Date.now() - 5 * 60 * 1000) }
        });

        if (!recentEvent) {
          await new TankFullEvent({ timestamp }).save();
        }

        hasCalled = true;

      } else {
        console.log('⚠ Tank full alert already sent.');
      }

    } else {
      hasCalled = false;
    }

    res.status(200).json(lastData);

  } catch (err) {
    console.error('❌ DB save error:', err);
    res.status(500).json({ error: 'Failed to save data' });
  }
});


// =======================
// 📤 GET: Latest Reading
// =======================

app.get('/api/water-level', (req, res) => {

  if (!lastData.timestamp) {
    return res.status(404).json({ message: 'No data available yet' });
  }

  res.json(lastData);
});


// =======================
// 📊 GET: History
// =======================

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
      return res.status(400).json({ error: 'Invalid interval (5m, 1h, 24h)' });
  }

  try {
    const data = await WaterLevel
      .find({ timestamp: { $gte: past } })
      .sort({ timestamp: 1 });

    res.json(data);

  } catch (err) {
    console.error('❌ History fetch error:', err);
    res.status(500).json({ error: 'Failed to fetch historical data' });
  }
});


// =======================
// 📊 GET: Tank Full Events
// =======================

app.get('/api/water-level/full-events', async (req, res) => {

  try {
    const events = await TankFullEvent
      .find()
      .sort({ timestamp: -1 });

    res.json(events);

  } catch (err) {
    console.error('❌ Full events fetch error:', err);
    res.status(500).json({ error: 'Failed to fetch tank full events' });
  }
});


// =======================
// 🚀 Start Server
// =======================

app.listen(port, () => {
  console.log(`✅ Server running on port ${port}`);
});
