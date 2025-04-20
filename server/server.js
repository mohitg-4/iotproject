require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const Reading = require("./models/Reading");
const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(express.json({ limit: '50mb' })); // Increased limit for audio payloads

// MongoDB connection state monitoring
mongoose.connection.on('connected', () => {
  console.log('MongoDB connection established successfully');
});

mongoose.connection.on('error', (err) => {
  console.error('MongoDB connection error:', err);
});

mongoose.connection.on('disconnected', () => {
  console.warn('MongoDB connection disconnected');
});

// Connect to MongoDB with improved settings
mongoose.connect(process.env.MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
  serverSelectionTimeoutMS: 30000,    // Increased from 5000ms
  socketTimeoutMS: 60000,             // Increased from 45000ms
  connectTimeoutMS: 60000,            // Increased from 30000ms
  bufferCommands: true,               // Buffer commands when disconnected
  maxPoolSize: 10                     // Set a reasonable pool size
}).then(() => {
  console.log("Connected to MongoDB");
  
  // Only initialize MQTT client after successful MongoDB connection
  const mqttClient = require('./services/mqttClient');
  
  // Start server after MongoDB is connected
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server listening on port ${PORT}`);
  });
}).catch(err => {
  console.error("Error connecting to MongoDB:", err);
  process.exit(1); // Exit if cannot connect to database
});

// POST route
app.post("/upload", async (req, res) => {
  console.log("Received data:", req.body); // Debug log
  try {
    // Verify database connection before proceeding
    if (mongoose.connection.readyState !== 1) {
      return res.status(503).json({
        status: "error",
        message: "Database connection not available",
      });
    }
    
    const data = req.body;
    const reading = new Reading(data);
    const savedReading = await reading.save();
    console.log("Data saved:", savedReading); // Debug log
    res.status(200).json({ status: "success", data: savedReading });
  } catch (err) {
    console.error("Upload error:", err);
    res.status(500).json({ 
      status: "error", 
      message: "Server error while saving data",
      details: err.message 
    });
  }
});

// Add a route to retrieve audio files
app.get("/audio/:readingId", async (req, res) => {
  try {
    const reading = await Reading.findById(req.params.readingId);
    
    if (!reading || !reading.sensorData.audioData.available || !reading.sensorData.audioData.wavFile) {
      return res.status(404).json({ status: "error", message: "Audio not found" });
    }
    
    // Set appropriate headers for WAV file
    res.setHeader('Content-Type', 'audio/wav');
    res.setHeader('Content-Disposition', `attachment; filename="${reading.sensorData.audioData.filename || 'audio.wav'}"`);
    
    // Send the WAV file
    res.send(reading.sensorData.audioData.wavFile);
  } catch (err) {
    console.error("Error retrieving audio:", err);
    res.status(500).json({ 
      status: "error", 
      message: "Server error while retrieving audio",
      details: err.message 
    });
  }
});

// Basic health check route
app.get("/", (req, res) => {
  res.status(200).json({
    status: "success",
    message: "API is running",
    databaseConnected: mongoose.connection.readyState === 1
  });
});

// Graceful shutdown handling
process.on('SIGINT', async () => {
  try {
    await mongoose.connection.close();
    console.log('MongoDB connection closed gracefully');
    process.exit(0);
  } catch (err) {
    console.error('Error during graceful shutdown:', err);
    process.exit(1);
  }
});
