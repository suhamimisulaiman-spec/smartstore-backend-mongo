// server.js - Express app (exports app)
require('dotenv').config();
const express = require("express");
const cors = require("cors");
const jwt = require("jsonwebtoken");
const morgan = require('morgan');

const { getNextId } = require('./database');
const Item = require('./models/Item');
const Log = require('./models/Log');
const User = require('./models/User');

const app = express();
app.use(cors());
app.use(express.json());
app.use(morgan('tiny'));

const SECRET = process.env.JWT_SECRET || "smartstore_secret_2025";

// AUTH helpers (same behavior as old)
function authenticateToken(req, res, next) {
  const auth = req.headers["authorization"];
  if (!auth) return res.status(401).json({ error: "Missing Authorization header" });
  const parts = auth.split(" ");
  if (parts.length !== 2 || parts[0] !== "Bearer") return res.status(401).json({ error: "Malformed Authorization header" });
  const token = parts[1];
  try {
    const payload = jwt.verify(token, SECRET);
    req.user = payload;
    next();
  } catch (e) {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
}
function adminOnly(req, res, next) {
  if (!req.user) return res.status(401).json({ error: "Not authenticated" });
  if (req.user.role !== "admin") return res.status(403).json({ error: "Admin only" });
  next();
}

// root
app.get("/", (req, res) => res.send("Smartstore Backend (MongoDB) - API compatible"));

// LOGIN
app.post("/login", async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: "username & password required" });
  const found = await User.findOne({ username, password }).lean();
  if (!found) return res.status(401).json({ error: "Invalid login" });
  const token = jwt.sign({ id: found.id, role: found.role, username: found.username }, SECRET, { expiresIn: "7d" });
  res.json({ token, user: { id: found.id, username: found.username, role: found.role } });
});

// GET /items
app.get("/items", async (req, res) => {
  const items = await Item.find({}).sort({ id: 1 }).lean();
  res.json(items);
});

// SEARCH
app.get("/items/search", async (req, res) => {
  const q = (req.query.q || "").trim().toLowerCase();
  if (!q) {
    const items = await Item.find({}).sort({ id: 1 }).lean();
    return res.json(items);
  }
  const items = await Item.find({
    $or: [
      { name: { $regex: q, $options: "i" } },
      { category: { $regex: q, $options: "i" } },
      { part_number: { $regex: q, $options: "i" } },
      { location: { $regex: q, $options: "i" } },
      { description: { $regex: q, $options: "i" } }
    ]
  }).sort({ id: 1 }).lean();
  res.json(items);
});

// ADD item (admin)
app.post("/items/add", authenticateToken, adminOnly, async (req, res) => {
  const next = await getNextId('items');
  const newItem = new Item({
    id: next,
    name: req.body.name || "",
    category: req.body.category || "",
    part_number: req.body.part_number || "",
    description: req.body.description || "",
    location: req.body.location || "",
    quantity: req.body.quantity != null ? Number(req.body.quantity) : 0,
    min_stock: req.body.min_stock != null ? Number(req.body.min_stock) : 0,
    created_at: new Date()
  });
  await newItem.save();
  res.json({ message: "Item added", id: newItem.id });
});

// DELETE item (admin)
app.delete("/items/delete/:id", authenticateToken, adminOnly, async (req, res) => {
  const id = Number(req.params.id);
  const removed = await Item.findOneAndDelete({ id });
  if (!removed) return res.status(404).json({ error: "Item not found" });
  res.json({ message: "Item deleted" });
});

// UPDATE item (admin)
app.put("/items/update/:id", authenticateToken, adminOnly, async (req, res) => {
  const id = Number(req.params.id);
  const update = {
    name: req.body.name,
    category: req.body.category,
    part_number: req.body.part_number,
    description: req.body.description,
    location: req.body.location,
    quantity: req.body.quantity != null ? Number(req.body.quantity) : undefined,
    min_stock: req.body.min_stock != null ? Number(req.body.min_stock) : undefined
  };
  // remove undefined keys
  Object.keys(update).forEach(k => update[k] === undefined && delete update[k]);
  const item = await Item.findOneAndUpdate({ id }, update, { new: true });
  if (!item) return res.status(404).json({ error: "Item not found" });
  res.json({ message: "Item updated" });
});

// ACTIVITY (logs)
app.get("/activity", async (req, res) => {
  const logs = await Log.find({}).sort({ id: -1 }).lean();
  res.json(logs);
});

// STOCK IN (admin)
app.post("/stockin", authenticateToken, adminOnly, async (req, res) => {
  const { item_id, quantity, remarks } = req.body;
  const idNum = Number(item_id);
  const qtyNum = Number(quantity);
  const item = await Item.findOne({ id: idNum });
  if (!item) return res.status(404).json({ error: "Item not found" });

  item.quantity = (item.quantity || 0) + qtyNum;
  await item.save();

  const logId = await getNextId('logs');
  const log = new Log({
    id: logId,
    type: "in",
    item_id: idNum,
    item_name: item.name,
    qty: qtyNum,
    remarks: remarks || "",
    ts: new Date(),
    by: req.user ? req.user.username : "unknown"
  });
  await log.save();

  res.json({ message: "Stock IN recorded", item });
});

// STOCK OUT (authenticated users allowed)
app.post("/stockout", authenticateToken, async (req, res) => {
  const { item_id, quantity, remarks } = req.body;
  const idNum = Number(item_id);
  const qtyNum = Number(quantity);
  const item = await Item.findOne({ id: idNum });
  if (!item) return res.status(404).json({ error: "Item not found" });

  item.quantity = Math.max(0, (item.quantity || 0) - qtyNum);
  await item.save();

  const logId = await getNextId('logs');
  const log = new Log({
    id: logId,
    type: "out",
    item_id: idNum,
    item_name: item.name,
    qty: qtyNum,
    remarks: remarks || "",
    ts: new Date(),
    by: req.user ? req.user.username : "unknown"
  });
  await log.save();

  res.json({ message: "Stock OUT recorded", item });
});

// DASHBOARD STATS
app.get("/dashboard-stats", async (req, res) => {
  const items = await Item.find({}).lean();
  const logs = await Log.find({}).lean();

  const totalItems = items.length;
  const lowStock = items.filter(i => (i.quantity || 0) <= (i.min_stock || 0)).length;

  const startOfToday = new Date();
  startOfToday.setHours(0,0,0,0);
  const stockInToday = logs.filter(l => l.type === "in" && new Date(l.ts) >= startOfToday).reduce((s, l) => s + (l.qty || 0), 0);
  const stockOutToday = logs.filter(l => l.type === "out" && new Date(l.ts) >= startOfToday).reduce((s, l) => s + (l.qty || 0), 0);

  // weeklyOut as 7-days array
  const days = [];
  for (let d = 6; d >= 0; d--) {
    const dt = new Date();
    dt.setDate(dt.getDate() - d);
    dt.setHours(0,0,0,0);
    days.push(dt);
  }
  const weeklyOut = days.map((start, idx) => {
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    return logs.filter(l => l.type === "out" && new Date(l.ts) >= start && new Date(l.ts) < end).reduce((s, l) => s + (l.qty || 0), 0);
  });

  res.json({ totalItems, lowStock, stockInToday, stockOutToday, weeklyOut });
});

module.exports = app;
