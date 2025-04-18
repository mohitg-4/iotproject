const mongoose = require("mongoose");

const readingSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true
  }
}, {
  collection: 'sensorData' // This explicitly names the collection
});

module.exports = mongoose.model("Reading", readingSchema);
