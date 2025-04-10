"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

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
  sensorDetails?: {
    lat: number;
    lon: number;
    zone: string;
  };
}

export default function Alerts() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState("recent");
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortBy, setSortBy] = useState("newest");
  const [filterBy, setFilterBy] = useState("all");

  useEffect(() => {
    fetchAlerts();
  }, []);

  const fetchAlerts = async () => {
    try {
      const [sensorsResponse, alertsResponse] = await Promise.all([
        fetch('/api/sensors'),
        fetch('/api/sensorData')
      ]);

      if (!sensorsResponse.ok || !alertsResponse.ok) {
        throw new Error('Failed to fetch data');
      }

      const sensors = await sensorsResponse.json();
      const alertsData = await alertsResponse.json();

      const enrichedAlerts = alertsData
        .filter((item: Alert) => item.alert)
        .map((alert: Alert) => {
          const sensorDetails = sensors.find((s: any) => s.id === alert.sensorId);
          return {
            ...alert,
            sensorDetails: sensorDetails ? {
              lat: sensorDetails.lat,
              lon: sensorDetails.lon,
              zone: sensorDetails.zone || 'Unknown Zone'
            } : undefined
          };
        });

      setAlerts(enrichedAlerts);
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getFilteredAndSortedAlerts = () => {
    let filtered = [...alerts];

    // Apply tab filter
    if (activeTab === "recent") {
      filtered = filtered.filter(alert => !alert.alert.viewed);
    }

    // Apply additional filters for history view
    if (activeTab === "history" && filterBy !== "all") {
      filtered = filtered.filter(alert => {
        switch (filterBy) {
          case "unread": return !alert.alert.viewed;
          case "high_severity": return alert.alert.severity === "high";
          case "motion": return alert.readings.motion;
          default: return true;
        }
      });
    }

    // Apply sorting for history view
    if (activeTab === "history") {
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
    }

    return filtered;
  };

  const handleBack = () => {
    router.push("/dashboard");
  };

  return (
    <div className="p-6">
      {/* Back Button and Header */}
      <div className="max-w-4xl mx-auto mb-8">
        <div className="flex items-center justify-between">
          <button
            onClick={handleBack}
            className="px-4 py-2 bg-gray-700 text-white rounded-full hover:bg-gray-600 transition-colors duration-200"
          >
            ← Back
          </button>
          <h1 className="text-3xl font-bold text-white">Alerts Dashboard</h1>
          <div className="w-[88px]"></div> {/* Spacer for alignment */}
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="flex justify-center mb-6">
        <div className="inline-flex space-x-4 bg-gray-900 p-2 rounded-lg">
          <button 
            onClick={() => setActiveTab("recent")} 
            className={`px-6 py-3 rounded-lg transition-colors duration-200 ${
              activeTab === "recent" ? "bg-red-600 text-white" : "bg-gray-800 text-gray-300 hover:bg-gray-700 cursor-pointer"
            }`}
          >
            Unread
          </button>
          <button 
            onClick={() => setActiveTab("history")} 
            className={`px-6 py-3 rounded-lg transition-colors duration-200 ${
              activeTab === "history" ? "bg-red-600 text-white" : "bg-gray-800 text-gray-300 hover:bg-gray-700 cursor-pointer"
            }`}
          >
            History
          </button>
          <button 
            onClick={() => setActiveTab("settings")} 
            className={`px-6 py-3 rounded-lg transition-colors duration-200 ${
              activeTab === "settings" ? "bg-red-600 text-white" : "bg-gray-800 text-gray-300 hover:bg-gray-700 cursor-pointer"
            }`}
          >
            Settings
          </button>
        </div>
      </div>

      {/* Sort and Filter Controls for History View */}
      {activeTab === "history" && (
        <div className="max-w-4xl mx-auto mb-6 bg-gray-800 p-4 rounded-lg">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
      )}

      {/* Alerts Display - modified for scrolling */}
      <div className="max-w-4xl mx-auto bg-gray-800 p-6 rounded-lg shadow-lg">
        {loading ? (
          <div className="text-white text-center">Loading alerts...</div>
        ) : (
          <div className="space-y-4">
            <div className="grid gap-4 max-h-[60vh] overflow-y-auto scrollbar-thin scrollbar-thumb-gray-600 scrollbar-track-gray-800"> {/* Added scrollbar styles */}
              {getFilteredAndSortedAlerts().map((alert) => (
                <div 
                  key={alert._id}
                  className={`bg-gray-700 p-4 rounded-lg ${
                    alert.alert.viewed ? 'border-l-4 border-gray-500' : 'border-l-4 border-red-500'
                  }`}
                >
                  <div className="flex justify-between items-start mb-2">
                    <h3 className="text-lg font-semibold text-white">
                      Sensor {alert.sensorId}
                    </h3>
                    <span className="text-sm text-gray-300">
                      {formatDate(alert.timestamp)}
                    </span>
                  </div>
                  <div className="space-y-2 text-gray-300">
                    <p>Location: {alert.location}</p>
                    {alert.sensorDetails && (
                      <p>Zone: {alert.sensorDetails.zone} (Lat: {alert.sensorDetails.lat}, Lon: {alert.sensorDetails.lon})</p>
                    )}
                    <p>{alert.alert.type} (Confidence: {alert.alert.confidence}%)</p>
                    <p>Severity: {alert.alert.severity}</p>
                    {alert.readings.motion && <p>Motion Detected</p>}
                    <p>Temperature: {alert.readings.temperature}°C</p>
                  </div>
                </div>
              ))}
            </div>
            {activeTab === "settings" && (
              <div className="text-gray-300">
                <h2 className="text-xl font-bold mb-4">Alert Settings</h2>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
