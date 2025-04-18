require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const Reading = require("./models/Reading");

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(express.json());

// Connect to MongoDB
mongoose.connect(process.env.MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
  serverSelectionTimeoutMS: 5000,
  socketTimeoutMS: 45000,
  connectTimeoutMS: 30000
}).then(() => console.log("Connected to MongoDB"))
  .catch(err => console.error("Error connecting to MongoDB:", err));

// POST route
app.post("/upload", async (req, res) => {
  console.log("Received data:", req.body); // Debug log
  try {
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

// GET route
app.get("/", (req, res) => {
  res.send("API is running");
});

// Start server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server listening on port ${PORT}`);
});
