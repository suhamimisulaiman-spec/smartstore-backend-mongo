// migrate.js
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { connectDB, getNextId } = require('./database');
const Item = require('./models/Item');
const Log = require('./models/Log');
const User = require('./models/User');

async function loadJSON(fname) {
  const p = path.join(__dirname, fname);
  if (!fs.existsSync(p)) return [];
  const raw = fs.readFileSync(p, 'utf8');
  try { return JSON.parse(raw); } catch { return []; }
}

(async function() {
  const uri = process.env.MONGODB_URI;
  if (!uri) { console.error('MONGODB_URI missing'); process.exit(1); }
  await connectDB(uri);

  const items = await loadJSON('items.json');
  const logs = await loadJSON('logs.json');
  const users = await loadJSON('users.json');

  if (items.length) {
    console.log('Importing items:', items.length);
    for (const it of items) {
      // if id exists use it, else assign new
      if (!it.id) it.id = await getNextId('items');
      await Item.findOneAndUpdate({ id: it.id }, it, { upsert: true, new: true });
    }
  } else console.log('No items.json found or empty');

  if (logs.length) {
    console.log('Importing logs:', logs.length);
    for (const lg of logs) {
      if (!lg.id) lg.id = await getNextId('logs');
      // normalize ts
      if (lg.ts) lg.ts = new Date(lg.ts);
      await Log.findOneAndUpdate({ id: lg.id }, lg, { upsert: true, new: true });
    }
  } else console.log('No logs.json found or empty');

  if (users.length) {
    console.log('Importing users:', users.length);
    for (const u of users) {
      if (!u.id) u.id = await getNextId('users');
      await User.findOneAndUpdate({ id: u.id }, u, { upsert: true, new: true });
    }
  } else console.log('No users.json found or empty');

  console.log('Migration finished');
  process.exit(0);
})();
