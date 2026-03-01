
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
const waterLevelSchema = new mongoose.Schema({
  distance: Number,
  level: Number,
  timestamp: { type: Date, default: Date.now }
});
waterLevelSchema.index({ timestamp: 1 }, { expireAfterSeconds: 15 * 24 * 60 * 60 });
const WaterLevel = mongoose.model('WaterLevel', waterLevelSchema);

const tankFullSchema = new mongoose.Schema({
  timestamp: { type: Date, default: Date.now }
});
tankFullSchema.index({ timestamp: 1 }, { expireAfterSeconds: 15 * 24 * 60 * 60 });
const TankFullEvent = mongoose.model('TankFullEvent', tankFullSchema);

// 🌐 App setup
const app = express();
const port = process.env.PORT || 3000;
app.use(cors());
app.use(express.json());

// 🌊 In-memory latest data
let lastData = { distance: 0, level: 0, tankFull: false, timestamp: null };
let hasCalled = false;

// =======================
// 🔔 TWILIO SETUP
// =======================

// FIRST TWILIO (leave exactly as yours)
const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const client = twilio(accountSid, authToken);

const flowSid = 'FW3d089e7d66c44a13177f00ad892744f2';
const toNumber = '+919423287988';
const fromNumber = '+12627627374';

// SECOND TWILIO (just added)
const accountSid2 = process.env.TWILIO_ACCOUNT_SID_2;
const authToken2 = process.env.TWILIO_AUTH_TOKEN_2;
const client2 = twilio(accountSid2, authToken2);

const flowSid2 = 'FW65001dbcccca5ebbce2173aa188c6c15';
const toNumber2 = '+919423262188';
const fromNumber2 = '+12183876708';

// 📩 POST: Receive ESP32 data
app.post('/api/water-level', async (req, res) => {
  const { distance, level, tankFull } = req.body;

  if (typeof distance !== 'number' || typeof level !== 'number') {
    return res.status(400).json({ error: 'Invalid data format' });
  }

  const timestamp = new Date();
  lastData = { distance, level, tankFull: !!tankFull, timestamp };

  try {
    const entry = new WaterLevel({ distance, level, timestamp });
    await entry.save();

    if (tankFull) {

      if (!hasCalled) {

        // 🔔 FIRST ACCOUNT CALL (unchanged)
        try {
          const execution1 = await client.studio.v2
            .flows(flowSid)
            .executions.create({
              to: toNumber,
              from: fromNumber
            });

          console.log('📞 First Twilio call:', execution1.sid);
        } catch (err) {
          console.error('❌ First Twilio error:', err.message);
        }

        // 🔔 SECOND ACCOUNT CALL (added)
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

        // Save tank full event
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

// 🚀 Start server
app.listen(port, () => {
  console.log(`✅ Server running on port ${port}`);
});
