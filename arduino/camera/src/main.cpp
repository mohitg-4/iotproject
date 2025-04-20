/*
  Modified from Rui Santos & Sara Santos - Random Nerd Tutorials
  ESP32-CAM Motion Detection with Web Server
  
  IMPORTANT!!!
   - Select Board "AI Thinker ESP32-CAM"
   - GPIO 0 must be connected to GND to upload a sketch
   - After connecting GPIO 0 to GND, press the ESP32-CAM on-board RESET button to put your board in flashing mode
*/
 
#include "esp_camera.h"
#include "Arduino.h"
#include "soc/soc.h"           // Disable brownout problems
#include "soc/rtc_cntl_reg.h"  // Disable brownout problems
#include "driver/rtc_io.h"
#include <WiFi.h>
#include <WebServer.h>
#include <WiFiClientSecure.h>  // For secure MQTT connection
#include <PubSubClient.h>      // MQTT client
#include <ArduinoJson.h>       // For JSON formatting

// WiFi credentials - replace with your network credentials
const char* ssid = "Mi 11X";
const char* password = "Laptop99@!";

// MQTT HiveMQ settings
const char* mqtt_server = "c997ac04f7364048929feac82a351c39.s1.eu.hivemq.cloud";
const int mqtt_port = 8883; // TLS/SSL port for secure connection
const char* device_id = "CAM001"; // Set your camera device ID here
const char* mqtt_username = "esp32-cam"; // ESP32-specific username
const char* mqtt_password = "Laptop99@!"; // ESP32-specific password

// MQTT topics
char mqtt_topic_image[50]; // For image data

// Web server will run on port 80
WebServer server(80);

// Flag to indicate if motion was detected
bool motionDetected = false;
// Variable to store the latest camera image
camera_fb_t * fb = NULL;
// Array to store multiple camera images
camera_fb_t* images[5] = {NULL, NULL, NULL, NULL, NULL};
// Time when motion was detected
unsigned long lastMotionTime = 0;
// How long to keep the server running after motion (in milliseconds)
const unsigned long KEEP_AWAKE_DURATION = 60000; // 1 minute
// Add this constant at the top with other constants
const unsigned long MOTION_RESET_TIME = 5000; // 5 seconds before allowing new motion detection
// Delay between consecutive photos (milliseconds)
const unsigned long PHOTO_DELAY = 500; 

// WiFi and MQTT clients
WiFiClientSecure espClient;
PubSubClient mqttClient(espClient);

// Pin definition for CAMERA_MODEL_AI_THINKER
#define PWDN_GPIO_NUM     32
#define RESET_GPIO_NUM    -1
#define XCLK_GPIO_NUM      0
#define SIOD_GPIO_NUM     26
#define SIOC_GPIO_NUM     27
#define Y9_GPIO_NUM       35
#define Y8_GPIO_NUM       34
#define Y7_GPIO_NUM       39
#define Y6_GPIO_NUM       36
#define Y5_GPIO_NUM       21
#define Y4_GPIO_NUM       19
#define Y3_GPIO_NUM       18
#define Y2_GPIO_NUM        5
#define VSYNC_GPIO_NUM    25
#define HREF_GPIO_NUM     23
#define PCLK_GPIO_NUM     22
#define LED_PIN           4
#define PIR_PIN           13

