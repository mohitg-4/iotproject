"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

interface SensorData {
  timestamp: Date;
  sensorId: string;
  alertType: "AOK" | "Poaching alert";
  videoData: {
    available: boolean;
    data: string;
  };
  audioData: {
    available: boolean;
    data: string;
  };
  viewed: boolean;
  _id?: string;
}

interface Alert {
  sensorData: SensorData;
}

interface Sensor {
  id: string;
  lat: number;
  lon: number;
  status: string;
  _id?: string;
}

interface EnrichedAlert extends Alert {
  sensorDetails?: {
    lat: number;
    lon: number;
    status: string;
  };
}

export default function Alerts() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState("recent");
  const [alerts, setAlerts] = useState<EnrichedAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortBy, setSortBy] = useState("newest");
  const [filterBy, setFilterBy] = useState("all");
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    fetchAlerts();
  }, []);

  // Calculate unread count whenever alerts change
  useEffect(() => {
    const count = alerts.filter(alert => !alert.sensorData.viewed && alert.sensorData.alertType != 'AOK').length;
    setUnreadCount(count);
  }, [alerts]);

  const fetchAlerts = async () => {
    try {
      const [sensorsResponse, alertsResponse] = await Promise.all([
        fetch('/api/sensors'),
        fetch('/api/sensorData')
      ]);

      if (!sensorsResponse.ok || !alertsResponse.ok) {
        throw new Error('Failed to fetch data');
      }

      const sensors: Sensor[] = await sensorsResponse.json();
      const alertsData: Alert[] = await alertsResponse.json();

      // Enrich alerts with sensor details
      const enrichedAlerts: EnrichedAlert[] = alertsData.map((alert: Alert) => {
        const sensorDetails = sensors.find((s: Sensor) => s.id === alert.sensorData.sensorId);
        return {
          ...alert,
          sensorDetails: sensorDetails ? {
            lat: sensorDetails.lat,
            lon: sensorDetails.lon,
            status: sensorDetails.status
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

  // Function to mark an alert as viewed
  const handleMarkAsRead = async (alertId: string | undefined, index: number) => {
    if (!alertId) return;

    try {
      // API call to update the alert in the database
      const response = await fetch(`/api/alerts/${alertId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          "sensorData.viewed": true
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to update alert status');
      }

      // Update the local state
      setAlerts(prevAlerts => {
        const newAlerts = [...prevAlerts];
        if (newAlerts[index] && newAlerts[index].sensorData) {
          newAlerts[index].sensorData.viewed = true;
        }
        return newAlerts;
      });
    } catch (error) {
      console.error('Error marking alert as read:', error);
    }
  };

  // Function to mark all alerts as viewed
  const handleMarkAllAsRead = async () => {
    const unviewedAlerts = alerts.filter(alert => !alert.sensorData.viewed);
    if (unviewedAlerts.length === 0) return;

    try {
      // Create an array of promises for each update request
      const updatePromises = unviewedAlerts.map(alert => 
        fetch(`/api/alerts/${alert.sensorData._id}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            "sensorData.viewed": true
          }),
        })
      );

      // Wait for all requests to complete
      await Promise.all(updatePromises);

      // Update the local state
      setAlerts(prevAlerts => 
        prevAlerts.map(alert => ({
          ...alert,
          sensorData: {
            ...alert.sensorData,
            viewed: true
          }
        }))
      );
    } catch (error) {
      console.error('Error marking all alerts as read:', error);
    }
  };

  const formatDate = (dateString: Date) => {
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
      filtered = filtered.filter(alert => 
        alert.sensorData.alertType === "Poaching alert" && !alert.sensorData.viewed
      );
    }

    // Apply additional filters for history view
    if (activeTab === "history" && filterBy !== "all") {
      filtered = filtered.filter(alert => {
        switch (filterBy) {
          case "unread": 
            return alert.sensorData.viewed === false;
          case "read":
            return alert.sensorData.viewed === true;
          case "aok": 
            return alert.sensorData.alertType === "AOK";
          case "poaching":
            return alert.sensorData.alertType === "Poaching alert";
          case "video_available":
            return alert.sensorData.videoData.available;
          case "audio_available": 
            return alert.sensorData.audioData.available;
          default: 
            return true;
        }
      });
    }

    // Apply sorting for history view
    if (activeTab === "history") {
      return filtered.sort((a, b) => {
        const timestampA = new Date(a.sensorData.timestamp).getTime();
        const timestampB = new Date(b.sensorData.timestamp).getTime();
        
        switch (sortBy) {
          case "newest":
            return timestampB - timestampA;
          case "oldest":
            return timestampA - timestampB;
          case "sensor":
            return a.sensorData.sensorId.localeCompare(b.sensorData.sensorId);
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
            className={`px-6 py-3 rounded-lg transition-colors duration-200 relative ${
              activeTab === "recent" ? "bg-red-600 text-white" : "bg-gray-800 text-gray-300 hover:bg-gray-700 cursor-pointer"
            }`}
          >
            Unread
            {unreadCount > 0 && (
              <span className="absolute -top-2 -right-2 bg-red-500 text-white text-xs rounded-full w-6 h-6 flex items-center justify-center">
                {unreadCount}
              </span>
            )}
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
                <option value="unread">Unread ({unreadCount})</option>
                <option value="read">Read</option>
                <option value="poaching">Poaching Alerts</option>
                <option value="aok">All OK</option>
                <option value="video_available">Video Available</option>
                <option value="audio_available">Audio Available</option>
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
            {/* Mark All as Read button */}
            {activeTab === "recent" && unreadCount > 0 && (
              <button
                onClick={handleMarkAllAsRead}
                className="w-full py-2 px-4 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors mb-4"
              >
                Mark All as Read
              </button>
            )}
            
            <div className="grid gap-4 max-h-[60vh] overflow-y-auto scrollbar-thin scrollbar-thumb-gray-600 scrollbar-track-gray-800">
              {getFilteredAndSortedAlerts().length === 0 ? (
                <div className="text-white text-center py-4">
                  {activeTab === "recent" ? "No unread alerts" : "No alerts match your filter criteria"}
                </div>
              ) : (
                getFilteredAndSortedAlerts().map((alert, index) => (
                  <div 
                    key={alert.sensorData._id || index}
                    className={`bg-gray-700 p-4 rounded-lg cursor-pointer ${
                      alert.sensorData.alertType === "AOK" 
                        ? 'border-l-4 border-gray-500' 
                        : !alert.sensorData.viewed 
                          ? 'border-l-4 border-red-500' 
                          : 'border-l-4 border-orange-500'
                    }`}
                    onClick={() => handleMarkAsRead(alert.sensorData._id, index)}
                  >
                    <div className="flex justify-between items-start mb-2">
                      <h3 className="text-lg font-semibold text-white flex items-center">
                        Sensor: {alert.sensorData.sensorId}
                        {!alert.sensorData.viewed && (
                          <span className="ml-2 px-2 py-1 text-xs bg-blue-500 text-white rounded-full">
                            New
                          </span>
                        )}
                      </h3>
                      <span className="text-sm text-gray-300">
                        {formatDate(alert.sensorData.timestamp)}
                      </span>
                    </div>
                    <div className="space-y-2 text-gray-300">
                      {alert.sensorDetails && (
                        <p>Status: {alert.sensorDetails.status} (Lat: {alert.sensorDetails.lat}, Lon: {alert.sensorDetails.lon})</p>
                      )}
                      <p>Alert Type: {alert.sensorData.alertType}</p>
                      
                      <div className="mt-3">
                        <p className="font-semibold">Media Captured:</p>
                        <p>📹 Video: {alert.sensorData.videoData.available ? 'Available' : 'Not available'}</p>
                        <p>🔊 Audio: {alert.sensorData.audioData.available ? 'Available' : 'Not available'}</p>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
