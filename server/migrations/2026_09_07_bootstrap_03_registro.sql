-- ============================================================
-- BOOTSTRAP 03: módulo de Pre-Registros
--   registro             → registros del público
--   registro_form_fields → qué campos se muestran/exigen por torneo
--   clubs_registro       → clubes autorizados (registro preferente)
--   registro_preferente_config → ventana global del registro preferente
-- Las tablas registro_precios, registro_socio_tipos y staff_users
-- tienen sus propias migraciones previas.
-- Idempotente. Sin GRANTs (IONOS / MySQL).
-- ============================================================

CREATE TABLE IF NOT EXISTS registro (
  reg_id               INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  reg_torneo_id        INT NOT NULL,
  reg_fecha            DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  reg_client_utc       DATETIME NULL DEFAULT NULL,

  -- Datos básicos
  reg_nombre           VARCHAR(120) NOT NULL DEFAULT '',
  reg_apellido         VARCHAR(120) NOT NULL DEFAULT '',
  reg_correo           VARCHAR(180) NOT NULL DEFAULT '',
  reg_telefono         VARCHAR(40)  DEFAULT NULL,
  reg_tel_pais         VARCHAR(8)   DEFAULT NULL,
  reg_tel_lada         VARCHAR(8)   DEFAULT NULL,
  reg_celular          VARCHAR(40)  DEFAULT NULL,
  reg_handicap         DECIMAL(4,1) DEFAULT NULL,
  reg_sexo             VARCHAR(12)  DEFAULT NULL,
  reg_fechanac         DATE         DEFAULT NULL,
  akron_edad           INT          DEFAULT NULL,
  reg_categoria        VARCHAR(80)  DEFAULT NULL,

  -- Socios / procedencia
  reg_es_socio         TINYINT(1) NOT NULL DEFAULT 0,
  reg_tipo_socio       VARCHAR(40)  DEFAULT NULL,
  reg_cargo_socio      TINYINT(1) NOT NULL DEFAULT 0,
  reg_numsocio         VARCHAR(60)  DEFAULT NULL,
  reg_club             VARCHAR(180) DEFAULT NULL,
  reg_id_club          INT          DEFAULT NULL,
  reg_pais             VARCHAR(80)  DEFAULT NULL,
  reg_estado           VARCHAR(80)  DEFAULT NULL,
  reg_ciudad           VARCHAR(80)  DEFAULT NULL,
  reg_direccion        VARCHAR(255) DEFAULT NULL,
  reg_cp               VARCHAR(12)  DEFAULT NULL,
  reg_spei             VARCHAR(40)  DEFAULT NULL,
  numghinspei          VARCHAR(40)  DEFAULT NULL,

  -- Adicionales
  reg_notas            TEXT         DEFAULT NULL,
  akron_talla          VARCHAR(20)  DEFAULT NULL,
  reg_talla_gorra      VARCHAR(20)  DEFAULT NULL,
  akron_talla_guante   VARCHAR(20)  DEFAULT NULL,
  akron_calzado        VARCHAR(20)  DEFAULT NULL,
  akron_codigo         VARCHAR(60)  DEFAULT NULL,
  akron_codigo_admin   VARCHAR(60)  DEFAULT NULL,

  -- Comprobante adjunto
  reg_archivo          LONGBLOB     DEFAULT NULL,
  reg_archivo_nombre   VARCHAR(255) DEFAULT NULL,
  reg_archivo_mime     VARCHAR(120) DEFAULT NULL,

  -- Pago / revisión administrativa
  status_pago          INT NOT NULL DEFAULT 1,
  reg_cargo            VARCHAR(120) DEFAULT NULL,
  akron_monto_pago     DECIMAL(10,2) DEFAULT NULL,
  reg_monto_confirmado DECIMAL(10,2) DEFAULT NULL,
  reg_pago_verificado  TINYINT(1) NOT NULL DEFAULT 0,
  reg_verificado       TINYINT(1) NOT NULL DEFAULT 0,
  reg_precio_estimado  DECIMAL(10,2) DEFAULT NULL,
  reg_precio_moneda    VARCHAR(8)   DEFAULT 'MXN',
  reg_precio_regla_id  INT          DEFAULT NULL,

  -- Correos / token público
  reg_token            VARCHAR(64)  DEFAULT NULL,
  reg_email_count      INT NOT NULL DEFAULT 0,
  reg_email_last       DATETIME NULL DEFAULT NULL,
  reg_welcome_count    INT NOT NULL DEFAULT 0,
  reg_welcome_last     DATETIME NULL DEFAULT NULL,

  UNIQUE KEY uniq_token (reg_token),
  INDEX idx_torneo (reg_torneo_id),
  INDEX idx_correo (reg_correo)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS registro_form_fields (
  id            INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  torneo_id     INT NOT NULL,
  field_name    VARCHAR(64) NOT NULL,
  field_label   VARCHAR(180) NOT NULL,
  is_enabled    TINYINT(1) NOT NULL DEFAULT 1,
  is_required   TINYINT(1) NOT NULL DEFAULT 0,
  display_order INT NOT NULL DEFAULT 0,
  section       VARCHAR(32) NOT NULL DEFAULT 'basica',
  UNIQUE KEY uniq_torneo_field (torneo_id, field_name),
  INDEX idx_torneo (torneo_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS clubs_registro (
  id           INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  torneoid     INT NOT NULL,
  clubid       INT NOT NULL,
  fecha_inicio DATE NULL DEFAULT NULL,
  fecha_fin    DATE NULL DEFAULT NULL,
  UNIQUE KEY uniq_torneo_club (torneoid, clubid)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS registro_preferente_config (
  torneoid     INT NOT NULL PRIMARY KEY,
  fecha_inicio DATE NULL DEFAULT NULL,
  fecha_fin    DATE NULL DEFAULT NULL,
  same_range   TINYINT(1) NOT NULL DEFAULT 1
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
