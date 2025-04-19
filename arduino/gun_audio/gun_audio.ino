#include <driver/i2s.h>
#include <arduinoFFT.h>
#include <math.h>        // Add this for log10 function
#include <WiFi.h>        // Added WiFi library
#include <HTTPClient.h>  // Added HTTP client library

// WiFi Credentials
const char* ssid = "Mi 11X";
const char* password = "Laptop99@!";

const char* serverUrl = "https://smmsrm9r-5000.inc1.devtunnels.ms";  // Fixed variable name to match usage later

// I2S pin configuration for the INMP441
#define I2S_WS 25   // Word Select (LRC)
#define I2S_SCK 33  // Serial Clock (BCLK)
#define I2S_SD 32   // Serial Data (DIN)

// Audio parameters
#define I2S_SAMPLE_RATE 16000
#define I2S_BUFFER_SIZE 1024
#define FFT_SAMPLES 512  // Must be a power of 2 and <= I2S_BUFFER_SIZE

// HTTP request parameters
#define SEND_INTERVAL 5000  // Added missing constant for minimum time between HTTP requests (5 seconds)

// FFT arrays
double vReal[FFT_SAMPLES];
double vImag[FFT_SAMPLES];

// Frequency range for gunshot detection
#define FREQUENCY_LOWER_BOUND 250
#define FREQUENCY_UPPER_BOUND 5000

// SPECTRAL RATIO THRESHOLD
#define SPECTRAL_RATIO_THRESHOLD 0.5
#define MIN_GUNSHOT_BAND_ENERGY 0.01 // Example: Minimum absolute energy in the band (prevents triggering on very quiet sounds with high ratio)

// Amplitude detection parameters
#define AMPLITUDE_THRESHOLD 80.0

// Transient detection parameters
#define HISTORY_SIZE 15           // Number of past amplitude values to store
#define TRANSIENT_THRESHOLD 4.0  // Minimum dB rise to consider as a transient
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

// ---------- PIR SETUP -----------
#define PIR_PIN 27

// Function to send HTTP POST request with detection data
void sendHttpPostRequest(bool motion_detected, bool is_gunshot) {
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
  String jsonPayload = "{\"motion_detected\":" + String(motion_detected ? "true" : "false") + ",\"is_gunshot\":" + String(is_gunshot ? "true" : "false") + "}";

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

void setup() {
  Serial.begin(115200);
  Serial.println("ESP32 INMP441 + FFT + Amplitude in dB + Transient Detection");
  pinMode(PIR_PIN, INPUT);

  // Initialize amplitude history with low values
  for (int i = 0; i < HISTORY_SIZE; i++) {
    amplitudeHistory[i] = -60.0;
  }

  // Connect to WiFi - Added WiFi connection setup
  Serial.print("Connecting to WiFi...");
  WiFi.begin(ssid, password);

  // Wait for connection (up to 20 seconds)
  unsigned long startAttemptTime = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - startAttemptTime < 20000) {
    delay(500);
    Serial.print(".");
  }

  if (WiFi.status() == WL_CONNECTED) {
    Serial.println();
    Serial.print("Connected to WiFi. IP: ");
    Serial.println(WiFi.localIP());
  } else {
    Serial.println();
    Serial.println("Failed to connect to WiFi. Will try in HTTP request function.");
  }

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
}

void loop() {
  bool motion_detected = digitalRead(PIR_PIN);
  int32_t audio_samples[I2S_BUFFER_SIZE];
  size_t bytes_read;

  // Read audio samples from I2S (blocking until data is available)
  i2s_read(I2S_NUM_0, audio_samples, sizeof(audio_samples), &bytes_read, portMAX_DELAY);

  // Determine the number of samples to process (up to FFT_SAMPLES)
  int samples_to_process = min((int)(bytes_read / sizeof(int32_t)), FFT_SAMPLES);

  // Calculate RMS value for amplitude
  double sum_squares = 0;

  // Convert the raw I2S samples to doubles for FFT processing
  for (int i = 0; i < samples_to_process; i++) {
    int32_t val = audio_samples[i];
    double sample = (double)val / 100000.0;
    vReal[i] = sample;
    vImag[i] = 0;

    // Sum of squares for RMS calculation
    sum_squares += sample * sample;
  }

  // Calculate RMS (Root Mean Square) amplitude
  double rms_amplitude = sqrt(sum_squares / samples_to_process);

  // Convert RMS amplitude to decibels
  // dB = 20 * log10(amplitude / reference)
  double db_amplitude = 20 * log10((rms_amplitude * 22));

  // ---- TRANSIENT DETECTION ----
  // Save current amplitude to history
  addToHistory(db_amplitude);

  // Calculate average background amplitude
  double avgBackground = getAverageBackground();

  // Calculate the transient (sudden rise in amplitude)
  double transient = db_amplitude - avgBackground;

  // Determine if this is a transient based on threshold
  gun_by_transient = (transient >= TRANSIENT_THRESHOLD);

  // ---- FFT Processing ----
  // Apply a Hamming window to the samples
  FFT.windowing(FFT_WIN_TYP_HAMMING, FFT_FORWARD);
  // Compute the FFT
  FFT.compute(FFT_FORWARD);
  // Compute the magnitudes from the complex FFT output
  FFT.complexToMagnitude();

  // Find the frequency bin with the highest magnitude (ignoring the DC component at index 0)
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
  
// Calculate Energy in the Gunshot Band
double energyInGunshotBand = 0;
for (int i = lowBin; i <= highBin; i++) {
    energyInGunshotBand += vReal[i] * vReal[i];
}

// Calculate Total Energy (excluding DC)
double totalEnergy = 0;
for (int i = 1; i <= FFT_SAMPLES / 2; i++) {
    totalEnergy += vReal[i] * vReal[i];
}

  // Calculate spectral ratio
  double spectralRatio = (totalEnergy > 0) ? energyInGunshotBand / totalEnergy : 0;

  // Determine if the spectral ratio exceeds threshold (characteristic of gunshots)
  gun_by_spectral = (spectralRatio > SPECTRAL_RATIO_THRESHOLD) && (energyInGunshotBand > MIN_GUNSHOT_BAND_ENERGY);

  // ---- AMPLITUDE ANALYSIS ----
  // Determine if the amplitude is high enough
  gun_by_amplitude = (db_amplitude > AMPLITUDE_THRESHOLD);

  // Calculate the dominant frequency (Hz)
  double dominantFreq = (peakIndex * bin_width);

  // FINAL GUNSHOT DETECTION LOGIC
  // A gunshot must meet all three criteria AND not be in cooldown period
  bool is_gunshot = false;
  unsigned long currentTime = millis();

  if (gun_by_frequency && gun_by_amplitude && gun_by_transient && gun_by_spectral && (currentTime - lastGunTime > COOLDOWN_MS)) {
    is_gunshot = true;
    lastGunTime = currentTime;  // Update the cooldown timer
  }

  // Print results
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
  Serial.print(is_gunshot ? "YES" : "NO");
  Serial.print(" | Motion: ");
  Serial.println(motion_detected ? "YES" : "NO");

  // Send HTTP POST if there's a gunshot or motion detected AND it's been at least SEND_INTERVAL since the last send
  if ((is_gunshot) && (currentTime - lastSendTime > SEND_INTERVAL)) {
    Serial.println("Sending HTTP POST request...");
    sendHttpPostRequest(motion_detected, is_gunshot);
  }

  delay(100);
}