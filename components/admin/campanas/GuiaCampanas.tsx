import { BookOpen } from "lucide-react";
import { PLANTILLAS_META_UI, TIPO_CAMPANA_UI } from "@/components/admin/campanas/ui";

// ============================================================================
// Guía de Campañas (2026-11-16, pedido de Manuel): lo que hay que saber para
// decidir, documentado donde se usa. Plantillas de Meta, cuándo conviene
// mandar y cuánto cuesta, y quién queda identificado al calificar.
// ============================================================================

function Bloque({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <details className="rounded-lg border border-gray-800 bg-gray-950/40 px-3.5 py-3">
      <summary className="cursor-pointer text-[14px] font-semibold text-gray-200">{titulo}</summary>
      <div className="mt-2.5 space-y-2 text-[13px] leading-relaxed text-gray-300">{children}</div>
    </details>
  );
}

const Li = ({ children }: { children: React.ReactNode }) => <li>{children}</li>;
const B = ({ children }: { children: React.ReactNode }) => <strong className="text-gray-100">{children}</strong>;

export function GuiaCampanas() {
  return (
    <section className="mb-4 space-y-2">
      <p className="flex items-center gap-1.5 text-[13px] font-semibold text-gray-400"><BookOpen size={14} /> Guía</p>

      <Bloque titulo="Plantillas de Meta: qué se les manda">
        <p>WhatsApp solo deja escribirle primero a una clienta con un mensaje aprobado por Meta (una plantilla). Se aprueba una vez por tipo y sirve para todas las campañas de ese tipo. Categoría <B>Marketing</B> (Meta no nos permite Utilidad), idioma español.</p>
        <div className="space-y-2">
          {Object.entries(PLANTILLAS_META_UI).map(([tipo, p]) => (
            <div key={tipo} className="rounded-md border border-gray-800 px-3 py-2">
              <p className="font-medium text-gray-100">{TIPO_CAMPANA_UI[tipo] ?? tipo} <span className="ml-1 font-mono text-[12px] text-gray-500">{p.nombre}</span></p>
              <p className="text-gray-400">Botón «{p.boton}» → <span className="font-mono text-gray-200 break-all">{p.url}{"{{1}}"}</span></p>
              <p className="text-gray-500">Ejemplo para Meta: <span className="font-mono break-all">{p.url}ejemplo123</span></p>
            </div>
          ))}
        </div>
        <p className="text-gray-400">El {"{{1}}"} del texto es el nombre de pila; el {"{{1}}"} del botón es la clave personal de cada clienta. El texto completo y el estado en Meta se ven en el detalle de cada campaña.</p>
      </Bloque>

      <Bloque titulo="Cuándo mandar y cuánto cuesta (ventana de 24 h)">
        <ul className="list-disc space-y-1.5 pl-4 marker:text-gray-600">
          <Li><B>La ventana de 24 h la abre la clienta cuando nos escribe</B>, no la compra. Nuestros mensajes (entrega, campañas) no la abren.</Li>
          <Li><B>Las plantillas de Marketing se cobran siempre</B>, aunque la ventana esté abierta. Lo que no se cobra dentro de la ventana es el texto libre (un mensaje común, sin plantilla).</Li>
          <Li><B>Clienta que nos escribió</B> (por ejemplo, una consulta a soporte): dentro de la ventana se le puede pedir la opinión con texto libre, sin costo. <span className="text-gray-500">Idea para una etapa futura; hoy no está automatizado.</span></Li>
          <Li><B>Clienta que vino por un anuncio y nunca escribió</B>: no hay ventana. Va la plantilla, en el momento de siempre.</Li>
          <Li><B>El momento de siempre</B>: 24 h después de que abre su lectura por primera vez (si no la abre, 48 h después de la entrega). Antes es pronto: todavía no la leyó y la respuesta es pobre o no llega.</Li>
          <Li>Solo se envía entre las 10 y las 21 h de Uruguay; lo que cae afuera espera al siguiente turno.</Li>
        </ul>
      </Bloque>

      <Bloque titulo="Quién calificó y qué se muestra">
        <ul className="list-disc space-y-1.5 pl-4 marker:text-gray-600">
          <Li><B>Cada envío lleva un link único</B>, atado a la orden y a la clienta. En la base se guarda solo una versión cifrada de la clave; el link vence a los 30 días.</Li>
          <Li><B>Una respuesta por envío</B>: queda guardada con la orden, la clienta, las estrellas (1 a 5) y el comentario. No se puede responder dos veces con el mismo link.</Li>
          <Li><B>En el admin</B> se ve quién respondió y de qué compra.</Li>
          <Li><B>Hacia afuera</B> solo puede aparecer «Nombre + inicial» (por ejemplo, Paula M.), y solo si dio permiso para compartirla. Desde el 16/11 es un único interruptor («Pueden compartir mi opinión en la web, las redes y los anuncios de Tu Oráculo»), que aparece solo con 4 o 5 estrellas y comentario, y arranca apagado. En la base se registra como sitio + difusión, con fecha y la versión exacta del texto aceptado.</Li>
          <Li><B>Testimonios</B>: una opinión con permiso puede pasar a Testimonios, pero no se publica sola; la publica Manuel.</Li>
          <Li>Como la respuesta está atada a la orden, se puede cruzar con el canal de la compra (anuncio de Facebook, Google, soporte). <span className="text-gray-500">El dato está; este panel todavía no lo muestra así.</span></Li>
        </ul>
      </Bloque>
    </section>
  );
}
