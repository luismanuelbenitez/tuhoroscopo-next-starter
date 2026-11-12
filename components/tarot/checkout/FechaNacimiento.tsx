"use client";

import { useEffect, useState } from "react";
import { ChevronDown } from "lucide-react";
import { inputCheckout, inputBg } from "./CampoCheckout";

// Fecha de nacimiento en tres listas (día · mes · año) en vez de
// <input type="date"> (auditoría checkout móvil 2026-11-01): en Android el
// calendario abre en el día de hoy y llegar al año de nacimiento lleva
// decenas de toques. Devuelve "AAAA-MM-DD" cuando la fecha está completa y
// es válida, y "" mientras tanto: el mismo valor que daba el input anterior.

// Abreviados: en 360 px de ancho "Septiembre" no entra en la lista.
const MESES = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
const ANIO_ACTUAL = new Date().getFullYear();
// Hay que ser mayor de 18 para comprar (2026-11-11): la lista arranca ahí.
const ANIO_MAXIMO = ANIO_ACTUAL - 18;
const ANIOS = Array.from({ length: ANIO_MAXIMO - 1920 + 1 }, (_, i) => ANIO_MAXIMO - i);
const DIAS = Array.from({ length: 31 }, (_, i) => i + 1);

const dos = (n: number) => String(n).padStart(2, "0");

function partes(valor: string) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(valor);
  return m ? { d: String(Number(m[3])), m: String(Number(m[2])), a: m[1] } : { d: "", m: "", a: "" };
}

function fechaValida(d: number, m: number, a: number) {
  const f = new Date(a, m - 1, d);
  return f.getFullYear() === a && f.getMonth() === m - 1 && f.getDate() === d && f <= new Date();
}

export function FechaNacimiento({ id, valor, onCambio, disabled }: { id: string; valor: string; onCambio: (v: string) => void; disabled?: boolean }) {
  const [sel, setSel] = useState(() => partes(valor));

  // Si el valor llega de afuera (precarga por URL), se refleja en las listas.
  useEffect(() => {
    if (valor) setSel(partes(valor));
  }, [valor]);

  const completa = sel.d && sel.m && sel.a;
  const invalida = !!completa && !fechaValida(Number(sel.d), Number(sel.m), Number(sel.a));

  function cambiar(campo: "d" | "m" | "a", v: string) {
    const nueva = { ...sel, [campo]: v };
    setSel(nueva);
    const ok = nueva.d && nueva.m && nueva.a && fechaValida(Number(nueva.d), Number(nueva.m), Number(nueva.a));
    onCambio(ok ? `${nueva.a}-${dos(Number(nueva.m))}-${dos(Number(nueva.d))}` : "");
  }

  const lista = (campo: "d" | "m" | "a", nombre: string, etiqueta: string, opciones: { v: string; t: string }[], primera?: boolean) => (
    <div className="relative min-w-0">
      <select
        id={primera ? id : undefined}
        name={nombre}
        aria-label={etiqueta}
        autoComplete={campo === "d" ? "bday-day" : campo === "m" ? "bday-month" : "bday-year"}
        className={`${inputCheckout} !pl-3 !pr-7 appearance-none cursor-pointer ${sel[campo] ? "" : "text-white/40"}`}
        style={inputBg}
        value={sel[campo]}
        onChange={(e) => cambiar(campo, e.target.value)}
        disabled={disabled}
      >
        <option value="" style={{ background: "#1a0a3a" }}>{etiqueta}</option>
        {opciones.map((o) => (
          <option key={o.v} value={o.v} style={{ background: "#1a0a3a", color: "white" }}>{o.t}</option>
        ))}
      </select>
      <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-white/50 pointer-events-none" />
    </div>
  );

  return (
    <div>
      <div className="grid grid-cols-[1fr_1.2fr_1.15fr] gap-2">
        {lista("d", "fecha_nacimiento_dia", "Día", DIAS.map((d) => ({ v: String(d), t: String(d) })), true)}
        {lista("m", "fecha_nacimiento_mes", "Mes", MESES.map((m, i) => ({ v: String(i + 1), t: m })))}
        {lista("a", "fecha_nacimiento_anio", "Año", ANIOS.map((a) => ({ v: String(a), t: String(a) })))}
      </div>
      {invalida && <p className="mt-1.5 text-xs text-amber-300/80">Esa fecha no existe. Revisá el día.</p>}
    </div>
  );
}
