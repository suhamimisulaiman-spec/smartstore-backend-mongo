const mongoose = require('mongoose');

const CounterSchema = new mongoose.Schema({
  _id: { type: String, required: true }, // e.g. "items", "logs", "users"
  seq: { type: Number, default: 0 }
});

const Counter = mongoose.model('Counter', CounterSchema);

// CONNECT TO MONGODB
async function connectDB(uri) {
  if (!uri) throw new Error("❌ MONGODB_URI missing from .env");
  await mongoose.connect(uri);
  console.log("🔥 MongoDB connected");
}

// AUTO INCREMENT ID FOR ANY COLLECTION
async function getNextId(name) {
  const doc = await Counter.findOneAndUpdate(
    { _id: name },
    { $inc: { seq: 1 } },
    { upsert: true, new: true }
  );
  return doc.seq;
}

module.exports = { connectDB, getNextId, Counter };
