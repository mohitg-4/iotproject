"use client";

import { useState, useEffect } from "react";
import { FiFilter } from "react-icons/fi";

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

export default function AlertHistory() {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortBy, setSortBy] = useState("newest");
  const [filterBy, setFilterBy] = useState("all");

  useEffect(() => {
    fetchAlerts();
  }, []);

  const fetchAlerts = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/sensorData');
      if (!response.ok) throw new Error('Failed to fetch alerts');
      
      const data = await response.json();
      setAlerts(data);
    } catch (error) {
      console.error('Error fetching alerts:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleAlertClick = async (alert: Alert, index: number) => {
    if (!alert.sensorData.viewed) {
      try {
        // Update the alert in the database
        const response = await fetch(`/api/sensorData/${alert.sensorData._id}`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            "sensorData.viewed": true
          }),
        });

        if (!response.ok) {
          throw new Error('Failed to update alert');
        }

        // Update the local state
        setAlerts(prevAlerts => {
          const newAlerts = [...prevAlerts];
          newAlerts[index] = {
            ...newAlerts[index],
            sensorData: {
              ...newAlerts[index].sensorData,
              viewed: true
            }
          };
          return newAlerts;
        });
      } catch (error) {
        console.error('Error updating alert:', error);
      }
    }
  };

  const handleMarkAllAsViewed = async () => {
    // Get all unviewed alerts
    const unviewedAlerts = alerts.filter(alert => !alert.sensorData.viewed);
    
    if (unviewedAlerts.length === 0) return;
    
    try {
      // Update all alerts in the database
      const promises = unviewedAlerts.map(alert => 
        fetch(`/api/sensorData/${alert.sensorData._id}`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            "sensorData.viewed": true
          }),
        })
      );
      
      await Promise.all(promises);
      
      // Update local state
      setAlerts(prevAlerts => 
        prevAlerts.map(alert => ({
          ...alert,
          sensorData: {
            ...alert.sensorData,
            viewed: alert.sensorData.viewed ? true : true // Set all to viewed
          }
        }))
      );
    } catch (error) {
      console.error('Error marking all alerts as viewed:', error);
    }
  };

  const getFilteredAndSortedAlerts = () => {
    let filtered = [...alerts];

    // Apply filters
    if (filterBy !== "all") {
      filtered = filtered.filter(alert => {
        switch (filterBy) {
          case "poaching": 
            return alert.sensorData.alertType === "Poaching alert";
          case "aok": 
            return alert.sensorData.alertType === "AOK";
          case "unread":
            return !alert.sensorData.viewed;
          case "read":
            return alert.sensorData.viewed;
          case "video_available": 
            return alert.sensorData.videoData.available;
          case "audio_available": 
            return alert.sensorData.audioData.available;
          default: 
            return true;
        }
      });
    }

    // Apply sorting
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
  };

  const unreadCount = alerts.filter(alert => !alert.sensorData.viewed).length;

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
              <option value="poaching">Poaching Alerts</option>
              <option value="aok">All OK</option>
              <option value="unread">Unread ({unreadCount})</option>
              <option value="read">Read</option>
              <option value="video_available">Video Available</option>
              <option value="audio_available">Audio Available</option>
            </select>
          </div>
          
          <div className="flex items-end">
            {unreadCount > 0 && (
              <button
                onClick={handleMarkAllAsViewed}
                className="w-full p-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
              >
                Mark All as Read
              </button>
            )}
          </div>
        </div>
      </div>

      {loading ? (
        <div className="text-white text-center">Loading alerts...</div>
      ) : alerts.length === 0 ? (
        <div className="text-white text-center">No alerts found</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 max-w-6xl mx-auto">
          {getFilteredAndSortedAlerts().map((alert, index) => (
            <div 
              key={alert.sensorData._id || index}
              className={`p-4 rounded-lg shadow-lg transition-all duration-200 cursor-pointer ${
                alert.sensorData.alertType === "AOK" 
                  ? 'bg-gray-800' 
                  : !alert.sensorData.viewed 
                    ? 'bg-red-900/50 border border-red-500' 
                    : 'bg-red-900/30 border border-red-300'
              }`}
              onClick={() => handleAlertClick(alert, index)}
            >
              <div className="flex justify-between items-start mb-3">
                <div className="text-lg font-semibold text-white">
                  Sensor {alert.sensorData.sensorId}
                </div>
                <div className="flex items-center space-x-2">
                  {!alert.sensorData.viewed && (
                    <span className="px-2 py-1 text-xs bg-blue-500 text-white rounded-full">
                      New
                    </span>
                  )}
                  {alert.sensorData.alertType === "Poaching alert" && (
                    <span className="px-2 py-1 text-xs bg-red-500 text-white rounded-full">
                      Alert
                    </span>
                  )}
                </div>
              </div>
              <div className="space-y-2 text-gray-300">
                <p>⏰ {new Date(alert.sensorData.timestamp).toLocaleString()}</p>
                <p>⚠️ {alert.sensorData.alertType}</p>
                
                <div className="mt-3">
                  <p className="font-semibold">Media Captured:</p>
                  <p>📹 Video: {alert.sensorData.videoData.available ? 'Available' : 'Not available'}</p>
                  <p>🔊 Audio: {alert.sensorData.audioData.available ? 'Available' : 'Not available'}</p>
                </div>
                
                {alert.sensorData.videoData.available && (
                  <div className="mt-2">
                    <p className="text-sm text-gray-400">Video data available</p>
                  </div>
                )}
                
                {alert.sensorData.audioData.available && (
                  <div className="mt-2">
                    <p className="text-sm text-gray-400">Audio data available</p>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
