-- ============================================================
-- BOOTSTRAP 02: contenido y catálogos
--   convocatoria_content  → secciones de Convocatoria / Reglas
--   menu                  → menú dinámico por torneo
--   patrocinadores        → logos de patrocinadores
--   estatuspago           → catálogo de estatus de pago
--   mejorscorep           → premios de mejor score diario
-- Idempotente. Sin GRANTs (IONOS / MySQL).
-- ============================================================

-- IMPORTANTE: fuerza la conexión a utf8mb4 para que los acentos
-- (revisión, cortesía) no se guarden dañados.
SET NAMES utf8mb4;
SET CHARACTER SET utf8mb4;



CREATE TABLE IF NOT EXISTS convocatoria_content (
  id           INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  torneoid     INT NOT NULL,
  section_id   VARCHAR(64) NOT NULL,
  section_type VARCHAR(32) NOT NULL DEFAULT 'generic',
  title        VARCHAR(255) DEFAULT NULL,
  content      LONGTEXT DEFAULT NULL COMMENT 'JSON con el contenido de la sección',
  sort_order   INT NOT NULL DEFAULT 0,
  enabled      TINYINT(1) NOT NULL DEFAULT 1,
  updated_at   TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_torneo_section (torneoid, section_id),
  INDEX idx_torneo (torneoid)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS menu (
  id       INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  torneoid INT NOT NULL,
  nombre   VARCHAR(120) NOT NULL,
  grupo    VARCHAR(80)  NOT NULL DEFAULT '',
  url      VARCHAR(255) NOT NULL DEFAULT '',
  icono    VARCHAR(64)  DEFAULT NULL,
  tipo     VARCHAR(32)  NOT NULL DEFAULT 'link',
  orden    INT NOT NULL DEFAULT 0,
  visible  TINYINT(1) NOT NULL DEFAULT 1,
  INDEX idx_torneo (torneoid)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS patrocinadores (
  id          INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  torneoid    INT NOT NULL,
  nombre      VARCHAR(180) NOT NULL,
  contacto    VARCHAR(180) DEFAULT NULL,
  logo        VARCHAR(255) DEFAULT NULL COMMENT 'Ruta relativa del logo (legacy)',
  logo_nombre VARCHAR(255) DEFAULT NULL COMMENT 'Nombre de archivo del logo',
  INDEX idx_torneo (torneoid)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS estatuspago (
  id     INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  nombre VARCHAR(60) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT IGNORE INTO estatuspago (id, nombre) VALUES
  (1, 'Pendiente'),
  (2, 'En revisión'),
  (3, 'Pagado'),
  (4, 'Cargo a socio'),
  (5, 'Cortesía'),
  (6, 'Cancelado');

CREATE TABLE IF NOT EXISTS mejorscorep (
  id        INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  torneoid  INT NOT NULL,
  premio    INT NOT NULL DEFAULT 1,
  fecha     DATE NOT NULL,
  jugadorid INT DEFAULT NULL,
  distancia DECIMAL(10,2) DEFAULT NULL,
  INDEX idx_torneo_fecha (torneoid, fecha)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
