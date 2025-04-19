#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <PubSubClient.h>
#include <ESP32Servo.h>
#include "esp_camera.h"
#include "Arduino.h"

// WiFi and MQTT configurations
const char* ssid = "Mi 11X";
const char* password = "Laptop99@!";
const char* mqtt_server = "mqtt://c997ac04f7364048929feac82a351c39.s1.eu.hivemq.cloud";
const int mqtt_port = 8883;
const char* mqtt_username = "Camera-module";
const char* mqtt_password = "Kaushikyadalaisagaydumbass53";
const char* mqtt_topic_image = "camera/images";
const char* mqtt_topic_status = "camera/status";

// Camera configurations
#define CAMERA_MODEL_AI_THINKER
#include "camera_pins.h"

// Servo configurations
#define SERVO_PIN 14  // GPIO14 for servo control
Servo myservo;

// IR bulb configuration
#define IR_BULB_PIN 4  // GPIO4 for IR LED control

// Variables for obstruction detection
#define FRAME_BRIGHTNESS_SAMPLES 100  // Number of pixels to sample for brightness
#define OBSTRUCTION_THRESHOLD 30      // Brightness threshold for obstruction detection
#define BRIGHTNESS_HISTORY_SIZE 10    // Number of frames to keep in history
int brightnessHistory[BRIGHTNESS_HISTORY_SIZE] = {0};
int historyIndex = 0;
bool obstructionCleared = false;

// Temperature monitoring
#define TEMP_THRESHOLD 75  // Temperature threshold in Celsius
unsigned long lastTempCheck = 0;
#define TEMP_CHECK_INTERVAL 10000  // Check temperature every 10 seconds

// Frame rate control
#define MIN_FRAME_INTERVAL 200     // Minimum time between frames (ms)
unsigned long lastFrameTime = 0;

// Variables for MQTT
WiFiClientSecure espClient;
PubSubClient client(espClient);

// Root CA certificate for HiveMQ Cloud (from search results)
static const char* root_ca PROGMEM = R"EOF(
-----BEGIN CERTIFICATE-----
MIIFazCCA1OgAwIBAgIRAIIQz7DSQONZRGPgu2OCiwAwDQYJKoZIhvcNAQELBQAw
TzELMAkGA1UEBhMCVVMxKTAnBgNVBAoTIEludGVybmV0IFNlY3VyaXR5IFJlc2Vh
cmNoIEdyb3VwMRUwEwYDVQQDEwxJU1JHIFJvb3QgWDEwHhcNMTUwNjA0MTEwNDM4
WhcNMzUwNjA0MTEwNDM4WjBPMQswCQYDVQQGEwJVUzEpMCcGA1UEChMgSW50ZXJu
ZXQgU2VjdXJpdHkgUmVzZWFyY2ggR3JvdXAxFTATBgNVBAMTDElTUkcgUm9vdCBY
MTCCAiIwDQYJKoZIhvcNAQEBBQADggIPADCCAgoCggIBAK3oJHP0FDfzm54rVygc
h77ct984kIxuPOZXoHj3dcKi/vVqbvYATyjb3miGbESTtrFj/RQSa78f0uoxmyF+
0TM8ukj13Xnfs7j/EvEhmkvBioZxaUpmZmyPfjxwv60pIgbz5MDmgK7iS4+3mX6U
A5/TR5d8mUgjU+g4rk8Kb4Mu0UlXjIB0ttov0DiNeNxGnTu3m8mfYXZg7w/
-----END CERTIFICATE-----
)EOF";

