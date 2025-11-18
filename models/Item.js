const mongoose = require('mongoose');

const ItemSchema = new mongoose.Schema({
  id: { type: Number, required: true, unique: true },
  name: { type: String, default: "" },
  category: { type: String, default: "" },
  part_number: { type: String, default: "" },
  description: { type: String, default: "" },
  location: { type: String, default: "" },
  quantity: { type: Number, default: 0 },
  min_stock: { type: Number, default: 0 },
  created_at: { type: Date, default: Date.now }
}, { versionKey: false });

module.exports = mongoose.model('Item', ItemSchema);
