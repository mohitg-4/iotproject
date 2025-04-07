"use client";

import { useState } from "react";

const alertHistory = [
  { id: 1, location: "Sector 3", sensorID: "SN-102", triggerTime: "10:15 AM", confidence: 92 },
  { id: 2, location: "Sector 7", sensorID: "SN-205", triggerTime: "12:45 PM", confidence: 85 },
  { id: 3, location: "Sector 5", sensorID: "SN-303", triggerTime: "3:30 PM", confidence: 78 },
];

export default function AlertHistory() {
  const [sortBy, setSortBy] = useState("recency");

  // Sorting Logic
  const sortedAlerts = [...alertHistory].sort((a, b) => {
    if (sortBy === "confidence") return b.confidence - a.confidence;
    return a.triggerTime.localeCompare(b.triggerTime);
  });

  return (
    <div className="p-6">
      <h1 className="text-3xl font-bold mb-6">📜 Alert History</h1>

      {/* Sort Options */}
      <div className="mb-4">
        <label className="mr-2 text-lg">Sort By:</label>
        <select
          onChange={(e) => setSortBy(e.target.value)}
          className="p-2 bg-gray-800 text-white rounded-lg"
        >
          <option value="recency">Recency</option>
          <option value="confidence">Trigger Confidence</option>
        </select>
      </div>

      {/* Alert List */}
      <div className="space-y-4">
        {sortedAlerts.map((alert) => (
          <div key={alert.id} className="bg-gray-800 p-4 rounded-lg shadow-lg">
            <p><strong>📍 Location:</strong> {alert.location}</p>
            <p><strong>🆔 Sensor ID:</strong> {alert.sensorID}</p>
            <p><strong>⏰ Time:</strong> {alert.triggerTime}</p>
            <p><strong>⚠️ Confidence:</strong> {alert.confidence}%</p>
          </div>
        ))}
      </div>
    </div>
  );
}