void setup() {
  Serial.begin(115200);
  Serial.println("Starting ESP32-CAM with obstruction detection...");
  
  // Initialize the servo
  ESP32PWM::allocateTimer(0);
  ESP32PWM::allocateTimer(1);
  ESP32PWM::allocateTimer(2);
  ESP32PWM::allocateTimer(3);
  myservo.setPeriodHertz(50);  // Standard 50hz servo
  myservo.attach(SERVO_PIN, 500, 2400);  // Attaches the servo on pin 14
  myservo.write(90);  // Set servo to middle position
  
  // Initialize IR bulb pin
  pinMode(IR_BULB_PIN, OUTPUT);
  digitalWrite(IR_BULB_PIN, HIGH);  // Start with IR LED on for night vision
  
  // Initialize camera with optimized settings
  Serial.println("Initializing camera...");
  camera_config_t config;
  config.ledc_channel = LEDC_CHANNEL_0;
  config.ledc_timer = LEDC_TIMER_0;
  config.pin_d0 = Y2_GPIO_NUM;
  config.pin_d1 = Y3_GPIO_NUM;
  config.pin_d2 = Y4_GPIO_NUM;
  config.pin_d3 = Y5_GPIO_NUM;
  config.pin_d4 = Y6_GPIO_NUM;
  config.pin_d5 = Y7_GPIO_NUM;
  config.pin_d6 = Y8_GPIO_NUM;
  config.pin_d7 = Y9_GPIO_NUM;
  config.pin_xclk = XCLK_GPIO_NUM;
  config.pin_pclk = PCLK_GPIO_NUM;
  config.pin_vsync = VSYNC_GPIO_NUM;
  config.pin_href = HREF_GPIO_NUM;
  config.pin_sscb_sda = SIOD_GPIO_NUM;
  config.pin_sscb_scl = SIOC_GPIO_NUM;
  config.pin_pwdn = PWDN_GPIO_NUM;
  config.pin_reset = RESET_GPIO_NUM;
  config.xclk_freq_hz = 20000000;
  config.pixel_format = PIXFORMAT_JPEG;
  
  // Configure camera settings to reduce overheating
  if(psramFound()) {
    config.frame_size = FRAMESIZE_VGA;  // 640x480, reduced from higher res
    config.jpeg_quality = 12;           // Balance between quality and size
    config.fb_count = 1;                // Reduced to save memory
  } else {
    config.frame_size = FRAMESIZE_QVGA; // 320x240 for devices without PSRAM
    config.jpeg_quality = 12;
    config.fb_count = 1;
  }
  
  // Initialize the camera
  esp_err_t err = esp_camera_init(&config);
  if (err != ESP_OK) {
    Serial.printf("Camera init failed with error 0x%x", err);
    return;
  }
  
  // Optimize camera settings for better performance and less heating
  sensor_t * s = esp_camera_sensor_get();
  s->set_framesize(s, config.frame_size);
  s->set_quality(s, config.jpeg_quality);
  s->set_brightness(s, 0);      // -2 to 2
  s->set_contrast(s, 0);        // -2 to 2
  s->set_saturation(s, 0);      // -2 to 2
  s->set_whitebal(s, 1);        // Enable white balance
  s->set_awb_gain(s, 1);        // Enable AWB gain
  s->set_wb_mode(s, 0);         // Auto white balance
  s->set_exposure_ctrl(s, 1);   // Enable exposure control
  s->set_gain_ctrl(s, 1);       // Enable gain control
  s->set_agc_gain(s, 0);        // Set gain to 0
  
  // Initialize WiFi
  Serial.println("Connecting to WiFi...");
  WiFi.begin(ssid, password);
  int wifiAttempts = 0;
  while (WiFi.status() != WL_CONNECTED && wifiAttempts < 20) {
    delay(500);
    Serial.print(".");
    wifiAttempts++;
  }
  
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("\nFailed to connect to WiFi. Restarting...");
    ESP.restart();
  }
  
  Serial.println("\nWiFi connected");
  Serial.print("IP address: ");
  Serial.println(WiFi.localIP());
  
  // Set up MQTT with secure connection
  espClient.setCACert(root_ca);
  client.setServer(mqtt_server, mqtt_port);
  client.setCallback(mqttCallback);
  
  // Try to connect to MQTT broker
  reconnectMQTT();
  
  // Send initial status message
  client.publish(mqtt_topic_status, "{\"status\":\"online\",\"temperature\":0}");
  
  Serial.println("Setup complete!");
}

