// Project: smartstore-backend-mongo
// Files included below. Save each block into separate files per path.


/* package.json */
{
  "name": "smartstore-backend-mongo",
  "version": "1.0.0",
  "description": "SmartStore backend using Express + MongoDB (production-ready for Vercel)",
  "main": "server.js",
  "scripts": {
    "start": "node server.js",
    "dev": "nodemon server.js",
    "migrate": "node migrate.js"
  },
  "engines": {
    "node": ">=18"
  },
  "dependencies": {
    "cors": "^2.8.5",
    "dotenv": "^16.0.0",
    "express": "^4.18.2",
    "helmet": "^6.0.1",
    "mongoose": "^7.0.0",
    "morgan": "^1.10.0"
  },
  "devDependencies": {
    "nodemon": "^2.0.22"
  }
}


/* server.js */
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const dotenv = require('dotenv');

dotenv.config();

const app = express();
app.use(helmet());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cors());
app.use(morgan('tiny'));

// Import routes
const itemsRouter = require('./routes/items');

app.use('/items', itemsRouter);
app.post('/health', (req, res) => res.json({ ok: true, time: new Date() }));

const MONGODB_URI = process.env.MONGODB_URI;
const PORT = process.env.PORT || 3000;

async function start() {
  if (!MONGODB_URI) {
    console.error('Missing MONGODB_URI in environment');
    process.exit(1);
  }

  try {
    await mongoose.connect(MONGODB_URI, {
      // useNewUrlParser/useUnifiedTopology are default in mongoose v7
    });
    console.log('MongoDB connected');

    app.listen(PORT, () => {
      console.log(`Server started on port ${PORT}`);
    });
  } catch (err) {
    console.error('Failed to connect to MongoDB', err);
    process.exit(1);
  }
}

start();


/* models/Item.js */
const mongoose = require('mongoose');

const StockEntrySchema = new mongoose.Schema({
  type: { type: String, enum: ['IN', 'OUT'], required: true },
  qty: { type: Number, required: true },
  note: { type: String },
  user: { type: String },
  createdAt: { type: Date, default: Date.now }
});

const ItemSchema = new mongoose.Schema({
  sku: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  price: { type: Number, default: 0 },
  qty: { type: Number, default: 0 },
  description: { type: String },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
  history: [StockEntrySchema]
});

ItemSchema.pre('save', function (next) {
  this.updatedAt = Date.now();
  next();
});

module.exports = mongoose.model('Item', ItemSchema);


/* routes/items.js */
const express = require('express');
const router = express.Router();
const Item = require('../models/Item');

// GET /items - list items
router.get('/', async (req, res) => {
  try {
    const items = await Item.find({}).sort({ name: 1 }).lean();
    return res.json({ ok: true, items });
  } catch (err) {
    console.error('GET /items error', err);
    return res.status(500).json({ ok: false, error: 'Internal server error' });
  }
});

// POST /items/add - add item
router.post('/add', async (req, res) => {
  try {
    const { sku, name, price = 0, qty = 0, description = '' } = req.body;
    if (!sku || !name) return res.status(400).json({ ok: false, error: 'sku & name required' });

    const existing = await Item.findOne({ sku });
    if (existing) return res.status(400).json({ ok: false, error: 'SKU already exists' });

    const item = new Item({ sku, name, price, qty, description });
    item.history.push({ type: 'IN', qty: Number(qty), note: 'Initial stock' });
    await item.save();

    return res.json({ ok: true, item });
  } catch (err) {
    console.error('POST /items/add error', err);
    return res.status(500).json({ ok: false, error: 'Internal server error' });
  }
});

// POST /items/stockin - stock in
router.post('/stockin', async (req, res) => {
  try {
    const { sku, qty, note = '' } = req.body;
    if (!sku || qty == null) return res.status(400).json({ ok: false, error: 'sku & qty required' });

    const item = await Item.findOne({ sku });
    if (!item) return res.status(404).json({ ok: false, error: 'Item not found' });

    item.qty = Number(item.qty) + Number(qty);
    item.history.push({ type: 'IN', qty: Number(qty), note });
    await item.save();

    return res.json({ ok: true, item });
  } catch (err) {
    console.error('POST /items/stockin error', err);
    return res.status(500).json({ ok: false, error: 'Internal server error' });
  }
});

