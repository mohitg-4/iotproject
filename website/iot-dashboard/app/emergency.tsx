import Sidebar from "./components/Sidebar";

export default function Emergency() {
  return (
    <div className="flex">
      <Sidebar />
      <main className="ml-64 p-6">
        <h1 className="text-2xl font-bold">Emergency Contacts</h1>
        <p>Manage emergency contacts here...</p>
      </main>
    </div>
  );
}
