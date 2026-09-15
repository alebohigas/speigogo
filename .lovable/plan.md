# Eliminar el espacio temporal entre encabezado e imagen

## Objetivo
Evitar que la franja de patrocinadores se dibuje con configuración provisional mientras carga la configuración real de la página.

## Cambios
- Considerar lista la configuración visual únicamente cuando hayan cargado tanto el alcance actual como la configuración general heredable.
- Mantener oculta la franja de patrocinadores durante ese breve estado, en vez de mostrar un bloque blanco que después desaparece.
- Aplicar la misma espera a los anuncios para evitar cambios de altura equivalentes.
- Verificar la navegación entre páginas en vista móvil y confirmar que la imagen inicia pegada al bloque superior correspondiente.

## Alcance técnico
Se ajustarán únicamente los hooks de configuración heredada y los dos ribbons del layout; no se cambiarán imágenes, contenido ni reglas de visibilidad guardadas.
