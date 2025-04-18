"use client";

import { useState, useEffect } from "react";
import { FiFilter } from "react-icons/fi";

interface Alert {
  _id: string;
  sensorId: string;
  timestamp: string;
  location: string;
  readings: {
    temperature: number;
    motion: boolean;
  };
  alert: {
    type: string;
    confidence: number;
    viewed: boolean;
    severity: string;
  };
}

export default function AlertHistory() {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortBy, setSortBy] = useState("newest");
  const [filterBy, setFilterBy] = useState("all");

  useEffect(() => {
    fetchAlerts();
  }, []); // Fetch on component mount

  const fetchAlerts = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/sensorData');
      if (!response.ok) throw new Error('Failed to fetch alerts');
      
      const data = await response.json();
      // Filter only entries with alerts
      const alertsData = data.filter((item: Alert) => item.alert);
      setAlerts(alertsData);
    } catch (error) {
      console.error('Error fetching alerts:', error);
    } finally {
      setLoading(false);
    }
  };

  const getFilteredAndSortedAlerts = () => {
    let filtered = [...alerts];

    // Apply filters
    if (filterBy !== "all") {
      filtered = filtered.filter(alert => {
        switch (filterBy) {
          case "unread": return !alert.alert.viewed;
          case "high_severity": return alert.alert.severity === "high";
          case "motion": return alert.readings.motion;
          default: return true;
        }
      });
    }

    // Apply sorting
    return filtered.sort((a, b) => {
      switch (sortBy) {
        case "newest":
          return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
        case "oldest":
          return new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime();
        case "confidence":
          return b.alert.confidence - a.alert.confidence;
        case "sensor":
          return a.sensorId.localeCompare(b.sensorId);
        default:
          return 0;
      }
    });
  };

  // Test if data is being fetched
  useEffect(() => {
    console.log('Current alerts:', alerts);
  }, [alerts]);

  return (
    <div className="p-6 bg-black min-h-screen">
      <h1 className="text-3xl font-bold mb-6 text-white text-center">📜 Alert History</h1>

      <div className="max-w-6xl mx-auto mb-6 bg-gray-800 p-4 rounded-lg">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-400 mb-2">Sort By</label>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="w-full p-2 bg-gray-700 text-white rounded border border-gray-600"
            >
              <option value="newest">Newest First</option>
              <option value="oldest">Oldest First</option>
              <option value="confidence">Confidence</option>
              <option value="sensor">Sensor ID</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-400 mb-2">Filter By</label>
            <select
              value={filterBy}
              onChange={(e) => setFilterBy(e.target.value)}
              className="w-full p-2 bg-gray-700 text-white rounded border border-gray-600"
            >
              <option value="all">All Alerts</option>
              <option value="unread">Unread Only</option>
              <option value="high_severity">High Severity</option>
              <option value="motion">Motion Detected</option>
            </select>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="text-white text-center">Loading alerts...</div>
      ) : alerts.length === 0 ? (
        <div className="text-white text-center">No alerts found</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 max-w-6xl mx-auto">
          {getFilteredAndSortedAlerts().map((alert) => (
            <div 
              key={alert._id}
              className={`p-4 rounded-lg shadow-lg transition-all duration-200 ${
                alert.alert.viewed ? 'bg-gray-800' : 'bg-red-900/50 border border-red-500'
              }`}
            >
              <div className="flex justify-between items-start mb-3">
                <div className="text-lg font-semibold text-white">
                  Sensor {alert.sensorId}
                </div>
                {!alert.alert.viewed && (
                  <span className="px-2 py-1 text-xs bg-red-500 text-white rounded-full">
                    New
                  </span>
                )}
              </div>
              <div className="space-y-2 text-gray-300">
                <p>📍 {alert.location}</p>
                <p>⏰ {new Date(alert.timestamp).toLocaleString()}</p>
                <p>⚠️ {alert.alert.type}</p>
                <p>🎯 Confidence: {alert.alert.confidence}%</p>
                <p>🔔 Severity: {alert.alert.severity}</p>
                {alert.readings.motion && <p>🏃 Motion Detected</p>}
                <p> Temperature: {alert.readings.temperature}°C</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}