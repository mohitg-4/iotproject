import Sidebar from "./components/Sidebar";
import ThemeToggle from "./components/ThemeToggle";

export default function Home() {
  return (
    <div className="flex">
      <Sidebar />
      <main className="ml-64 p-6">
        <h1 className="text-2xl font-bold">Welcome to the IoT Dashboard</h1>
        <p>Use the sidebar to navigate.</p>
      </main>
      <ThemeToggle />
    </div>
  );
}
