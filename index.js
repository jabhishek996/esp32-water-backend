import express from 'express';
import cors from 'cors';
import mongoose from 'mongoose';
import twilio from 'twilio';
import admin from "firebase-admin";

// =======================
// 🔥 Firebase Init (ENV BASED)
// =======================
const serviceAccount = JSON.parse(
  process.env.FIREBASE_SERVICE_ACCOUNT
);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

// =======================
// 🌍 MongoDB Connection (ENV)
// =======================
const mongoURI = process.env.MONGO_URI;

mongoose.connect(mongoURI)
  .then(() => console.log('✅ Connected to MongoDB'))
  .catch(err => console.error('❌ MongoDB connection error:', err));

// =======================
// 💾 Schemas
// =======================

// Water Level Schema
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

// Tank Full Events Schema
const tankFullSchema = new mongoose.Schema({
  timestamp: { type: Date, default: Date.now }
});

tankFullSchema.index(
  { timestamp: 1 },
  { expireAfterSeconds: 15 * 24 * 60 * 60 }
);

const TankFullEvent = mongoose.model('TankFullEvent', tankFullSchema);

// 🔔 FCM Token Schema
const tokenSchema = new mongoose.Schema({
  token: String,
  createdAt: { type: Date, default: Date.now }
});

const FCMToken = mongoose.model('FCMToken', tokenSchema);

// =======================
// 🌐 App Setup
// =======================
const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// =======================
// 📲 SAVE TOKEN API
// =======================
app.post('/api/save-token', async (req, res) => {
  const { token } = req.body;

  if (!token) return res.status(400).json({ error: 'No token' });

  try {
    const exists = await FCMToken.findOne({ token });

    if (!exists) {
      await new FCMToken({ token }).save();
      console.log("✅ Token saved");
    }

    res.json({ success: true });
  } catch (err) {
    console.error('❌ Token save error:', err);
    res.status(500).json({ error: 'Failed' });
  }
});

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
let lowAlertSent = false;

// =======================
// 🔔 TWILIO SETUP
// =======================
const client1 = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);

const flowSid1 = 'FW3d089e7d66c44a13177f00ad892744f2';
const toNumber1 = '+919423287988';
const fromNumber1 = '+12627627374';

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
}

const flowSid2 = 'FW65001dbcccca5ebbce2173aa188c6c15';
const toNumber2 = '+919423262188';
const fromNumber2 = '+12183876708';

// =======================
// 📩 POST: ESP32 DATA
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

    await new WaterLevel({ distance, level, timestamp }).save();

    // 🚨 TANK FULL ALERT
    if (tankFull && !hasCalled) {

      const tokens = await FCMToken.find();
      const tokenList = tokens.map(t => t.token);

      if (tokenList.length > 0) {
        await admin.messaging().sendEachForMulticast({
          tokens: tokenList,
          notification: {
            title: "🚨 Tank Full",
            body: "Water tank is FULL 🚰"
          }
        });
        console.log("🔥 Tank full notification sent");
      }

      try {
        await client1.studio.v2.flows(flowSid1).executions.create({
          to: toNumber1,
          from: fromNumber1
        });
      } catch (err) {
        console.error(err.message);
      }

      if (client2) {
        try {
          await client2.studio.v2.flows(flowSid2).executions.create({
            to: toNumber2,
            from: fromNumber2
          });
        } catch (err) {
          console.error(err.message);
        }
      }

      hasCalled = true;
      // ✅ SAVE TANK FULL EVENT (avoid duplicate within 5 min)
const recentEvent = await TankFullEvent.findOne({
  timestamp: { $gte: new Date(Date.now() - 5 * 60 * 1000) }
});

if (!recentEvent) {
  await new TankFullEvent({ timestamp }).save();
}
    }

    if (!tankFull) hasCalled = false;

    // ⚠ LOW LEVEL ALERT
    const LOW_LEVEL = 20;

    if (level <= LOW_LEVEL && !lowAlertSent) {

      const tokens = await FCMToken.find();
      const tokenList = tokens.map(t => t.token);

      if (tokenList.length > 0) {
        await admin.messaging().sendEachForMulticast({
          tokens: tokenList,
          notification: {
            title: "⚠ Low Water Level",
            body: "Water level is LOW"
          }
        });

        console.log("⚠ Low level notification sent");
      }

      lowAlertSent = true;
    }

    if (level > LOW_LEVEL) lowAlertSent = false;

    res.json(lastData);

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// =======================
// 📤 GET APIs
// =======================
app.get('/api/water-level', (req, res) => {

  if (!lastData.timestamp) {
    return res.status(404).json({ message: 'No data yet' });
  }

  const diff = (Date.now() - new Date(lastData.timestamp)) / 1000;

  res.json({
    ...lastData,
    deviceStatus: diff < 20 ? "online" : "offline"
  });
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
    res.status(500).json({ error: 'Failed to fetch events' });
  }
});
// =======================
app.listen(port, () => {
  console.log(`✅ Server running on port ${port}`);
});