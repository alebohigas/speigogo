-- =====================================================================
-- MULTI-TORNEO 03 — Revisión de conflictos por dominio compartido
-- Idempotente. Ejecutar después de 01_scope y 02_seed.
--
-- Resultado de la revisión de tablas:
--   • Por TORNEO (ya soportan varios torneos en el mismo dominio, sin
--     cambios necesarios): convocatoria_content, categorias_reglas, menu,
--     patrocinadores, mejorscorep, banderas, registro, registro_form_fields,
--     registro_precios, registro_socio_tipos, registro_preferente_config,
--     clubs_registro.
--   • Por DOMINIO + ALCANCE: site_config (columna `scope`) y site_torneos.
--   • Globales (compartidas a propósito): usuarios, usuario_areas,
--     usuario_sesion, estatuspago, clubs.
--
-- Esta migración sólo corrige los dos puntos donde el dominio compartido
-- podía causar conflicto:
--   1) la fila `general` debe apuntar al torneo PRINCIPAL del dominio;
--   2) cada torneo activo debe tener su propia fila de configuración.
-- =====================================================================

SET NAMES utf8mb4;

-- 0) Normalizar colación: mezclar utf8mb4_unicode_ci con utf8mb4_general_ci
--    provoca el error 1267 en los JOIN por `domain`. Unificamos todo a
--    utf8mb4_unicode_ci (tablas y columnas de texto).
ALTER TABLE site_config  CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
ALTER TABLE site_torneos CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- 1) Alinear site_config.general con el primer torneo activo del dominio.
UPDATE site_config sc
JOIN (
  SELECT st.domain, st.torneoid
  FROM site_torneos st
  JOIN (
    SELECT domain, MIN(orden * 100000 + id) AS rank_key
    FROM site_torneos WHERE activo = 1 GROUP BY domain
  ) f ON f.domain = st.domain AND (st.orden * 100000 + st.id) = f.rank_key
) p ON p.domain = sc.domain COLLATE utf8mb4_unicode_ci
SET sc.torneoid = p.torneoid
WHERE sc.scope = 'general';

-- 2) Crear la fila de configuración de cada torneo activo que aún no exista,
--    copiando la configuración general del dominio como punto de partida.
INSERT INTO site_config (
  domain, scope, torneoid, menu_order, visibility, menu_groups,
  page_group_assignments, live_scoring_config, sponsors_config, eventos_config,
  avisos_config, premios_config, hoteles_config, menus_config, popup_config,
  anuncio_config, home_config, hero_config, historial_config, stats_config,
  stats_page_config, modules_config, tarjetas_config, theme_config
)
SELECT g.domain, CAST(st.torneoid AS CHAR), st.torneoid, g.menu_order, g.visibility, g.menu_groups,
       g.page_group_assignments, g.live_scoring_config, g.sponsors_config, g.eventos_config,
       g.avisos_config, g.premios_config, g.hoteles_config, g.menus_config, g.popup_config,
       g.anuncio_config, g.home_config, g.hero_config, g.historial_config, g.stats_config,
       g.stats_page_config, g.modules_config, g.tarjetas_config, g.theme_config
FROM site_torneos st
JOIN site_config g ON g.domain = st.domain COLLATE utf8mb4_unicode_ci AND g.scope = 'general'
WHERE st.activo = 1
  AND NOT EXISTS (
    SELECT 1 FROM (SELECT domain, scope FROM site_config) x
    WHERE x.domain = st.domain COLLATE utf8mb4_unicode_ci
      AND x.scope = CAST(st.torneoid AS CHAR)
  );

-- 3) Índice de apoyo para las consultas por dominio.
SET @has_idx := (
  SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'site_config' AND INDEX_NAME = 'idx_domain'
);
SET @sql := IF(@has_idx = 0, 'ALTER TABLE site_config ADD INDEX idx_domain (domain)', 'SELECT 1');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;
