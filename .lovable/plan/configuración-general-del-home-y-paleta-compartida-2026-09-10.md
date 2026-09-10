# Configuración General del Home y paleta compartida

## Objetivo
Hacer que la pestaña **General → Configuración** administre la portada común, no un torneo específico, y permitir compartir su paleta con todos los torneos del sitio.

## Cambios
- Sustituir el bloque “Torneo ID” de General por un campo **Texto del Home** con guardado directo.
- Mantener el texto sincronizado con el título que ya se muestra en la portada común.
- Mostrar la paleta de colores dentro de General como configuración propia.
- Añadir el interruptor **Aplicar esta paleta a todos los torneos**.
- Al guardar una paleta con el interruptor activo, copiarla a las configuraciones de todos los torneos del dominio; con el interruptor apagado, guardar solamente la paleta General.
- Conservar la configuración individual de colores cuando se entra a la pestaña de cada torneo.

## Detalles técnicos
- Guardar el texto en `home_config.title`, reutilizando el JSON existente.
- Ampliar la acción de guardado de paleta para enviar una bandera de copia masiva.
- Procesar la copia en `site_config.php` usando los torneos vinculados al mismo dominio, sin alterar sus demás configuraciones.
- Verificar compilación y el formulario visible en General.
