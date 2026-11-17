-- Opinión: el permiso único queda solo para la web (2026-11-16, Manuel:
-- "pa que tanto ... en la web del oráculo"). Mismo esquema que
-- 20261116000004: las dos versiones con el mismo texto, un interruptor.
-- Con este texto la opinión se puede usar en la web de Tu Oráculo, no en
-- redes ni anuncios.

insert into tarot_consentimientos_textos (version, tipo, texto) values
  ('feedback_sitio_v3', 'sitio', 'Pueden compartir mi opinión en la web de Tu Oráculo.'),
  ('feedback_difusion_v3', 'difusion', 'Pueden compartir mi opinión en la web de Tu Oráculo.')
on conflict (version) do nothing;

update tarot_consentimientos_textos
   set vigente = false
 where version in ('feedback_sitio_v2', 'feedback_difusion_v2');
