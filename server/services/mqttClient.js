const mqtt = require('mqtt');
const Reading = require('../models/Reading');
const Animal = require('../models/Animal');

// MQTT broker configuration
const brokerUrl = 'mqtt://c997ac04f7364048929feac82a351c39.s1.eu.hivemq.cloud:8883'; // Your HiveMQ endpoint
const options = {
  clientId: 'iot-server-' + Math.random().toString(16).substring(2, 8),
  clean: true,
  username: 'server-listener', // Server-specific username
  password: 'Kaushikyadalaisagaydumbass53', // Server-specific password
  protocol: 'mqtts',
  rejectUnauthorized: true
};

// Topics to subscribe to
const topics = {
  sensorData: 'sensors/+/data',  // Subscribe to all sensor data
  animalData: 'animals/+/location'  // Subscribe to all animal location data
};

// Create MQTT client
const client = mqtt.connect(brokerUrl, options);

// Handle connection
client.on('connect', () => {
  console.log('Connected to MQTT broker');
  
  // Subscribe to all relevant topics
  client.subscribe([topics.sensorData, topics.animalData], (err) => {
    if (!err) {
      console.log(`Subscribed to topics: ${topics.sensorData}, ${topics.animalData}`);
    } else {
      console.error('Subscription error:', err);
    }
  });
});

// Handle incoming messages
client.on('message', async (topic, message) => {
  console.log(`Received message on ${topic}: ${message.toString()}`);
  
  try {
    // Parse the message as JSON
    const data = JSON.parse(message.toString());
    
    // Determine message type based on topic
    if (topic.startsWith('sensors/')) {
      // Process sensor data
      await processSensorData(topic, data);
    } else if (topic.startsWith('animals/')) {
      // Process animal tracking data
      await processAnimalData(topic, data);
    }
  } catch (error) {
    console.error('Error processing MQTT message:', error);
  }
});

// Process sensor data
async function processSensorData(topic, data) {
  // Extract sensor ID from topic (format: sensors/<sensorId>/data)
  const sensorId = topic.split('/')[1];
  
  // Format data according to Reading schema
  const readingData = {
    sensorData: {
      timestamp: data.timestamp || new Date(),
      sensorId: sensorId,
      alertType: data.alertType || "AOK",
      videoData: {
        available: data.videoAvailable || false,
        data: data.videoData || "No video captured"
      },
      audioData: {
        available: data.audioAvailable || false,
        data: data.audioData || "No audio captured"
      },
      viewed: false
    }
  };
  
  // Create and save reading to MongoDB
  const reading = new Reading(readingData);
  await reading.save();
  console.log(`Saved reading from sensor ${sensorId} to database`);
}

// Process animal tracking data
async function processAnimalData(topic, data) {
  // Extract animal ID from topic (format: animals/<animalId>/location)
  const animalId = topic.split('/')[1];
  
  // Check if the animal already exists
  let animal = await Animal.findOne({ animal_ID: animalId });
  
  if (animal) {
    // Update existing animal
    animal.last_attributes = {
      lat: data.lat,
      lon: data.lon,
      velocity: data.velocity || 0,
      altitude: data.altitude || 0
    };
    animal.last_update = new Date();
    
    // Only update safe area if provided
    if (data.safe_area) {
      animal.safe_area = data.safe_area;
    }
    
    await animal.save();
    console.log(`Updated tracking data for animal ${animalId}`);
  } else {
    // Create new animal if it doesn't exist
    animal = new Animal({
      animal_ID: animalId,
      last_attributes: {
        lat: data.lat,
        lon: data.lon,
        velocity: data.velocity || 0,
        altitude: data.altitude || 0
      },
      safe_area: data.safe_area || {
        lat: data.lat,  // Default to current position
        lon: data.lon,
        radius: 1000    // Default 1km radius
      },
      last_update: new Date()
    });
    
    await animal.save();
    console.log(`Created new animal ${animalId} with tracking data`);
  }
}

// Handle errors
client.on('error', (err) => {
  console.error('MQTT client error:', err);
});

module.exports = client;