import Link from 'next/link';

import { PaginaInstitucional, EncabezadoInstitucional, PanelInstitucional, PANEL_INSTITUCIONAL } from '@/components/marca/PaginaInstitucional';
import { GOLD } from '@/components/home/theme';
import { getPrecioSuscripcion } from '@/lib/getPrecioSuscripcion';
import { getPrecioTarot } from '@/lib/getPrecioTarot';

export default async function TerminosServicio() {
  const [precio, precioTarot] = await Promise.all([
    getPrecioSuscripcion(),
    getPrecioTarot(),
  ]);
  const precioTarotTexto = precioTarot !== null ? `$U ${precioTarot}` : 'el precio que ves en el checkout';
  const precioSuscripcionTexto = precio !== null ? `$U ${precio}` : 'el precio que ves en el checkout';

  const SECTIONS = [
    {
      title: '1. Descripción del servicio',
      content: 'Tu Oráculo es una empresa uruguaya de experiencias digitales de autoconocimiento. Hoy ofrece un producto en producción: Tarot, lecturas individuales generadas por inteligencia artificial y entregadas vía WhatsApp. También existe la Guía Diaria, una suscripción mensual de mensajes personalizados por WhatsApp, no comercializada actualmente. Ambos son de uso personal y no comercial. Tu Oráculo es un servicio operado por Luis Manuel Benítez Rodríguez, titular de una empresa unipersonal registrada en Uruguay, RUT 214998320016.',
    },
    {
      title: '2. Condiciones de uso',
      content: 'Al usar nuestros servicios aceptás estos Términos en su totalidad. Debés ser mayor de 18 años para contratar una lectura o suscribirte. No podés usar el servicio con fines comerciales, revender el contenido ni reproducirlo sin autorización.',
    },
    {
      title: '3. Tarot — Pago único',
      content: `Las lecturas de tarot son un producto de pago único: cuestan ${precioTarotTexto}, sin suscripción ni renovación automática. Cada contratación corresponde a una lectura individual sobre la consulta especificada en el formulario. El pago se procesa a través de Mercado Pago.`,
    },
    {
      title: '4. Guía Diaria — Suscripción mensual',
      content: `La Guía Diaria, cuando está disponible, cuesta ${precioSuscripcionTexto} por mes, con renovación automática mensual. Podés cancelar en cualquier momento desde tu perfil en Mercado Pago o escribiéndonos a hola@tuoraculo.uy. La cancelación detiene la renovación siguiente; no hay reembolso proporcional por el mes en curso salvo que la cancelación ocurra dentro de las primeras 24 horas del cargo.`,
    },
    {
      title: '5. Contenido generado por inteligencia artificial',
      content: 'Las lecturas de Tarot son generadas íntegramente por modelos de inteligencia artificial aplicando simbología del tarot tradicional a la consulta del usuario. El contenido tiene exclusivamente carácter simbólico y de reflexión personal. No constituye asesoramiento profesional de ningún tipo (psicológico, médico, legal, financiero ni de ninguna otra índole). Tu Oráculo no garantiza resultados ni la exactitud de ninguna interpretación. El usuario asume la responsabilidad por el uso que haga del contenido recibido.',
    },
    {
      title: '6. Entregas y tiempos',
      content: 'Las lecturas de Tarot se entregan en menos de 15 minutos tras la confirmación del pago, salvo problemas técnicos imprevistos — en ese caso, nos ponemos en contacto con el usuario. La Guía Diaria, cuando está disponible, se entrega cada mañana, generalmente entre las 7 y las 9 AM (hora de Uruguay).',
    },
    {
      title: '7. Pagos y seguridad',
      content: 'Todos los pagos son procesados por Mercado Pago. Tu Oráculo no almacena datos de tarjeta ni información de pago sensible en sus servidores. Las disputas de pago deben gestionarse directamente con Mercado Pago de acuerdo a sus políticas.',
    },
    {
      title: '8. Limitación de responsabilidad',
      content: 'Tu Oráculo ofrece contenido de bienestar, astrología práctica y simbología tarot con fines recreativos y de reflexión. No somos responsables por decisiones tomadas en base al contenido de nuestros mensajes o lecturas. La responsabilidad total de Tu Oráculo ante cualquier reclamación se limita al importe abonado por el servicio en cuestión.',
    },
    {
      title: '9. Propiedad intelectual',
      content: 'El contenido generado por Tu Oráculo(mensajes, lecturas, diseños) es propiedad de Tu Oráculo. Podés usarlo para uso personal, pero no reproducirlo, distribuirlo ni comercializarlo sin autorización escrita.',
    },
    {
      title: '10. Modificaciones',
      content: 'Nos reservamos el derecho de actualizar estos Términos en cualquier momento. Cambios significativos serán comunicados por WhatsApp o en el sitio web. El uso continuado del servicio después de notificada una actualización implica aceptación de los nuevos términos.',
    },
    {
      title: '11. Contacto',
      content: 'Para cualquier consulta relacionada con estos Términos, escribinos a hola@tuoraculo.uy.',
    },
  ];

  return (
    <PaginaInstitucional>
      <EncabezadoInstitucional eyebrow="Legal" titulo="Términos del servicio">
        <p>Estas condiciones regulan el uso del Tarot y, cuando esté disponible, de la Guía Diaria.</p>
        <p className="text-white/45 text-[13px] mt-2">Última actualización: septiembre 2026</p>
      </EncabezadoInstitucional>

      <div className="space-y-3 mb-10">
        {SECTIONS.map(section => (
          <PanelInstitucional key={section.title} titulo={section.title}>
            <p>{section.content}</p>
          </PanelInstitucional>
        ))}
      </div>

      <div className="rounded-2xl px-6 py-5 text-center" style={PANEL_INSTITUCIONAL}>
        <p className="text-white/70 text-[15px]">
          Consultas legales:{' '}
          <a href="mailto:hola@tuoraculo.uy" className="underline underline-offset-2" style={{ color: GOLD }}>
            hola@tuoraculo.uy
          </a>
        </p>
          <p className="text-white/50 text-[13px] mt-3">
            ¿Buscás la{' '}
            <Link href="/politica-de-privacidad" className="underline underline-offset-2" style={{ color: GOLD }}>
              Política de privacidad
            </Link>
            ?
          </p>
      </div>
    </PaginaInstitucional>
  );
}