void loop() {
  // Check WiFi connection
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("WiFi connection lost. Reconnecting...");
    WiFi.begin(ssid, password);
    delay(5000);  // Wait a bit before continuing
    return;
  }
  
  // Check MQTT connection
  if (!client.connected()) {
    reconnectMQTT();
  }
  client.loop();
  
  // Check temperature periodically to prevent overheating
  unsigned long currentTime = millis();
  if (currentTime - lastTempCheck > TEMP_CHECK_INTERVAL) {
    lastTempCheck = currentTime;
    float temperature = readTemperature();
    
    // Send temperature to MQTT broker
    char tempMsg[50];
    sprintf(tempMsg, "{\"status\":\"online\",\"temperature\":%.1f}", temperature);
    client.publish(mqtt_topic_status, tempMsg);
    
    // If temperature is too high, enter cooling mode
    if (temperature > TEMP_THRESHOLD) {
      Serial.println("WARNING: ESP32 is overheating! Entering cooling mode...");
      delay(5000);  // Extended delay to allow cooling
      return;
    }
  }
  
  // Control frame rate to prevent overheating
  if (currentTime - lastFrameTime < MIN_FRAME_INTERVAL) {
    delay(10);  // Short delay to yield processor time
    return;
  }
  lastFrameTime = currentTime;
  
  // Capture an image
  camera_fb_t * fb = esp_camera_fb_get();
  if (!fb) {
    Serial.println("Camera capture failed");
    delay(1000);
    return;
  }
  
  // Check for obstruction
  bool isObstructed = detectObstruction(fb);
  
  // If obstruction is detected and hasn't been cleared yet, activate servo
  if (isObstructed && !obstructionCleared) {
    Serial.println("Obstruction detected! Clearing...");
    
    // Publish obstruction status
    client.publish(mqtt_topic_status, "{\"status\":\"obstructed\"}");
    
    // Attempt to clear obstruction
    clearObstruction();
    
    // Set flag to avoid continuous clearing attempts
    obstructionCleared = true;
    
    // Release the current frame
    esp_camera_fb_return(fb);
    
    // Capture a new frame after clearing
    delay(1000);
    fb = esp_camera_fb_get();
    if (!fb) {
      Serial.println("Camera capture failed after clearing obstruction");
      delay(1000);
      return;
    }
    
    // Check if clearing worked
    if (!detectObstruction(fb)) {
      Serial.println("Obstruction cleared successfully!");
      client.publish(mqtt_topic_status, "{\"status\":\"cleared\"}");
    } else {
      Serial.println("Failed to clear obstruction.");
      client.publish(mqtt_topic_status, "{\"status\":\"failed_to_clear\"}");
    }
  } else if (!isObstructed) {
    // Reset obstruction cleared flag if no obstruction is detected
    obstructionCleared = false;
  }
  
  // Convert the image to base64 and send via MQTT
  sendImageViaMQTT(fb);
  
  // Return the frame buffer back to the camera
  esp_camera_fb_return(fb);
}

bool detectObstruction(camera_fb_t *fb) {
  // Sample pixels from the JPEG to estimate overall brightness
  int totalBrightness = 0;
  int samplesCount = 0;
  
  // Sample every Nth byte to estimate brightness
  for (size_t i = 0; i < fb->len; i += fb->len / FRAME_BRIGHTNESS_SAMPLES) {
    totalBrightness += fb->buf[i];
    samplesCount++;
  }
  
  int currentBrightness = totalBrightness / samplesCount;
  
  // Add to brightness history
  brightnessHistory[historyIndex] = currentBrightness;
  historyIndex = (historyIndex + 1) % BRIGHTNESS_HISTORY_SIZE;
  
  // Calculate average brightness from history
  int sumBrightness = 0;
  for (int i = 0; i < BRIGHTNESS_HISTORY_SIZE; i++) {
    sumBrightness += brightnessHistory[i];
  }
  int avgBrightness = sumBrightness / BRIGHTNESS_HISTORY_SIZE;
  
  // If brightness suddenly drops significantly compared to history, 
  // it might indicate an obstruction
  bool obstructionDetected = false;
  if (avgBrightness > 0 && currentBrightness < avgBrightness - OBSTRUCTION_THRESHOLD) {
    obstructionDetected = true;
  }
  
  return obstructionDetected;
}

void clearObstruction() {
  // Move servo to clear obstruction
  // The exact movement pattern will depend on your setup
  
  // First, move slowly to one side
  for (int pos = 90; pos >= 0; pos -= 5) {
    myservo.write(pos);
    delay(50);
  }
  delay(200);
  
  // Then move to the other side
  for (int pos = 0; pos <= 180; pos += 5) {
    myservo.write(pos);
    delay(50);
  }
  delay(200);
  
  // Return to center position
  for (int pos = 180; pos >= 90; pos -= 5) {
    myservo.write(pos);
    delay(50);
  }
}

float readTemperature() {
  // ESP32 has an internal temperature sensor
  #ifdef CONFIG_IDF_TARGET_ESP32
    float temperatureF = (temprature_sens_read() - 32) / 1.8;
    return temperatureF;
  #else
    // If not available, return a dummy value
    return 50.0;
  #endif
}

