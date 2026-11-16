"use client";
import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, Check, CheckCircle2, Copy, History, Loader2, Plus, RefreshCw } from "lucide-react";
import { TarotAdminShell } from "@/components/admin/TarotAdminShell";

// Reglas comerciales (2026-11-16, pedido de Manuel). Cada beneficio que se le
// ofrece a una clienta: qué es, cómo está configurado, quién lo decidió y
// cuándo (historial con el porqué) y qué trajo (códigos, ventas, ingresos).
// Todo se edita acá; los cupones de Cupones son solo su ejecución.

type Regla = {
  clave: string; nombre: string; descripcion: string; tipo: "codigo_fijo" | "codigo_personal"; activa: boolean;
  porcentaje: number; codigo: string | null; formato_codigo: string | null; vigencia_horas: number | null; vence_el: string | null;
  max_usos_por_cliente: number; campania: string; textos: Record<string, string>; decidido_por: string; decidido_at: string;
};
type Cambio = { id: string; fecha: string; por: string; nota: string; cambios: Record<string, unknown> };
type Codigo = { codigo: string; activo: boolean; tipo_descuento: string; valor_descuento: number | null; fecha_fin: string | null; created_at: string; ventas: number; ingresos: number };
type Item = { regla: Regla; historial: Cambio[]; codigos: Codigo[]; totales: { codigos: number; ventas: number; ingresos: number } };

const TEXTOS: Record<string, string> = {
  eyebrow: "Etiqueta de arriba", titulo: "Título", cuerpo: "Texto", boton: "Botón", pie: "Pie ({CODIGO} = el código)",
  mensaje: "Mensaje de WhatsApp ({VENCE} = vencimiento, {LINK} = link)",
};
const fecha = (s: string | null) => (s ? new Date(s).toLocaleDateString("es-UY", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "America/Montevideo" }) : "—");
const fechaHora = (s: string) => new Date(s).toLocaleString("es-UY", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "America/Montevideo" });
const pesos = (n: number) => `$${Math.round(n).toLocaleString("es-UY")}`;
const descuentoTexto = (c: Codigo) => (c.tipo_descuento === "porcentaje" ? `${c.valor_descuento ?? 0} %` : c.tipo_descuento === "monto_fijo" ? `${pesos(c.valor_descuento ?? 0)} menos` : c.tipo_descuento);
const MOTIVOS: Record<string, string> = {
  falta_nota: "Escribí por qué cambia: queda en el historial.", codigo_con_numero: "El código no puede llevar números.",
  texto_con_porcentaje: "Los textos para la clienta no pueden mostrar el porcentaje.", porcentaje_invalido: "El porcentaje va entre 1 y 50.",
};

function CopiarBoton({ texto, etiqueta }: { texto: string; etiqueta: string }) {
  const [ok, setOk] = useState(false);
  return (
    <button
      onClick={async () => { try { await navigator.clipboard.writeText(texto); setOk(true); setTimeout(() => setOk(false), 2000); } catch { /* sin portapapeles */ } }}
      className="inline-flex items-center gap-1.5 rounded-lg border border-gray-700 px-3 py-1.5 text-[13px] text-gray-200 hover:bg-gray-800"
    >
      {ok ? <Check size={14} /> : <Copy size={14} />} {ok ? "Copiado" : etiqueta}
    </button>
  );
}

