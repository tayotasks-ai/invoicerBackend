const mongoose = require('mongoose');

// Prefer a full MONGODB_URI if one is set; otherwise fall back to building it
// from MONGO_DB_PASSWORD against the default cluster (legacy behaviour).
const mongoUri = process.env.MONGODB_URI
  || `mongodb+srv://juwontayo:${process.env.MONGO_DB_PASSWORD}@cluster0.gzpfkkr.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

const dbConnect = mongoose.connect(mongoUri, {
  useNewUrlParser: true,
  useUnifiedTopology: true
})
  .then(() => console.log('Connected to MongoDB'))
  .catch((error) => {
    console.error('Failed to connect to MongoDB:', error.message);
    process.exit(1);
  });

module.exports = dbConnect;