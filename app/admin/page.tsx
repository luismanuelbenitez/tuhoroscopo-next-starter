"use client";
import { useState } from "react";

export default function AdminPage() {
  const [cargando, setCargando] = useState(false);

  async function handleLogout() {
    setCargando(true);
    await fetch("/api/admin/auth/logout", { method: "POST" });
    window.location.href = "/admin/login";
  }

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-2xl font-semibold">Panel THC</h1>
        <button
          onClick={handleLogout}
          disabled={cargando}
          className="text-sm text-gray-400 hover:text-white disabled:opacity-50 transition-colors"
        >
          {cargando ? "Cerrando..." : "Cerrar sesión"}
        </button>
      </div>
      <p className="text-gray-400">Panel en construcción.</p>
    </div>
  );
}