function Configuracion({ r, alGuardar }: { r: Regla; alGuardar: () => void }) {
  const [f, setF] = useState({
    activa: r.activa, porcentaje: String(r.porcentaje), codigo: r.codigo ?? "", formato_codigo: r.formato_codigo ?? "",
    vigencia_horas: r.vigencia_horas == null ? "" : String(r.vigencia_horas), vence_el: r.vence_el ? r.vence_el.slice(0, 10) : "",
    max_usos_por_cliente: String(r.max_usos_por_cliente), textos: { ...r.textos }, nota: "",
  });
  const [estado, setEstado] = useState<{ tipo: "ok" | "error"; texto: string } | null>(null);
  const [guardando, setGuardando] = useState(false);

  const guardar = async () => {
    setGuardando(true); setEstado(null);
    const cambios: Record<string, unknown> = {
      activa: f.activa, porcentaje: Number(f.porcentaje), max_usos_por_cliente: Number(f.max_usos_por_cliente), textos: f.textos,
    };
    if (r.tipo === "codigo_fijo") { cambios.codigo = f.codigo; cambios.vence_el = f.vence_el ? `${f.vence_el}T23:59:59-03:00` : null; }
    else { cambios.formato_codigo = f.formato_codigo; cambios.vigencia_horas = f.vigencia_horas ? Number(f.vigencia_horas) : null; }
    try {
      const res = await fetch("/api/admin/tarot/reglas-comerciales", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ accion: "guardar", clave: r.clave, cambios, nota: f.nota }) });
      const j = await res.json();
      if (!j.ok) setEstado({ tipo: "error", texto: MOTIVOS[j.motivo] ?? j.detalle ?? j.motivo ?? "No se pudo guardar." });
      else if (j.sin_cambios) setEstado({ tipo: "ok", texto: "No había cambios." });
      else { setEstado({ tipo: "ok", texto: "Guardado y registrado en el historial." }); setF((x) => ({ ...x, nota: "" })); alGuardar(); }
    } catch { setEstado({ tipo: "error", texto: "No se pudo guardar." }); }
    setGuardando(false);
  };

  const campo = "w-full rounded-lg border border-gray-700 bg-gray-950 px-3 py-2 text-[15px] text-gray-100 focus:border-amber-500 focus:outline-none";
  const etiqueta = "mb-1 block text-[13px] text-gray-400";
  return (
    <div className="space-y-3">
      <label className="flex items-center gap-2 text-[15px] text-gray-200">
        <input type="checkbox" checked={f.activa} onChange={(e) => setF({ ...f, activa: e.target.checked })} className="h-4 w-4 accent-amber-500" />
        Regla activa
      </label>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div>
          <span className={etiqueta}>Descuento (%)</span>
          <input inputMode="decimal" value={f.porcentaje} onChange={(e) => setF({ ...f, porcentaje: e.target.value })} className={campo} />
        </div>
        {r.tipo === "codigo_fijo" ? (
          <>
            <div>
              <span className={etiqueta}>Código</span>
              <input value={f.codigo} onChange={(e) => setF({ ...f, codigo: e.target.value.toUpperCase() })} className={`${campo} uppercase tracking-wider`} />
            </div>
            <div>
              <span className={etiqueta}>Vence el</span>
              <input type="date" value={f.vence_el} onChange={(e) => setF({ ...f, vence_el: e.target.value })} className={campo} />
            </div>
          </>
        ) : (
          <>
            <div>
              <span className={etiqueta}>Formato del código</span>
              <input value={f.formato_codigo} onChange={(e) => setF({ ...f, formato_codigo: e.target.value.toUpperCase() })} className={`${campo} uppercase tracking-wider`} />
            </div>
            <div>
              <span className={etiqueta}>Vigencia (horas)</span>
              <input inputMode="numeric" value={f.vigencia_horas} onChange={(e) => setF({ ...f, vigencia_horas: e.target.value })} className={campo} />
            </div>
          </>
        )}
        <div>
          <span className={etiqueta}>Usos por clienta</span>
          <input inputMode="numeric" value={f.max_usos_por_cliente} onChange={(e) => setF({ ...f, max_usos_por_cliente: e.target.value })} className={campo} />
        </div>
      </div>
      {Object.keys(f.textos).map((k) => (
        <div key={k}>
          <span className={etiqueta}>{TEXTOS[k] ?? k}</span>
          <textarea rows={k === "mensaje" || k === "cuerpo" ? 3 : 1} value={f.textos[k]} onChange={(e) => setF({ ...f, textos: { ...f.textos, [k]: e.target.value } })} className={`${campo} resize-y`} />
        </div>
      ))}
      <div>
        <span className={etiqueta}>¿Por qué cambia? (obligatorio, queda en el historial)</span>
        <input value={f.nota} onChange={(e) => setF({ ...f, nota: e.target.value })} placeholder="Ej.: bajamos a 10 % porque el 20 % no trajo ventas" className={campo} />
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button onClick={guardar} disabled={guardando} className="inline-flex min-h-[44px] items-center gap-2 rounded-lg bg-amber-500 px-4 text-[15px] font-semibold text-gray-950 hover:bg-amber-400 disabled:opacity-60">
          {guardando ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />} Guardar
        </button>
        {estado && <span className={`text-[14px] ${estado.tipo === "ok" ? "text-emerald-300" : "text-red-300"}`}>{estado.texto}</span>}
      </div>
    </div>
  );
}

