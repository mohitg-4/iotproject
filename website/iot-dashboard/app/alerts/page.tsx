"use client";

import { useState } from "react";
import Link from "next/link";

export default function Alerts() {
  const [activeTab, setActiveTab] = useState("recent");

  return (
    <div className="p-6">
      <h1 className="text-3xl font-bold mb-6">🚨 Alerts</h1>

      {/* Tabs Navigation */}
      <div className="flex space-x-4 mb-6">
        <button onClick={() => setActiveTab("recent")} className={`px-4 py-2 rounded-lg ${activeTab === "recent" ? "bg-red-600 text-white" : "bg-gray-800 text-gray-300"}`}>
          Recent Alert
        </button>
        <button onClick={() => setActiveTab("history")} className={`px-4 py-2 rounded-lg ${activeTab === "history" ? "bg-red-600 text-white" : "bg-gray-800 text-gray-300"}`}>
          Alert History
        </button>
        <button onClick={() => setActiveTab("settings")} className={`px-4 py-2 rounded-lg ${activeTab === "settings" ? "bg-red-600 text-white" : "bg-gray-800 text-gray-300"}`}>
          Alert Settings
        </button>
      </div>

      {/* Tab Content */}
      <div className="bg-gray-800 p-6 rounded-lg shadow-lg">
        {activeTab === "recent" && <p>📍 Recent alert details will be shown here.</p>}
        {activeTab === "history" && <p>📜 Alert history list will be displayed here.</p>}
        {activeTab === "settings" && <p>⚙️ Alert settings options will be configured here.</p>}
      </div>
    </div>
  );
}
