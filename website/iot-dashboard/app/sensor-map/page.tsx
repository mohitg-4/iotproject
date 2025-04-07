"use client";

import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import { useState, useEffect, useRef } from "react";
import L from "leaflet";
import { useRouter, useSearchParams } from "next/navigation";
import { FiEdit2 } from "react-icons/fi";

// Fix for default marker icons
L.Icon.Default.mergeOptions({
  iconUrl: "https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.7.1/dist/images/marker-shadow.png",
});

type Sensor = {
  id: string;
  lat: number;
  lon: number;
  status: string;
};

export default function SensorMap() {
  const [sensors, setSensors] = useState<Sensor[]>([]); // Dynamic sensor storage
  const [selectedSensor, setSelectedSensor] = useState<Sensor | null>(null);
  const router = useRouter();
  const searchParams = useSearchParams();

  // Store references to popups
  const popupRefs = useRef<Map<string, L.Popup>>(new Map());

  // Simulate fetching sensor data from an API
  useEffect(() => {
    const fetchSensors = async () => {
      const mockSensors: Sensor[] = [
        { id: "SN-101", lat: 12.9716, lon: 77.5946, status: "active" },
        { id: "SN-102", lat: 12.9611, lon: 77.6012, status: "inactive" },
        { id: "SN-103", lat: 12.9810, lon: 77.6100, status: "alert" },
      ];
      setSensors(mockSensors); // Set the fetched sensors
    };

    fetchSensors();
  }, []);

  // Handle updated or newly added sensor data from query parameters
  useEffect(() => {
    const sensorId = searchParams.get("sensorId");
    const lat = searchParams.get("lat");
    const lon = searchParams.get("lon");
    const status = searchParams.get("status");

    if (sensorId && lat && lon && status) {
      const updatedSensor: Sensor = {
        id: sensorId,
        lat: parseFloat(lat),
        lon: parseFloat(lon),
        status,
      };

      setSensors((prevSensors) => {
        const existingSensorIndex = prevSensors.findIndex(
          (sensor) => sensor.id === sensorId
        );

        if (existingSensorIndex !== -1) {
          // Update existing sensor
          const updatedSensors = [...prevSensors];
          updatedSensors[existingSensorIndex] = updatedSensor;
          return updatedSensors;
        } else {
          // Add new sensor
          return [...prevSensors, updatedSensor];
        }
      });

      // Clear query parameters after processing
      router.push("/sensor-map");
    }
  }, [searchParams, router]);

  const deleteSensor = (sensorId: string) => {
    setSensors((prevSensors) =>
      prevSensors.filter((sensor) => sensor.id !== sensorId)
    );
  };

  const getColor = (status: string): string => {
    if (status === "active") return "#00ff00";
    if (status === "alert") return "red";
    if (status === "inactive") return "#ffff00";
    return "gray";
  };

  const getIcon = (status: string) => {
    const color = getColor(status);
    return new L.DivIcon({
      className: "custom-icon",
      html: `<div style="background-color: ${color}; width: 15px; height: 15px; border-radius: 50%;"></div>`,
      iconSize: [15, 15],
      iconAnchor: [7.5, 7.5],
      popupAnchor: [0, -7.5],
    });
  };

  // Open the popup for the selected sensor
  useEffect(() => {
    if (selectedSensor && popupRefs.current.has(selectedSensor.id)) {
      const popup = popupRefs.current.get(selectedSensor.id);
      if (popup) {
        popup.openOn(popup._map); // Open the popup on the map
      }
    }
  }, [selectedSensor]);

  return (
    <div className="flex h-screen">
      {/* Map Section */}
      <div className="flex-1">
        <MapContainer center={[12.9716, 77.5946]} zoom={13} className="h-full w-full">
          <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
          {sensors.map((sensor) => (
            <Marker
              key={sensor.id}
              position={[sensor.lat, sensor.lon]}
              icon={getIcon(sensor.status)}
            >
              <Popup
                ref={(popup) => {
                  if (popup) {
                    popupRefs.current.set(sensor.id, popup);
                  }
                }}
              >
                <strong>Sensor ID:</strong> {sensor.id} <br />
                <strong>Status:</strong> {sensor.status}
              </Popup>
            </Marker>
          ))}
        </MapContainer>
      </div>

      {/* Sidebar Section */}
      <div className="w-64 bg-black text-white p-4">
        <div className="flex items-center mb-4">
          {/* Back to Dashboard Button */}
          <button
            onClick={() => router.push("/dashboard")}
            className="mr-2 px-2 py-1 bg-gray-700 text-white rounded hover:bg-gray-800 text-sm"
          >
            ←
          </button>
          <h2 className="text-xl font-bold">📍 Sensors</h2>
        </div>

        {/* Add New Sensor Button */}
        <button
          onClick={() => router.push(`/sensor-map/edit?sensorId=&lat=&lon=`)}
          className="w-full mb-4 px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 text-sm"
        >
          + Add New Sensor
        </button>

        {/* Sensor List */}
        <ul className="space-y-2">
          {sensors.map((sensor) => (
            <li
              key={sensor.id}
              className={`p-2 rounded-lg cursor-pointer flex justify-between items-center group ${
                selectedSensor?.id === sensor.id ? "bg-gray-700" : "hover:bg-gray-800"
              }`}
              style={{
                borderBottom: `2px solid ${getColor(sensor.status)}`, // Dynamic bottom border color
              }}
            >
              <div className="flex items-center space-x-2">
                <div onClick={() => setSelectedSensor(sensor)}>
                  🆔 {sensor.id}
                </div>
              </div>
              <div className="flex space-x-2 items-center opacity-0 group-hover:opacity-100 transition-opacity">
                {/* Edit Button */}
                <FiEdit2
                  className="text-gray-400 hover:text-white cursor-pointer"
                  onClick={() =>
                    router.push(
                      `/sensor-map/edit?sensorId=${sensor.id}&lat=${sensor.lat}&lon=${sensor.lon}&status=${sensor.status}`
                    )
                  }
                />
                {/* Delete Button */}
                <button
                  onClick={() => deleteSensor(sensor.id)}
                  className="text-gray-400 hover:text-red-500 cursor-pointer"
                >
                  🗑️
                </button>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}