'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

type Registro = {
  id_suscriptor?: string
  nombre: string
  signo: string
  contenido_preferido: string
  telefono: string
  whatsapp: string
  email?: string
  // Campos de estado que vienen del registro en 2do plano
  resultado?: 'duplicado'
  mensaje?: string
  error_backend?: string
}

export default function PlanCards2() {
  const router = useRouter();
  
  // ===========================================
  // === ESTADOS ===
  // ===========================================
  const [reg, setReg] = useState<Registro | null>(null);
  const [loadingPago, setLoadingPago] = useState(false); // Para el clic del botón
  const [mensajeError, setMensajeError] = useState<string | null>(null);

  // ===========================================
  // === USEEFFECT CON POLLING ===
  // ===========================================
  useEffect(() => {
    
    // Función que revisa sessionStorage
    function checkRegistro() {
      try {
        const raw = sessionStorage.getItem('registro');
        if (!raw) {
          // Si no hay nada, podría ser que el usuario navegó directo aquí
          console.warn("[PlanCards2] Polling: No hay 'registro' en sessionStorage.");
          return true; // Detener polling si no hay registro
        }

        const registro: Registro = JSON.parse(raw);

        // Actualizamos 'reg' en CADA sondeo.
        // 1. Primero se seteará sin id_suscriptor (renderiza el saludo)
        // 2. Luego se seteará CON id_suscriptor (habilita el botón)
        setReg(registro); 

        // CASO 1: ¡ÉXITO! Se encontró el ID
        if (registro.id_suscriptor) {
          console.log(`[PlanCards2] Polling: ID ${registro.id_suscriptor} encontrado.`);
          setMensajeError(null);
          return true; // Detener polling
        }

        // CASO 2: Error de Duplicado
        if (registro.resultado === 'duplicado') {
          console.warn('[PlanCards2] Polling: Resultado duplicado encontrado.');
          setMensajeError(registro.mensaje || 'Ya tenés una suscripción activa.');
          return true; // Detener polling
        }

        // CASO 3: Error de Backend
        if (registro.error_backend) {
          console.error('[PlanCards2] Polling: Error de backend encontrado:', registro.error_backend);
          setMensajeError(registro.error_backend);
          return true; // Detener polling
        }

        // CASO 4: Aún no hay ID, seguir esperando...
        console.log('[PlanCards2] Polling: Esperando id_suscriptor...');
        return false; // Continuar polling

      } catch (err) {
        console.error('Error leyendo sessionStorage en polling:', err);
        setMensajeError("Error al leer tus datos de registro.");
        return true; // Detener polling por error
      }
    }

    // Ejecución inicial del polling (por si ya estaba listo)
    if (checkRegistro()) return;

    // Intervalo de polling
    const interval = setInterval(() => {
      if (checkRegistro()) {
        clearInterval(interval);
      }
    }, 500); // Revisa 2 veces por segundo

    // Limpiar al desmontar
    return () => clearInterval(interval);
  }, []); // El array vacío asegura que se ejecute solo una vez al montar

  // ===========================================
  // === LÓGICA DE ACTIVACIÓN (SIN CAMBIOS) ===
  // ===========================================
  async function handleActivate() {
    if (!reg || !reg.id_suscriptor || loadingPago) return; 
    setLoadingPago(true);

    try {
      const res = await fetch('/api/crear-suscripcion', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id_suscriptor: reg.id_suscriptor,
          nombre: reg.nombre,
          whatsapp: reg.whatsapp,
          signo: reg.signo,
          contenido_preferido: reg.contenido_preferido,
          email: reg.email ?? `user_${reg.whatsapp}@tuoraculo.uy`,
          monto: 390,
          moneda: "UYU",
          reason: `Premium mensual THC - ${reg.nombre}`
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (res.ok && (data.init_point || data.sandbox_init_point)) {
        window.location.href = data.init_point || data.sandbox_init_point;
      } else {
        console.error('Respuesta inesperada:', data);
        alert(data?.error || 'No se pudo iniciar el pago.');
      }
    } catch (err) {
      console.error('Error creando suscripción:', err);
      alert('Ocurrió un error al iniciar el pago.');
    } finally {
      setLoadingPago(false);
    }
  }

  // ===========================================
  // === RENDERIZADO ===
  // ===========================================

  // 1. Estado de Error (Duplicado o Falla de Alta) - MODAL
  if (mensajeError) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-black/60 backdrop-blur-sm z-50">
        <div className="bg-gradient-to-b from-rose-900/95 to-rose-800/95 rounded-3xl shadow-2xl p-8 max-w-sm w-[90%] text-center transform transition-all duration-300 scale-100">
          <div className="flex justify-center mb-4"><span className="text-5xl">🔔</span></div>
          <h2 className="text-2xl font-bold text-white mb-3">Aviso importante</h2>
          <p className="mb-6 text-white/90 leading-relaxed">
            {mensajeError}
          </p>
          <button
            onClick={() => {
              setMensajeError(null);
              sessionStorage.removeItem('registro'); 
              router.push("/registro?from=planes");
            }}
            className="w-full rounded-2xl bg-gray-200 px-6 py-3 font-semibold text-gray-800 shadow-lg hover:bg-gray-300 transition"
          >
            Volver a intentarlo
          </button>
        </div>
      </div>
    );
  }

  // 2. Estado de Carga INICIAL (antes del primer polling)
  // Muestra un loader breve mientras 'reg' es null
  if (!reg) {
    return (
      <div className="max-w-[720px] mx-auto px-4 py-16 text-center">
        {/* Loader simple para la carga inicial */}
        <div className="w-10 h-10 border-4 border-t-pink-400 border-white/30 rounded-full animate-spin mx-auto"></div>
      </div>
    );
  }

  // 3. Estado de Éxito/Carga (Mostrar Tarjeta de Plan)
  // 'reg' existe (al menos con nombre/signo, quizás sin id_suscriptor todavía)
  const maskedWa = reg.whatsapp.replace(/^(\+\d{3})\d+(\d{3})$/, '$1 *** $2');
  
  // Variable de control para el botón
  const isButtonDisabled = loadingPago || !reg.id_suscriptor;

  return (
    <div className="px-4 py-12">
      <div className="mx-auto max-w-3xl">
        {/* Banner superior con saludo */}
        <div className="mx-auto max-w-2xl mb-6 rounded-full bg-cosmic-surface/75 border border-white/10 text-center px-5 py-3">
          <p className="text-white/80">
            ¡Hola, <span className="font-semibold text-white">{reg.nombre}</span>! Estás a un paso de recibir tu contenido premium en{' '}
            <span className="font-mono text-white/90">{maskedWa}</span>
          </p>
        </div>

        {/* Tarjeta principal */}
        <div className="rounded-xl2 bg-cosmic-surface/70 border border-white/10 p-6 md:p-8 shadow-glow backdrop-blur-sm">
          <div className="mx-auto max-w-xl text-center">
            <span className="inline-block text-[20px] tracking-widest uppercase text-cosmic-gold/90 bg-black/20 border border-white/10 rounded-full px-3 py-1 mb-6">
              Flexibilidad total
            </span>
            <h1 className="text-white text-2xl md:text-3xl font-extrabold">
              Suscripción premium mensual
            </h1>
            <div className="my-4">
              <span className="text-4xl md:text-5xl font-extrabold text-white">$U 390</span>
              <span className="text-white/80 font-semibold ml-1">/mes</span>
            </div>
            <ul className="text-white/80 text-sm space-y-1 mb-6">
              <li>Pagás mes a mes, sin ataduras.</li>
              <li>Renovación automática. Cancelás cuando quieras.</li>
              <li>Recibí tu primer mensaje en minutos.</li>
            </ul>
            
            {/* === BOTÓN CORREGIDO (TEXTO FIJO) === */}
            <button
              onClick={handleActivate}
              disabled={isButtonDisabled} // Deshabilitado si carga pago O si no hay ID
              className="w-full rounded-xl2 px-5 py-3 font-bold text-[#1a0935] bg-cta-grad shadow-glow hover:opacity-[.98] transition disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {loadingPago ? 'Iniciando pago…' : 'Activá tu cuenta ahora'}
            </button>

            <p className="text-white/55 text-xs mt-3">
              Serás redirigido a Mercado Pago para finalizar el pago de forma segura.
            </p>
          </div>
          <div className="mt-6 text-center text-xs text-white/55">
            Signo: <span className="text-white/75">{reg.signo || '—'}</span> · Preferencia:{' '}
            <span className="text-white/75">{reg.contenido_preferido || '—'}</span>
          </div>
          <div className="mt-4 text-center">
            <Link href="/registro?from=planes" className="text-white/75 underline hover:text-white">
              Editar mis datos
            </Link>
          </div>
          <div className="mt-6 text-center text-[11px] text-white/50">
            Tus datos están protegidos. Podés cancelar online en cualquier momento.
          </div>
        </div>
      </div>
    </div>
  )
}
