"use client";
import { useState } from "react";

export default function AdminLoginPage() {
  const [usuario, setUsuario] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [cargando, setCargando] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setCargando(true);
    setError("");

    const res = await fetch("/api/admin/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ usuario, password }),
    });

    if (res.ok) {
      // Reload completo para que el middleware lea la nueva sesión
      window.location.href = "/admin";
    } else {
      const data = await res.json().catch(() => ({}));
      setError(data.mensaje ?? "Credenciales incorrectas.");
    }
    setCargando(false);
  }

  return (
    <div className="flex items-center justify-center min-h-screen">
      <form
        onSubmit={handleSubmit}
        className="flex flex-col gap-4 w-80 p-8 rounded-xl border border-gray-800 bg-gray-900"
      >
        <h1 className="text-lg font-semibold text-white">Panel THC</h1>
        <input
          type="text"
          placeholder="Usuario"
          value={usuario}
          onChange={e => setUsuario(e.target.value)}
          required
          autoComplete="username"
          className="border border-gray-700 px-3 py-2 rounded bg-gray-800 text-white placeholder-gray-500 focus:outline-none focus:border-violet-500"
        />
        <input
          type="password"
          placeholder="Contraseña"
          value={password}
          onChange={e => setPassword(e.target.value)}
          required
          autoComplete="current-password"
          className="border border-gray-700 px-3 py-2 rounded bg-gray-800 text-white placeholder-gray-500 focus:outline-none focus:border-violet-500"
        />
        {error && <p className="text-red-400 text-sm">{error}</p>}
        <button
          type="submit"
          disabled={cargando}
          className="bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white py-2 rounded font-medium transition-colors"
        >
          {cargando ? "Ingresando..." : "Ingresar"}
        </button>
      </form>
    </div>
  );
}
