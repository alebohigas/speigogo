-- ============================================================
-- FIX: estatuspago — esquema real (k / v) + acentos correctos
--   La tabla existente usa las columnas `k` (clave) y `v` (texto),
--   por eso fallaba el INSERT con la columna `id`.
--   Además fuerza utf8mb4 para que no se guarden textos dañados
--   del tipo "revisiÃ³n" / "CortesÃ­a".
-- Idempotente. Sin GRANTs (IONOS / MySQL).
-- ============================================================

-- 1) La conexión debe hablar utf8mb4 ANTES de escribir texto
SET NAMES utf8mb4;
SET CHARACTER SET utf8mb4;

-- 2) Tabla y columnas en utf8mb4 (repara el almacenamiento)
ALTER TABLE estatuspago CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- 3) Catálogo con los valores reales del sistema
INSERT IGNORE INTO estatuspago (k, v) VALUES
  (1,  'POR VALIDAR'),
  (2,  'PAGADO'),
  (3,  'POR COBRAR'),
  (4,  'CORTESIA'),
  (5,  'LISTA ESPERA'),
  (6,  'CANCELADO'),
  (88, 'INSCRITO'),
  (99, 'ELIMINADO');

-- 4) Normaliza los textos por si alguna fila quedó dañada
UPDATE estatuspago SET v = CASE k
  WHEN 1  THEN 'POR VALIDAR'
  WHEN 2  THEN 'PAGADO'
  WHEN 3  THEN 'POR COBRAR'
  WHEN 4  THEN 'CORTESIA'
  WHEN 5  THEN 'LISTA ESPERA'
  WHEN 6  THEN 'CANCELADO'
  WHEN 88 THEN 'INSCRITO'
  WHEN 99 THEN 'ELIMINADO'
  ELSE v END
WHERE k IN (1,2,3,4,5,6,88,99);
