#include <driver/i2s.h>
#include <arduinoFFT.h>
#include <math.h>
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <PubSubClient.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include <CircularBuffer.h>

// WiFi Credentials
const char* ssid = "Mi 11X";
const char* password = "Laptop99@!";

const char* serverUrl = "https://smmsrm9r-5000.inc1.devtunnels.ms";

// MQTT HiveMQ settings
const char* mqtt_server = "c997ac04f7364048929feac82a351c39.s1.eu.hivemq.cloud";
const int mqtt_port = 8883; // TLS/SSL port for secure connection
const char* sensor_id = "S001"; // Set your sensor ID here
const char* mqtt_username = "esp32-publisher"; // ESP32-specific username
const char* mqtt_password = "Kaushikyadalaisagaydumbass53"; // ESP32-specific password

// MQTT topics
char mqtt_topic_audio[50]; // For audio data
char mqtt_topic_alert[50]; // For gunshot alerts

// I2S pin configuration for the INMP441
#define I2S_WS 25   // Word Select (LRC)
#define I2S_SCK 33  // Serial Clock (BCLK)
#define I2S_SD 32   // Serial Data (DIN)

// Audio parameters
#define I2S_SAMPLE_RATE 16000
#define I2S_BUFFER_SIZE 1024
#define FFT_SAMPLES 512  // Must be a power of 2 and <= I2S_BUFFER_SIZE

// HTTP request parameters
#define SEND_INTERVAL 5000  // Minimum time between HTTP requests (5 seconds)

// Audio circular buffer parameters
#define AUDIO_SAMPLE_RATE 8000  // Reduced sample rate for transmission
#define SECONDS_TO_BUFFER 3     // Buffer 3 seconds of audio before gunshot
#define SECONDS_TO_STREAM 6     // Stream 6 seconds of audio after gunshot
#define SAMPLES_TO_BUFFER (AUDIO_SAMPLE_RATE * SECONDS_TO_BUFFER)
#define MQTT_PACKET_SIZE 512    // Size of each MQTT packet in bytes

// Create circular buffer to store audio samples (8-bit for efficiency)
CircularBuffer<uint8_t, SAMPLES_TO_BUFFER> audioBuffer;

// FFT arrays
double vReal[FFT_SAMPLES];
double vImag[FFT_SAMPLES];

// Frequency range for gunshot detection
#define FREQUENCY_LOWER_BOUND 250
#define FREQUENCY_UPPER_BOUND 5000

// SPECTRAL RATIO THRESHOLD
#define SPECTRAL_RATIO_THRESHOLD 0.5
#define MIN_GUNSHOT_BAND_ENERGY 0.01 // Minimum energy in the band

// Amplitude detection parameters
#define AMPLITUDE_THRESHOLD 80.0

// Transient detection parameters
#define HISTORY_SIZE 15           // Number of past amplitude values to store
#define TRANSIENT_THRESHOLD 4.0   // Minimum dB rise to consider as a transient
double amplitudeHistory[HISTORY_SIZE];
int historyIndex = 0;

// Create FFT instance using the updated arduinoFFT syntax
ArduinoFFT<double> FFT(vReal, vImag, FFT_SAMPLES, I2S_SAMPLE_RATE);

// Detection variables
bool gun_by_frequency = false;
bool gun_by_amplitude = false;
bool gun_by_transient = false;
bool gun_by_spectral = false;
unsigned long lastGunTime = 0;
unsigned long lastSendTime = 0;

#define COOLDOWN_MS 500  // Cooldown period after detection

// Audio streaming state management
bool isStreaming = false;
unsigned long streamingStartTime = 0;
unsigned long samplesStreamed = 0;
bool gunshotDetected = false;

// WiFi and MQTT clients
WiFiClientSecure espClient;
PubSubClient mqttClient(espClient);

// Function to add a value to the circular buffer
void addToHistory(double value) {
  amplitudeHistory[historyIndex] = value;
  historyIndex = (historyIndex + 1) % HISTORY_SIZE;
}

// Function to get average background amplitude (excluding most recent)
double getAverageBackground() {
  double sum = 0.0;
  int count = 0;
  for (int i = 0; i < HISTORY_SIZE; i++) {
    // Skip the most recently added value
    if (i != ((historyIndex - 1 + HISTORY_SIZE) % HISTORY_SIZE)) {
      sum += amplitudeHistory[i];
      count++;
    }
  }
  return count > 0 ? sum / count : 0;
}

// Function to set up WiFi connection
void setupWiFi() {
  Serial.print("Connecting to WiFi: ");
  Serial.println(ssid);
  
  WiFi.begin(ssid, password);
  
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  
  Serial.println();
  Serial.println("WiFi connected");
  Serial.print("IP address: ");
  Serial.println(WiFi.localIP());
}

