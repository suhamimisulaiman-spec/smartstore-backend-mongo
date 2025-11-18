const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
  id: { type: Number, required: true, unique: true },
  username: { type: String, required: true, unique: true },
  password: { type: String, required: true }, // plaintext kept for parity with old system
  role: { type: String, default: "user" } // "admin" | "user"
}, { versionKey: false });

module.exports = mongoose.model('User', UserSchema);
