-- ============================================================
-- BOOTSTRAP 01: site_config
-- Tabla de configuración por dominio (torneoid activo, menús,
-- visibilidad de páginas, tema y configuración de cada sección).
-- Idempotente: CREATE TABLE IF NOT EXISTS.
-- Sin GRANTs (hosting compartido IONOS / MySQL).
-- ============================================================

CREATE TABLE IF NOT EXISTS site_config (
  domain                 VARCHAR(255) NOT NULL PRIMARY KEY,
  torneoid               INT NOT NULL,
  menu_order             TEXT DEFAULT NULL COMMENT 'JSON pageId -> orden',
  visibility             TEXT DEFAULT NULL COMMENT 'JSON pageId -> visible',
  menu_groups            TEXT DEFAULT NULL COMMENT 'JSON array de grupos de menú',
  page_group_assignments TEXT DEFAULT NULL COMMENT 'JSON pageId -> groupId',
  live_scoring_config    TEXT DEFAULT NULL,
  sponsors_config        TEXT DEFAULT NULL,
  eventos_config         TEXT DEFAULT NULL,
  avisos_config          TEXT DEFAULT NULL,
  premios_config         TEXT DEFAULT NULL,
  hoteles_config         TEXT DEFAULT NULL,
  menus_config           TEXT DEFAULT NULL,
  popup_config           TEXT DEFAULT NULL,
  anuncio_config         TEXT DEFAULT NULL,
  home_config            TEXT DEFAULT NULL,
  hero_config            TEXT DEFAULT NULL,
  historial_config       TEXT DEFAULT NULL,
  stats_config           TEXT DEFAULT NULL,
  stats_page_config      TEXT DEFAULT NULL,
  modules_config         TEXT DEFAULT NULL,
  tarjetas_config        TEXT DEFAULT NULL,
  theme_config           TEXT DEFAULT NULL,
  updated_at             TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Alta del dominio (ajusta dominio y torneoid antes de ejecutar):
-- INSERT INTO site_config (domain, torneoid) VALUES ('cs.speitour.com', 361)
--   ON DUPLICATE KEY UPDATE torneoid = VALUES(torneoid);
