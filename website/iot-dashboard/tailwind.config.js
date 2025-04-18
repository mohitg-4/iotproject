module.exports = {
    darkMode: "class",
    content: [
      "./pages/**/*.{js,ts,jsx,tsx}",
      "./components/**/*.{js,ts,jsx,tsx}"
    ],
    theme: {
      extend: {
        colors: {
          background: "#0F172A", // Dark mode background
          foreground: "#F8FAFC", // Text color
          accent: "#4F4688", // Accent color
        },
      },
    },
    plugins: [],
  };
  