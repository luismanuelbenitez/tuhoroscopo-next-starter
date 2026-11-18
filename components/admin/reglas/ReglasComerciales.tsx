"use client";
import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, Archive, Check, CheckCircle2, ChevronDown, Copy, History, Loader2, Plus, RefreshCw, RotateCcw, X } from "lucide-react";
import { TarotAdminShell } from "@/components/admin/TarotAdminShell";

// Reglas comerciales (2026-11-16, pedido de Manuel). Cada beneficio que se le
// ofrece a una clienta: qué es, cómo está configurado, quién lo decidió y
// cuándo (historial con el porqué) y qué trajo (códigos, ventas, ingresos).
// Todo se edita acá; los cupones de Cupones son solo su ejecución.
// 2026-11-17: tarjetas compactas (detalle a pedido), precio especial fijo en
// todas, crear reglas y "eliminar" = archivar (nunca se borra; se ven en
// "Eliminadas" y se pueden restaurar).

type Regla = {
  clave: string; nombre: string; descripcion: string; tipo: "codigo_fijo" | "codigo_personal"; activa: boolean;
  porcentaje: number; codigo: string | null; formato_codigo: string | null; precio_fijo_uyu: number | null; vigencia_horas: number | null; vence_el: string | null;
  max_usos_por_cliente: number; campania: string; textos: Record<string, string>; decidido_por: string; decidido_at: string;
  archivada_at: string | null; archivada_por: string | null;
};
type Cambio = { id: string; fecha: string; por: string; nota: string; cambios: Record<string, unknown> };
type Codigo = { codigo: string; activo: boolean; tipo_descuento: string; valor_descuento: number | null; precio_fijo_uyu: number | null; fecha_fin: string | null; created_at: string; ventas: number; ingresos: number };
type Item = { regla: Regla; historial: Cambio[]; codigos: Codigo[]; totales: { codigos: number; ventas: number; ingresos: number } };

const TEXTOS: Record<string, string> = {
  eyebrow: "Etiqueta de arriba", titulo: "Título", cuerpo: "Texto", boton: "Botón", pie: "Pie ({CODIGO} = el código)",
  mensaje: "Mensaje de WhatsApp ({VENCE} = vencimiento, {LINK} = link)",
};
const fecha = (s: string | null) => (s ? new Date(s).toLocaleDateString("es-UY", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "America/Montevideo" }) : "—");
const fechaHora = (s: string) => new Date(s).toLocaleString("es-UY", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "America/Montevideo" });
const pesos = (n: number) => `$${Math.round(n).toLocaleString("es-UY")}`;
const beneficio = (r: Pick<Regla, "precio_fijo_uyu" | "porcentaje">) => (r.precio_fijo_uyu ? `precio especial ${pesos(r.precio_fijo_uyu)}` : `${r.porcentaje} % menos`);
const descuentoTexto = (c: Codigo) => (c.tipo_descuento === "porcentaje" ? `${c.valor_descuento ?? 0} %` : c.tipo_descuento === "monto_fijo" ? `${pesos(c.valor_descuento ?? 0)} menos` : c.tipo_descuento === "precio_fijo" ? `precio ${pesos(c.precio_fijo_uyu ?? 0)}` : c.tipo_descuento);
const MOTIVOS: Record<string, string> = {
  precio_invalido: "El precio especial va entre $100 y $5.000 y tiene que ser menor que el precio actual.",
  falta_nota: "Escribí el porqué: queda en el historial.", codigo_con_numero: "El código no puede llevar números.",
  texto_con_porcentaje: "Los textos para la clienta no pueden mostrar el porcentaje.", porcentaje_invalido: "El porcentaje va entre 1 y 50.",
  regla_archivada: "La regla está eliminada: restaurala para editarla.",
};
const campo = "w-full rounded-lg border border-gray-700 bg-gray-950 px-3 py-2 text-[15px] text-gray-100 focus:border-amber-500 focus:outline-none";
const etiqueta = "mb-1 block text-[13px] text-gray-400";
const botonPrincipal = "inline-flex min-h-[44px] items-center justify-center gap-2 rounded-lg bg-amber-500 px-4 text-[15px] font-semibold text-gray-950 hover:bg-amber-400 disabled:opacity-60";

