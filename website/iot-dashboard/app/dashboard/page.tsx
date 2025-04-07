"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

export default function Dashboard() {
  const router = useRouter();
  const [isClicked, setIsClicked] = useState(false); // State to track button click

  const handleClick = () => {
    setIsClicked(true); // Set clicked state to true
    setTimeout(() => setIsClicked(false), 200); // Reset state after animation duration
    router.push("/"); // Navigate to the main webpage
  };

  return (
    <div className="p-6">
      {/* Back to Main Webpage Button */}
      <button
        onClick={handleClick}
        className={`mb-4 px-4 py-2 bg-gray-800 text-white rounded-full hover:bg-gray-700 cursor-pointer text-sm ${
          isClicked ? "animate-grow-shrink" : ""
        }`}
      >
        ← Back
      </button>

      <h1 className="text-4xl font-bold mb-12 text-center tracking-wide">Dashboard</h1>

      {/* Separator Line */}
      <hr className="border-t-2 border-gray-700 mb-8 mx-auto w-3/4" />

      {/* Alerts Tile */}
      <Link
        href="/alerts"
        className="block bg-[#9e2e2e] text-white p-6 rounded-3xl shadow-lg text-center hover:bg-[#1f1f1f] transition-all mb-2 w-3/4 mx-auto"
      >
        <h2 className="text-xl font-bold">Alerts</h2>
        <p className="text-sm">Check recent alerts and history</p>
      </Link>
      <Link
        href="/sensor-map"
        className="block bg-[#7f222e] text-white p-6 rounded-3xl shadow-lg text-center hover:bg-[#1f1f1f] transition-all mb-2 w-3/4 mx-auto"
      >
        <h2 className="text-xl font-bold">Sensor Map</h2>
        <p className="text-sm">View and Edit sensor spatial data</p>
      </Link>
    </div>
  );
}