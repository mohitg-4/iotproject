const mqtt = require('mqtt');
const Reading = require('../models/Reading');
const Animal = require('../models/Animal');
const fs = require('fs');
const path = require('path');

// MQTT broker configuration
const brokerUrl = 'mqtt://c997ac04f7364048929feac82a351c39.s1.eu.hivemq.cloud:8883';
const options = {
  clientId: 'iot-server-' + Math.random().toString(16).substring(2, 8),
  clean: true,
  username: 'server-listener',
  password: 'Kaushikyadalaisagaydumbass53',
  protocol: 'mqtts',
  rejectUnauthorized: true
};

// Topics to subscribe to
const topics = {
  sensorData: 'sensors/+/data',
  animalData: 'animals/+/location',
  audioData: 'sensors/+/audio'  // New topic for audio streams
};

// Audio buffer storage - stores packets until we have a complete recording
const audioBuffers = {};

// Create MQTT client
const client = mqtt.connect(brokerUrl, options);

// Handle connection
client.on('connect', () => {
  console.log('Connected to MQTT broker');
  
  // Subscribe to all relevant topics
  client.subscribe([topics.sensorData, topics.animalData, topics.audioData], (err) => {
    if (!err) {
      console.log(`Subscribed to topics: ${topics.sensorData}, ${topics.animalData}, ${topics.audioData}`);
    } else {
      console.error('Subscription error:', err);
    }
  });
});