async function enviar(cuerpo: Record<string, unknown>) {
  try {
    const res = await fetch("/api/admin/tarot/reglas-comerciales", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(cuerpo) });
    return (await res.json()) as { ok: boolean; motivo?: string; detalle?: string; sin_cambios?: boolean } & Record<string, unknown>;
  } catch { return { ok: false, detalle: "No se pudo conectar." }; }
}
const textoError = (j: { motivo?: string; detalle?: string }) => j.detalle ?? MOTIVOS[j.motivo ?? ""] ?? j.motivo ?? "No se pudo.";

function CopiarBoton({ texto, etiqueta: et }: { texto: string; etiqueta: string }) {
  const [ok, setOk] = useState(false);
  return (
    <button
      onClick={async () => { try { await navigator.clipboard.writeText(texto); setOk(true); setTimeout(() => setOk(false), 2000); } catch { /* sin portapapeles */ } }}
      className="inline-flex items-center gap-1.5 rounded-lg border border-gray-700 px-3 py-1.5 text-[13px] text-gray-200 hover:bg-gray-800"
    >
      {ok ? <Check size={14} /> : <Copy size={14} />} {ok ? "Copiado" : et}
    </button>
  );
}

/** Precio especial ($) o descuento (%): uno de los dos. */
function CampoBeneficio({ modo, valor, onModo, onValor }: { modo: "precio" | "porcentaje"; valor: string; onModo: (m: "precio" | "porcentaje") => void; onValor: (v: string) => void }) {
  return (
    <div className="col-span-2">
      <span className={etiqueta}>Beneficio</span>
      <div className="flex flex-wrap gap-2">
        <div className="flex shrink-0 overflow-hidden rounded-lg border border-gray-700">
          {(["precio", "porcentaje"] as const).map((m) => (
            <button key={m} type="button" onClick={() => onModo(m)} className={`min-h-[42px] px-3 text-[14px] ${modo === m ? "bg-amber-500 font-semibold text-gray-950" : "bg-gray-950 text-gray-300 hover:bg-gray-800"}`}>
              {m === "precio" ? "Precio $" : "Descuento %"}
            </button>
          ))}
        </div>
        <input inputMode="decimal" value={valor} onChange={(e) => onValor(e.target.value)} placeholder={modo === "precio" ? "ej. 590" : "ej. 10"} className={`${campo} min-w-[96px] flex-1 basis-24`} />
      </div>
    </div>
  );
}