// Function to reconnect to MQTT broker
void reconnectMQTT() {
  while (!mqttClient.connected()) {
    Serial.print("Connecting to MQTT broker...");
    String clientId = "ESP32-" + String(random(0xffff), HEX);
    
    if (mqttClient.connect(clientId.c_str(), mqtt_username, mqtt_password)) {
      Serial.println("connected");
    } else {
      Serial.print("failed, rc=");
      Serial.print(mqttClient.state());
      Serial.println(" retrying in 5 seconds");
      delay(5000);
    }
  }
}

// Function to send a gunshot alert via MQTT
void sendGunshotAlert() {
  if (!mqttClient.connected()) {
    reconnectMQTT();
  }

  // Create JSON document for the alert
  StaticJsonDocument<256> doc;
  
  doc["timestamp"] = millis();
  doc["sensorId"] = sensor_id;
  doc["alertType"] = "Poaching alert";
  doc["audioAvailable"] = true;
  
  char jsonBuffer[256];
  serializeJson(doc, jsonBuffer);
  
  // Publish to MQTT
  Serial.print("Publishing gunshot alert: ");
  Serial.println(jsonBuffer);
  
  if (mqttClient.publish(mqtt_topic_alert, jsonBuffer)) {
    Serial.println("Successfully published gunshot alert");
  } else {
    Serial.println("Failed to publish gunshot alert");
  }
}

// Function to send audio data via MQTT
void sendAudioData(const uint8_t* buffer, size_t length, bool isPreshot) {
  if (!mqttClient.connected()) {
    reconnectMQTT();
  }

  // Create JSON document with metadata and binary audio
  StaticJsonDocument<256> doc;
  
  doc["timestamp"] = millis();
  doc["sensorId"] = sensor_id;
  doc["sampleRate"] = AUDIO_SAMPLE_RATE;
  doc["bits"] = 8;
  doc["isPreshot"] = isPreshot;
  doc["length"] = length;
  
  char metadataBuffer[256];
  size_t metadataLength = serializeJson(doc, metadataBuffer);
  
  // Create a buffer with metadata + binary audio data
  // Format: [metadata length (2 bytes)][metadata json][audio binary]
  uint8_t packetBuffer[MQTT_PACKET_SIZE];
  
  // Store metadata length as first two bytes
  packetBuffer[0] = metadataLength & 0xFF;
  packetBuffer[1] = (metadataLength >> 8) & 0xFF;
  
  // Copy metadata
  memcpy(packetBuffer + 2, metadataBuffer, metadataLength);
  
  // Copy as much audio data as will fit
  size_t audioLength = min(length, MQTT_PACKET_SIZE - metadataLength - 2);
  memcpy(packetBuffer + 2 + metadataLength, buffer, audioLength);
  
  // Total packet size
  size_t packetSize = 2 + metadataLength + audioLength;
  
  // Publish to MQTT
  if (mqttClient.publish(mqtt_topic_audio, packetBuffer, packetSize)) {
    Serial.println("Published audio packet");
  } else {
    Serial.println("Failed to publish audio packet");
  }
}

// Send HTTP POST request with detection data (kept for backward compatibility)
void sendHttpPostRequest(bool is_gunshot) {
  // Check if WiFi is connected
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("WiFi not connected. Trying to reconnect...");
    WiFi.begin(ssid, password);

    // Wait for connection for up to 10 seconds
    unsigned long connectionStartTime = millis();
    while (WiFi.status() != WL_CONNECTED && millis() - connectionStartTime < 10000) {
      delay(500);
      Serial.print(".");
    }

    if (WiFi.status() != WL_CONNECTED) {
      Serial.println("Failed to reconnect to WiFi");
      return;
    }

    Serial.println("WiFi reconnected");
  }

  HTTPClient http;
  http.begin(serverUrl);
  http.addHeader("Content-Type", "application/json");

  // Create JSON payload
  String jsonPayload = "{\"is_gunshot\":" + String(is_gunshot ? "true" : "false") + "}";

  // Send the request
  int httpResponseCode = http.POST(jsonPayload);

  // Check response
  if (httpResponseCode > 0) {
    String response = http.getString();
    Serial.println("HTTP Response code: " + String(httpResponseCode));
    Serial.println("Response: " + response);
  } else {
    Serial.println("Error on HTTP request. Error code: " + String(httpResponseCode));
  }

  // Free resources
  http.end();

  // Update last send time
  lastSendTime = millis();
}

