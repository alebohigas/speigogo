-- =============================================================
-- Bootstrap 04 — Usuarios: superadmin + staff temporal (speigogo)
-- =============================================================
-- La base legacy `speigogo` ya trae la tabla `usuarios` (con columnas
-- id, usuario, pwd, tipo, torneoid, estatus, desde, hasta, activo),
-- pero NO trae las tablas auxiliares que usa el panel /admin:
--   * usuario_areas   → permisos por área del staff temporal
--   * usuario_sesion  → tokens de sesión del staff temporal
-- Tampoco existe el row reservado del superadmin, por eso el login
-- cae al fallback histórico 'admin2025'.
--
-- Esta migración es idempotente: se puede correr varias veces.
-- =============================================================

SET NAMES utf8mb4;
SET CHARACTER SET utf8mb4;

-- -------------------------------------------------------------
-- 1) Ajustes a la tabla `usuarios`
-- -------------------------------------------------------------

-- pwd debe poder almacenar un bcrypt (60 chars) sin truncar.
SET @sql := IF(
  (SELECT CHARACTER_MAXIMUM_LENGTH FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'usuarios'
      AND COLUMN_NAME = 'pwd') < 255,
  'ALTER TABLE usuarios MODIFY COLUMN pwd VARCHAR(255) NOT NULL',
  'SELECT 1');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

-- `usuario` debe caber '__superadmin__' (14) y usuarios staff largos.
SET @sql := IF(
  (SELECT CHARACTER_MAXIMUM_LENGTH FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'usuarios'
      AND COLUMN_NAME = 'usuario') < 60,
  'ALTER TABLE usuarios MODIFY COLUMN usuario VARCHAR(60) NOT NULL',
  'SELECT 1');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

-- `nombre` corto (30) para nombres reales de staff.
SET @sql := IF(
  (SELECT CHARACTER_MAXIMUM_LENGTH FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'usuarios'
      AND COLUMN_NAME = 'nombre') < 120,
  'ALTER TABLE usuarios MODIFY COLUMN nombre VARCHAR(120) NOT NULL DEFAULT ''''',
  'SELECT 1');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

-- Columna `tipo` (99 = staff temporal, 100 = superadmin). Ya existe en
-- speigogo, pero se valida por si la instalación es distinta.
SET @sql := IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'usuarios'
      AND COLUMN_NAME = 'tipo') = 0,
  'ALTER TABLE usuarios ADD COLUMN tipo INT NOT NULL DEFAULT 0',
  'SELECT 1');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

-- Índice único en `usuario` (requerido por el upsert del superadmin).
SET @sql := IF(
  (SELECT COUNT(*) FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'usuarios'
      AND COLUMN_NAME = 'usuario' AND NON_UNIQUE = 0) = 0,
  'ALTER TABLE usuarios ADD UNIQUE KEY uq_usuario (usuario)',
  'SELECT 1');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

-- Charset utf8mb4 para acentos correctos en nombres.
ALTER TABLE usuarios CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- -------------------------------------------------------------
-- 2) Tablas auxiliares del staff temporal
-- -------------------------------------------------------------

CREATE TABLE IF NOT EXISTS usuario_areas (
  usuario_id INT NOT NULL,
  area VARCHAR(40) NOT NULL,
  PRIMARY KEY (usuario_id, area),
  KEY idx_usuario (usuario_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS usuario_sesion (
  id INT NOT NULL AUTO_INCREMENT,
  usuario_id INT NOT NULL,
  token CHAR(64) NOT NULL,
  expira DATETIME NOT NULL,
  creado DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_token (token),
  KEY idx_usuario (usuario_id),
  KEY idx_expira (expira)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -------------------------------------------------------------
-- 3) Superadmin (row reservado usuario='__superadmin__', tipo=100)
-- -------------------------------------------------------------
-- IMPORTANTE: reemplaza el hash de abajo por el bcrypt de tu contraseña
-- de superadmin (la misma que usas en los demás proyectos). Mientras el
-- row no exista, el API acepta el fallback histórico 'admin2025'.
--
-- Para generar el hash en el servidor:
--   php -r "echo password_hash('TU_PASSWORD', PASSWORD_DEFAULT), PHP_EOL;"

SET @superadmin_hash := '$2y$12$G42NWjsNYjIUyZTp.GQZY.617MenIdiTR1cBTR1gvj9QEeTBOD9l.';

INSERT INTO usuarios (usuario, pwd, clubid, tipo, torneoid, estatus, nombre, ultent, activo)
VALUES ('__superadmin__', @superadmin_hash, 0, 100, 0, 'ACTIVO', 'Superadmin', NOW(), 1)
ON DUPLICATE KEY UPDATE pwd = VALUES(pwd), tipo = 100, activo = 1, estatus = 'ACTIVO';
