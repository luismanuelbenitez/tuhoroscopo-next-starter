-- Opinión: un solo permiso para compartir (2026-11-16, pedido de Manuel:
-- "cero fricción", dos casillas eran muchas).
--
-- Se mantienen las dos columnas de consentimiento (sitio y difusión) y su
-- registro por versión: la página muestra UN interruptor con este texto y,
-- si se activa, marca los dos. Por eso las dos versiones nuevas tienen el
-- mismo texto: cada respuesta queda atada al texto exacto que se presentó.
-- Las v1 quedan guardadas (no vigentes) porque hay respuestas que las citan.

insert into tarot_consentimientos_textos (version, tipo, texto) values
  ('feedback_sitio_v2', 'sitio',
   'Pueden compartir mi opinión en la web, las redes y los anuncios de Tu Oráculo.'),
  ('feedback_difusion_v2', 'difusion',
   'Pueden compartir mi opinión en la web, las redes y los anuncios de Tu Oráculo.')
on conflict (version) do nothing;

update tarot_consentimientos_textos
   set vigente = false
 where version in ('feedback_sitio_v1', 'feedback_difusion_v1');