function CodigoPersonal({ r, alCrear }: { r: Regla; alCrear: () => void }) {
  const [d, setD] = useState({ nombre: "", tema: "amor", nacimiento: "" });
  const [res, setRes] = useState<{ codigo: string; link: string; mensaje: string; vence: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [creando, setCreando] = useState(false);
  const crear = async () => {
    setCreando(true); setError(null); setRes(null);
    try {
      const r2 = await fetch("/api/admin/tarot/reglas-comerciales", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ accion: "codigo_personal", clave: r.clave, ...d }) });
      const j = await r2.json();
      if (!j.ok) setError(j.detalle ?? j.motivo ?? "No se pudo crear."); else { setRes(j); alCrear(); }
    } catch { setError("No se pudo crear."); }
    setCreando(false);
  };
  const campo = "w-full rounded-lg border border-gray-700 bg-gray-950 px-3 py-2 text-[15px] text-gray-100 focus:border-amber-500 focus:outline-none";
  return (
    <div className="rounded-xl border border-amber-900/50 bg-amber-950/10 p-3.5">
      <p className="mb-2 text-[14px] font-semibold text-amber-200">Crear el código para una clienta</p>
      <div className="grid gap-2 sm:grid-cols-[1fr_auto_auto_auto]">
        <input value={d.nombre} onChange={(e) => setD({ ...d, nombre: e.target.value })} placeholder="Nombre (ej. Camila)" className={campo} />
        <select value={d.tema} onChange={(e) => setD({ ...d, tema: e.target.value })} className={campo}>
          <option value="amor">Amor</option><option value="decisiones">Decisiones</option><option value="trabajo">Trabajo y dinero</option><option value="general">General</option>
        </select>
        <input type="date" value={d.nacimiento} onChange={(e) => setD({ ...d, nacimiento: e.target.value })} title="Fecha de nacimiento (opcional)" className={campo} />
        <button onClick={crear} disabled={creando || !d.nombre.trim() || !r.activa} className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-lg bg-amber-500 px-4 text-[15px] font-semibold text-gray-950 hover:bg-amber-400 disabled:opacity-60">
          {creando ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />} Crear
        </button>
      </div>
      <p className="mt-1.5 text-[12.5px] text-gray-500">Se crea el código y se arma el link con sus datos. No se le manda nada: lo copiás y se lo enviás vos.</p>
      {error && <p className="mt-2 text-[14px] text-red-300">{error}</p>}
      {res && (
        <div className="mt-3 space-y-2 rounded-lg border border-gray-800 bg-gray-950 p-3">
          <p className="text-[15px] text-gray-100">Código <b className="tracking-wider text-amber-300">{res.codigo}</b> · vence {fechaHora(res.vence)}</p>
          <p className="whitespace-pre-wrap break-words text-[14px] text-gray-300">{res.mensaje || res.link}</p>
          <div className="flex flex-wrap gap-2">
            {res.mensaje && <CopiarBoton texto={res.mensaje} etiqueta="Copiar mensaje" />}
            <CopiarBoton texto={res.link} etiqueta="Copiar link" />
          </div>
        </div>
      )}
    </div>
  );
}

