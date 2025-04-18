"use client";

import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import { useState, useEffect, useRef } from "react";
import L from "leaflet";
import { useRouter, useSearchParams } from "next/navigation";
import { FiEdit2, FiFilter } from "react-icons/fi";

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
  _id?: string; // Add this to handle MongoDB's _id
};

export default function SensorMap() {
  const [sensors, setSensors] = useState<Sensor[]>([]); // Dynamic sensor storage
  const [selectedSensor, setSelectedSensor] = useState<Sensor | null>(null);
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [showFilterDropdown, setShowFilterDropdown] = useState(false);
  const [customQuery, setCustomQuery] = useState("");
  const [showCustomQuery, setShowCustomQuery] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();

  // Store references to popups
  const popupRefs = useRef<Map<string, L.Popup>>(new Map());

  // Simulate fetching sensor data from an API
  useEffect(() => {
    const fetchSensors = async () => {
      try {
        const response = await fetch('/api/sensors');
        if (!response.ok) {
          throw new Error('Failed to fetch sensors');
        }
        const data = await response.json();
        setSensors(data);
      } catch (error) {
        console.error('Error fetching sensors:', error);
      }
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

  const deleteSensor = async (sensorId: string) => {
    try {
      const response = await fetch(`/api/sensors?id=${sensorId}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
      });
        
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to delete sensor');
      }
  
      setSensors((prevSensors) =>
        prevSensors.filter((sensor) => sensor.id !== sensorId)
      );
  
      console.log('Sensor deleted successfully');
    } catch (error) {
      console.error('Error deleting sensor:', error);
      alert('Failed to delete sensor');
    }
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

  const getFilteredSensors = () => {
    if (filterStatus === "all") return sensors;
    return sensors.filter(sensor => sensor.status === filterStatus);
  };

  const handleCustomQuery = async () => {
    try {
      const response = await fetch('/api/sensors/query', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ query: customQuery }),
      });
      
      if (!response.ok) throw new Error('Query failed');
      
      const data = await response.json();
      setSensors(data);
    } catch (error) {
      console.error('Error executing query:', error);
      alert('Failed to execute query');
    }
  };

  return (
    <div className="flex h-screen">
      {/* Map Section */}
      <div className="flex-1 bg-black p-4"> {/* Added bg-black and p-4 */}
        <div className="h-full w-full rounded-xl overflow-hidden border border-gray-800"> {/* Added rounded-xl, overflow-hidden, and border */}
          <MapContainer center={[12.9716, 77.5946]} zoom={13} className="h-full w-full">
            <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
            {getFilteredSensors().map((sensor) => (
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
          <div className="flex-1 text-center mr-8">
    <h2 className="text-xl font-bold">Sensors</h2>
  </div>
        </div>

        {/* Filter Section */}
        <div className="mb-4 relative">
          <button
            onClick={() => setShowFilterDropdown(!showFilterDropdown)}
            className="w-full px-4 py-2 bg-gray-700 text-white rounded hover:bg-gray-600 flex items-center justify-center"
          >
            <span className="flex items-center">
              <FiFilter className="mr-2" />
              Filter
            </span>
          </button>
          
          {showFilterDropdown && (
            <div className="absolute w-full mt-2 bg-gray-700 rounded-lg shadow-lg z-10">
              <button
                onClick={() => {
                  setFilterStatus("all");
                  setShowFilterDropdown(false);
                }}
                className="w-full px-4 py-2 text-left hover:bg-gray-600"
              >
                All
              </button>
              <button
                onClick={() => {
                  setFilterStatus("active");
                  setShowFilterDropdown(false);
                }}
                className="w-full px-4 py-2 text-left hover:bg-gray-600"
              >
                Active
              </button>
              <button
                onClick={() => {
                  setFilterStatus("inactive");
                  setShowFilterDropdown(false);
                }}
                className="w-full px-4 py-2 text-left hover:bg-gray-600"
              >
                Inactive
              </button>
              <button
                onClick={() => {
                  setFilterStatus("alert");
                  setShowFilterDropdown(false);
                }}
                className="w-full px-4 py-2 text-left hover:bg-gray-600"
              >
                Alert
              </button>
            </div>
          )}
        </div>

        {/* Custom Query Section */}
        <div className="mb-4">
          <button
            onClick={() => setShowCustomQuery(!showCustomQuery)}
            className="w-full px-4 py-2 bg-gray-700 text-white rounded hover:bg-gray-600"
          >
            Custom Query
          </button>
          
          {showCustomQuery && (
            <div className="mt-2 space-y-2">
              <textarea
                value={customQuery}
                onChange={(e) => setCustomQuery(e.target.value)}
                placeholder="Enter NoSQL query..."
                className="w-full p-2 bg-gray-700 text-white rounded resize-none"
                rows={4}
              />
              <button
                onClick={handleCustomQuery}
                className="w-full px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
              >
                Execute Query
              </button>
            </div>
          )}
        </div>

        {/* Add New Sensor Button */}
        <button
          onClick={() => router.push(`/sensor-map/edit?sensorId=&lat=&lon=`)}
          className="w-full mb-4 px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 text-sm cursor-pointer">
          + Add New Sensor
        </button>

        {/* Sensor List */}
        <ul className="space-y-2">
          {getFilteredSensors().map((sensor) => (
            <li
              key={sensor.id}
              className={`p-2 rounded-lg cursor-pointer flex justify-between items-center group ${
                selectedSensor?.id === sensor.id ? "bg-gray-700" : "hover:bg-gray-800"
              }`}
              style={{
                borderRight: `3px solid ${getColor(sensor.status)}`, // Dynamic bottom border color
              }}
            >
              <div className="flex items-center space-x-2">
                <div onClick={() => setSelectedSensor(sensor)}>
                   {sensor.id}
                </div>
              </div>
              <div className="flex space-x-2 items-center opacity-30 group-hover:opacity-100 transition-opacity">
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