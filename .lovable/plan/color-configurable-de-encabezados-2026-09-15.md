# Color configurable de encabezados

## Cambios
- Añadir debajo de “Color de Última actualización” un selector “Color de Encabezados”, con `#999999` como valor predeterminado.
- Guardar el color dentro de la configuración de paleta del alcance actual, respetando la opción de aplicar la configuración General a todos los torneos.
- Aplicar ese color a los encabezados de tarjetas y tablas de Equipos, Salidas y Resultados en móvil, tablet y escritorio.
- Conservar este color al cambiar o guardar una paleta y validar el resultado visual y la compilación.

## Detalles técnicos
- Extender `theme_config` con un campo opcional para mantener compatibilidad con configuraciones existentes.
- Usar un único valor compartido con fallback `#999999`; no requiere una nueva columna ni migración.