// Function to process and transmit all buffered audio
void transmitBufferedAudio() {
  uint8_t tempBuffer[MQTT_PACKET_SIZE - 256]; // Allow space for metadata
  int packetCount = 0;
  int remaining = audioBuffer.size();
  
  while (remaining > 0) {
    // Determine how many samples to send in this packet
    int samplesToSend = min(remaining, (int)sizeof(tempBuffer));
    
    // Copy samples from circular buffer to temp buffer
    for (int i = 0; i < samplesToSend; i++) {
      tempBuffer[i] = audioBuffer[i];
    }
    
    // Send the audio packet
    sendAudioData(tempBuffer, samplesToSend, true);
    
    remaining -= samplesToSend;
    packetCount++;
    
    // Small delay to avoid MQTT congestion
    delay(20);
  }
  
  Serial.print("Transmitted ");
  Serial.print(packetCount);
  Serial.println(" packets of pre-shot audio");
}

void setup() {
  Serial.begin(115200);
  Serial.println("ESP32 INMP441 + FFT + MQTT Audio Streaming");

  // Initialize amplitude history with low values
  for (int i = 0; i < HISTORY_SIZE; i++) {
    amplitudeHistory[i] = -60.0;
  }

  // Connect to WiFi
  setupWiFi();
  
  // Skip certificate verification (for testing only)
  espClient.setInsecure();
  
  // Set up MQTT connection
  mqttClient.setServer(mqtt_server, mqtt_port);
  
  // Create the MQTT topics
  sprintf(mqtt_topic_audio, "sensors/%s/audio", sensor_id);
  sprintf(mqtt_topic_alert, "sensors/%s/data", sensor_id);
  
  // Connect to MQTT broker
  reconnectMQTT();

  // I2S configuration for capturing audio from the INMP441
  i2s_config_t i2s_config = {
    .mode = (i2s_mode_t)(I2S_MODE_MASTER | I2S_MODE_RX),
    .sample_rate = I2S_SAMPLE_RATE,
    .bits_per_sample = I2S_BITS_PER_SAMPLE_32BIT,
    .channel_format = I2S_CHANNEL_FMT_ONLY_LEFT,
    .communication_format = I2S_COMM_FORMAT_I2S,
    .intr_alloc_flags = ESP_INTR_FLAG_LEVEL1,
    .dma_buf_count = 4,
    .dma_buf_len = I2S_BUFFER_SIZE,
    .use_apll = false
  };

  // I2S pin mapping
  i2s_pin_config_t pin_config = {
    .bck_io_num = I2S_SCK,
    .ws_io_num = I2S_WS,
    .data_out_num = -1,  // Not used in RX mode
    .data_in_num = I2S_SD
  };

  // Install I2S driver and set the pins
  i2s_driver_install(I2S_NUM_0, &i2s_config, 0, NULL);
  i2s_set_pin(I2S_NUM_0, &pin_config);
  
  Serial.println("Setup complete");
}

