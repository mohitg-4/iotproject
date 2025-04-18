"use client";

import { useState, useEffect } from "react";

const ThemeToggle = () => {
  const [theme, setTheme] = useState("dark");

  useEffect(() => {
    document.documentElement.classList.add(theme);
  }, [theme]);

  return (
    <button 
      onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
      className="fixed bottom-5 right-5 bg-accent p-2 rounded text-white hover:text-gray-900 transition-colors duration-300 cursor-pointer shadow-lg"
    >
      Toggle Theme
    </button>
  );
};

export default ThemeToggle;