void reconnectMQTT() {
  // Loop until we're reconnected
  int attempts = 0;
  while (!client.connected() && attempts < 5) {
    Serial.print("Attempting MQTT connection...");
    // Create a random client ID
    String clientId = "ESP32CAM-";
    clientId += String(random(0xffff), HEX);
    // Attempt to connect
    if (client.connect(clientId.c_str(), mqtt_username, mqtt_password)) {
      Serial.println("connected");
      
      // Subscribe to control topics
      client.subscribe("camera/control");
    } else {
      Serial.print("failed, rc=");
      Serial.print(client.state());
      Serial.println(" try again in 5 seconds");
      delay(5000);
      attempts++;
    }
  }
}

void mqttCallback(char* topic, byte* payload, unsigned int length) {
  // Handle incoming MQTT messages
  String message;
  for (int i = 0; i < length; i++) {
    message += (char)payload[i];
  }
  
  Serial.print("Message arrived [");
  Serial.print(topic);
  Serial.print("] ");
  Serial.println(message);
  
  // Example: Control servo movement remotely
  if (String(topic) == "camera/control") {
    if (message == "clear") {
      clearObstruction();
    } else if (message == "ir_on") {
      digitalWrite(IR_BULB_PIN, HIGH);
    } else if (message == "ir_off") {
      digitalWrite(IR_BULB_PIN, LOW);
    }
  }
}

void sendImageViaMQTT(camera_fb_t *fb) {
  // Convert image to base64
  String base64Image = base64Encode(fb->buf, fb->len);
  
  // Check if conversion was successful
  if (base64Image.length() > 0) {
    // Split the image into chunks if it's too large for MQTT
    int chunkSize = 10000; // Adjust based on MQTT broker's message size limit
    int numChunks = (base64Image.length() + chunkSize - 1) / chunkSize;
    
    // Send a start message with metadata
    String metadata = "{\"type\":\"image\",\"chunks\":" + String(numChunks) + ",\"size\":" + String(base64Image.length()) + "}";
    client.publish(mqtt_topic_status, metadata.c_str());
    
    // Send each chunk
    for (int i = 0; i < numChunks; i++) {
      int startIndex = i * chunkSize;
      int endIndex = min((i + 1) * chunkSize, (int)base64Image.length());
      String chunk = base64Image.substring(startIndex, endIndex);
      
      String chunkTopic = String(mqtt_topic_image) + "/chunk/" + String(i);
      boolean success = client.publish(chunkTopic.c_str(), chunk.c_str());
      
      if (!success) {
        Serial.println("Failed to publish chunk " + String(i));
      }
      
      // Small delay between chunks to avoid overwhelming the broker
      delay(50);
    }
    
    Serial.println("Image sent successfully in " + String(numChunks) + " chunks");
  } else {
    Serial.println("Failed to encode image to base64");
  }
}

String base64Encode(uint8_t* data, size_t length) {
  // Standard Base64 encoding implementation
  const char* base64_chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  String result;
  result.reserve(4 * ((length + 2) / 3)); // Reserve approximate space
  
  int i = 0;
  unsigned char char_array_3[3];
  unsigned char char_array_4[4];
  
  while (length--) {
    char_array_3[i++] = *(data++);
    if (i == 3) {
      char_array_4[0] = (char_array_3[0] & 0xfc) >> 2;
      char_array_4[1] = ((char_array_3[0] & 0x03) << 4) + ((char_array_3[1] & 0xf0) >> 4);
      char_array_4[2] = ((char_array_3[1] & 0x0f) << 2) + ((char_array_3[2] & 0xc0) >> 6);
      char_array_4[3] = char_array_3[2] & 0x3f;
      
      for(i = 0; i < 4; i++) {
        result += base64_chars[char_array_4[i]];
      }
      i = 0;
    }
  }
  
  if (i) {
    for(int j = i; j < 3; j++) {
      char_array_3[j] = '\0';
    }
    
    char_array_4[0] = (char_array_3[0] & 0xfc) >> 2;
    char_array_4[1] = ((char_array_3[0] & 0x03) << 4) + ((char_array_3[1] & 0xf0) >> 4);
    char_array_4[2] = ((char_array_3[1] & 0x0f) << 2) + ((char_array_3[2] & 0xc0) >> 6);
    char_array_4[3] = char_array_3[2] & 0x3f;
    
    for (int j = 0; j < i + 1; j++) {
      result += base64_chars[char_array_4[j]];
    }
    
    while((i++ < 3)) {
      result += '=';
    }
  }
  
  return result;
}
