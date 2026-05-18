-- ================================================================
-- SPRINT 1: TAROT THC — Tablas, índices y RLS
-- Módulo 100% independiente. Prefijo tarot_ en todas las tablas.
-- No toca ninguna tabla existente del SaaS THC.
-- ================================================================

-- 1. tarot_mazos
CREATE TABLE tarot_mazos (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre           text NOT NULL,
  nombre_corto     text NOT NULL,
  descripcion      text,
  anio_publicacion integer,
  dominio_publico  boolean NOT NULL DEFAULT false,
  licencia         text NOT NULL DEFAULT 'public_domain',
  activo           boolean NOT NULL DEFAULT true,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

-- 2. tarot_tipos_tirada
CREATE TABLE tarot_tipos_tirada (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre           text NOT NULL,
  slug             text NOT NULL UNIQUE,
  descripcion      text,
  cantidad_cartas  smallint NOT NULL,
  activa           boolean NOT NULL DEFAULT true,
  orden_display    smallint NOT NULL DEFAULT 1,
  created_at       timestamptz NOT NULL DEFAULT now()
);

-- 3. tarot_posiciones_tirada
CREATE TABLE tarot_posiciones_tirada (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo_tirada_id   uuid NOT NULL REFERENCES tarot_tipos_tirada(id) ON DELETE CASCADE,
  numero           smallint NOT NULL,
  nombre           text NOT NULL,
  descripcion      text,
  icono            text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tipo_tirada_id, numero)
);

-- 4. tarot_cartas
CREATE TABLE tarot_cartas (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mazo_id                uuid NOT NULL REFERENCES tarot_mazos(id) ON DELETE RESTRICT,
  nombre_es              text NOT NULL,
  nombre_en              text,
  arcano                 text NOT NULL CHECK (arcano IN ('mayor', 'menor')),
  numero                 smallint,
  palo                   text CHECK (palo IN ('bastos', 'copas', 'espadas', 'oros')),
  carta_corte            text,
  imagen_url             text,
  imagen_alt             text,
  significado_normal     text,
  significado_invertido  text,
  significados_por_tema  jsonb NOT NULL DEFAULT '{}',
  keywords               text[] NOT NULL DEFAULT '{}',
  activa                 boolean NOT NULL DEFAULT true,
  created_at             timestamptz NOT NULL DEFAULT now()
);

-- 5. tarot_clientes
CREATE TABLE tarot_clientes (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre_completo      text NOT NULL,
  telefono             text NOT NULL,
  email                text,
  fecha_nacimiento     date NOT NULL,
  hora_nacimiento      time,
  lugar_nacimiento     text,
  ip_registro          inet,
  user_agent           text,
  acepto_terminos      boolean NOT NULL DEFAULT false,
  acepto_terminos_at   timestamptz,
  acepto_privacidad    boolean NOT NULL DEFAULT false,
  acepto_privacidad_at timestamptz,
  version_terminos     text NOT NULL DEFAULT 'v1.0',
  hash_verificacion    text,
  deleted_at           timestamptz,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);

