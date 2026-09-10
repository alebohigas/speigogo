# Título y orden de la página General

## Objetivo
Permitir configurar el título visible del inicio compartido y ordenar los torneos junto con las páginas generales desde **General → Página → Orden**.

## Cambios
- Añadir un campo **Título de la página General** dentro de **Página → Botones Home**, guardado en la configuración `general` existente.
- Mostrar ese título en la portada común y usarlo también como título de la pestaña del navegador.
- En **General → Página → Orden**, incluir cada torneo publicado como una fila arrastrable, junto con Home y las páginas generales.
- Guardar esas posiciones en el orden del menú General usando identificadores auxiliares de torneo, sin cambiar ni mezclar los `torneoid`.
- Hacer que la barra superior respete ese orden; Home seguirá siempre primero.

## Detalles técnicos
- Ampliar `home_config` con un campo opcional `title`, sin migración de base de datos porque ya se guarda como JSON.
- Usar claves como `torneo-274` únicamente dentro de `menu_order`; son referencias de presentación y no sustituyen el identificador real del torneo.
- Mantener el campo de orden en “Torneos” como respaldo para configuraciones anteriores.
- Verificar compilación y el resultado visible en escritorio.
