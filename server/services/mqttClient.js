const mqtt = require('mqtt');
const Reading = require('../models/Reading');
const Animal = require('../models/Animal');
const fs = require('fs');
const path = require('path');

// MQTT broker configuration
const brokerUrl = 'mqtts://c997ac04f7364048929feac82a351c39.s1.eu.hivemq.cloud:8883';
const options = {
  clientId: 'iot-server-' + Math.random().toString(16).substring(2, 8),
  clean: true,
  username: 'server-listener',
  password: 'Laptop99@!',
  protocol: 'mqtts',
  rejectUnauthorized: true
};

// Topics to subscribe to
const topics = {
  sensorData: 'sensors/+/data',
  animalData: 'animals/+/location',
  audioData: 'sensors/+/audio',  // New topic for audio streams
  imageMetadata: 'cameras/+/image/metadata',  // New topic for image metadata
  imageChunk: 'cameras/+/image/chunk/#'  // New topic for image chunks
};

// Audio buffer storage - stores packets until we have a complete recording
const audioBuffers = {};

// Store image chunks in memory before saving to DB
const imageBuffers = {};

// Create MQTT client
const client = mqtt.connect(brokerUrl, options);

// Handle connection
client.on('connect', () => {
  console.log('Connected to MQTT broker');
  
  // Subscribe to all relevant topics
  client.subscribe([topics.sensorData, topics.animalData, topics.audioData, topics.imageMetadata, topics.imageChunk], (err) => {
    if (!err) {
      console.log(`Subscribed to topics: ${topics.sensorData}, ${topics.animalData}, ${topics.audioData}, ${topics.imageMetadata}, ${topics.imageChunk}`);
    } else {
      console.error('Subscription error:', err);
    }
  });
});

