'use client';

// Colocar logo en: public/logo-thc.png
const LOGO_SRC = '/logo-thc.png';

function MsgDivider() {
  return <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', margin: '1px 0' }} />;
}

export default function WAPreview() {
  return (
    <div className="rounded-2xl border border-white/10 overflow-hidden" style={{ background: '#0b141a' }}>

      {/* Cabecera del chat */}
      <div
        className="flex items-center gap-3 px-4 py-2.5"
        style={{ background: '#202c33', borderBottom: '1px solid rgba(0,0,0,0.25)' }}
      >
        {/* Avatar con logo — fallback: círculo violeta si public/logo-thc.png no existe */}
        <div
          className="w-8 h-8 rounded-full overflow-hidden shrink-0 flex items-center justify-center"
          style={{ background: 'linear-gradient(135deg, #5b21b6, #7c3aed)' }}
        >
          <img
            src={LOGO_SRC}
            alt="Tu Horóscopo Cósmico"
            className="w-full h-full object-cover"
            onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
          />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-white text-[13px] font-semibold leading-tight">Tu Horóscopo Cósmico</p>
          <p className="text-green-400 text-[11px]">en línea</p>
        </div>
        <span className="text-white/25 text-[11px] shrink-0">08:07</span>
      </div>

      {/* Área de chat */}
      <div style={{ padding: '12px 10px' }}>
        <div className="flex justify-start">

          {/* Burbuja — mensaje recibido */}
          <div
            className="rounded-2xl rounded-tl-none overflow-hidden"
            style={{ backgroundColor: '#202c33', maxWidth: '97%' }}
          >

            {/* Banner "TU MENSAJE DE HOY" */}
            <div
              className="text-center"
              style={{
                padding: '14px 16px 11px',
                background: 'linear-gradient(160deg, #2d1b69 0%, #1e0f4a 45%, #0f0820 100%)',
                borderBottom: '2px solid rgba(251,191,36,0.22)',
              }}
            >
              <p style={{ color: 'rgba(251,191,36,0.55)', fontSize: '10px', letterSpacing: '0.3em', marginBottom: '6px' }}>
                ☽ &nbsp; ✦ &nbsp; ☾
              </p>
              <p style={{ color: '#fff', fontWeight: 800, fontSize: '16px', lineHeight: 1.2, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                Tu mensaje de hoy
              </p>
              <p style={{ color: 'rgba(251,191,36,0.35)', fontSize: '10px', letterSpacing: '0.25em', marginTop: '6px' }}>
                ✦ &nbsp; · &nbsp; ✦
              </p>
            </div>

            {/* Cuerpo */}
            <div style={{ padding: '12px 14px 8px', display: 'flex', flexDirection: 'column', gap: '7px' }}>

              <p style={{ color: 'rgba(255,255,255,0.92)', fontSize: '13.5px', lineHeight: 1.45 }}>
                Hola María ✨
              </p>

              <MsgDivider />

              <div>
                <p style={{ color: 'rgba(255,255,255,0.92)', fontSize: '13.5px', fontWeight: 600 }}>🌐 Horóscopo</p>
                <p style={{ color: 'rgba(255,255,255,0.70)', fontSize: '13px', lineHeight: 1.5, marginTop: '2px' }}>
                  Hoy tu energía te invita a soltar lo que venís cargando. Enfocate en una sola cosa y hacela bien.
                </p>
              </div>

              <MsgDivider />

              <div>
                <p style={{ color: 'rgba(255,255,255,0.92)', fontSize: '13.5px', fontWeight: 600 }}>💙 En foco</p>
                <p style={{ color: 'rgba(255,255,255,0.70)', fontSize: '13px', lineHeight: 1.5, marginTop: '2px' }}>
                  En bienestar mental, bajá el ritmo antes de responder. Tu claridad aparece cuando dejás de correr.
                </p>
              </div>

              <MsgDivider />

              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <p style={{ color: 'rgba(255,255,255,0.82)', fontSize: '13px', lineHeight: 1.45 }}>
                  🔢 <strong style={{ fontWeight: 600 }}>Número:</strong>{' '}
                  <span style={{ color: 'rgba(196,181,253,0.95)' }}>7</span>{' '}
                  — conectá con tu intuición antes de decidir.
                </p>
                <p style={{ color: 'rgba(255,255,255,0.82)', fontSize: '13px', lineHeight: 1.45 }}>
                  🎨 <strong style={{ fontWeight: 600 }}>Color:</strong>{' '}
                  <span style={{ color: 'rgba(196,181,253,0.95)' }}>Violeta</span>{' '}
                  — conectá con tu calma interior.
                </p>
              </div>

              <MsgDivider />

              <div>
                <p style={{ color: 'rgba(255,255,255,0.92)', fontSize: '13.5px', fontWeight: 600 }}>🧘 Pausa</p>
                <p style={{ color: 'rgba(255,255,255,0.70)', fontSize: '13px', lineHeight: 1.5, marginTop: '2px' }}>
                  Respirá profundo tres veces antes de abrir el teléfono.
                </p>
              </div>

              <MsgDivider />

              <div>
                <p style={{ color: 'rgba(255,255,255,0.80)', fontSize: '13px' }}>✨ Estamos con vos</p>
                <p style={{ color: 'rgba(255,255,255,0.35)', fontSize: '11px', marginTop: '2px' }}>
                  Si querés pausar los mensajes, escribí BAJA
                </p>
              </div>

              <p style={{ color: 'rgba(255,255,255,0.25)', fontSize: '10px', textAlign: 'right', marginTop: '2px' }}>
                08:07 ✓✓
              </p>
            </div>
          </div>
        </div>
      </div>

      <p className="text-center pb-3" style={{ color: 'rgba(255,255,255,0.32)', fontSize: '11px' }}>
        Así llega tu mensaje cada mañana
      </p>
    </div>
  );
}
