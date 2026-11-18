import { OtraLecturaBloque } from "./Bloques";
import { restSupabase } from "@/lib/asistenteParte";
import { ofertaOtraLectura } from "@/lib/reglasComerciales";
import { getPrecioTarot } from "@/lib/getPrecioTarot";

// "¿Querés hacer otra lectura?" con precio especial (Manuel 2026-11-17).
// Decide en el servidor si corresponde la oferta: regla comercial
// "otra_lectura" activa (Admin → Reglas comerciales) y la lectura dentro de su
// plazo (2 semanas desde la entrega). Si no corresponde o algo falla, el botón
// queda como siempre, a precio normal: nunca una oferta vieja o mal calculada.
export async function OtraLectura({ nombre, nacimiento, expiraAt }: { nombre: string | null; nacimiento: string | null; expiraAt: string }) {
  let oferta = null;
  try {
    const rest = restSupabase();
    if (rest) oferta = await ofertaOtraLectura(rest, expiraAt, await getPrecioTarot());
  } catch {
    oferta = null;
  }
  return <OtraLecturaBloque nombre={nombre} nacimiento={nacimiento} oferta={oferta} />;
}
