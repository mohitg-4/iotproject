import Sidebar from "./components/Sidebar";
import ThemeToggle from "./components/ThemeToggle";

export default function Home() {
  return (
    <div className="flex min-h-screen bg-gradient-to-br from-gray-900 to-gray-800 text-white transition-colors">
      <Sidebar />
      <main className="flex-1 p-10 pt-24 md:ml-64 transition-all">
        <h1 className="text-4xl font-extrabold mb-6">Welcome to Poachy Preventy</h1>
        <p className="text-lg text-gray-300">
          Monitor and track sensor activity in real-time. Use the sidebar to navigate.
        </p>
      </main>
      <ThemeToggle/>
    </div>
  );
}
