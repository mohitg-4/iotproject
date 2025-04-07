"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

type Sensor = {
  id: string;
  lat: number;
  lon: number;
  status: string;
};

export default function EditSensor() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const sensorId = searchParams.get("sensorId") || ""; // Default to empty string
  const lat = searchParams.get("lat") || ""; // Default to empty string
  const lon = searchParams.get("lon") || ""; // Default to empty string

  // Initialize sensor state
  const [sensor, setSensor] = useState<Sensor>({
    id: sensorId || "", // Default to empty string for new sensors
    lat: lat ? parseFloat(lat) : 0, // Default to 0 if lat is empty
    lon: lon ? parseFloat(lon) : 0, // Default to 0 if lon is empty
    status: "inactive", // Default status for new sensors
  });

  const handleSave = () => {
    // Pass the updated sensor data back to the sensor-map page via query parameters
    const query = new URLSearchParams({
      sensorId: sensor.id,
      lat: sensor.lat.toString(),
      lon: sensor.lon.toString(),
      status: sensor.status,
    }).toString();

    router.push(`/sensor-map?${query}`); // Navigate back to the sensor map with updated data
  };

  return (
    <div className="p-6 text-white">
      {/* Back Button */}
      <button
        onClick={() => router.push("/sensor-map")}
        className="mb-4 px-4 py-2 bg-gray-700 text-white rounded hover:bg-gray-800"
      >
        ← Back to Sensor Map
      </button>

      <h1 className="text-2xl font-bold mb-4">
        {sensorId ? "Edit Sensor" : "Add New Sensor"}
      </h1>
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium mb-1">Sensor ID</label>
          <input
            type="text"
            value={sensor.id}
            onChange={(e) => setSensor({ ...sensor, id: e.target.value })}
            className="w-full p-2 rounded bg-gray-800 text-white"
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Latitude</label>
          <input
            type="number"
            value={sensor.lat}
            onChange={(e) => setSensor({ ...sensor, lat: parseFloat(e.target.value) })}
            className="w-full p-2 rounded bg-gray-800 text-white"
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Longitude</label>
          <input
            type="number"
            value={sensor.lon}
            onChange={(e) => setSensor({ ...sensor, lon: parseFloat(e.target.value) })}
            className="w-full p-2 rounded bg-gray-800 text-white"
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Status</label>
          <select
            value={sensor.status}
            onChange={(e) => setSensor({ ...sensor, status: e.target.value })}
            className="w-full p-2 rounded bg-gray-800 text-white"
          >
            <option value="inactive">Inactive</option>
            <option value="active">Active</option>
            <option value="alert">Alert</option>
          </select>
        </div>
        <button
          onClick={handleSave}
          className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700"
        >
          Save
        </button>
      </div>
    </div>
  );
}