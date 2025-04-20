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

// WiFi credentials - replace with your network credentials
const char* ssid = "Mi 11X";
const char* password = "Laptop99@!";

// Web server will run on port 80
WebServer server(80);

// Flag to indicate if motion was detected
bool motionDetected = false;
// Variable to store the latest camera image
camera_fb_t * fb = NULL;
// Time when motion was detected
unsigned long lastMotionTime = 0;
// How long to keep the server running after motion (in milliseconds)
const unsigned long KEEP_AWAKE_DURATION = 60000; // 1 minute

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
  
  // Start web server
  setupWebServer();
  
  if (motionDetected) {
    // Take a picture when motion is detected
    capturePhoto();
  }
}

void loop() {
  server.handleClient();
  
  // Check if PIR detected motion
  if (digitalRead(PIR_PIN) == HIGH && !motionDetected) {
    Serial.println("Motion detected!");
    motionDetected = true;
    lastMotionTime = millis();
    capturePhoto();
  }
  
  // Check if we should go to sleep
  if (motionDetected && (millis() - lastMotionTime > KEEP_AWAKE_DURATION)) {
    Serial.println("Going to sleep now");
    // Clean up
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
    rtc_gpio_hold_en(GPIO_NUM_4);  // FIX: Changed from GPIO_NUM_LED to GPIO_NUM_4
    
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

void capturePhoto() {
  // Turn on flash if needed
  digitalWrite(LED_PIN, HIGH);
  delay(100);
  
  // Capture a new image
  if (fb) {
    esp_camera_fb_return(fb);
    fb = NULL;
  }
  
  fb = esp_camera_fb_get();
  if(!fb) {
    Serial.println("Camera capture failed");
    return;
  }
  
  Serial.printf("Image captured! Size: %zu bytes\n", fb->len);
  
  // Turn off flash
  digitalWrite(LED_PIN, LOW);
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
  capturePhoto();
  motionDetected = true;
  lastMotionTime = millis();
  server.sendHeader("Location", "/");
  server.send(303);
}

void handleImage() {
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