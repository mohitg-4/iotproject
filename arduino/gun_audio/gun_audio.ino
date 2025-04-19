#include <Arduino.h>
#include <WiFi.h>
#include <HTTPClient.h>
#include <driver/i2s.h>
#include <arduinoFFT.h>

// WiFi Credentials
const char* ssid = "Mi 11X";
const char* password = "Laptop99@!";
const char* serverUrl = "https://w0skqgwc-3000.inc1.devtunnels.ms/"; // Ensure this is your correct server URL

// I2S Configuration
#define I2S_WS 25
#define I2S_SCK 32 // Note: Pins 32/33 might conflict with PSRAM/Flash on some boards. Consider changing if issues arise.
#define I2S_SD 33
#define I2S_SAMPLE_RATE 16000
#define I2S_BUFFER_SIZE 1024 // Samples read per i2s_read call

// Audio Buffering
#define PRE_TRIGGER_SECONDS 3
#define POST_TRIGGER_SECONDS 4
#define TOTAL_BUFFER_SECONDS (PRE_TRIGGER_SECONDS + POST_TRIGGER_SECONDS)
const size_t bufferSize = (TOTAL_BUFFER_SECONDS * I2S_SAMPLE_RATE); // Total size of the circular buffer in samples
int16_t* audioBuffer;  // Pointer for the main circular audio buffer
size_t bufferHead = 0; // Current write position in the circular buffer

// FFT Configuration
#define FFT_SAMPLES 512 // Needs to be power of 2, and <= I2S_BUFFER_SIZE for this processing logic
double vReal[FFT_SAMPLES];
double vImag[FFT_SAMPLES];
ArduinoFFT<double> FFT = ArduinoFFT<double>(vReal, vImag, FFT_SAMPLES, I2S_SAMPLE_RATE);

// Detection Parameters
#define FREQUENCY_LOWER_BOUND 250
#define FREQUENCY_UPPER_BOUND 5000
#define SPECTRAL_RATIO_THRESHOLD 0.5
#define AMPLITUDE_THRESHOLD 80.0  // dB threshold
#define TRANSIENT_THRESHOLD 4.0   // dB change threshold
#define HISTORY_SIZE 15           // Number of past amplitude readings for background noise estimation
double amplitudeHistory[HISTORY_SIZE];
int historyIndex = 0;

// Structure to hold a captured audio segment for sending
typedef struct {
  int16_t* samples;
  size_t length;
} AudioBufferCapture;

// --- Function Declarations ---
void setupWifi();
void setupI2S();
void processAudioDetection(int32_t* rawSamples, int sampleCount);
bool checkGunshotConditions(double db, double transient, double spectral, double frequency);
void sendAudioToServer(AudioBufferCapture* audioData);
void createWavHeader(byte* header, int bitsPerSample, int channels, int sampleRate, int numSamples);
void addToHistory(double value);
double getAverageBackground();

// Global debug flag to bypass troublesome operations
bool DEBUG_MODE = true;

void setup() {
  pinMode(2, OUTPUT);
  
  // Reliable serial initialization
  Serial.begin(115200);
  delay(2000);  // Give serial monitor plenty of time to connect
  
  // Repeated markers to ensure we see the start
  for (int i=0; i<10; i++) {
    Serial.println("====== ESP32 STARTING ======");
    Serial.flush();
    digitalWrite(2, !digitalRead(2));
    delay(300);
  }
  
  // Rest of the setup
  Serial.println("Allocating audio buffer...");
  Serial.flush();
  size_t requiredMemory = bufferSize * sizeof(int16_t);
  Serial.printf("Buffer requires %d bytes\n", requiredMemory);
  Serial.flush();
  
  if (psramFound()) {
    Serial.println("PSRAM found, using it for audio buffer");
    audioBuffer = (int16_t*)ps_malloc(requiredMemory);
  } else {
    Serial.println("No PSRAM, using regular RAM");
    audioBuffer = (int16_t*)malloc(requiredMemory);
  }
  
  if (!audioBuffer) {
    Serial.println("ERROR: Failed to allocate audio buffer!");
    while(1) {
      digitalWrite(2, HIGH);
      delay(100);
      digitalWrite(2, LOW);
      delay(100);
    }
  }
  
  Serial.printf("Audio buffer allocated successfully at 0x%p\n", audioBuffer);
  memset(audioBuffer, 0, requiredMemory);
  
  // Initialize history
  for(int i = 0; i < HISTORY_SIZE; i++) {
    amplitudeHistory[i] = 0.0;
  }
  
  if (!DEBUG_MODE) {
    // Only attempt I2S setup in non-debug mode
    Serial.println("Starting I2S setup...");
    setupI2S();
    Serial.println("I2S setup complete");
  } else {
    Serial.println("DEBUG MODE: Skipping I2S setup");
  }
  
  Serial.println("Setup complete. Starting main loop...");
  Serial.flush();
}

void loop() {
  static unsigned long counter = 0;
  counter++;
  
  // Heartbeat LED
  digitalWrite(2, (counter % 2) ? HIGH : LOW);
  
  if (DEBUG_MODE) {
    // Simple debug mode - just print progress
    if(counter % 10 == 0) {
      Serial.printf("Debug loop running: %lu\n", counter);
    }
    delay(100);
    return;
  }

  // When ready to test I2S, implement actual I2S reading with timeouts
  // and proper error handling here
  
  delay(50);  // Small delay to prevent watchdog issues
}

// Add the implementation of setupI2S which was declared but missing
void setupI2S() {
  Serial.println("Setting up I2S...");
  
  i2s_config_t i2sConfig = {
    .mode = (i2s_mode_t)(I2S_MODE_MASTER | I2S_MODE_RX),
    .sample_rate = I2S_SAMPLE_RATE,
    .bits_per_sample = I2S_BITS_PER_SAMPLE_32BIT, // Read 32 bits
    .channel_format = I2S_CHANNEL_FMT_ONLY_LEFT,  // Mono microphone
    .communication_format = I2S_COMM_FORMAT_STAND_I2S, // Standard I2S
    .intr_alloc_flags = ESP_INTR_FLAG_LEVEL1,
    .dma_buf_count = 4,
    .dma_buf_len = I2S_BUFFER_SIZE,
    .use_apll = false,
    .tx_desc_auto_clear = false,
    .fixed_mclk = 0
  };
  
  i2s_pin_config_t pinConfig = {
    .bck_io_num = I2S_SCK,
    .ws_io_num = I2S_WS,
    .data_out_num = I2S_PIN_NO_CHANGE, // Not transmitting
    .data_in_num = I2S_SD
  };
  
  esp_err_t err;
  Serial.println("Installing I2S driver...");
  err = i2s_driver_install(I2S_NUM_0, &i2sConfig, 0, NULL);
  if (err != ESP_OK) {
    Serial.printf("Failed installing I2S driver: %d\n", err);
    return;
  }
  
  Serial.println("Setting I2S pins...");
  err = i2s_set_pin(I2S_NUM_0, &pinConfig);
  if (err != ESP_OK) {
    Serial.printf("Failed setting I2S pins: %d\n", err);
    return;
  }
  
  Serial.println("I2S successfully initialized");
}
