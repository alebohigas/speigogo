-- =====================================================================
-- MULTI-TORNEO 01 — Alcances de configuración
-- Idempotente. Ejecutar UNA vez por base de datos.
--
-- 1) site_config deja de tener una sola fila por dominio: ahora hay una
--    fila por (dominio, alcance). El alcance es 'general' o el torneoid.
-- 2) Nueva tabla site_torneos: qué torneos vive cada dominio, con su
--    nombre visible, su nombre corto para la dirección y su orden.
-- =====================================================================

SET NAMES utf8mb4;

-- ---------- 1. Columna scope en site_config ----------
SET @has_scope := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'site_config' AND COLUMN_NAME = 'scope'
);

SET @sql := IF(@has_scope = 0,
  "ALTER TABLE site_config ADD COLUMN scope VARCHAR(32) NOT NULL DEFAULT 'general' COMMENT 'general o el torneoid al que pertenece esta configuración'",
  'SELECT 1');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

-- ---------- 2. Clave primaria compuesta (domain, scope) ----------
SET @pk_cols := (
  SELECT GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX)
  FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'site_config' AND INDEX_NAME = 'PRIMARY'
);

SET @sql := IF(@pk_cols IS NULL OR @pk_cols <> 'domain,scope',
  'ALTER TABLE site_config DROP PRIMARY KEY, ADD PRIMARY KEY (domain, scope)',
  'SELECT 1');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

-- ---------- 3. Tabla de torneos por dominio ----------
CREATE TABLE IF NOT EXISTS site_torneos (
  id        INT AUTO_INCREMENT PRIMARY KEY,
  domain    VARCHAR(255) NOT NULL,
  torneoid  INT NOT NULL,
  nombre    VARCHAR(255) NOT NULL DEFAULT '' COMMENT 'Nombre visible en la barra superior',
  slug      VARCHAR(64)  NOT NULL DEFAULT '' COMMENT 'Nombre corto usado en la dirección: /experience/resultados',
  orden     INT NOT NULL DEFAULT 1,
  activo    TINYINT(1) NOT NULL DEFAULT 1,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_dom_torneo (domain, torneoid),
  UNIQUE KEY uk_dom_slug (domain, slug)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
