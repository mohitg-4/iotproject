"use client";

import { useState } from "react";
import Link from "next/link";
import { FiMenu, FiX, FiHome, FiBook, FiSettings, FiAlertTriangle } from "react-icons/fi";

const Sidebar = () => {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      {/* Sidebar Toggle Button */}
      <button
        className="fixed top-6 left-6 z-30 p-2 bg-accent text-white rounded-full shadow-lg hover:text-red-500 transition-all cursor-pointer"
        onClick={() => setIsOpen(!isOpen)}
      >
        {isOpen ? <FiX size={24} /> : <FiMenu size={24} />}
      </button>

      {/* Sidebar Navigation */}
      <aside
        className={`fixed left-0 top-0 h-full w-64 bg-background/90 backdrop-blur-lg shadow-xl transition-transform duration-300 ${
          isOpen ? "translate-x-0" : "-translate-x-72"
        }`}
      >


        <nav className="space-y-4 p-6 mt-16">
          <ul className="space-y-2">
            <li>
              <Link
                href="/dashboard"
                className="group flex items-center gap-3 px-4 py-3 text-lg rounded-lg hover:bg-accent/50 transition-all"
              >
                <FiHome
                  size={20}
                  className="text-white group-hover:text-yellow-400 transition-all"
                />
                <span className="group-hover:text-yellow-400 transition-all">Dashboard</span>
              </Link>
            </li>
            <li>
              <Link
                href="/how-to-use"
                className="group flex items-center gap-3 px-4 py-3 text-lg rounded-lg hover:bg-accent/50 transition-all"
              >
                <FiBook
                  size={20}
                  className="text-white group-hover:text-blue-400 transition-all"
                />
                <span className="group-hover:text-blue-400 transition-all">How to Use</span>
              </Link>
            </li>
            <li>
              <Link
                href="/settings"
                className="group flex items-center gap-3 px-4 py-3 text-lg rounded-lg hover:bg-accent/50 transition-all"
              >
                <FiSettings
                  size={20}
                  className="text-white group-hover:text-green-400 transition-all"
                />
                <span className="group-hover:text-green-400 transition-all">Settings</span>
              </Link>
            </li>
            <li>
              <Link
                href="/emergency"
                className="group flex items-center gap-3 px-4 py-3 text-lg rounded-lg hover:bg-accent/50 transition-all"
              >
                <FiAlertTriangle
                  size={20}
                  className="text-white group-hover:text-red-400 transition-all"
                />
                <span className="group-hover:text-red-400 transition-all">Emergency</span>
              </Link>
            </li>
          </ul>
        </nav>
      </aside>
    </>
  );
};

export default Sidebar;