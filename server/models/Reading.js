const mongoose = require("mongoose");

const readingSchema = new mongoose.Schema({
  "sensorData": {
    "timestamp": {
      "type": "Date",
      "required": true
    },
    "sensorId": {
      "type": "String",
      "required": true
    },
    "alertType": {
      "type": "String",
      "enum": ["AOK", "Poaching alert"],
      "required": true
    },
    "videoData": {
      "type": "Object",
      "properties": {
        "available": {
          "type": "Boolean",
          "default": false
        },
        "data": {
          "type": "String",
          "default": "No video captured"
        }
      }
    },
    "audioData": {
      "type": "Object",
      "properties": {
        "available": {
          "type": "Boolean",
          "default": false
        },
        "data": {
          "type": "String",
          "default": "No audio captured"
        }
      }
    },
    viewed: {
      "type": "Boolean",
      "default": false
    },
  }
}, {
  collection: 'sensorData' // This explicitly names the collection
});

module.exports = mongoose.model("Reading", readingSchema);