-- 6. tarot_ordenes
CREATE TABLE tarot_ordenes (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id         uuid NOT NULL REFERENCES tarot_clientes(id) ON DELETE RESTRICT,
  tipo_tirada_id     uuid NOT NULL REFERENCES tarot_tipos_tirada(id) ON DELETE RESTRICT,
  mazo_id            uuid NOT NULL REFERENCES tarot_mazos(id) ON DELETE RESTRICT,
  estado             text NOT NULL DEFAULT 'formulario_completo'
                     CHECK (estado IN (
                       'formulario_completo','pago_iniciado','pago_confirmado',
                       'pago_rechazado','pago_expirado','generando_lectura',
                       'lectura_lista','generando_pdf','pdf_listo',
                       'enviando_whatsapp','entregado',
                       'error_lectura','error_pdf','error_whatsapp',
                       'error_critico','cancelado'
                     )),
  external_reference text NOT NULL UNIQUE,
  pregunta_usuario   text,
  tema               text NOT NULL DEFAULT 'general'
                     CHECK (tema IN ('general','amor','trabajo','salud','dinero')),
  precio_cobrado     numeric(10,2) NOT NULL,
  moneda             text NOT NULL DEFAULT 'UYU'
                     CHECK (moneda IN ('UYU','ARS','USD')),
  idioma             text NOT NULL DEFAULT 'es',
  origen_canal       text NOT NULL DEFAULT 'web'
                     CHECK (origen_canal IN ('web','whatsapp','instagram')),
  utm_source         text,
  utm_medium         text,
  utm_campaign       text,
  ip_orden           inet,
  user_agent_orden   text,
  pagina_origen      text,
  notas_internas     text,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

-- 7. tarot_pagos
CREATE TABLE tarot_pagos (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  orden_id              uuid NOT NULL REFERENCES tarot_ordenes(id) ON DELETE RESTRICT,
  mp_preference_id      text,
  mp_payment_id         text,
  mp_external_reference text,
  mp_status             text CHECK (mp_status IN (
                          'pending','approved','in_process','rejected',
                          'cancelled','refunded','charged_back'
                        )),
  mp_status_detail      text,
  mp_payment_type       text,
  mp_payment_method_id  text,
  mp_installments       smallint DEFAULT 1,
  monto                 numeric(10,2),
  moneda                text,
  ip_pago               inet,
  webhook_payload       jsonb,
  webhook_received_at   timestamptz,
  link_pago             text,
  link_expira_at        timestamptz,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

-- 8. tarot_lecturas
CREATE TABLE tarot_lecturas (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  orden_id         uuid NOT NULL REFERENCES tarot_ordenes(id) ON DELETE RESTRICT,
  estado           text NOT NULL DEFAULT 'pendiente'
                   CHECK (estado IN ('pendiente','generando','completada','error')),
  numero_intento   smallint NOT NULL DEFAULT 1,
  es_vigente       boolean NOT NULL DEFAULT true,
  prompt_sistema   text,
  prompt_usuario   text,
  ia_modelo        text,
  ia_tokens_entrada  integer,
  ia_tokens_salida   integer,
  ia_costo_usd     numeric(8,6),
  contenido_json   jsonb,
  resumen_lectura  text,
  mensaje_final    text,
  error_codigo     text,
  error_mensaje    text,
  error_detalle    jsonb,
  generado_at      timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

-- 9. tarot_lecturas_cartas
CREATE TABLE tarot_lecturas_cartas (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lectura_id       uuid NOT NULL REFERENCES tarot_lecturas(id) ON DELETE CASCADE,
  carta_id         uuid NOT NULL REFERENCES tarot_cartas(id) ON DELETE RESTRICT,
  posicion_id      uuid NOT NULL REFERENCES tarot_posiciones_tirada(id) ON DELETE RESTRICT,
  numero_posicion  smallint NOT NULL,
  invertida        boolean NOT NULL DEFAULT false,
  interpretacion   text,
  consejo          text,
  created_at       timestamptz NOT NULL DEFAULT now()
);

-- 10. tarot_pdfs
CREATE TABLE tarot_pdfs (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  orden_id         uuid NOT NULL REFERENCES tarot_ordenes(id) ON DELETE RESTRICT,
  lectura_id       uuid NOT NULL REFERENCES tarot_lecturas(id) ON DELETE RESTRICT,
  estado           text NOT NULL DEFAULT 'pendiente'
                   CHECK (estado IN ('pendiente','generando','generado','error_generacion','invalidado')),
  numero_intento   smallint NOT NULL DEFAULT 1,
  storage_bucket   text NOT NULL DEFAULT 'tarot-pdfs',
  storage_path     text,
  storage_url      text,
  tamano_bytes     integer,
  paginas          smallint,
  plantilla_usada  text NOT NULL DEFAULT 'v1',
  hash_archivo     text,
  error_codigo     text,
  error_mensaje    text,
  generado_at      timestamptz,
  url_expira_at    timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

-- 11. tarot_envios_whatsapp
CREATE TABLE tarot_envios_whatsapp (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  orden_id         uuid NOT NULL REFERENCES tarot_ordenes(id) ON DELETE RESTRICT,
  pdf_id           uuid NOT NULL REFERENCES tarot_pdfs(id) ON DELETE RESTRICT,
  estado           text NOT NULL DEFAULT 'pendiente'
                   CHECK (estado IN (
                     'pendiente','enviando','enviado','entregado',
                     'leido','error','agotado_reintentos'
                   )),
  numero_intento   smallint NOT NULL DEFAULT 1,
  telefono_destino text NOT NULL,
  proveedor_wa     text NOT NULL DEFAULT 'twilio',
  wa_message_id    text,
  wa_status        text,
  wa_error_code    text,
  wa_error_mensaje text,
  respuesta_raw    jsonb,
  enviado_at       timestamptz,
  entregado_at     timestamptz,
  leido_at         timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

-- 12. tarot_configuracion
CREATE TABLE tarot_configuracion (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clave       text NOT NULL UNIQUE,
  valor       text NOT NULL,
  tipo_valor  text NOT NULL DEFAULT 'string'
              CHECK (tipo_valor IN ('string','number','boolean','json')),
  descripcion text,
  es_secreto  boolean NOT NULL DEFAULT false,
  activo      boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- 13. tarot_logs
CREATE TABLE tarot_logs (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  orden_id       uuid REFERENCES tarot_ordenes(id) ON DELETE SET NULL,
  cliente_id     uuid REFERENCES tarot_clientes(id) ON DELETE SET NULL,
  evento         text NOT NULL,
  nivel          text NOT NULL DEFAULT 'info'
                 CHECK (nivel IN ('debug','info','warning','error','critical')),
  mensaje        text,
  payload        jsonb NOT NULL DEFAULT '{}',
  ip             inet,
  user_agent     text,
  duracion_ms    integer,
  funcion_origen text,
  created_at     timestamptz NOT NULL DEFAULT now()
);

-- ================================================================
-- ÍNDICES
-- ================================================================
CREATE INDEX idx_tarot_ordenes_external_ref   ON tarot_ordenes(external_reference);
CREATE INDEX idx_tarot_ordenes_estado         ON tarot_ordenes(estado);
CREATE INDEX idx_tarot_ordenes_cliente_id     ON tarot_ordenes(cliente_id);
CREATE INDEX idx_tarot_ordenes_created_at     ON tarot_ordenes(created_at DESC);
CREATE INDEX idx_tarot_lecturas_orden_vigente ON tarot_lecturas(orden_id, es_vigente);
CREATE INDEX idx_tarot_lecturas_estado        ON tarot_lecturas(estado);
CREATE INDEX idx_tarot_pdfs_orden_estado      ON tarot_pdfs(orden_id, estado);
CREATE INDEX idx_tarot_envios_wa_orden_estado ON tarot_envios_whatsapp(orden_id, estado);
CREATE INDEX idx_tarot_logs_orden_id          ON tarot_logs(orden_id, created_at DESC);
CREATE INDEX idx_tarot_logs_nivel             ON tarot_logs(nivel, created_at DESC);
CREATE INDEX idx_tarot_cartas_mazo_arcano     ON tarot_cartas(mazo_id, arcano);
CREATE INDEX idx_tarot_pagos_mp_payment_id    ON tarot_pagos(mp_payment_id);
CREATE INDEX idx_tarot_pagos_orden_id         ON tarot_pagos(orden_id);
CREATE INDEX idx_tarot_config_clave_activo    ON tarot_configuracion(clave) WHERE activo = true;

-- ================================================================
-- ROW LEVEL SECURITY
-- ================================================================
ALTER TABLE tarot_mazos             ENABLE ROW LEVEL SECURITY;
ALTER TABLE tarot_cartas            ENABLE ROW LEVEL SECURITY;
ALTER TABLE tarot_tipos_tirada      ENABLE ROW LEVEL SECURITY;
ALTER TABLE tarot_posiciones_tirada ENABLE ROW LEVEL SECURITY;
ALTER TABLE tarot_clientes          ENABLE ROW LEVEL SECURITY;
ALTER TABLE tarot_ordenes           ENABLE ROW LEVEL SECURITY;
ALTER TABLE tarot_pagos             ENABLE ROW LEVEL SECURITY;
ALTER TABLE tarot_lecturas          ENABLE ROW LEVEL SECURITY;
ALTER TABLE tarot_lecturas_cartas   ENABLE ROW LEVEL SECURITY;
ALTER TABLE tarot_pdfs              ENABLE ROW LEVEL SECURITY;
ALTER TABLE tarot_envios_whatsapp   ENABLE ROW LEVEL SECURITY;
ALTER TABLE tarot_configuracion     ENABLE ROW LEVEL SECURITY;
ALTER TABLE tarot_logs              ENABLE ROW LEVEL SECURITY;

-- Catálogo: lectura pública (el frontend necesita cartas y mazos)
CREATE POLICY "tarot_mazos_select_public"
  ON tarot_mazos FOR SELECT USING (activo = true);

CREATE POLICY "tarot_cartas_select_public"
  ON tarot_cartas FOR SELECT USING (activa = true);

CREATE POLICY "tarot_tipos_tirada_select_public"
  ON tarot_tipos_tirada FOR SELECT USING (activa = true);

CREATE POLICY "tarot_posiciones_tirada_select_public"
  ON tarot_posiciones_tirada FOR SELECT USING (true);

-- El resto sin políticas públicas.
-- Las Edge Functions operan con service_role (bypass RLS).
-- Sin política = sin acceso desde anon/authenticated.
