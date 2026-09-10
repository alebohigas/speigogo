-- Corrige el torneoid de las configuraciones por torneo.
-- Las filas copiadas desde la configuración general conservaron el torneoid
-- heredado (p. ej. 274), por lo que las páginas de cada torneo mostraban los
-- datos de otro torneo.
SET NAMES utf8mb4;
SET CHARACTER SET utf8mb4;

UPDATE site_config
SET torneoid = CAST(scope AS UNSIGNED)
WHERE scope REGEXP '^[0-9]+$'
  AND CAST(scope AS UNSIGNED) > 0
  AND torneoid <> CAST(scope AS UNSIGNED);
