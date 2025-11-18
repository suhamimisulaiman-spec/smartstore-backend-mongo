const mongoose = require('mongoose');

const LogSchema = new mongoose.Schema({
  id: { type: Number, required: true, unique: true },
  type: { type: String }, // "in" | "out"
  item_id: { type: Number },
  item_name: { type: String },
  qty: { type: Number },
  remarks: { type: String, default: "" },
  ts: { type: Date, default: Date.now },
  by: { type: String, default: "unknown" }
}, { versionKey: false });

module.exports = mongoose.model('Log', LogSchema);