void setup() {
  WRITE_PERI_REG(RTC_CNTL_BROWN_OUT_REG, 0); // Disable brownout detector
  Serial.begin(115200);
  Serial.setDebugOutput(true);
  
  // Check if we're booting due to external wake up (PIR motion)
  esp_sleep_wakeup_cause_t wakeup_reason = esp_sleep_get_wakeup_cause();
  if(wakeup_reason == ESP_SLEEP_WAKEUP_EXT0) {
    Serial.println("Wakeup caused by external signal using RTC_IO (PIR)");
    motionDetected = true;
    lastMotionTime = millis();
  }
  
  // Initialize camera
  initCamera();
  
  // Setup LED
  pinMode(LED_PIN, OUTPUT);
  digitalWrite(LED_PIN, LOW);
  
  // Setup PIR sensor pin
  pinMode(PIR_PIN, INPUT);
  
  // Connect to WiFi
  connectToWiFi();
  
  // Skip certificate verification (for testing only)
  espClient.setInsecure();
  
  // Set up MQTT connection
  mqttClient.setServer(mqtt_server, mqtt_port);
  
  // Create the MQTT topic
  sprintf(mqtt_topic_image, "cameras/%s/image", device_id);
  
  // Start web server
  setupWebServer();
  
  if (motionDetected) {
    // Take pictures when motion is detected
    captureMultiplePhotos();
    // Send them via MQTT
    for (int i = 0; i < 5; i++) {
      if (images[i] != NULL) {
        sendImageViaMQTT(images[i], i);
      }
    }
  }
}

void loop() {
  server.handleClient();
  
  // Keep MQTT connection alive
  if (!mqttClient.connected()) {
    reconnectMQTT();
  }
  mqttClient.loop();
  
  // Reset motion detection flag after a short period to allow new detections
  if (motionDetected && (millis() - lastMotionTime > MOTION_RESET_TIME)) {
    motionDetected = false;
  }
  
  // Check if PIR detected motion
  if (digitalRead(PIR_PIN) == HIGH && !motionDetected) {
    Serial.println("Motion detected!");
    motionDetected = true;
    lastMotionTime = millis();
    
    // Capture multiple photos
    captureMultiplePhotos();
    
    // Send photos via MQTT
    for (int i = 0; i < 5; i++) {
      if (images[i] != NULL) {
        sendImageViaMQTT(images[i], i);
      }
    }
  }
  
  // Check if we should go to sleep
  if (motionDetected && (millis() - lastMotionTime > KEEP_AWAKE_DURATION)) {
    Serial.println("Going to sleep now");
    
    // Clean up image buffers
    for (int i = 0; i < 5; i++) {
      if (images[i] != NULL) {
        esp_camera_fb_return(images[i]);
        images[i] = NULL;
      }
    }
    
    if (fb) {
      esp_camera_fb_return(fb);
      fb = NULL;
    }
    
    server.close();
    WiFi.disconnect(true);
    
    // Configure wakeup on PIR motion (GPIO 13)
    esp_sleep_enable_ext0_wakeup(GPIO_NUM_13, HIGH);
    rtc_gpio_pullup_dis(GPIO_NUM_13);
    rtc_gpio_pulldown_en(GPIO_NUM_13);
    
    // Turn off LED
    digitalWrite(LED_PIN, LOW);
    rtc_gpio_hold_en(GPIO_NUM_4);
    
    delay(1000);
    esp_deep_sleep_start();
  }
}

void initCamera() {
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
  config.pin_sccb_sda = SIOD_GPIO_NUM;
  config.pin_sccb_scl = SIOC_GPIO_NUM;
  config.pin_pwdn = PWDN_GPIO_NUM;
  config.pin_reset = RESET_GPIO_NUM;
  config.xclk_freq_hz = 20000000;
  config.pixel_format = PIXFORMAT_JPEG;
  config.grab_mode = CAMERA_GRAB_LATEST;
 
  if(psramFound()){
    config.frame_size = FRAMESIZE_UXGA; // FRAMESIZE_ + QVGA|CIF|VGA|SVGA|XGA|SXGA|UXGA
    config.jpeg_quality = 10;
    config.fb_count = 2;
  } else {
    config.frame_size = FRAMESIZE_SVGA;
    config.jpeg_quality = 12;
    config.fb_count = 1;
  }
 
  // Init Camera
  esp_err_t err = esp_camera_init(&config);
  if (err != ESP_OK) {
    Serial.printf("Camera init failed with error 0x%x", err);
    return;
  }
  Serial.println("Camera initialized successfully");
}

void connectToWiFi() {
  WiFi.begin(ssid, password);
  
  Serial.print("Connecting to WiFi");
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.println();
  
  Serial.print("Connected to WiFi. IP Address: ");
  Serial.println(WiFi.localIP());
}

