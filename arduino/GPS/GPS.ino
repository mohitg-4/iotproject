/*********
  Rui Santos & Sara Santos - Random Nerd Tutorials
  Complete instructions at https://RandomNerdTutorials.com/esp32-neo-6m-gps-module-arduino/
  Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files.
  The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.
*********/

#include <TinyGPS++.h>
#include <WiFi.h>
#include <PubSubClient.h>
#include <WiFiClientSecure.h>
#include <ArduinoJson.h>

// Define the RX and TX pins for Serial 2
#define RXD2 16
#define TXD2 17
#define GPS_BAUD 9600

// WiFi credentials
const char* ssid = "Mi 11X";
const char* password = "Laptop99@!";

// MQTT HiveMQ settings
const char* mqtt_server = "c997ac04f7364048929feac82a351c39.s1.eu.hivemq.cloud";
const int mqtt_port = 8883; // TLS/SSL port for secure connection
const char* animal_id = "A001"; // Set your animal ID here
const char* mqtt_username = "animal-1"; // ESP32-specific username
const char* mqtt_password = "Kaushikyadalaisagaydumbass53"; // ESP32-specific password

// The topic to publish to
char mqtt_topic[50];

// How often to publish GPS data (milliseconds)
const unsigned long PUBLISH_INTERVAL = 30000; // 5 minutes
unsigned long lastPublishTime = 0;

// The TinyGPS++ object
TinyGPSPlus gps;

// Create an instance of the HardwareSerial class for Serial 2
HardwareSerial gpsSerial(2);

// WiFi and MQTT clients
WiFiClientSecure espClient;
PubSubClient mqttClient(espClient);

void setup() {
  // Serial Monitor
  Serial.begin(115200);
  delay(1000);
  
  // Start Serial 2 with the defined RX and TX pins and a baud rate of 9600
  gpsSerial.begin(GPS_BAUD, SERIAL_8N1, RXD2, TXD2);
  delay(1000);
  Serial.println("Serial 2 started at 9600 baud rate");
  
  // Connect to WiFi
  setupWiFi();
  
  // Skip certificate verification (for testing only)
  espClient.setInsecure();
  
  // Set up MQTT connection
  mqttClient.setServer(mqtt_server, mqtt_port);
  
  // Create the MQTT topic
  sprintf(mqtt_topic, "animals/%s/location", animal_id);
  
  Serial.println("Setup complete, waiting for GPS fix...");
}

void loop() {
  // Keep WiFi and MQTT connected
  if (!mqttClient.connected()) {
    reconnectMQTT();
  }
  mqttClient.loop();

  // Read GPS data
  while (gpsSerial.available() > 0) {
    gps.encode(gpsSerial.read());
  }
  
  // Check if it's time to publish data and we have a valid GPS fix
  unsigned long currentMillis = millis();
  if ((currentMillis - lastPublishTime >= PUBLISH_INTERVAL) && gps.location.isValid()) {
    publishGPSData();
    lastPublishTime = currentMillis;
  }
  
  // Debug output to serial monitor
  if (gps.location.isUpdated()) {
    displayGPSInfo();
  }
}

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

void publishGPSData() {
  // Create JSON document for the data
  StaticJsonDocument<256> doc;
  
  // Add GPS location data
  doc["lat"] = gps.location.lat();
  doc["lon"] = gps.location.lng();
  doc["altitude"] = gps.altitude.meters();
  doc["velocity"] = gps.speed.mps(); // Speed in meters per second
  
  // Safe area - you might want to set this in setup or elsewhere
  JsonObject safe_area = doc.createNestedObject("safe_area");
  safe_area["lat"] = 51.505; // Default safe area center (replace with actual coordinates)
  safe_area["lon"] = -0.09;  // Default safe area center
  safe_area["radius"] = 1000; // Default radius in meters
  
  // Serialize JSON to string
  char jsonBuffer[256];
  serializeJson(doc, jsonBuffer);
  
  // Publish to MQTT
  Serial.print("Publishing GPS data: ");
  Serial.println(jsonBuffer);
  
  if (mqttClient.publish(mqtt_topic, jsonBuffer)) {
    Serial.println("Successfully published GPS data");
  } else {
    Serial.println("Failed to publish GPS data");
  }
}

void displayGPSInfo() {
  Serial.print("LAT: ");
  Serial.println(gps.location.lat(), 6);
  Serial.print("LONG: "); 
  Serial.println(gps.location.lng(), 6);
  Serial.print("SPEED (km/h) = "); 
  Serial.println(gps.speed.kmph()); 
  Serial.print("ALT (m) = "); 
  Serial.println(gps.altitude.meters());
  Serial.print("Satellites = "); 
  Serial.println(gps.satellites.value()); 
  Serial.print("Time: ");
  Serial.println(String(gps.date.year()) + "/" + String(gps.date.month()) + "/" + 
                String(gps.date.day()) + " " + String(gps.time.hour()) + ":" + 
                String(gps.time.minute()) + ":" + String(gps.time.second()));
  Serial.println(); 

  
}
