"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Sensor } from "@/types/sensor";

export default function EditSensor() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const sensorId = searchParams.get("sensorId") || "";
  const lat = searchParams.get("lat") || "";
  const lon = searchParams.get("lon") || "";

  const [sensor, setSensor] = useState<Sensor>({
    id: sensorId || "",
    lat: lat ? parseFloat(lat) : 0,
    lon: lon ? parseFloat(lon) : 0,
    status: "inactive",
  });

  const handleSave = async () => {
    try {
      const method = sensorId ? 'PUT' : 'POST';
      const response = await fetch('/api/sensors', {
        method,
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(sensor),
      });

      if (!response.ok) throw new Error('Failed to save sensor');
      router.push('/sensor-map');
    } catch (error) {
      console.error('Error saving sensor:', error);
    }
  };

  const getStatusButtonClass = (status: string) => {
    const baseClass = "px-4 py-2 rounded-lg font-medium transition-colors duration-200 ";
    if (sensor.status === status) {
      switch (status) {
        case "active":
          return baseClass + "bg-green-600 text-white";
        case "inactive":
          return baseClass + "bg-gray-600 text-white";
        case "alert":
          return baseClass + "bg-red-600 text-white";
      }
    }
    return baseClass + "bg-gray-700 text-gray-300 hover:bg-gray-600";
  };

  return (
    <div className="min-h-screen bg-black flex items-center justify-center p-4">
      <div className="bg-gray-900 rounded-xl shadow-xl w-full max-w-md p-8">
        <div className="flex justify-between items-center mb-8">
          <button
            onClick={() => router.push("/sensor-map")}
            className="text-gray-400 hover:text-white transition-colors duration-200"
          >
            ← Back
          </button>
          <h1 className="text-2xl font-bold text-white">
            {sensorId ? "Edit Sensor" : "Add New Sensor"}
          </h1>
        </div>

        <div className="space-y-6">
          <div>
            <label className="block text-gray-300 text-sm font-medium mb-2">Sensor ID</label>
            <input
              type="text"
              value={sensor.id}
              onChange={(e) => setSensor({ ...sensor, id: e.target.value })}
              className="w-full p-3 rounded-lg bg-gray-700 text-white border border-gray-600 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none transition-all duration-200"
            />
          </div>

          <div>
            <label className="block text-gray-300 text-sm font-medium mb-2">Latitude</label>
            <input
              type="number"
              value={sensor.lat}
              onChange={(e) => setSensor({ ...sensor, lat: parseFloat(e.target.value) })}
              className="w-full p-3 rounded-lg bg-gray-700 text-white border border-gray-600 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none transition-all duration-200"
            />
          </div>

          <div>
            <label className="block text-gray-300 text-sm font-medium mb-2">Longitude</label>
            <input
              type="number"
              value={sensor.lon}
              onChange={(e) => setSensor({ ...sensor, lon: parseFloat(e.target.value) })}
              className="w-full p-3 rounded-lg bg-gray-700 text-white border border-gray-600 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none transition-all duration-200"
            />
          </div>

          <div>
            <label className="block text-gray-300 text-sm font-medium mb-2">Status</label>
            <div className="grid grid-cols-3 gap-3">
              <button
                onClick={() => setSensor({ ...sensor, status: "inactive" })}
                className={getStatusButtonClass("inactive")}
              >
                Inactive
              </button>
              <button
                onClick={() => setSensor({ ...sensor, status: "active" })}
                className={getStatusButtonClass("active")}
              >
                Active
              </button>
              <button
                onClick={() => setSensor({ ...sensor, status: "alert" })}
                className={getStatusButtonClass("alert")}
              >
                Alert
              </button>
            </div>
          </div>

          <button
            onClick={handleSave}
            className="w-full mt-8 px-4 py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors duration-200"
          >
            Save Changes
          </button>
        </div>
      </div>
    </div>
  );
}