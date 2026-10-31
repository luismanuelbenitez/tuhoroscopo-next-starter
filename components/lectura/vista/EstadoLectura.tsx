import Link from "next/link";
import { CTA_GRADIENT } from "@/components/home/theme";
import { SERIF, CREMA, GOLD, FondoLectura, FONDO_PAGINA, Eyebrow, PanelOscuro, MarcaTuOraculo } from "./Base";

// Pantallas de estado de /lectura (expirado / no encontrado). Qué pantalla se
// muestra lo sigue decidiendo app/lectura/[token]/page.tsx (lógica congelada).
//
// Expirado → oferta de reactivación (pedido de Manuel 2026-10-17): 20% en la
// próxima lectura con el cupón VOLVE20 (tarot_codigos_descuento: 1 uso por
// cliente, tope 200 usos, vence 2027-04-30, editable desde Admin → Cupones).
// El checkout lo precarga desde ?codigo= y lo valida al ingresar el WhatsApp
// (así se controla el límite por cliente). UTMs para medir la campaña.
const CODIGO_REACTIVACION = "VOLVE20";
const HREF_REACTIVACION =
  `/tarot/checkout?codigo=${CODIGO_REACTIVACION}&utm_source=lectura&utm_medium=web&utm_campaign=reactivacion-lectura-expirada`;

function Contenedor({ fontClass, children }: { fontClass: string; children: React.ReactNode }) {
  return (
    <main className={`${fontClass} min-h-screen flex items-center justify-center px-5 py-16 text-center relative`} style={{ background: FONDO_PAGINA }}>
      <FondoLectura />
      <div className="relative w-full max-w-[420px]">
        <div className="mb-8"><MarcaTuOraculo centrado /></div>
        {children}
      </div>
    </main>
  );
}

function Titulo({ children }: { children: React.ReactNode }) {
  return (
    <h1 className="mb-4" style={{ fontFamily: SERIF, fontWeight: 700, fontSize: 28, lineHeight: 1.15, color: CREMA }}>
      {children}
    </h1>
  );
}

function Expirado({ fontClass }: { fontClass: string }) {
  return (
    <Contenedor fontClass={fontClass}>
      <PanelOscuro className="px-6 py-7">
        <Titulo>Este acceso online expiró</Titulo>
        <p className="text-[15px] leading-relaxed" style={{ color: "#c9c4d6" }}>
          El acceso web a esta lectura estuvo disponible durante 30 días y ya no está activo. Si guardaste el PDF, tu lectura sigue disponible ahí para siempre.
        </p>
      </PanelOscuro>

      <div className="mt-5">
        <PanelOscuro className="px-6 py-7" style={{ border: "1px solid rgba(231,184,71,0.8)" }}>
          <Eyebrow className="mb-2">Un regalo para vos</Eyebrow>
          <h2 style={{ fontFamily: SERIF, fontWeight: 700, fontSize: 26, lineHeight: 1.15, color: CREMA }}>
            20% de descuento en tu próxima lectura
          </h2>
          <p className="mt-3 mb-6 text-[15px] leading-relaxed" style={{ color: "#c9c4d6" }}>
            Tu acceso online venció. Si querés hacer una nueva lectura, tenés 20% de descuento.
          </p>
          <a
            href={HREF_REACTIVACION}
            className="inline-flex items-center justify-center rounded-full px-8 min-h-[50px] text-[16px] font-bold transition hover:brightness-105"
            style={{ background: CTA_GRADIENT, color: "#180e00", boxShadow: "0 6px 22px rgba(240,197,90,0.30)" }}
          >
            Quiero mi nueva lectura →
          </a>
          <p className="mt-4 text-[12.5px]" style={{ color: "#a79fbd" }}>
            Código <span className="font-bold tracking-wider" style={{ color: GOLD }}>{CODIGO_REACTIVACION}</span> · se aplica automáticamente
          </p>
        </PanelOscuro>
      </div>
    </Contenedor>
  );
}

function NoEncontrado({ fontClass, waNumero }: { fontClass: string; waNumero: string }) {
  return (
    <Contenedor fontClass={fontClass}>
      <PanelOscuro className="px-6 py-8">
        <Titulo>No encontramos esta lectura</Titulo>
        <p className="mb-6 text-[15px] leading-relaxed" style={{ color: "#c9c4d6" }}>
          Este enlace no existe o está incompleto. Revisá que esté igual a como lo recibiste por WhatsApp o email.
        </p>
        <Link
          href="/"
          className="inline-flex items-center justify-center rounded-full px-7 min-h-[48px] text-[15px] font-semibold transition-colors hover:border-[rgba(240,197,90,0.95)]"
          style={{ color: CREMA, border: "1px solid rgba(231,184,71,0.75)", background: "linear-gradient(180deg,#2a1648,#170c2c)" }}
        >
          Ir a tuoraculo.uy
        </Link>
        {/* Quien llega con un link roto casi siempre pagó: se le da un
            contacto directo (auditoría UX 2026-10-30, L4). */}
        <p className="mt-5 text-[14px]" style={{ color: "#c9c4d6" }}>
          ¿Necesitás ayuda?{" "}
          {waNumero ? (
            <>
              <a href={`https://wa.me/${waNumero}?text=${encodeURIComponent("Hola! No puedo abrir mi lectura de Tarot.")}`} target="_blank" rel="noopener noreferrer" className="underline underline-offset-4" style={{ color: GOLD }}>Escribinos por WhatsApp</a>
              {" "}o a{" "}
            </>
          ) : "Escribinos a "}
          <a href="mailto:hola@tuoraculo.uy?subject=No%20puedo%20abrir%20mi%20lectura" className="underline underline-offset-4" style={{ color: GOLD }}>hola@tuoraculo.uy</a>
          {" "}y te la reenviamos.
        </p>
      </PanelOscuro>
    </Contenedor>
  );
}

export function EstadoLectura({ variante, fontClass, waNumero = "" }: { variante: "expirado" | "no_encontrado"; fontClass: string; waNumero?: string }) {
  return variante === "expirado" ? <Expirado fontClass={fontClass} /> : <NoEncontrado fontClass={fontClass} waNumero={waNumero} />;
}
