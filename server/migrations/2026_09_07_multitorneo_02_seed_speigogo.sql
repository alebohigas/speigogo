-- =====================================================================
-- MULTI-TORNEO 02 — Alta de los torneos del dominio y copia de config
-- Idempotente. Ejecutar DESPUÉS de 2026_09_07_multitorneo_01_scope.sql.
--
-- Ajusta las 3 variables de abajo antes de ejecutar.
-- La configuración actual del dominio (fila 'general') se copia tal cual
-- a cada torneo, de modo que ambos arrancan iguales y luego se separan
-- desde /admin.
-- =====================================================================

SET NAMES utf8mb4;

SET @dom  := 'speigogo.speitour.com';   -- dominio del sitio
SET @t1   := 274;                        -- primer torneo
SET @t2   := 275;                        -- segundo torneo

-- ---------- 1. Alta de los torneos ----------
-- El nombre y el nombre corto se toman del torneo real; el nombre corto
-- es la primera palabra distintiva del nombre (editable luego en /admin).
INSERT INTO site_torneos (domain, torneoid, nombre, slug, orden, activo)
SELECT @dom, @t1, COALESCE(t.nombre, CONCAT('Torneo ', @t1)), 'torneo1', 1, 1
FROM (SELECT 1) x LEFT JOIN torneo t ON t.torneoid = @t1
ON DUPLICATE KEY UPDATE torneoid = VALUES(torneoid);

INSERT INTO site_torneos (domain, torneoid, nombre, slug, orden, activo)
SELECT @dom, @t2, COALESCE(t.nombre, CONCAT('Torneo ', @t2)), 'torneo2', 2, 1
FROM (SELECT 1) x LEFT JOIN torneo t ON t.torneoid = @t2
ON DUPLICATE KEY UPDATE torneoid = VALUES(torneoid);

-- ---------- 2. Copia de la configuración actual a cada torneo ----------
-- Copia completa de la fila 'general' cambiando scope y torneoid.
CREATE TEMPORARY TABLE tmp_site_config_seed AS
  SELECT * FROM site_config WHERE domain = @dom AND scope = 'general';

UPDATE tmp_site_config_seed SET scope = CAST(@t1 AS CHAR), torneoid = @t1;
INSERT IGNORE INTO site_config SELECT * FROM tmp_site_config_seed;

UPDATE tmp_site_config_seed SET scope = CAST(@t2 AS CHAR), torneoid = @t2;
INSERT IGNORE INTO site_config SELECT * FROM tmp_site_config_seed;

DROP TEMPORARY TABLE tmp_site_config_seed;
