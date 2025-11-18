// server.js - Smartstore Backend (MongoDB)
require("dotenv").config();

// Error handlers
process.on("uncaughtException", err => console.log("UNCAUGHT ERROR:", err));
process.on("unhandledRejection", err => console.log("UNHANDLED PROMISE:", err));

const express = require("express");
const cors = require("cors");
const jwt = require("jsonwebtoken");
const morgan = require("morgan");

// IMPORT DATABASE FUNCTIONS
const { connectDB, getNextId } = require("./database");

// MODELS
const Item = require("./models/Item");
const Log = require("./models/Log");
const User = require("./models/User");

// EXPRESS SETUP
const app = express();
app.use(cors());
app.use(express.json());
app.use(morgan("tiny"));

const SECRET = process.env.JWT_SECRET || "smartstore_secret_2025";

// ====== CONNECT TO MONGODB ======
const MONGODB_URI = process.env.MONGODB_URI;

connectDB(MONGODB_URI)
  .then(() => console.log("🔥 MongoDB connected successfully"))
  .catch(err => console.error("❌ MongoDB connection failed:", err));

// ===== AUTH HELPERS =====
function authenticateToken(req, res, next) {
  const auth = req.headers["authorization"];
  if (!auth) return res.status(401).json({ error: "Missing Authorization header" });

  const parts = auth.split(" ");
  if (parts.length !== 2 || parts[0] !== "Bearer")
    return res.status(401).json({ error: "Malformed Authorization header" });

  try {
    req.user = jwt.verify(parts[1], SECRET);
    next();
  } catch {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
}

function adminOnly(req, res, next) {
  if (!req.user) return res.status(401).json({ error: "Not authenticated" });
  if (req.user.role !== "admin") return res.status(403).json({ error: "Admin only" });
  next();
}

// ===== ROOT =====
app.get("/", (req, res) => {
  res.send("Smartstore MongoDB backend is running.");
});

// ===== LOGIN =====
app.post("/login", async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password)
    return res.status(400).json({ error: "username & password required" });

  const found = await User.findOne({ username, password }).lean();
  if (!found) return res.status(401).json({ error: "Invalid login" });

  const token = jwt.sign(
    { id: found.id, role: found.role, username: found.username },
    SECRET,
    { expiresIn: "7d" }
  );

  res.json({ token, user: { id: found.id, username: found.username, role: found.role } });
});

// ===== ITEMS =====
app.get("/items", async (req, res) => {
  const items = await Item.find({}).sort({ id: 1 }).lean();
  res.json(items);
});

app.get("/items/search", async (req, res) => {
  const q = (req.query.q || "").trim().toLowerCase();
  if (!q) return res.json(await Item.find({}).sort({ id: 1 }).lean());

  const items = await Item.find({
    $or: [
      { name: { $regex: q, $options: "i" } },
      { category: { $regex: q, $options: "i" } },
      { part_number: { $regex: q, $options: "i" } },
      { location: { $regex: q, $options: "i" } },
      { description: { $regex: q, $options: "i" } }
    ]
  })
    .sort({ id: 1 })
    .lean();

  res.json(items);
});

// ADD item (Admin)
app.post("/items/add", authenticateToken, adminOnly, async (req, res) => {
  const nextId = await getNextId("items");

  const item = new Item({
    id: nextId,
    name: req.body.name || "",
    category: req.body.category || "",
    part_number: req.body.part_number || "",
    description: req.body.description || "",
    location: req.body.location || "",
    quantity: Number(req.body.quantity || 0),
    min_stock: Number(req.body.min_stock || 0),
    created_at: new Date()
  });

  await item.save();
  res.json({ message: "Item added", id: nextId });
});

// DELETE item
app.delete("/items/delete/:id", authenticateToken, adminOnly, async (req, res) => {
  const removed = await Item.findOneAndDelete({ id: Number(req.params.id) });
  if (!removed) return res.status(404).json({ error: "Item not found" });

  res.json({ message: "Item deleted" });
});

// UPDATE item
app.put("/items/update/:id", authenticateToken, adminOnly, async (req, res) => {
  const update = {
    name: req.body.name,
    category: req.body.category,
    part_number: req.body.part_number,
    description: req.body.description,
    location: req.body.location,
    quantity: req.body.quantity != null ? Number(req.body.quantity) : undefined,
    min_stock: req.body.min_stock != null ? Number(req.body.min_stock) : undefined
  };

  Object.keys(update).forEach(k => update[k] === undefined && delete update[k]);

  const updated = await Item.findOneAndUpdate({ id: Number(req.params.id) }, update, {
    new: true
  });

  if (!updated) return res.status(404).json({ error: "Item not found" });

  res.json({ message: "Item updated" });
});

// ===== ACTIVITY LOG =====
app.get("/activity", async (req, res) => {
  res.json(await Log.find({}).sort({ id: -1 }).lean());
});

// STOCK IN
app.post("/stockin", authenticateToken, adminOnly, async (req, res) => {
  const id = Number(req.body.item_id);
  const qty = Number(req.body.quantity);

  const item = await Item.findOne({ id });
  if (!item) return res.status(404).json({ error: "Item not found" });

  item.quantity += qty;
  await item.save();

  const log = new Log({
    id: await getNextId("logs"),
    type: "in",
    item_id: id,
    item_name: item.name,
    qty,
    remarks: req.body.remarks || "",
    ts: new Date(),
    by: req.user.username
  });

  await log.save();

  res.json({ message: "Stock IN recorded", item });
});

// STOCK OUT
app.post("/stockout", authenticateToken, async (req, res) => {
  const id = Number(req.body.item_id);
  const qty = Number(req.body.quantity);

  const item = await Item.findOne({ id });
  if (!item) return res.status(404).json({ error: "Item not found" });

  item.quantity = Math.max(0, item.quantity - qty);
  await item.save();

  const log = new Log({
    id: await getNextId("logs"),
    type: "out",
    item_id: id,
    item_name: item.name,
    qty,
    remarks: req.body.remarks || "",
    ts: new Date(),
    by: req.user.username
  });

  await log.save();

  res.json({ message: "Stock OUT recorded", item });
});

// ===== DASHBOARD =====
app.get("/dashboard-stats", async (req, res) => {
  const items = await Item.find({}).lean();
  const logs = await Log.find({}).lean();

  const totalItems = items.length;
  const lowStock = items.filter(i => i.quantity <= i.min_stock).length;

  const startToday = new Date();
  startToday.setHours(0, 0, 0, 0);

  const stockInToday = logs
    .filter(l => l.type === "in" && new Date(l.ts) >= startToday)
    .reduce((sum, l) => sum + l.qty, 0);

  const stockOutToday = logs
    .filter(l => l.type === "out" && new Date(l.ts) >= startToday)
    .reduce((sum, l) => sum + l.qty, 0);

  const days = [];
  for (let d = 6; d >= 0; d--) {
    const date = new Date();
    date.setDate(date.getDate() - d);
    date.setHours(0, 0, 0, 0);
    days.push(date);
  }

  const weeklyOut = days.map(day => {
    const end = new Date(day);
    end.setDate(end.getDate() + 1);
    return logs
      .filter(l => l.type === "out" && new Date(l.ts) >= day && new Date(l.ts) < end)
      .reduce((s, l) => s + l.qty, 0);
  });

  res.json({ totalItems, lowStock, stockInToday, stockOutToday, weeklyOut });
});

// ===== START SERVER =====
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("🚀 Smartstore MongoDB backend running on port:", PORT);
});
