-- ============================================================
-- FIX: estatuspago — columnas desconocidas + mojibake
--   1) Convierte la tabla a utf8mb4 (arregla textos guardados).
--   2) Detecta nombres reales de columnas (id y nombre) y
--      rellena el catálogo con los textos correctos.
-- Idempotente. Sin GRANTs (IONOS / MySQL).
-- ============================================================

-- 1) Charset correcto en la tabla y sus columnas de texto
ALTER TABLE estatuspago CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- 2) Inserción dinámica usando las columnas reales de la tabla
SET @pk := (
  SELECT COLUMN_NAME FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'estatuspago' AND COLUMN_KEY = 'PRI'
  LIMIT 1
);
SET @label := (
  SELECT COLUMN_NAME FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'estatuspago'
    AND COLUMN_KEY <> 'PRI'
    AND DATA_TYPE IN ('varchar','char','text','enum')
  ORDER BY ORDINAL_POSITION LIMIT 1
);
-- Respaldos por si no hay PRI o columna de texto detectable
SET @pk := COALESCE(@pk, (
  SELECT COLUMN_NAME FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'estatuspago'
  ORDER BY ORDINAL_POSITION LIMIT 1
));
SET @label := COALESCE(@label, (
  SELECT COLUMN_NAME FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'estatuspago'
    AND COLUMN_NAME <> @pk
  ORDER BY ORDINAL_POSITION LIMIT 1
));

SET @sql := CONCAT(
  'INSERT IGNORE INTO estatuspago (`', @pk, '`, `', @label, '`) VALUES ',
  '(1, ''Pendiente''),',
  '(2, ''En revisión''),',
  '(3, ''Pagado''),',
  '(4, ''Cargo a socio''),',
  '(5, ''Cortesía''),',
  '(6, ''Cancelado'')'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 3) Corrige mojibake en filas que ya existieran con texto dañado
SET @fix := CONCAT(
  'UPDATE estatuspago SET `', @label, '` = CASE `', @pk, '` ',
  'WHEN 1 THEN ''Pendiente'' ',
  'WHEN 2 THEN ''En revisión'' ',
  'WHEN 3 THEN ''Pagado'' ',
  'WHEN 4 THEN ''Cargo a socio'' ',
  'WHEN 5 THEN ''Cortesía'' ',
  'WHEN 6 THEN ''Cancelado'' ',
  'ELSE `', @label, '` END'
);
PREPARE stmt2 FROM @fix;
EXECUTE stmt2;
DEALLOCATE PREPARE stmt2;
