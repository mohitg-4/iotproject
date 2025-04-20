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
        "sampleRate": {
          "type": "Number",
          "default": 8000
        },
        "bitsPerSample": {
          "type": "Number",
          "default": 8
        },
        "duration": {
          "type": "Number",
          "default": 0
        },
        "filename": {
          "type": "String",
          "default": ""
        },
        "wavFile": {
          "type": "Buffer"
        }
      }
    },
    viewed: {
      "type": "Boolean",
      "default": false
    },
  }
}, {
  collection: 'sensorData'
});

module.exports = mongoose.model("Reading", readingSchema);
