import mongoose from 'mongoose';

const waterLevelSchema = new mongoose.Schema({
  distance: Number,
  level: Number,
  timestamp: {
    type: Date,
    default: Date.now
  }
});

export default mongoose.model('WaterLevel', waterLevelSchema);
