"use client";

// Texto legal reutilizado tal cual de la landing anterior — no se reescribe
// ni se inventa contenido nuevo en este pase. Visualmente discreto, a
// propósito: no compite con las secciones de venta.
export function TransparenciaTarot() {
  return (
    <section className="relative px-5 md:px-8 pb-10 max-w-[620px] mx-auto">
      <div
        className="rounded-2xl"
        style={{ padding: "16px 20px", border: "1px solid rgba(255,255,255,0.06)", background: "rgba(255,255,255,0.02)" }}
      >
        <p
          className="text-[10.5px] font-bold uppercase tracking-widest mb-2"
          style={{ color: "rgba(251,191,36,0.42)" }}
        >
          Transparencia
        </p>
        <p className="text-[12.5px] text-white/42 leading-relaxed m-0">
          Esta lectura es generada por inteligencia artificial aplicando simbología de tarot
          tradicional a tu consulta. No predice el futuro ni reemplaza consejo profesional en
          ninguna área. Su propósito es ofrecerte una perspectiva simbólica para reflexionar.
        </p>
      </div>
    </section>
  );
}