// Capture a single photo
camera_fb_t* capturePhoto() {
  // Turn on flash if needed
  digitalWrite(LED_PIN, HIGH);
  delay(100);
  
  // Capture a new image
  camera_fb_t* new_fb = esp_camera_fb_get();
  if(!new_fb) {
    Serial.println("Camera capture failed");
    return NULL;
  }
  
  Serial.printf("Image captured! Size: %zu bytes\n", new_fb->len);
  
  // Turn off flash
  digitalWrite(LED_PIN, LOW);
  
  return new_fb;
}

// Capture multiple photos in sequence
void captureMultiplePhotos() {
  Serial.println("Capturing multiple photos...");
  
  // Free any previous images
  for (int i = 0; i < 5; i++) {
    if (images[i] != NULL) {
      esp_camera_fb_return(images[i]);
      images[i] = NULL;
    }
  }
  
  // Capture 5 photos with short delays between them
  for (int i = 0; i < 5; i++) {
    images[i] = capturePhoto();
    if (images[i] == NULL) {
      Serial.println("Failed to capture image " + String(i));
    }
    delay(PHOTO_DELAY);
  }
  
  // Update the main fb pointer to the latest image for web display
  if (fb) {
    esp_camera_fb_return(fb);
  }
  
  // Copy the last image to fb for web display
  if (images[4] != NULL) {
    fb = esp_camera_fb_get();
    if (fb) {
      memcpy(fb->buf, images[4]->buf, images[4]->len);
      fb->len = images[4]->len;
    }
  }
  
  Serial.println("Multiple photo capture complete");
}

void setupWebServer() {
  server.on("/", handleRoot);
  server.on("/capture", handleCapture);
  server.on("/image", handleImage);
  server.onNotFound(handleNotFound);
  
  server.begin();
  Serial.println("Web server started");
}

void handleRoot() {
  String html = "<!DOCTYPE html><html><head>";
  html += "<meta name='viewport' content='width=device-width, initial-scale=1.0'>";
  html += "<title>ESP32-CAM Motion Detection</title>";
  html += "<style>";
  html += "body { font-family: Arial, sans-serif; text-align: center; margin: 20px; }";
  html += "img { max-width: 100%; height: auto; border: 2px solid #444; }";
  html += "button { background-color: #0275d8; color: white; padding: 10px 20px; ";
  html += "border: none; border-radius: 4px; margin: 10px; cursor: pointer; }";
  html += "</style></head><body>";
  html += "<h1>ESP32-CAM Motion Detection</h1>";
  
  if (motionDetected) {
    html += "<p>Motion detected! Image captured.</p>";
    html += "<img src='/image' alt='Captured Image'>";
    html += "<p>Last motion detected: " + String((millis() - lastMotionTime) / 1000) + " seconds ago</p>";
  } else {
    html += "<p>No motion detected yet.</p>";
  }
  
  html += "<button onclick=\"location.href='/capture'\">Capture New Image</button>";
  html += "<script>setTimeout(function(){ location.reload(); }, 10000);</script>"; // Auto refresh every 10 seconds
  html += "</body></html>";
  
  server.send(200, "text/html", html);
}

void handleCapture() {
  captureMultiplePhotos();
  motionDetected = true;
  lastMotionTime = millis();
  
  // Send photos via MQTT
  for (int i = 0; i < 5; i++) {
    if (images[i] != NULL) {
      sendImageViaMQTT(images[i], i);
    }
  }
  
  server.sendHeader("Location", "/");
  server.send(303);
}

void handleImage() {
  if (!fb) {
    // If no image is available, try to capture one
    fb = capturePhoto();
  }
  
  if (!fb) {
    server.send(404, "text/plain", "No image available");
    return;
  }
  
  server.setContentLength(fb->len);
  server.send(200, "image/jpeg", "");
  
  // Send the image data
  WiFiClient client = server.client();
  client.write(fb->buf, fb->len);
}