function TarjetaRegla({ it, recargar }: { it: Item; recargar: () => void }) {
  const r = it.regla;
  return (
    <section className="rounded-2xl border border-gray-800 bg-gray-900/40 p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-[17px] font-semibold text-white">{r.nombre}</h2>
          <p className="mt-0.5 text-[13px] text-gray-500">Decidido por {r.decidido_por} · {fecha(r.decidido_at)}</p>
        </div>
        <span className={`rounded-full border px-2.5 py-0.5 text-[12.5px] ${r.activa ? "border-emerald-800 bg-emerald-950/50 text-emerald-200" : "border-gray-700 bg-gray-900 text-gray-400"}`}>
          {r.activa ? "Activa" : "Apagada"}
        </span>
      </div>
      <p className="mt-3 text-[15px] leading-relaxed text-gray-300">{r.descripcion}</p>

      <div className="mt-3 grid grid-cols-3 gap-2">
        {[["Descuento", `${r.porcentaje} %`], ["Ventas", String(it.totales.ventas)], ["Ingresos", pesos(it.totales.ingresos)]].map(([k, v]) => (
          <div key={k} className="rounded-xl border border-gray-800 bg-gray-950/60 px-3 py-2">
            <p className="text-[12px] text-gray-500">{k}</p>
            <p className="text-[18px] font-semibold text-gray-100">{v}</p>
          </div>
        ))}
      </div>

      {r.tipo === "codigo_personal" && <div className="mt-4"><CodigoPersonal r={r} alCrear={recargar} /></div>}

      <details className="mt-4 rounded-xl border border-gray-800 bg-gray-950/40 p-3.5">
        <summary className="cursor-pointer text-[14px] font-semibold text-gray-200">Configuración</summary>
        <div className="mt-3"><Configuracion r={r} alGuardar={recargar} /></div>
      </details>

      <details className="mt-3 rounded-xl border border-gray-800 bg-gray-950/40 p-3.5">
        <summary className="cursor-pointer text-[14px] font-semibold text-gray-200">Evidencia · {it.codigos.length} código{it.codigos.length === 1 ? "" : "s"}</summary>
        {it.codigos.length ? (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[460px] text-left text-[13.5px]">
              <thead className="text-gray-500"><tr><th className="py-1.5 pr-3 font-normal">Código</th><th className="pr-3 font-normal">Descuento</th><th className="pr-3 font-normal">Creado</th><th className="pr-3 font-normal">Vence</th><th className="pr-3 font-normal">Ventas</th><th className="font-normal">Ingresos</th></tr></thead>
              <tbody className="text-gray-200">
                {it.codigos.map((c) => (
                  <tr key={c.codigo} className="border-t border-gray-800">
                    <td className="py-1.5 pr-3 font-semibold tracking-wider">{c.codigo}{!c.activo && <span className="ml-1.5 text-[11.5px] font-normal tracking-normal text-gray-500">(apagado)</span>}</td>
                    <td className="pr-3">{descuentoTexto(c)}</td><td className="pr-3">{fecha(c.created_at)}</td><td className="pr-3">{fecha(c.fecha_fin)}</td><td className="pr-3">{c.ventas}</td><td>{pesos(c.ingresos)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <p className="mt-2 text-[14px] text-gray-500">Todavía no hay códigos.</p>}
      </details>

      <details className="mt-3 rounded-xl border border-gray-800 bg-gray-950/40 p-3.5" open>
        <summary className="cursor-pointer text-[14px] font-semibold text-gray-200"><History size={14} className="mr-1 inline" />Historial de decisiones</summary>
        <ol className="mt-3 space-y-3">
          {it.historial.map((h) => (
            <li key={h.id} className="border-l-2 border-amber-700/60 pl-3">
              <p className="text-[12.5px] text-gray-500">{fechaHora(h.fecha)} · {h.por}</p>
              <p className="text-[14.5px] leading-relaxed text-gray-200">{h.nota}</p>
            </li>
          ))}
        </ol>
      </details>
    </section>
  );
}

export function ReglasComerciales() {
  const [items, setItems] = useState<Item[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const cargar = useCallback(async () => {
    setError(null);
    try {
      const r = await fetch("/api/admin/tarot/reglas-comerciales", { cache: "no-store" });
      const j = await r.json();
      if (!j.ok) setError(j.detalle ?? j.motivo ?? "No se pudo cargar."); else setItems(j.reglas);
    } catch { setError("No se pudo cargar."); }
  }, []);
  useEffect(() => { cargar(); }, [cargar]);

  return (
    <TarotAdminShell>
      <div className="mx-auto max-w-4xl space-y-4 px-4 py-5 sm:px-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-[20px] font-semibold text-white">Reglas comerciales</h1>
            <p className="mt-1 text-[14.5px] leading-relaxed text-gray-400">
              Cada beneficio que se le ofrece a una clienta, documentado: qué es, cómo está configurado, quién lo decidió y qué trajo.
              Los códigos no llevan números y la clienta nunca ve el porcentaje.
            </p>
          </div>
          <button onClick={cargar} aria-label="Actualizar" className="rounded-lg border border-gray-700 p-2 text-gray-300 hover:bg-gray-800"><RefreshCw size={16} /></button>
        </div>
        {error && <p className="flex items-center gap-2 rounded-xl border border-red-900 bg-red-950/40 p-3 text-[14px] text-red-200"><AlertTriangle size={16} /> {error}</p>}
        {!items && !error && <p className="flex items-center gap-2 text-[14px] text-gray-400"><Loader2 size={16} className="animate-spin" /> Cargando…</p>}
        {items?.map((it) => <TarjetaRegla key={it.regla.clave} it={it} recargar={cargar} />)}
      </div>
    </TarotAdminShell>
  );
}