function Configuracion({ r, alGuardar }: { r: Regla; alGuardar: () => void }) {
  // Código fijo con plazo desde la entrega (regla "otra_lectura"): se edita en días.
  const conPlazo = r.tipo === "codigo_fijo" && r.vigencia_horas != null;
  const [f, setF] = useState({
    activa: r.activa, modo: (r.precio_fijo_uyu ? "precio" : "porcentaje") as "precio" | "porcentaje",
    valor: String(r.precio_fijo_uyu ?? r.porcentaje), codigo: r.codigo ?? "", formato_codigo: r.formato_codigo ?? "",
    vigencia_horas: r.vigencia_horas == null ? "" : String(r.tipo === "codigo_fijo" ? Math.round(r.vigencia_horas / 24) : r.vigencia_horas), vence_el: r.vence_el ? r.vence_el.slice(0, 10) : "",
    max_usos_por_cliente: String(r.max_usos_por_cliente), textos: { ...r.textos }, nota: "",
  });
  const [estado, setEstado] = useState<{ tipo: "ok" | "error"; texto: string } | null>(null);
  const [guardando, setGuardando] = useState(false);

  const guardar = async () => {
    setGuardando(true); setEstado(null);
    const cambios: Record<string, unknown> = { activa: f.activa, max_usos_por_cliente: Number(f.max_usos_por_cliente), textos: f.textos };
    if (f.modo === "precio") cambios.precio_fijo_uyu = Number(f.valor);
    else { cambios.precio_fijo_uyu = null; cambios.porcentaje = Number(f.valor); }
    if (r.tipo === "codigo_fijo") {
      cambios.codigo = f.codigo; cambios.vence_el = f.vence_el ? `${f.vence_el}T23:59:59-03:00` : null;
      // Plazo de la oferta en días desde la entrega (botón "otra lectura").
      if (conPlazo) cambios.vigencia_horas = f.vigencia_horas ? Math.round(Number(f.vigencia_horas) * 24) : null;
    } else { cambios.formato_codigo = f.formato_codigo; cambios.vigencia_horas = f.vigencia_horas ? Number(f.vigencia_horas) : null; }
    const j = await enviar({ accion: "guardar", clave: r.clave, cambios, nota: f.nota });
    if (!j.ok) setEstado({ tipo: "error", texto: textoError(j) });
    else if (j.sin_cambios) setEstado({ tipo: "ok", texto: "No había cambios." });
    else { setEstado({ tipo: "ok", texto: "Guardado y registrado en el historial." }); setF((x) => ({ ...x, nota: "" })); alGuardar(); }
    setGuardando(false);
  };

  return (
    <div className="space-y-3">
      <label className="flex items-center gap-2 text-[15px] text-gray-200">
        <input type="checkbox" checked={f.activa} onChange={(e) => setF({ ...f, activa: e.target.checked })} className="h-4 w-4 accent-amber-500" />
        Regla activa
      </label>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <CampoBeneficio modo={f.modo} valor={f.valor} onModo={(modo) => setF({ ...f, modo, valor: modo === "precio" ? String(r.precio_fijo_uyu ?? "") : String(r.porcentaje) })} onValor={(valor) => setF({ ...f, valor })} />
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
            {conPlazo && (
              <div>
                <span className={etiqueta}>Se ofrece (días desde la entrega)</span>
                <input inputMode="numeric" value={f.vigencia_horas} onChange={(e) => setF({ ...f, vigencia_horas: e.target.value })} className={campo} />
              </div>
            )}
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
          <textarea rows={k === "mensaje" || k === "cuerpo" ? 3 : (f.textos[k] ?? "").length > 28 ? 2 : 1} value={f.textos[k]} onChange={(e) => setF({ ...f, textos: { ...f.textos, [k]: e.target.value } })} className={`${campo} resize-y`} />
        </div>
      ))}
      <div>
        <span className={etiqueta}>¿Por qué cambia? (obligatorio, queda en el historial)</span>
        <input value={f.nota} onChange={(e) => setF({ ...f, nota: e.target.value })} placeholder="Ej.: pasamos a $590 porque el 10 % no movía la aguja" className={campo} />
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button onClick={guardar} disabled={guardando} className={botonPrincipal}>
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
    const j = await enviar({ accion: "codigo_personal", clave: r.clave, ...d });
    if (!j.ok) setError(textoError(j)); else { setRes(j as unknown as { codigo: string; link: string; mensaje: string; vence: string }); alCrear(); }
    setCreando(false);
  };
  return (
    <div className="rounded-xl border border-amber-900/50 bg-amber-950/10 p-3.5">
      <p className="mb-2 text-[14px] font-semibold text-amber-200">Crear el código para una clienta</p>
      <div className="grid gap-2 sm:grid-cols-[1fr_auto_auto_auto]">
        <input value={d.nombre} onChange={(e) => setD({ ...d, nombre: e.target.value })} placeholder="Nombre (ej. Camila)" className={campo} />
        <select value={d.tema} onChange={(e) => setD({ ...d, tema: e.target.value })} className={campo}>
          <option value="amor">Amor</option><option value="decisiones">Decisiones</option><option value="trabajo">Trabajo y dinero</option><option value="general">General</option>
        </select>
        <input type="date" value={d.nacimiento} onChange={(e) => setD({ ...d, nacimiento: e.target.value })} title="Fecha de nacimiento (opcional)" className={campo} />
        <button onClick={crear} disabled={creando || !d.nombre.trim() || !r.activa} className={botonPrincipal}>
          {creando ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />} Crear
        </button>
      </div>
      <p className="mt-1.5 text-[12.5px] text-gray-500">{r.activa ? "Se crea el código y se arma el link con sus datos. No se le manda nada: lo copiás y se lo enviás vos." : "La regla está apagada: prendela para crear códigos."}</p>
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

/** Eliminar (archivar) o restaurar, siempre con el porqué. */
function Archivar({ r, alHacer }: { r: Regla; alHacer: () => void }) {
  const archivada = !!r.archivada_at;
  const [abierto, setAbierto] = useState(false);
  const [nota, setNota] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [haciendo, setHaciendo] = useState(false);
  const hacer = async () => {
    setHaciendo(true); setError(null);
    const j = await enviar({ accion: archivada ? "restaurar" : "archivar", clave: r.clave, nota });
    if (!j.ok) setError(textoError(j)); else { setAbierto(false); setNota(""); alHacer(); }
    setHaciendo(false);
  };
  if (!abierto)
    return (
      <button onClick={() => setAbierto(true)} className={`inline-flex min-h-[40px] items-center gap-1.5 rounded-lg border px-3 text-[14px] ${archivada ? "border-gray-700 text-gray-200 hover:bg-gray-800" : "border-red-900/70 text-red-300 hover:bg-red-950/40"}`}>
        {archivada ? <RotateCcw size={15} /> : <Archive size={15} />} {archivada ? "Restaurar" : "Eliminar"}
      </button>
    );
  return (
    <div className={`space-y-2 rounded-xl border p-3.5 ${archivada ? "border-gray-700 bg-gray-950/50" : "border-red-900/60 bg-red-950/20"}`}>
      <p className="text-[14px] leading-relaxed text-gray-200">
        {archivada
          ? "Vuelve a la lista principal, apagada. Para que se ofrezca de nuevo, prendela después."
          : r.tipo === "codigo_fijo"
            ? `Se apaga y su código ${r.codigo ?? ""} deja de funcionar. No se borra nada: queda en "Eliminadas" con su historial y su evidencia.`
            : "Se apaga y no se pueden crear códigos nuevos. Los códigos que ya se le dieron a una clienta siguen valiendo hasta que vencen. No se borra nada: queda en \"Eliminadas\"."}
      </p>
      <input value={nota} onChange={(e) => setNota(e.target.value)} placeholder={archivada ? "¿Por qué se restaura? (obligatorio)" : "¿Por qué se elimina? (obligatorio)"} className={campo} />
      <div className="flex flex-wrap items-center gap-2">
        <button onClick={hacer} disabled={haciendo || !nota.trim()} className={`inline-flex min-h-[42px] items-center gap-2 rounded-lg px-4 text-[14px] font-semibold disabled:opacity-60 ${archivada ? "bg-amber-500 text-gray-950 hover:bg-amber-400" : "bg-red-600 text-white hover:bg-red-500"}`}>
          {haciendo ? <Loader2 size={15} className="animate-spin" /> : archivada ? <RotateCcw size={15} /> : <Archive size={15} />} {archivada ? "Restaurar" : "Eliminar regla"}
        </button>
        <button onClick={() => { setAbierto(false); setError(null); }} className="min-h-[42px] rounded-lg px-3 text-[14px] text-gray-400 hover:text-gray-200">Cancelar</button>
        {error && <span className="text-[14px] text-red-300">{error}</span>}
      </div>
    </div>
  );
}

function TarjetaRegla({ it, recargar }: { it: Item; recargar: () => void }) {
  const r = it.regla;
  const archivada = !!r.archivada_at;
  const [abierta, setAbierta] = useState(false);
  const resumen = [r.tipo === "codigo_fijo" ? r.codigo : r.formato_codigo, beneficio(r), `${it.totales.ventas} venta${it.totales.ventas === 1 ? "" : "s"}`].filter(Boolean).join(" · ");
  const chip = archivada
    ? "border-gray-700 bg-gray-900 text-gray-500"
    : r.activa ? "border-emerald-800 bg-emerald-950/50 text-emerald-200" : "border-gray-700 bg-gray-900 text-gray-400";

  return (
    <section className={`rounded-2xl border p-4 sm:p-5 ${archivada ? "border-gray-800/70 bg-gray-950/30" : "border-gray-800 bg-gray-900/40"}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className={`text-[16.5px] font-semibold leading-snug ${archivada ? "text-gray-400" : "text-white"}`}>{r.nombre}</h2>
          <p className="mt-0.5 text-[13.5px] font-medium tracking-wide text-amber-200/80">{resumen}</p>
        </div>
        <span className={`shrink-0 rounded-full border px-2.5 py-0.5 text-[12.5px] ${chip}`}>{archivada ? "Eliminada" : r.activa ? "Activa" : "Apagada"}</span>
      </div>
      <p className={`mt-2 text-[14.5px] leading-relaxed text-gray-400 ${abierta ? "" : "line-clamp-2"}`}>{r.descripcion}</p>
      <button onClick={() => setAbierta(!abierta)} aria-expanded={abierta} className="mt-2 inline-flex min-h-[40px] items-center gap-1.5 rounded-lg px-1 text-[14px] font-semibold text-amber-300 hover:text-amber-200">
        {abierta ? "Ocultar detalle" : "Ver detalle"} <ChevronDown size={16} className={`transition-transform ${abierta ? "rotate-180" : ""}`} />
      </button>

      {abierta && (
        <div className="mt-2 space-y-3">
          <p className="text-[13px] text-gray-500">
            Decidido por {r.decidido_por} · {fecha(r.decidido_at)}{archivada && ` · eliminada por ${r.archivada_por ?? "—"} el ${fecha(r.archivada_at)}`}
          </p>
          <div className="grid grid-cols-3 gap-2">
            {[[r.precio_fijo_uyu ? "Precio especial" : "Descuento", r.precio_fijo_uyu ? pesos(r.precio_fijo_uyu) : `${r.porcentaje} %`], ["Ventas", String(it.totales.ventas)], ["Ingresos", pesos(it.totales.ingresos)]].map(([k, v]) => (
              <div key={k} className="rounded-xl border border-gray-800 bg-gray-950/60 px-3 py-2">
                <p className="text-[12px] text-gray-500">{k}</p>
                <p className="text-[18px] font-semibold text-gray-100">{v}</p>
              </div>
            ))}
          </div>

          {!archivada && r.tipo === "codigo_personal" && <CodigoPersonal r={r} alCrear={recargar} />}

          {!archivada && (
            <details className="rounded-xl border border-gray-800 bg-gray-950/40 p-3.5" open>
              <summary className="cursor-pointer text-[14px] font-semibold text-gray-200">Configuración</summary>
              <div className="mt-3"><Configuracion r={r} alGuardar={recargar} /></div>
            </details>
          )}

          <details className="rounded-xl border border-gray-800 bg-gray-950/40 p-3.5">
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

          <details className="rounded-xl border border-gray-800 bg-gray-950/40 p-3.5">
            <summary className="cursor-pointer text-[14px] font-semibold text-gray-200"><History size={14} className="mr-1 inline" />Historial de decisiones · {it.historial.length}</summary>
            <ol className="mt-3 space-y-3">
              {it.historial.map((h) => (
                <li key={h.id} className="border-l-2 border-amber-700/60 pl-3">
                  <p className="text-[12.5px] text-gray-500">{fechaHora(h.fecha)} · {h.por}</p>
                  <p className="text-[14.5px] leading-relaxed text-gray-200">{h.nota}</p>
                </li>
              ))}
            </ol>
          </details>

          <div className="pt-1"><Archivar r={r} alHacer={recargar} /></div>
        </div>
      )}
    </section>
  );
}

function NuevaRegla({ alCrear, cerrar }: { alCrear: () => void; cerrar: () => void }) {
  const [f, setF] = useState({
    nombre: "", descripcion: "", tipo: "codigo_fijo" as "codigo_fijo" | "codigo_personal", modo: "precio" as "precio" | "porcentaje", valor: "",
    codigo: "", formato_codigo: "{NOMBRE}VIP", vigencia_horas: "48", vence_el: "", max_usos_por_cliente: "1", activa: false, nota: "",
  });
  const [error, setError] = useState<string | null>(null);
  const [creando, setCreando] = useState(false);
  const crear = async () => {
    setCreando(true); setError(null);
    const regla: Record<string, unknown> = {
      nombre: f.nombre, descripcion: f.descripcion, tipo: f.tipo, activa: f.activa, max_usos_por_cliente: Number(f.max_usos_por_cliente),
      ...(f.modo === "precio" ? { precio_fijo_uyu: Number(f.valor) } : { porcentaje: Number(f.valor) }),
      ...(f.tipo === "codigo_fijo"
        ? { codigo: f.codigo, vence_el: f.vence_el ? `${f.vence_el}T23:59:59-03:00` : null }
        : { formato_codigo: f.formato_codigo, vigencia_horas: Number(f.vigencia_horas) }),
    };
    if (!f.valor.trim()) { setError("Poné el precio especial o el porcentaje."); setCreando(false); return; }
    const j = await enviar({ accion: "crear", regla, nota: f.nota });
    if (!j.ok) setError(textoError(j)); else { alCrear(); cerrar(); }
    setCreando(false);
  };
  return (
    <section className="space-y-3 rounded-2xl border border-amber-800/60 bg-amber-950/10 p-4 sm:p-5">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-[17px] font-semibold text-amber-100">Nueva regla comercial</h2>
        <button onClick={cerrar} aria-label="Cerrar" className="rounded-lg p-2 text-gray-400 hover:bg-gray-800 hover:text-gray-200"><X size={18} /></button>
      </div>
      <div>
        <span className={etiqueta}>Nombre</span>
        <input value={f.nombre} onChange={(e) => setF({ ...f, nombre: e.target.value })} placeholder="Ej.: Precio especial para amigas de una clienta" className={campo} />
      </div>
      <div>
        <span className={etiqueta}>Qué es y cuándo se ofrece</span>
        <textarea rows={2} value={f.descripcion} onChange={(e) => setF({ ...f, descripcion: e.target.value })} className={`${campo} resize-y`} />
      </div>
      <div>
        <span className={etiqueta}>Tipo</span>
        <div className="grid gap-2 sm:grid-cols-2">
          {([["codigo_fijo", "Un código para todas", "Ej.: NUEVAMIRADA. Lo usa cualquiera que lo tenga."], ["codigo_personal", "Un código por clienta", "Ej.: CAMILAVIP. Lo creás desde la regla para cada una, con vencimiento."]] as const).map(([v, t, s]) => (
            <button key={v} type="button" onClick={() => setF({ ...f, tipo: v })} className={`rounded-xl border p-3 text-left ${f.tipo === v ? "border-amber-500 bg-amber-500/10" : "border-gray-700 hover:bg-gray-900"}`}>
              <p className="text-[15px] font-semibold text-gray-100">{t}</p>
              <p className="mt-0.5 text-[13px] leading-snug text-gray-400">{s}</p>
            </button>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <CampoBeneficio modo={f.modo} valor={f.valor} onModo={(modo) => setF({ ...f, modo })} onValor={(valor) => setF({ ...f, valor })} />
        {f.tipo === "codigo_fijo" ? (
          <>
            <div>
              <span className={etiqueta}>Código (sin números)</span>
              <input value={f.codigo} onChange={(e) => setF({ ...f, codigo: e.target.value.toUpperCase() })} className={`${campo} uppercase tracking-wider`} />
            </div>
            <div>
              <span className={etiqueta}>Vence el (opcional)</span>
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
      <label className="flex items-center gap-2 text-[15px] text-gray-200">
        <input type="checkbox" checked={f.activa} onChange={(e) => setF({ ...f, activa: e.target.checked })} className="h-4 w-4 accent-amber-500" />
        Activarla ya (si no, nace apagada)
      </label>
      <div>
        <span className={etiqueta}>¿Por qué se crea? (obligatorio, queda en el historial)</span>
        <input value={f.nota} onChange={(e) => setF({ ...f, nota: e.target.value })} className={campo} />
      </div>
      <p className="rounded-lg border border-gray-800 bg-gray-950/50 p-3 text-[13px] leading-relaxed text-gray-400">
        Una regla nueva funciona como código en el checkout y en los links que armes. Para que aparezca sola en una pantalla de la web
        (como el botón de la lectura) hay que programarla aparte.
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <button onClick={crear} disabled={creando || !f.nombre.trim() || !f.nota.trim()} className={botonPrincipal}>
          {creando ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />} Crear regla
        </button>
        {error && <span className="text-[14px] text-red-300">{error}</span>}
      </div>
    </section>
  );
}

export function ReglasComerciales() {
  const [items, setItems] = useState<Item[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [creando, setCreando] = useState(false);
  const [verEliminadas, setVerEliminadas] = useState(false);
  const cargar = useCallback(async () => {
    setError(null);
    try {
      const r = await fetch("/api/admin/tarot/reglas-comerciales", { cache: "no-store" });
      const j = await r.json();
      if (!j.ok) setError(j.detalle ?? j.motivo ?? "No se pudo cargar."); else setItems(j.reglas);
    } catch { setError("No se pudo cargar."); }
  }, []);
  useEffect(() => { cargar(); }, [cargar]);

  // Activas primero, después apagadas; las eliminadas (archivadas) van aparte.
  const vigentes = (items ?? []).filter((it) => !it.regla.archivada_at).sort((a, b) => Number(b.regla.activa) - Number(a.regla.activa));
  const eliminadas = (items ?? []).filter((it) => it.regla.archivada_at);

  return (
    <TarotAdminShell>
      <div className="mx-auto max-w-4xl space-y-4 px-4 py-5 sm:px-6">
        <div>
          <div className="flex items-center justify-between gap-3">
            <h1 className="text-[20px] font-semibold text-white">Reglas comerciales</h1>
            <div className="flex shrink-0 gap-2">
              <button onClick={() => setCreando(true)} className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg bg-amber-500 px-3 text-[14px] font-semibold text-gray-950 hover:bg-amber-400"><Plus size={16} /> Nueva</button>
              <button onClick={cargar} aria-label="Actualizar" className="rounded-lg border border-gray-700 p-2 text-gray-300 hover:bg-gray-800"><RefreshCw size={16} /></button>
            </div>
          </div>
          <p className="mt-1 text-[14.5px] leading-relaxed text-gray-400">
            Cada beneficio que se le ofrece a una clienta, documentado: qué es, cómo está configurado, quién lo decidió y qué trajo.
            Los códigos no llevan números y la clienta nunca ve el porcentaje.
          </p>
        </div>
        {error && <p className="flex items-center gap-2 rounded-xl border border-red-900 bg-red-950/40 p-3 text-[14px] text-red-200"><AlertTriangle size={16} /> {error}</p>}
        {!items && !error && <p className="flex items-center gap-2 text-[14px] text-gray-400"><Loader2 size={16} className="animate-spin" /> Cargando…</p>}
        {creando && <NuevaRegla alCrear={cargar} cerrar={() => setCreando(false)} />}
        {vigentes.map((it) => <TarjetaRegla key={it.regla.clave} it={it} recargar={cargar} />)}

        {items && (
          <div className="pt-2">
            <button onClick={() => setVerEliminadas(!verEliminadas)} disabled={!eliminadas.length} className="inline-flex min-h-[40px] items-center gap-1.5 text-[14px] text-gray-400 hover:text-gray-200 disabled:opacity-50">
              <Archive size={15} /> {eliminadas.length ? `${verEliminadas ? "Ocultar" : "Ver"} eliminadas (${eliminadas.length})` : "No hay reglas eliminadas"}
              {!!eliminadas.length && <ChevronDown size={15} className={`transition-transform ${verEliminadas ? "rotate-180" : ""}`} />}
            </button>
            {verEliminadas && <div className="mt-3 space-y-3">{eliminadas.map((it) => <TarjetaRegla key={it.regla.clave} it={it} recargar={cargar} />)}</div>}
          </div>
        )}
      </div>
    </TarotAdminShell>
  );
}
