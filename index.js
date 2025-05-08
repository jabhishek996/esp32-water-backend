
import express from 'express';
import cors from 'cors';
import mysql from 'mysql2';

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// ✅ MySQL connection setup (YOUR DETAILS USED)
const db = mysql.createConnection({
  host: 'sql12.freesqldatabase.com',
  user: 'sql12776790',
  password: 'aI6SuVEjEW',
  database: 'sql12776790',
  port: 3306, // default MySQL port
});

// 🔌 Connect to DB
db.connect((err) => {
  if (err) {
    console.error('❌ Database connection failed:', err);
    return;
  }
  console.log('✅ Connected to MySQL database!');
});

// 🌊 Temporary in-memory store for ESP32 data
let lastData = { distance: 0, level: 0, timestamp: null };

// 🔄 POST endpoint to receive water-level data from ESP32
app.post('/api/water-level', (req, res) => {
  const { distance, level } = req.body;
  if (typeof distance === 'number' && typeof level === 'number') {
    lastData = { distance, level, timestamp: new Date() };
    console.log('📩 Data received:', lastData);

    // Optional: Insert immediately
    const query = 'INSERT INTO water_data (distance, level, timestamp) VALUES (?, ?, ?)';
    db.query(query, [distance, level, lastData.timestamp], (err) => {
      if (err) {
        console.error('❌ Insert failed:', err);
        res.status(500).json({ error: 'Insert failed' });
        return;
      }
      console.log('✅ Data logged immediately');
      res.status(200).json({ message: 'Data received and logged successfully' });
    });
  } else {
    res.status(400).json({ error: 'Invalid data format' });
  }
});

// 🕒 Scheduled insert every 30 minutes
setInterval(() => {
  if (lastData.timestamp) {
    const query = 'INSERT INTO water_data (distance, level, timestamp) VALUES (?, ?, ?)';
    db.query(query, [lastData.distance, lastData.level, new Date()], (err) => {
      if (err) {
        console.error('❌ Scheduled insert failed:', err);
      } else {
        console.log('🕒 Scheduled data inserted');
      }
    });
  }
}, 1 * 60 * 1000); // 30 minutes

// 📤 GET endpoint to fetch latest data
app.get('/api/water-level', (req, res) => {
  res.json(lastData);
});

// 📈 GET endpoint to fetch historical data for charts
app.get('/api/water-data-history', (req, res) => {
  const query = 'SELECT * FROM water_data ORDER BY timestamp DESC';
  db.query(query, (err, results) => {
    if (err) {
      console.error('❌ Failed to fetch history:', err);
      res.status(500).json({ error: 'Failed to fetch data' });
      return;
    }
    res.json(results);
  });
});

// 🚀 Start server
app.listen(port, () => {
  console.log(`✅ Server running on port ${port}`);
});
