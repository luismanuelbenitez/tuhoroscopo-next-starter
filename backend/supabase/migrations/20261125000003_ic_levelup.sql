-- Inteligencia comercial · Level Up (2026-11-25). Aditiva, sin tocar datos.
--
-- 1) Corrige un error de la fase 3: al cerrar un experimento, su aprendizaje se
--    guarda con origen 'experimento', que el check no permitía (el cierre
--    habría fallado a mitad de camino).
-- 2) Historial de cada aprendizaje: al corregirlo, darlo de baja o reactivarlo
--    se guarda la versión anterior (la memoria conserva cómo cambió).
-- 3) Decisión 'revalidada': una recomendación vieja que Manuel confirma que
--    sigue vigente vuelve a la bandeja con fecha nueva (deja de ser "vieja").

alter table public.tarot_analista_aprendizajes drop constraint if exists tarot_analista_aprendizajes_origen_check;
alter table public.tarot_analista_aprendizajes add constraint tarot_analista_aprendizajes_origen_check
  check (origen = any (array['ia'::text, 'manual'::text, 'experimento'::text]));

alter table public.tarot_analista_aprendizajes add column if not exists historial jsonb not null default '[]'::jsonb;

alter table public.ic_decisiones drop constraint if exists ic_decisiones_estado_check;
alter table public.ic_decisiones add constraint ic_decisiones_estado_check
  check (estado = any (array['aceptada'::text, 'descartada'::text, 'pospuesta'::text, 'hecha'::text, 'no_aplica'::text, 'revalidada'::text]));
