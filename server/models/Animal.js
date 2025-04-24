const mongoose = require("mongoose");

const animalSchema = new mongoose.Schema({
  animal_ID: {
    type: String,
    required: true,
    unique: true
  },
  last_attributes: {
    lat: {
      type: Number,
      required: true
    },
    lon: {
      type: Number,
      required: true
    },
    velocity: {
      type: Number,
      default: 0
    },
    altitude: {
      type: Number,
      default: 0
    }
  },
  safe_area: {
    lat: {
      type: Number,
      required: true
    },
    lon: {
      type: Number,
      required: true
    },
    radius: {
      type: Number,
      required: true
    }
  },
  last_update: {
    type: Date,
    default: Date.now
  }
}, {
  collection: 'animals' 
});

module.exports = mongoose.model("Animal", animalSchema);