void handleNotFound() {
  server.send(404, "text/plain", "Page Not Found");
}

// Function to reconnect to MQTT broker
void reconnectMQTT() {
  int attempts = 0;
  while (!mqttClient.connected() && attempts < 5) {
    Serial.print("Connecting to MQTT broker...");
    String clientId = "ESP32CAM-";
    clientId += String(random(0xffff), HEX);
    
    if (mqttClient.connect(clientId.c_str(), mqtt_username, mqtt_password)) {
      Serial.println("connected");
    } else {
      Serial.print("failed, rc=");
      Serial.print(mqttClient.state());
      Serial.println(" retrying in 5 seconds");
      delay(5000);
      attempts++;
    }
  }
}

// Base64 encode function for image data
String base64Encode(const uint8_t* data, size_t length) {
  const char base64_chars[] = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  String encoded;
  
  // Reserve memory for base64 output (4 bytes for every 3 input bytes, plus some extra)
  encoded.reserve(((length + 2) / 3) * 4);
  
  for (size_t i = 0; i < length; i += 3) {
    uint32_t octet_a = i < length ? data[i] : 0;
    uint32_t octet_b = (i + 1) < length ? data[i + 1] : 0;
    uint32_t octet_c = (i + 2) < length ? data[i + 2] : 0;
    
    uint32_t triple = (octet_a << 16) + (octet_b << 8) + octet_c;
    
    encoded += base64_chars[(triple >> 18) & 0x3F];
    encoded += base64_chars[(triple >> 12) & 0x3F];
    encoded += (i + 1 < length) ? base64_chars[(triple >> 6) & 0x3F] : '=';
    encoded += (i + 2 < length) ? base64_chars[triple & 0x3F] : '=';
  }
  
  return encoded;
}

// Function to send image via MQTT
void sendImageViaMQTT(camera_fb_t *fb, int imageNumber) {
  if (!mqttClient.connected()) {
    reconnectMQTT();
    if (!mqttClient.connected()) {
      Serial.println("Failed to connect to MQTT broker. Not sending image.");
      return;
    }
  }
  
  if (!fb) {
    Serial.println("Invalid image buffer");
    return;
  }
  
  // Convert image to base64
  String base64Image = base64Encode(fb->buf, fb->len);
  
  // Check if conversion was successful
  if (base64Image.length() > 0) {
    // Split the image into chunks if it's too large for MQTT
    int chunkSize = 10000; // Adjust based on MQTT broker's message size limit
    int numChunks = (base64Image.length() + chunkSize - 1) / chunkSize;
    
    // Send a start message with metadata
    String metadata = "{\"device_id\":\"" + String(device_id) + 
                     "\",\"type\":\"image\",\"image_number\":" + String(imageNumber) + 
                     ",\"chunks\":" + String(numChunks) + 
                     ",\"size\":" + String(base64Image.length()) + 
                     ",\"timestamp\":" + String(millis()) + "}";
                     
    char metadataTopic[60];
    sprintf(metadataTopic, "%s/metadata", mqtt_topic_image);
    mqttClient.publish(metadataTopic, metadata.c_str());
    Serial.println("Published image metadata");
    
    // Send each chunk
    for (int i = 0; i < numChunks; i++) {
      int startIndex = i * chunkSize;
      int endIndex = min((i + 1) * chunkSize, (int)base64Image.length());
      String chunk = base64Image.substring(startIndex, endIndex);
      
      String chunkTopic = String(mqtt_topic_image) + "/chunk/" + String(imageNumber) + "/" + String(i);
      boolean success = mqttClient.publish(chunkTopic.c_str(), chunk.c_str());
      
      if (!success) {
        Serial.println("Failed to publish chunk " + String(i));
      }
      
      // Small delay between chunks to avoid overwhelming the broker
      delay(50);
    }
    
    Serial.println("Image " + String(imageNumber) + " sent successfully in " + String(numChunks) + " chunks");
  } else {
    Serial.println("Failed to encode image to base64");
  }
}