// Handle incoming messages
client.on('message', async (topic, message) => {
  console.log(`Received message on ${topic}: ${message.length} bytes`);
  
  try {
    // Extract the sensor ID from the topic
    const topicParts = topic.split('/');
    const sensorId = topicParts[1];
    
    if (topic.endsWith('/data')) {
      // Process sensor data (alerts)
      const data = JSON.parse(message.toString());
      await processSensorData(topic, data);
    } else if (topic.endsWith('/location')) {
      // Process animal tracking data
      const data = JSON.parse(message.toString());
      await processAnimalData(topic, data);
    } else if (topic.endsWith('/audio')) {
      // Process audio data - binary format
      await processAudioData(sensorId, message);
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
      timestamp: data.timestamp ? new Date(data.timestamp) : new Date(),
      sensorId: sensorId,
      alertType: data.alertType || "AOK",
      videoData: {
        available: data.videoAvailable || false,
        data: data.videoData || "No video captured"
      },
      audioData: {
        available: data.audioAvailable || false,
        sampleRate: 8000,  // Default, will be updated when audio arrives
        bitsPerSample: 8,
        duration: 0,
        filename: "",
        wavFile: null
      },
      viewed: false
    }
  };
  
  // Create and save reading to MongoDB
  const reading = new Reading(readingData);
  await reading.save();
  console.log(`Saved reading from sensor ${sensorId} to database with ID: ${reading._id}`);
  
  // Initialize audio buffer for this alert if it indicates audio is available
  if (data.audioAvailable) {
    // Create a unique key for this alert
    const alertKey = `${sensorId}_${data.timestamp}`;
    
    // Initialize the audio buffer for this alert
    audioBuffers[alertKey] = {
      readingId: reading._id,
      sensorId: sensorId,
      timestamp: data.timestamp,
      preshot: [],    // Buffer for pre-shot audio packets
      postshot: [],   // Buffer for post-shot audio packets
      metadata: {
        sampleRate: 8000,
        bitsPerSample: 8
      }
    };
    
    console.log(`Initialized audio buffer for alert ${alertKey}`);
  }
}

// Process animal tracking data (unchanged)
async function processAnimalData(topic, data) {
  // Existing implementation remains the same
  const animalId = topic.split('/')[1];
  
  let animal = await Animal.findOne({ animal_ID: animalId });
  
  if (animal) {
    animal.last_attributes = {
      lat: data.lat,
      lon: data.lon,
      velocity: data.velocity || 0,
      altitude: data.altitude || 0
    };
    animal.last_update = new Date();
    
    if (data.safe_area) {
      animal.safe_area = data.safe_area;
    }
    
    await animal.save();
    console.log(`Updated tracking data for animal ${animalId}`);
  } else {
    animal = new Animal({
      animal_ID: animalId,
      last_attributes: {
        lat: data.lat,
        lon: data.lon,
        velocity: data.velocity || 0,
        altitude: data.altitude || 0
      },
      safe_area: data.safe_area || {
        lat: data.lat,
        lon: data.lon,
        radius: 1000
      },
      last_update: new Date()
    });
    
    await animal.save();
    console.log(`Created new animal ${animalId} with tracking data`);
  }
}

// Process audio data
async function processAudioData(sensorId, message) {
  try {
    // Extract metadata length from first two bytes (as per ESP32 code)
    const metadataLength = message[0] | (message[1] << 8);
    
    // Extract the metadata as JSON (starts after the length bytes)
    const metadataBuffer = message.slice(2, 2 + metadataLength);
    const metadata = JSON.parse(metadataBuffer.toString());
    
    // Extract the audio data (everything after metadata)
    const audioData = message.slice(2 + metadataLength);
    
    console.log(`Received audio packet: ${audioData.length} bytes, sensorId: ${metadata.sensorId}, isPreshot: ${metadata.isPreshot}`);
    
    // Create a unique key for this alert based on sensor ID and timestamp
    const alertKey = `${metadata.sensorId}_${metadata.timestamp}`;
    
    // If we don't have a buffer for this alert yet, it might be because
    // we received audio before the alert - create one
    if (!audioBuffers[alertKey]) {
      console.log(`Creating audio buffer for alert ${alertKey} (audio arrived before alert)`);
      audioBuffers[alertKey] = {
        sensorId: metadata.sensorId,
        timestamp: metadata.timestamp,
        preshot: [],
        postshot: [],
        metadata: {
          sampleRate: metadata.sampleRate || 8000,
          bitsPerSample: metadata.bits || 8
        }
      };
    }
    
    // Update metadata if provided
    if (metadata.sampleRate) {
      audioBuffers[alertKey].metadata.sampleRate = metadata.sampleRate;
    }
    if (metadata.bits) {
      audioBuffers[alertKey].metadata.bitsPerSample = metadata.bits;
    }
    
    // Add audio data to the appropriate buffer (preshot or postshot)
    if (metadata.isPreshot) {
      audioBuffers[alertKey].preshot.push(audioData);
    } else {
      audioBuffers[alertKey].postshot.push(audioData);
      
      // If this is postshot data, check if we should finalize the recording
      if (audioBuffers[alertKey].postshot.length >= 5) { // Assume 5 packets complete a recording
        await finalizeAudioRecording(alertKey);
      }
    }
  } catch (error) {
    console.error('Error processing audio data:', error);
  }
}

// Finalize audio recording by creating WAV file and storing in MongoDB
async function finalizeAudioRecording(alertKey) {
  try {
    console.log(`Finalizing audio recording for alert ${alertKey}`);
    
    const audioBuffer = audioBuffers[alertKey];
    
    // Combine all audio buffers (preshot and postshot)
    const allAudioBuffers = [...audioBuffer.preshot, ...audioBuffer.postshot];
    const totalLength = allAudioBuffers.reduce((acc, buf) => acc + buf.length, 0);
    
    // Create a consolidated buffer from all audio packets
    const consolidatedAudio = Buffer.concat(allAudioBuffers, totalLength);
    
    // Create a WAV file from the raw audio data
    const wavBuffer = createWavFile(
      consolidatedAudio, 
      audioBuffer.metadata.sampleRate, 
      audioBuffer.metadata.bitsPerSample
    );
    
    // Calculate duration in seconds
    const duration = consolidatedAudio.length / audioBuffer.metadata.sampleRate;
    
    // Create a filename
    const filename = `${audioBuffer.sensorId}_${new Date(audioBuffer.timestamp).toISOString()}.wav`;
    
    // If we have a reading ID, update the reading with the audio data
    if (audioBuffer.readingId) {
      await updateReadingWithAudio(
        audioBuffer.readingId,
        wavBuffer,
        filename,
        audioBuffer.metadata.sampleRate,
        audioBuffer.metadata.bitsPerSample,
        duration
      );
    } else {
      // If we don't have a reading ID, try to find the reading
      await findAndUpdateReadingWithAudio(
        audioBuffer.sensorId,
        audioBuffer.timestamp,
        wavBuffer,
        filename,
        audioBuffer.metadata.sampleRate,
        audioBuffer.metadata.bitsPerSample,
        duration
      );
    }
    
    // Clean up the buffer
    delete audioBuffers[alertKey];
    console.log(`Audio processing completed for alert ${alertKey}`);
  } catch (error) {
    console.error('Error finalizing audio recording:', error);
  }
}

// Create a WAV file from raw audio data
function createWavFile(audioData, sampleRate, bitsPerSample) {
  // WAV file header structure
  const numChannels = 1; // Mono
  const byteRate = sampleRate * numChannels * bitsPerSample / 8;
  const blockAlign = numChannels * bitsPerSample / 8;
  const dataSize = audioData.length;
  const headerSize = 44;
  
  // Create a buffer for the WAV header + audio data
  const wavBuffer = Buffer.alloc(headerSize + dataSize);
  
  // Write the WAV header
  // RIFF header
  wavBuffer.write('RIFF', 0);                                // ChunkID
  wavBuffer.writeUInt32LE(36 + dataSize, 4);                 // ChunkSize
  wavBuffer.write('WAVE', 8);                                // Format
  
  // fmt subchunk
  wavBuffer.write('fmt ', 12);                               // Subchunk1ID
  wavBuffer.writeUInt32LE(16, 16);                           // Subchunk1Size (16 for PCM)
  wavBuffer.writeUInt16LE(1, 20);                            // AudioFormat (1 for PCM)
  wavBuffer.writeUInt16LE(numChannels, 22);                  // NumChannels
  wavBuffer.writeUInt32LE(sampleRate, 24);                   // SampleRate
  wavBuffer.writeUInt32LE(byteRate, 28);                     // ByteRate
  wavBuffer.writeUInt16LE(blockAlign, 32);                   // BlockAlign
  wavBuffer.writeUInt16LE(bitsPerSample, 34);                // BitsPerSample
  
  // data subchunk
  wavBuffer.write('data', 36);                               // Subchunk2ID
  wavBuffer.writeUInt32LE(dataSize, 40);                     // Subchunk2Size
  
  // Copy the audio data
  audioData.copy(wavBuffer, headerSize);
  
  return wavBuffer;
}

// Update a reading with audio data
async function updateReadingWithAudio(readingId, wavBuffer, filename, sampleRate, bitsPerSample, duration) {
  try {
    const reading = await Reading.findById(readingId);
    
    if (reading) {
      // Update the audio data
      reading.sensorData.audioData = {
        available: true,
        sampleRate: sampleRate,
        bitsPerSample: bitsPerSample,
        duration: duration,
        filename: filename,
        wavFile: wavBuffer
      };
      
      await reading.save();
      console.log(`Updated reading ${readingId} with audio data`);
    } else {
      console.error(`Reading ${readingId} not found`);
    }
  } catch (error) {
    console.error('Error updating reading with audio:', error);
  }
}

// Find a reading by sensor ID and timestamp and update with audio
async function findAndUpdateReadingWithAudio(sensorId, timestamp, wavBuffer, filename, sampleRate, bitsPerSample, duration) {
  try {
    // Look for readings with the same sensor ID around the timestamp
    // Allow a small time window to account for possible time differences
    const timeWindow = 10000; // 10 seconds
    const timestampDate = new Date(timestamp);
    const minTime = new Date(timestampDate.getTime() - timeWindow);
    const maxTime = new Date(timestampDate.getTime() + timeWindow);
    
    const reading = await Reading.findOne({
      'sensorData.sensorId': sensorId,
      'sensorData.timestamp': {
        $gte: minTime,
        $lte: maxTime
      }
    });
    
    if (reading) {
      // Update the audio data
      reading.sensorData.audioData = {
        available: true,
        sampleRate: sampleRate,
        bitsPerSample: bitsPerSample,
        duration: duration,
        filename: filename,
        wavFile: wavBuffer
      };
      
      await reading.save();
      console.log(`Found and updated reading for sensor ${sensorId} with audio data`);
    } else {
      console.error(`No matching reading found for sensor ${sensorId} around timestamp ${timestamp}`);
    }
  } catch (error) {
    console.error('Error finding and updating reading with audio:', error);
  }
}

// Handle errors
client.on('error', (err) => {
  console.error('MQTT client error:', err);
});

module.exports = client;