// POST /items/stockout - stock out
router.post('/stockout', async (req, res) => {
  try {
    const { sku, qty, note = '' } = req.body;
    if (!sku || qty == null) return res.status(400).json({ ok: false, error: 'sku & qty required' });

    const item = await Item.findOne({ sku });
    if (!item) return res.status(404).json({ ok: false, error: 'Item not found' });

    const outQty = Number(qty);
    if (item.qty - outQty < 0) return res.status(400).json({ ok: false, error: 'Insufficient stock' });

    item.qty = Number(item.qty) - outQty;
    item.history.push({ type: 'OUT', qty: outQty, note });
    await item.save();

    return res.json({ ok: true, item });
  } catch (err) {
    console.error('POST /items/stockout error', err);
    return res.status(500).json({ ok: false, error: 'Internal server error' });
  }
});

// PUT /items/:sku - update item
router.put('/:sku', async (req, res) => {
  try {
    const { sku } = req.params;
    const update = req.body;
    const item = await Item.findOneAndUpdate({ sku }, update, { new: true });
    if (!item) return res.status(404).json({ ok: false, error: 'Item not found' });
    return res.json({ ok: true, item });
  } catch (err) {
    console.error('PUT /items/:sku error', err);
    return res.status(500).json({ ok: false, error: 'Internal server error' });
  }
});

// DELETE /items/:sku
router.delete('/:sku', async (req, res) => {
  try {
    const { sku } = req.params;
    const item = await Item.findOneAndDelete({ sku });
    if (!item) return res.status(404).json({ ok: false, error: 'Item not found' });
    return res.json({ ok: true, message: 'Deleted' });
  } catch (err) {
    console.error('DELETE /items/:sku error', err);
    return res.status(500).json({ ok: false, error: 'Internal server error' });
  }
});

module.exports = router;


/* migrate.js --- optional script to import local items.json into MongoDB */
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const dotenv = require('dotenv');

dotenv.config();
const Item = require('./models/Item');

async function migrate() {
  const MONGODB_URI = process.env.MONGODB_URI;
  if (!MONGODB_URI) {
    console.error('Provide MONGODB_URI in .env');
    process.exit(1);
  }

  await mongoose.connect(MONGODB_URI);
  console.log('Connected to MongoDB');

  const file = path.join(__dirname, 'items.json');
  if (!fs.existsSync(file)) {
    console.error('items.json not found in project root');
    process.exit(1);
  }

  const raw = fs.readFileSync(file, 'utf8');
  let data;
  try {
    data = JSON.parse(raw);
  } catch (err) {
    console.error('Invalid JSON', err);
    process.exit(1);
  }

  // Assuming data is array of items
  const inserted = [];
  for (const it of data) {
    try {
      const doc = await Item.findOneAndUpdate({ sku: it.sku }, { $set: it }, { upsert: true, new: true });
      inserted.push(doc.sku);
    } catch (err) {
      console.error('Failed to insert', it.sku, err.message);
    }
  }

  console.log('Inserted/updated SKUs:', inserted.length);
  process.exit(0);
}

migrate();


/* README.md */
# SmartStore Backend (Express + MongoDB)

This project replaces the old file-based backend and uses MongoDB so it works on Vercel (read-only fs). It includes endpoints for listing items, add, stock-in, stock-out, update and delete.

## Quick start (local)

1. Copy `.env.example` to `.env` and set `MONGODB_URI`.
2. `npm install`
3. `npm run dev`
4. API Root: `http://localhost:3000`

## Deployment (Vercel)

1. Create MongoDB Atlas free cluster and get connection string.
2. In Vercel Dashboard for project `smartstore-backend2`, set Environment Variable `MONGODB_URI` to the connection string.
3. Ensure project is connected to GitHub repo and deploy from `main` branch.
4. Vercel will build and start the server.

## Migrate existing items.json

If you have a local `items.json` file from the old app, place it in project root and run:

```
MONGODB_URI="your_uri" npm run migrate
```

This will upsert SKUs into MongoDB.

## Environment variables

- `MONGODB_URI` - required
- `PORT` - optional


/* .vercelignore (optional) */
node_modules
*.log
items.json


/* Notes for Frontend */
1. Change API base URL in frontend to the deployed Vercel URL, for example:
   `https://smartstore-backend2.vercel.app/items` (note the `/items` prefix used in routes)
2. Ensure CORS is allowed (server uses default `cors()` middleware). If you need to restrict, set `origin`.


/* End of files */
