"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Sidebar from "../components/Sidebar";

interface AlertStats {
  unreadCount: number;
  mostRecentTime: string;
  oldestTime: string;
}

interface SensorStats {
  total: number;
  active: number;
  inactive: number;
  alerted: number;
}

interface AnimalStats {
  total: number;
  safe: number;
  unsafe: number;
  lastUpdate: string;
}

export default function Dashboard() {
  const router = useRouter();
  const [isClicked, setIsClicked] = useState(false);
  const [isSidebarVisible, setIsSidebarVisible] = useState(false);
  const [alertStats, setAlertStats] = useState<AlertStats>({
    unreadCount: 0,
    mostRecentTime: '',
    oldestTime: ''
  });
  const [sensorStats, setSensorStats] = useState<SensorStats>({
    total: 0,
    active: 0,
    inactive: 0,
    alerted: 0
  });
  const [animalStats, setAnimalStats] = useState<AnimalStats>({
    total: 0,
    safe: 0,
    unsafe: 0,
    lastUpdate: ''
  });

  useEffect(() => {
    const fetchStats = async () => {
      try {
        // Fetch sensor stats
        const sensorsResponse = await fetch('/api/sensors');
        const sensors = await sensorsResponse.json();
        
        setSensorStats({
          total: sensors.length,
          active: sensors.filter((s: any) => s.status === 'active').length,
          inactive: sensors.filter((s: any) => s.status === 'inactive').length,
          alerted: sensors.filter((s: any) => s.status === 'alert').length
        });

        // Fetch alert stats
        const alertsResponse = await fetch('/api/alerts/stats');
        const alertData = await alertsResponse.json();
        
        setAlertStats(alertData);
        
        // Fetch animal stats
        const animalsResponse = await fetch('/api/animals');
        const animals = await animalsResponse.json();
        
        if (animals && animals.length > 0) {
          // Calculate safe vs unsafe animals
          const safeAnimals = animals.filter((animal: any) => {
            // Calculate if animal is within safe area using Haversine formula
            const { lat, lon } = animal.last_attributes;
            const { lat: safeLat, lon: safeLon, radius } = animal.safe_area;
            
            const R = 6371e3; // Earth's radius in meters
            const φ1 = (lat * Math.PI) / 180;
            const φ2 = (safeLat * Math.PI) / 180;
            const Δφ = ((safeLat - lat) * Math.PI) / 180;
            const Δλ = ((safeLon - lon) * Math.PI) / 180;

            const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
                      Math.cos(φ1) * Math.cos(φ2) *
                      Math.sin(Δλ/2) * Math.sin(Δλ/2);
            const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
            const distance = R * c; // in meters

            return distance <= radius;
          });
          
          const now = new Date();
          
          setAnimalStats({
            total: animals.length,
            safe: safeAnimals.length,
            unsafe: animals.length - safeAnimals.length,
            lastUpdate: now.toLocaleTimeString()
          });
        }
      } catch (error) {
        console.error('Error fetching statistics:', error);
      }
    };

    fetchStats();
    
    // Set up refresh interval (every minute)
    const intervalId = setInterval(fetchStats, 60000);
    
    // Clean up interval on component unmount
    return () => clearInterval(intervalId);
  }, []);

  const handleClick = () => {
    setIsClicked(true);
    setTimeout(() => {
      setIsClicked(false);
      router.push("/"); // Navigate to landing page
    }, 200);
  };

  return (
    <div className="p-6 bg-black min-h-screen">
      <div className={`fixed top-0 left-0 h-full transition-transform duration-300 ${
        isSidebarVisible ? 'translate-x-0' : '-translate-x-full'
      }`}>
        <Sidebar />
      </div>

      {/* Header Box */}
      <div className="bg-gray-800 rounded-xl p-6 mb-8 max-w-7xl mx-auto">
        <div className="flex justify-between items-center">
          <button
            onClick={handleClick}
            className={`px-4 py-2 bg-gray-700 text-white rounded-full hover:bg-gray-600 cursor-pointer text-sm ${
              isClicked ? "animate-grow-shrink" : ""
            }`}
          >
            ← Back
          </button>
          <h1 className="text-4xl font-bold text-white">Dashboard</h1>
          <div className="w-[72px]"></div>
        </div>
      </div>

      {/* Main Content Box */}
      <div className="bg-gray-900 rounded-xl p-8 max-w-7xl mx-auto">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {/* Alerts Box */}
          <Link href="/alerts" className="block">
            <div className="bg-gray-800 rounded-xl p-6 hover:bg-gray-700 transition-all min-h-[250px] aspect-square">
              <h2 className="text-2xl font-bold text-white mb-4">Alerts</h2>
              <div className="space-y-3">
                <div className="flex justify-between text-gray-300">
                  <span>Unread Alerts:</span>
                  <span className="font-bold text-red-400">{alertStats.unreadCount}</span>
                </div>
                <div className="flex justify-between text-gray-300">
                  <span>Most Recent:</span>
                  <span>{alertStats.mostRecentTime || 'N/A'}</span>
                </div>
                <div className="flex justify-between text-gray-300">
                  <span>Oldest Unread:</span>
                  <span>{alertStats.oldestTime || 'N/A'}</span>
                </div>
              </div>
            </div>
          </Link>

          {/* Sensor Map Box */}
          <Link href="/sensor-map" className="block">
            <div className="bg-gray-800 rounded-xl p-6 hover:bg-gray-700 transition-all min-h-[250px] aspect-square">
              <h2 className="text-2xl font-bold text-white mb-4">Sensor Map</h2>
              <div className="space-y-3">
                <div className="flex justify-between text-gray-300">
                  <span>Total Sensors:</span>
                  <span className="font-bold">{sensorStats.total}</span>
                </div>
                <div className="flex justify-between text-gray-300">
                  <span>Active:</span>
                  <span className="font-bold text-green-400">{sensorStats.active}</span>
                </div>
                <div className="flex justify-between text-gray-300">
                  <span>Inactive:</span>
                  <span className="font-bold text-yellow-400">{sensorStats.inactive}</span>
                </div>
                <div className="flex justify-between text-gray-300">
                  <span>Alerted:</span>
                  <span className="font-bold text-red-400">{sensorStats.alerted}</span>
                </div>
              </div>
            </div>
          </Link>

          {/* Animal Tracking Box */}
          <Link href="/animalTracker" className="block">
            <div className="bg-gray-800 rounded-xl p-6 hover:bg-gray-700 transition-all min-h-[250px] aspect-square">
              <h2 className="text-2xl font-bold text-white mb-4">Animal Tracking</h2>
              <div className="space-y-3">
                <div className="flex justify-between text-gray-300">
                  <span>Animals Tagged:</span>
                  <span className="font-bold">{animalStats.total}</span>
                </div>
                <div className="flex justify-between text-gray-300">
                  <span>Safe Animals:</span>
                  <span className="font-bold text-green-400">{animalStats.safe}</span>
                </div>
                <div className="flex justify-between text-gray-300">
                  <span>Unsafe Animals:</span>
                  <span className="font-bold text-red-400">{animalStats.unsafe}</span>
                </div>
                <div className="flex justify-between text-gray-300">
                  <span>Last Update:</span>
                  <span>{animalStats.lastUpdate || 'N/A'}</span>
                </div>
              </div>
            </div>
          </Link>
        </div>
      </div>
    </div>
  );
}