require('dotenv').config();
const app = require('./server');
const { connectDB } = require('./database');

const PORT = process.env.PORT || 3000;
const MONGODB_URI = process.env.MONGODB_URI;

(async () => {
  if (!MONGODB_URI) {
    console.error('MONGODB_URI missing in env');
    process.exit(1);
  }
  await connectDB(MONGODB_URI);
  app.listen(PORT, () => console.log(`Server started on port ${PORT}`));
})();
