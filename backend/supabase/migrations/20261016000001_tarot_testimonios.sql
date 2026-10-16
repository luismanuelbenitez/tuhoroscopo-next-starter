-- ============================================================================
-- Testimonios de Tu Tirada Tarot — 2026-10-16.
--
-- Una fila por encuesta de satisfacción. El ciclo previsto:
--   1. Tras la entrega, el sistema envía una encuesta por WhatsApp
--      (estado_encuesta = 'enviada').
--   2. El cliente responde estrellas (0–5), su opinión y si autoriza
--      publicarla (estado_encuesta = 'respondida').
--   3. Desde el admin se decide si se publica en la web (publicado = true).
--
-- La landing /tarot SOLO muestra filas con publicado = true. Por defecto
-- NADA se publica, y la base impide publicar sin opinión, sin puntuación
-- o sin autorización explícita del cliente (ver chk_tarot_testimonios_publicable).
-- Mantiene la decisión del 2026-08-06: nunca testimonios inventados.
--
-- orden_id / cliente_id son nullable a propósito (testimonio cargado a mano
-- por el admin a partir de un mensaje real), pero una orden genera como
-- máximo un testimonio.
-- ============================================================================

create table if not exists tarot_testimonios (
  id                     uuid primary key default gen_random_uuid(),

  -- Vínculo con la compra real (trazabilidad: el testimonio es verificable)
  orden_id               uuid references tarot_ordenes(id) on delete set null,
  cliente_id             uuid references tarot_clientes(id) on delete set null,

  -- Contenido
  opinion                text check (opinion is null or char_length(opinion) <= 600),
  puntuacion             smallint check (puntuacion is null or puntuacion between 0 and 5),
  nombre                 text,              -- como se muestra en la web, ej. "Carolina"
  ciudad                 text,              -- opcional, ej. "Montevideo"

  -- Consentimiento: el cliente aceptó que su opinión se muestre en la web
  autoriza_publicacion   boolean not null default false,
  autoriza_publicacion_at timestamptz,

  -- Publicación en la web (por defecto NO)
  publicado              boolean not null default false,
  publicado_at           timestamptz,
  orden_visual           integer not null default 0,   -- menor = aparece primero

  -- Ciclo de la encuesta
  canal                  text not null default 'whatsapp'
                         check (canal in ('whatsapp', 'email', 'manual')),
  estado_encuesta        text not null default 'pendiente'
                         check (estado_encuesta in ('pendiente', 'enviada', 'respondida', 'expirada', 'descartada')),
  encuesta_enviada_at    timestamptz,
  respondida_at          timestamptz,
  whatsapp_message_id    text,              -- mensaje de encuesta enviado (trazabilidad con Meta)

  notas_internas         text,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),

  -- No se puede publicar algo incompleto ni sin autorización del cliente.
  constraint chk_tarot_testimonios_publicable check (
    publicado = false
    or (opinion is not null and puntuacion is not null and autoriza_publicacion = true)
  )
);

-- Una orden → como máximo un testimonio.
create unique index if not exists uq_tarot_testimonios_orden
  on tarot_testimonios (orden_id) where orden_id is not null;

-- Lectura de la landing: solo publicados, en orden.
create index if not exists idx_tarot_testimonios_publicados
  on tarot_testimonios (orden_visual, publicado_at desc) where publicado = true;

-- Seguimiento de encuestas pendientes de respuesta.
create index if not exists idx_tarot_testimonios_estado
  on tarot_testimonios (estado_encuesta, encuesta_enviada_at);

alter table tarot_testimonios enable row level security;
-- Sin policies: acceso exclusivo vía service_role (server-side de Next.js y
-- Edge Functions), igual que tarot_clientes / tarot_ordenes.

-- updated_at automático + publicado_at al publicar.
create or replace function tarot_testimonios_touch()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  if new.publicado = true and (old.publicado is distinct from true) and new.publicado_at is null then
    new.publicado_at := now();
  end if;
  if new.autoriza_publicacion = true and (old.autoriza_publicacion is distinct from true) and new.autoriza_publicacion_at is null then
    new.autoriza_publicacion_at := now();
  end if;
  return new;
end;
$$;

drop trigger if exists trg_tarot_testimonios_touch on tarot_testimonios;
create trigger trg_tarot_testimonios_touch
  before update on tarot_testimonios
  for each row execute function tarot_testimonios_touch();

-- Nombre tomado del sistema: al vincular una orden, se completa cliente_id
-- y el PRIMER nombre del cliente (nunca el nombre completo ni el apellido
-- en la web). Si el admin cargó un nombre a mano, se respeta.
create or replace function tarot_testimonios_completar_desde_orden()
returns trigger
language plpgsql
as $$
begin
  if new.orden_id is not null and new.cliente_id is null then
    select o.cliente_id into new.cliente_id from tarot_ordenes o where o.id = new.orden_id;
  end if;
  if (new.nombre is null or btrim(new.nombre) = '') and new.cliente_id is not null then
    select initcap(split_part(btrim(c.nombre_completo), ' ', 1)) into new.nombre
      from tarot_clientes c where c.id = new.cliente_id;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_tarot_testimonios_completar on tarot_testimonios;
create trigger trg_tarot_testimonios_completar
  before insert or update of orden_id, cliente_id, nombre on tarot_testimonios
  for each row execute function tarot_testimonios_completar_desde_orden();
