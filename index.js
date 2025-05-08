import express from 'express';
import cors from 'cors';
import mysql from 'mysql2';

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// ✅ MySQL connection setup
const db = mysql.createConnection({
  host: 'sql12.freesqldatabase.com',
  user: 'sql12776790',
  password: 'aI6SuVEjEW',
  database: 'sql12776790',
  port: 3306,
});

// 🔌 Function to reconnect to MySQL if the connection is lost
function ensureConnection() {
  if (db.state === 'disconnected') {
    db.connect((err) => {
      if (err) {
        console.error('❌ Failed to reconnect to MySQL:', err);
      } else {
        console.log('✅ Reconnected to MySQL');
      }
    });
  }
}

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

// 🕒 Scheduled logging every 5 minutes
setInterval(() => {
  ensureConnection();  // Ensure the connection is active before the insert

  if (lastData.timestamp) {
    const query = 'INSERT INTO water_data (distance, level, timestamp) VALUES (?, ?, ?)';
    db.query(query, [lastData.distance, lastData.level, new Date()], (err) => {
      if (err) {
        console.error('❌ Scheduled insert failed:', err);
      } else {
        console.log('🕒 Scheduled data inserted at', new Date().toLocaleString());
      }
    });
  }
}, 5 * 60 * 1000); // 5 minutes interval

// 📤 GET: Latest single reading
app.get('/api/water-level', (req, res) => {
  res.json(lastData);
});

// 📈 GET: All historical data
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