// Handle incoming messages
client.on('message', async (topic, message) => {
  try {
    console.log(`Received message on topic: ${topic}`);
    
    // Extract the sensor/device ID from the topic (common for all handlers)
    const topicParts = topic.split('/');
    const sensorId = topicParts[1];
    
    // Handle different message types based on topic
    if (topic.endsWith('/data')) {
      // Process sensor data
      const data = JSON.parse(message.toString());
      await processSensorData(topic, data);
    } else if (topic.endsWith('/location')) {
      // Process animal tracking data
      const data = JSON.parse(message.toString());
      await processAnimalData(topic, data);
    } else if (topic.endsWith('/audio')) {
      // Process audio data - binary format
      await processAudioData(sensorId, message);
    } else if (topic.endsWith('/image/metadata')) {
      // Process image metadata
      const data = JSON.parse(message.toString());
      await processImageMetadata(topic, data);
    } else if (topic.includes('/image/chunk/')) {
      // Process image chunk
      await processImageChunk(topic, message);
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
    
    // Get the audio buffer for this alert
    const audioBuffer = audioBuffers[alertKey];
    if (!audioBuffer) {
      console.error(`No audio buffer found for alert ${alertKey}`);
      return;
    }
    
    // Combine all audio buffers (preshot and postshot)
    const allAudioBuffers = [...audioBuffer.preshot, ...audioBuffer.postshot];
    const totalLength = allAudioBuffers.reduce((acc, buf) => acc + buf.length, 0);
    
    console.log(`Audio data size: ${totalLength} bytes`);
    console.log(`Preshot buffers: ${audioBuffer.preshot.length}, Postshot buffers: ${audioBuffer.postshot.length}`);
    
    // Skip if no audio data
    if (totalLength === 0) {
      console.error(`No audio data to process for alert ${alertKey}`);
      return;
    }
    
    // Create a consolidated buffer with all audio data
    const consolidatedAudio = Buffer.concat(allAudioBuffers, totalLength);
    
    // Create a WAV file from the raw audio data
    const sampleRate = audioBuffer.metadata.sampleRate;
    const bitsPerSample = audioBuffer.metadata.bitsPerSample;
    
    // Create WAV file
    const wavBuffer = createWavFile(consolidatedAudio, sampleRate, bitsPerSample);
    
    console.log(`WAV buffer created, size: ${wavBuffer.length} bytes`);
    console.log(`WAV buffer type: ${typeof wavBuffer}, isBuffer: ${Buffer.isBuffer(wavBuffer)}`);
    
    // Calculate duration in seconds
    const duration = totalLength / (sampleRate * (bitsPerSample / 8));
    
    // Create a filename
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `audio_${audioBuffer.sensorId}_${timestamp}.wav`;
    
    // If we have a reading ID, update it with the audio
    if (audioBuffer.readingId) {
      await updateReadingWithAudio(
        audioBuffer.readingId, 
        wavBuffer, 
        filename, 
        sampleRate, 
        bitsPerSample, 
        duration
      );
    } else {
      // Try to find a matching reading by timestamp
      await findAndUpdateReadingWithAudio(
        audioBuffer.sensorId, 
        audioBuffer.timestamp, 
        wavBuffer, 
        filename, 
        sampleRate, 
        bitsPerSample, 
        duration
      );
    }
    
    // Remove the audio buffer to free memory
    delete audioBuffers[alertKey];
    
    console.log(`Audio processing complete for alert ${alertKey}`);
  } catch (error) {
    console.error(`Error finalizing audio recording for alert ${alertKey}:`, error);
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
      console.log(`Updated reading with wavFile (${wavBuffer.length} bytes)`);
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
    const timeWindow = 30000; // 30 seconds instead of 10
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

// Process image metadata
async function processImageMetadata(topic, data) {
  try {
    const deviceId = data.device_id;
    const imageNumber = data.image_number;
    const timestamp = data.timestamp;
    const expectedChunks = data.chunks;
    
    console.log(`Received image metadata for ${deviceId}, image ${imageNumber}, expecting ${expectedChunks} chunks`);
    
    // Create a key for this specific image
    const imageKey = `${deviceId}_${timestamp}_${imageNumber}`;
    
    // Initialize the image buffer
    imageBuffers[imageKey] = {
      deviceId: deviceId,
      imageNumber: imageNumber,
      timestamp: timestamp,
      totalChunks: expectedChunks,
      receivedChunks: 0,
      chunks: new Array(expectedChunks),
      size: data.size,
      isComplete: false
    };
    
    // Look for a sensor reading to attach this image to
    // Find a reading from the last 10 seconds (assuming image comes shortly after the alert)
    const tenSecondsAgo = new Date(Date.now() - 10000);
    
    const reading = await Reading.findOne({
      'sensorData.sensorId': deviceId,
      'sensorData.timestamp': { $gte: tenSecondsAgo }
    }).sort({ 'sensorData.timestamp': -1 });
    
    if (reading) {
      imageBuffers[imageKey].readingId = reading._id;
      
      // Update reading to indicate video is available
      if (!reading.sensorData.videoData.available) {
        reading.sensorData.videoData.available = true;
        reading.sensorData.videoData.imageCount = 0;
        reading.sensorData.videoData.images = [];
        await reading.save();
        console.log(`Updated reading ${reading._id} to enable video data`);
      }
    } else {
      console.log(`No matching reading found for device ${deviceId}`);
    }
  } catch (error) {
    console.error('Error processing image metadata:', error);
  }
}

// Process image chunk
async function processImageChunk(topic, message) {
  try {
    // Parse topic to extract device ID, image number, and chunk index
    // Topic format: cameras/DEVICE_ID/image/chunk/IMAGE_NUMBER/CHUNK_INDEX
    const parts = topic.split('/');
    const deviceId = parts[1];
    const imageNumber = parseInt(parts[4]);
    const chunkIndex = parseInt(parts[5]);
    
    // Create a key that matches the one from metadata
    // We need to find the correct timestamp from our imageBuffers
    let imageKey = null;
    let matchingBuffer = null;
    
    // Look through existing image buffers to find the right one
    Object.keys(imageBuffers).forEach(key => {
      if (key.startsWith(`${deviceId}_`) && 
          imageBuffers[key].imageNumber === imageNumber &&
          !imageBuffers[key].isComplete) {
        imageKey = key;
        matchingBuffer = imageBuffers[key];
      }
    });
    
    if (!matchingBuffer) {
      console.error(`Received chunk but no matching buffer for ${deviceId}, image ${imageNumber}, chunk ${chunkIndex}`);
      return;
    }
    
    // Store this chunk
    matchingBuffer.chunks[chunkIndex] = message.toString();
    matchingBuffer.receivedChunks++;
    
    console.log(`Received chunk ${chunkIndex+1}/${matchingBuffer.totalChunks} for ${deviceId}, image ${imageNumber}`);
    
    // If we have received all chunks, combine and save
    if (matchingBuffer.receivedChunks === matchingBuffer.totalChunks) {
      console.log(`All chunks received for ${deviceId}, image ${imageNumber}. Combining...`);
      
      // Combine chunks into complete base64 string
      const base64Image = matchingBuffer.chunks.join('');
      
      // Check if the combined size matches the expected size
      if (base64Image.length === matchingBuffer.size) {
        console.log(`Successfully reconstructed image of size ${base64Image.length} bytes`);
        
        // Save to database if we have a reading ID
        if (matchingBuffer.readingId) {
          await saveImageToReading(matchingBuffer.readingId, base64Image, imageNumber, matchingBuffer.timestamp);
        } else {
          console.log(`No reading ID found for ${deviceId}, image ${imageNumber}`);
        }
      } else {
        console.error(`Size mismatch: expected ${matchingBuffer.size}, got ${base64Image.length}`);
      }
      
      // Mark as complete and clean up
      matchingBuffer.isComplete = true;
      
      // After some time, remove the buffer to free memory
      setTimeout(() => {
        delete imageBuffers[imageKey];
      }, 60000); // Clean up after 1 minute
    }
  } catch (error) {
    console.error('Error processing image chunk:', error);
  }
}

// Save image to reading
async function saveImageToReading(readingId, base64Image, imageNumber, timestamp) {
  try {
    const reading = await Reading.findById(readingId);
    
    if (reading) {
      // Make sure images array exists
      if (!reading.sensorData.videoData.images) {
        reading.sensorData.videoData.images = [];
      }
      
      // Add the new image
      reading.sensorData.videoData.images.push({
        timestamp: timestamp,
        data: base64Image,
        imageNumber: imageNumber
      });
      
      // Update imageCount
      reading.sensorData.videoData.imageCount = reading.sensorData.videoData.images.length;
      
      await reading.save();
      console.log(`Saved image ${imageNumber} to reading ${readingId}`);
    } else {
      console.error(`Reading ${readingId} not found`);
    }
  } catch (error) {
    console.error('Error saving image to reading:', error);
  }
}

// Handle errors
client.on('error', (err) => {
  console.error('MQTT client error:', err);
});

module.exports = client;
