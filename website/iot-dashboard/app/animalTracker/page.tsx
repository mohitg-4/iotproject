"use client";

import { MapContainer, TileLayer, Marker, Popup, Circle, useMap } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import { useState, useEffect, useRef } from "react";
import L from "leaflet";
import { useRouter } from "next/navigation";
import { FiFilter } from "react-icons/fi";
import { Animal } from "@/types/animal";

// Fix for default marker icons
L.Icon.Default.mergeOptions({
  iconUrl: "https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.7.1/dist/images/marker-shadow.png",
});

// Helper component to get map instance
function MapController({ setMapInstance }: { setMapInstance: React.Dispatch<React.SetStateAction<L.Map | null>> }) {
  const map = useMap();
  
  useEffect(() => {
    setMapInstance(map);
  }, [map, setMapInstance]);
  
  return null;
}

export default function AnimalTracker() {
  const [animals, setAnimals] = useState<Animal[]>([]);
  const [selectedAnimal, setSelectedAnimal] = useState<Animal | null>(null);
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [showFilterDropdown, setShowFilterDropdown] = useState(false);
  const [mapInstance, setMapInstance] = useState<L.Map | null>(null);
  const router = useRouter();

  // Store references to popups
  const popupRefs = useRef<Map<string, L.Popup>>(new Map());

  // Fetch animals data
  useEffect(() => {
    const fetchAnimals = async () => {
      try {
        const response = await fetch('/api/animals');
        if (!response.ok) {
          throw new Error('Failed to fetch animals');
        }
        const data = await response.json();
        setAnimals(data);
      } catch (error) {
        console.error('Error fetching animals:', error);
      }
    };

    fetchAnimals();
  }, []);

  // Calculate if an animal is within its safe area
  const isAnimalSafe = (animal: Animal): boolean => {
    const { lat, lon } = animal.last_attributes;
    const { lat: safeLat, lon: safeLon, radius } = animal.safe_area;
    
    // Calculate distance using Haversine formula
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
  };

  const getColor = (animal: Animal): string => {
    if (selectedAnimal && animal.animal_ID === selectedAnimal.animal_ID) {
      return "#3b82f6"; // Blue for selected animal
    }
    return isAnimalSafe(animal) ? "#00ff00" : "red"; // Green for safe, red for unsafe
  };

  const getIcon = (animal: Animal) => {
    const color = getColor(animal);
    return new L.DivIcon({
      className: "custom-icon",
      html: `<div style="background-color: ${color}; width: 15px; height: 15px; border-radius: 50%; border: 2px solid white;"></div>`,
      iconSize: [15, 15],
      iconAnchor: [7.5, 7.5],
      popupAnchor: [0, -7.5],
    });
  };

  const getFilteredAnimals = () => {
    if (filterStatus === "all") return animals;
    if (filterStatus === "safe") return animals.filter(animal => isAnimalSafe(animal));
    return animals.filter(animal => !isAnimalSafe(animal)); // unsafe
  };

  const safeCount = animals.filter(animal => isAnimalSafe(animal)).length;
  const unsafeCount = animals.length - safeCount;
  const [mapCenter, setMapCenter] = useState<[number, number]>([51.505, -0.09]); // Default location
  
  // Calculate map center based on animals' positions
  useEffect(() => {
    if (animals.length > 0) {
      const totalLat = animals.reduce((sum, animal) => sum + animal.last_attributes.lat, 0);
      const totalLon = animals.reduce((sum, animal) => sum + animal.last_attributes.lon, 0);
      
      setMapCenter([totalLat / animals.length, totalLon / animals.length]);
    }
  }, [animals]);

  const handleAnimalClick = (animal: Animal) => {
    setSelectedAnimal(animal);
    // Open popup for the selected animal
    const popup = popupRefs.current.get(animal.animal_ID);
    if (popup && mapInstance) {
      popup.openOn(mapInstance);
    }
  };

  return (
    <div className="flex h-screen">
      {/* Map Section */}
      <div className="flex-1 bg-black p-4">
        <div className="h-full w-full rounded-xl overflow-hidden border border-gray-800">
          <MapContainer 
            center={mapCenter as [number, number]} 
            zoom={13} 
            className="h-full w-full"
          >
            <MapController setMapInstance={setMapInstance} />
            <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
            {getFilteredAnimals().map((animal) => (
              <div key={animal.animal_ID}>
                <Marker
                  position={[animal.last_attributes.lat, animal.last_attributes.lon]}
                  icon={getIcon(animal)}
                >
                  <Popup
                    ref={(popup) => {
                      if (popup) {
                        popupRefs.current.set(animal.animal_ID, popup);
                      }
                    }}
                  >
                    <div>
                      <strong>Animal ID:</strong> {animal.animal_ID} <br />
                      <strong>Status:</strong> {isAnimalSafe(animal) ? 'Safe' : 'Outside Safe Area'} <br />
                      <strong>Velocity:</strong> {animal.last_attributes.velocity} m/s <br />
                      <strong>Altitude:</strong> {animal.last_attributes.altitude} m
                    </div>
                  </Popup>
                </Marker>
                <Circle 
                  center={[animal.safe_area.lat, animal.safe_area.lon]}
                  radius={animal.safe_area.radius}
                  pathOptions={{
                    // Change border color to blue when selected, otherwise keep safety color
                    color: selectedAnimal?.animal_ID === animal.animal_ID ? 
                           '#3b82f6' : // Blue when selected
                           (isAnimalSafe(animal) ? 'green' : 'red'),
                    weight: selectedAnimal?.animal_ID === animal.animal_ID ? 3 : 2, // Make selected border thicker
                    fillColor: isAnimalSafe(animal) ? 'green' : 'red',
                    fillOpacity: 0.1,
                    opacity: selectedAnimal?.animal_ID === animal.animal_ID ? 0.9 : 0.7, // Make selected border more visible
                    dashArray: selectedAnimal?.animal_ID === animal.animal_ID ? '5, 5' : undefined // Optional: add dashed effect for selection
                  }}
                />
              </div>
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
            <h2 className="text-xl font-bold">Animals</h2>
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
                  setFilterStatus("safe");
                  setShowFilterDropdown(false);
                }}
                className="w-full px-4 py-2 text-left hover:bg-gray-600"
              >
                Safe
              </button>
              <button
                onClick={() => {
                  setFilterStatus("unsafe");
                  setShowFilterDropdown(false);
                }}
                className="w-full px-4 py-2 text-left hover:bg-gray-600"
              >
                Outside Safe Area
              </button>
            </div>
          )}
        </div>

        {/* Stats Section */}
        <div className="bg-gray-800 p-3 rounded-lg mb-4">
          <h3 className="text-sm font-bold mb-2 text-gray-300">Animal Stats</h3>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div className="bg-gray-700 p-2 rounded">
              <div className="text-gray-400">Total</div>
              <div className="font-bold">{animals.length}</div>
            </div>
            <div className="bg-gray-700 p-2 rounded">
              <div className="text-green-400">Safe</div>
              <div className="font-bold">{safeCount}</div>
            </div>
            <div className="bg-gray-700 p-2 rounded">
              <div className="text-red-400">Alerts</div>
              <div className="font-bold">{unsafeCount}</div>
            </div>
          </div>
        </div>

        {/* Animal List */}
        <div className="mb-2 text-sm font-bold text-gray-300">Animal List</div>
        <ul className="space-y-2 overflow-y-auto max-h-[calc(100vh-320px)]">
          {getFilteredAnimals().map((animal) => (
            <li
              key={animal.animal_ID}
              className={`p-2 rounded-lg cursor-pointer flex justify-between items-center group ${
                selectedAnimal?.animal_ID === animal.animal_ID ? "bg-gray-700" : "hover:bg-gray-800"
              }`}
              style={{
                borderRight: `3px solid ${isAnimalSafe(animal) ? "#00ff00" : "red"}`,
              }}
              onClick={() => handleAnimalClick(animal)}
            >
              <div className="flex items-center space-x-2">
                <div>{animal.animal_ID}</div>
              </div>
              <div className="text-xs">
                {isAnimalSafe(animal) ? (
                  <span className="text-green-400">Safe</span>
                ) : (
                  <span className="text-red-400">Alert</span>
                )}
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}