void loop() {
  // Keep MQTT connection alive
  if (!mqttClient.connected()) {
    reconnectMQTT();
  }
  mqttClient.loop();

  // Read audio sample buffer from I2S
  int32_t audio_samples[I2S_BUFFER_SIZE];
  size_t bytes_read;
  i2s_read(I2S_NUM_0, audio_samples, sizeof(audio_samples), &bytes_read, portMAX_DELAY);
  int samples_read = bytes_read / sizeof(int32_t);

  // Calculate RMS value for amplitude
  double sum_squares = 0;

  // Process audio samples and add to circular buffer (downsampled and converted to 8-bit)
  for (int i = 0; i < samples_read; i++) {
    int32_t val = audio_samples[i];
    double sample = (double)val / 100000.0;
    
    // Add samples to the FFT buffer (only use what we need)
    if (i < FFT_SAMPLES) {
      vReal[i] = sample;
      vImag[i] = 0;
    }
    
    // Sum of squares for RMS calculation
    sum_squares += sample * sample;
    
    // Add downsampled audio to circular buffer (every 2nd sample at 16kHz becomes 8kHz)
    // Convert from 32-bit to 8-bit unsigned (0-255)
    if (i % 2 == 0) {
      // Map from our sample range to 0-255 range
      uint8_t sample8bit = constrain(map(val, -1000000, 1000000, 0, 255), 0, 255);
      
      // Add to circular buffer
      audioBuffer.push(sample8bit);
    }
  }

  // Calculate RMS (Root Mean Square) amplitude
  double rms_amplitude = sqrt(sum_squares / samples_read);

  // Convert RMS amplitude to decibels
  double db_amplitude = 20 * log10((rms_amplitude * 22));

  // ---- TRANSIENT DETECTION ----
  addToHistory(db_amplitude);
  double avgBackground = getAverageBackground();
  double transient = db_amplitude - avgBackground;
  gun_by_transient = (transient >= TRANSIENT_THRESHOLD);

  // ---- FFT Processing ----
  FFT.windowing(FFT_WIN_TYP_HAMMING, FFT_FORWARD);
  FFT.compute(FFT_FORWARD);
  FFT.complexToMagnitude();

  // Find the frequency bin with the highest magnitude
  double bin_width = (double)I2S_SAMPLE_RATE / FFT_SAMPLES;
  int lowBin = (int)(FREQUENCY_LOWER_BOUND / bin_width);
  int highBin = (int)(FREQUENCY_UPPER_BOUND / bin_width);

  double peak = 0;
  int peakIndex = 0;
  for (int i = 1; i <= FFT_SAMPLES / 2; i++) {
    if (vReal[i] > peak) {
      peak = vReal[i];
      peakIndex = i;
    }
  } 
  
  // Determine if the dominant frequency is in the gunshot range
  gun_by_frequency = (peakIndex >= lowBin && peakIndex <= highBin);

  // SPECTRAL RATIO ANALYSIS
  double energyInGunshotBand = 0;
  for (int i = lowBin; i <= highBin; i++) {
      energyInGunshotBand += vReal[i] * vReal[i];
  }

  double totalEnergy = 0;
  for (int i = 1; i <= FFT_SAMPLES / 2; i++) {
      totalEnergy += vReal[i] * vReal[i];
  }

  double spectralRatio = (totalEnergy > 0) ? energyInGunshotBand / totalEnergy : 0;
  gun_by_spectral = (spectralRatio > SPECTRAL_RATIO_THRESHOLD) && (energyInGunshotBand > MIN_GUNSHOT_BAND_ENERGY);

  // ---- AMPLITUDE ANALYSIS ----
  gun_by_amplitude = (db_amplitude > AMPLITUDE_THRESHOLD);
  double dominantFreq = (peakIndex * bin_width);

  // Check for gunshot detection
  unsigned long currentTime = millis();
  bool is_gunshot_detected = gun_by_frequency && gun_by_amplitude && 
                             gun_by_transient && gun_by_spectral && 
                             (currentTime - lastGunTime > COOLDOWN_MS);

  // If this is a new gunshot detection (not previously detected or we're not already streaming)
  if (is_gunshot_detected && !isStreaming) {
    Serial.println("GUNSHOT DETECTED! Starting audio stream...");
    
    // Send gunshot alert
    sendGunshotAlert();
    
    // Send previous buffer (pre-gunshot audio)
    transmitBufferedAudio();
    
    // Start streaming mode
    isStreaming = true;
    streamingStartTime = currentTime;
    samplesStreamed = 0;
    
    // Update last gun time for cooldown
    lastGunTime = currentTime;
    
    // Update last send time
    lastSendTime = currentTime;
    
    // Also send HTTP request for compatibility
    sendHttpPostRequest(true);
  }

  // If we're in streaming mode, send real-time audio
  if (isStreaming) {
    // Prepare audio packet for streaming
    uint8_t streamBuffer[MQTT_PACKET_SIZE - 256]; // Leave room for metadata
    int samplesToSend = min(audioBuffer.size(), (int)sizeof(streamBuffer));
    
    // Extract the most recent samples from the buffer
    for (int i = 0; i < samplesToSend; i++) {
      streamBuffer[i] = audioBuffer[i];
    }
    
    // Send audio packet (marked as post-shot)
    sendAudioData(streamBuffer, samplesToSend, false);
    
    // Increment the counter for samples we've streamed
    samplesStreamed += (samplesToSend / 2); // Adjust for downsampling
    
    // Check if we've streamed enough samples
    if (samplesStreamed >= (AUDIO_SAMPLE_RATE * SECONDS_TO_STREAM)) {
      Serial.println("Post-gunshot audio streaming complete");
      isStreaming = false;
    }
  }

  // Print debug information
  Serial.print("Amp: ");
  Serial.print(db_amplitude);
  Serial.print(" dB | Trans: ");
  Serial.print(transient);
  Serial.print(" dB | Freq: ");
  Serial.print(dominantFreq);
  Serial.print(" Hz | Spectral Ratio: ");
  Serial.print(spectralRatio);
  Serial.print(" | F:");
  Serial.print(gun_by_frequency ? "Y" : "N");
  Serial.print(" A:");
  Serial.print(gun_by_amplitude ? "Y" : "N");
  Serial.print(" T:");
  Serial.print(gun_by_transient ? "Y" : "N");
  Serial.print(" S:");
  Serial.print(gun_by_spectral ? "Y" : "N");
  Serial.print(" | Gun: ");
  Serial.print(is_gunshot_detected ? "YES" : "NO");
  Serial.print(" | Buffer: ");
  Serial.println(audioBuffer.size());

  // Slight delay to prevent tight looping
  delay(10);
}