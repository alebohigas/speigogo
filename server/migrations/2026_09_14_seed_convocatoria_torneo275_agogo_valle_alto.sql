-- =====================================================================
-- Seed: /convocatoria para torneoid = 275
-- 2º TORNEO INTERNO A GO-GO — 17 y 18 de octubre de 2026
-- Club de Golf Valle Alto (club 27)
-- Fuente: convocatoria oficial "Valle Alto Golf Comics — Issue 02".
--
-- Idempotente vía ON DUPLICATE KEY UPDATE (clave única torneoid+section_id).
-- NOTA: sin GRANT/privilegios (MySQL IONOS).
-- =====================================================================

SET NAMES utf8mb4;
SET CHARACTER SET utf8mb4;

START TRANSACTION;

-- ---------------------------------------------------------------------
-- Descripción general
-- ---------------------------------------------------------------------
INSERT INTO convocatoria_content (torneoid, section_id, section_type, title, content, sort_order, enabled) VALUES
(275, 'descripcion', 'generic', 'Descripción',
'{"text": "CLUB DE GOLF VALLE ALTO — 2º TORNEO INTERNO A GO-GO\\n17 y 18 de octubre de 2026.\\n\\nEl Club de Golf Valle Alto tiene el honor de invitar a todos nuestros socios golfistas a participar en nuestro Torneo de Golf.\\n\\nFORMATO DE JUEGO: 36 hoyos A GO-GO en grupo de 4 jugadores. Los grupos podrán tener un jugador invitado (no socio).\\n\\nHÁNDICAP: los equipos deberán estar integrados por 4 jugadores. La fórmula para determinar el hándicap del equipo es la suma de los 4 integrantes al 50% y el resultado se divide entre el número de jugadores (4); ese será el hándicap con el que jugarán cada día. Se jugará con el hándicap registrado al 15 de septiembre del 2026.\\n\\nHándicap máximo por jugador: Caballeros 26.6 índex · Damas 29.6 índex.\\n\\nCUPO LÍMITE: 144 jugadores por turno."}', 1, 1)
ON DUPLICATE KEY UPDATE section_type=VALUES(section_type), title=VALUES(title), content=VALUES(content), enabled=1, updated_at=CURRENT_TIMESTAMP;

-- ---------------------------------------------------------------------
-- Elegibilidad, categorías, mesas de salida e inscripciones
-- ---------------------------------------------------------------------
INSERT INTO convocatoria_content (torneoid, section_id, section_type, title, content, sort_order, enabled) VALUES
(275, 'elegibilidad', 'elegibilidad', 'Elegibilidad',
'{"eligibilityText": "Podrán participar todos los socios amateurs golfistas mayores de 18 años que cumplan con los estatutos vigentes del club. Los grupos podrán tener un jugador invitado (no socio); todos los invitados deberán tener un hándicap federado.", "notesText": ["CATEGORÍAS: habrá dos categorías. De la lista de los equipos inscritos se sumarán los índices de los 4 jugadores y en base a ese resultado se partirá en 2: CATEGORÍA A y CATEGORÍA B.", "HORARIOS DE SALIDAS: horario matutino — escopetazo 7:00 a. m. Categoría B · horario vespertino — escopetazo 1:00 p. m. Categoría A.", "MESAS DE SALIDA — Damas: hasta 29.6 marcas Rojas.", "MESAS DE SALIDA — Caballeros: hasta 7.0 marcas Azules · de 7.1 a 26.6 marcas Blancas.", "MESAS DE SALIDA — Seniors: 10.4 en adelante marcas Doradas (60 años en adelante).", "NOTA: los jugadores de 60 años en adelante con hándicap menor de 10.4 deberán jugar de marcas blancas con su hándicap correspondiente.", "CUPO LÍMITE: 144 jugadores por turno.", "El Comité organizador se reserva el derecho de hacer los cambios necesarios en beneficio del evento y su decisión será inapelable."], "inscripcionesText": "Las inscripciones se realizarán en la oficina de golf con Nelson Tobias a partir del día 15 de septiembre del presente año. Inscripción para invitados a partir del martes 13 de octubre (todos los invitados deberán tener un hándicap federado)."}', 2, 1)
ON DUPLICATE KEY UPDATE section_type=VALUES(section_type), title=VALUES(title), content=VALUES(content), enabled=1, updated_at=CURRENT_TIMESTAMP;

-- ---------------------------------------------------------------------
-- Costos
-- ---------------------------------------------------------------------
INSERT INTO convocatoria_content (torneoid, section_id, section_type, title, content, sort_order, enabled) VALUES
(275, 'costos', 'generic', 'Costos',
'{"sociosPricing": [{"title": "Socios (cargo a cuenta)", "caballeros": "3000.00", "damasSeniors": "3000.00"}], "foraneosPricing": [{"title": "Invitados (efectivo)", "caballeros": "5000.00", "damasSeniors": "5000.00"}], "pricingNote": "Socios $3,000.00 por jugador, CARGO A CUENTA. Invitados $5,000.00 por jugador, EFECTIVO.", "inscripcionesText": "Oficina de golf con Nelson Tobias, a partir del 15 de septiembre. Invitados a partir del martes 13 de octubre. Inscripción para la categoría cierra el sábado 17 de octubre."}', 3, 1)
ON DUPLICATE KEY UPDATE section_type=VALUES(section_type), title=VALUES(title), content=VALUES(content), enabled=1, updated_at=CURRENT_TIMESTAMP;

-- ---------------------------------------------------------------------
-- Competencias y premios especiales
-- ---------------------------------------------------------------------
INSERT INTO convocatoria_content (torneoid, section_id, section_type, title, content, sort_order, enabled) VALUES
(275, 'competencias', 'list', 'Competencias',
'{"items": [{"nombre": "O''YES", "descripcion": "Premios a los 3 mejores lugares generales de O''Yes en cada par 3 por día. Los premios de O''Yes no serán repetibles: sólo se podrá ganar un premio por jugador por día.", "premios": "3 mejores lugares generales por par 3 y por día."}, {"nombre": "DRIVER DE PRECISIÓN — hoyo 4", "descripcion": "Premio al mejor Driver de Precisión en el hoyo 4 por categoría.", "premios": "Premio por categoría."}]}', 4, 1)
ON DUPLICATE KEY UPDATE section_type=VALUES(section_type), title=VALUES(title), content=VALUES(content), enabled=1, updated_at=CURRENT_TIMESTAMP;

-- ---------------------------------------------------------------------
-- Premiación
-- ---------------------------------------------------------------------
INSERT INTO convocatoria_content (torneoid, section_id, section_type, title, content, sort_order, enabled) VALUES
(275, 'premiacion', 'list', 'Premiación',
'{"items": [{"categoria": "Categoría A", "premios": ["Trofeo para 1er lugar Gross.", "Trofeo para 1°, 2° y 3er lugar Neto."]}, {"categoria": "Categoría B", "premios": ["Trofeo para 1er lugar Gross.", "Trofeo para 1°, 2° y 3er lugar Neto."]}, {"categoria": "Premios especiales", "premios": ["3 mejores lugares generales de O''Yes en cada par 3 por día (no repetibles).", "Mejor Driver de Precisión en el hoyo 4 por categoría."]}]}', 5, 1)
ON DUPLICATE KEY UPDATE section_type=VALUES(section_type), title=VALUES(title), content=VALUES(content), enabled=1, updated_at=CURRENT_TIMESTAMP;

-- ---------------------------------------------------------------------
-- Desempates
-- ---------------------------------------------------------------------
INSERT INTO convocatoria_content (torneoid, section_id, section_type, title, content, sort_order, enabled) VALUES
(275, 'desempates', 'desempates', 'Desempates',
'{"intro": "Cualquier empate se decidirá de acuerdo con el sistema de comparación de tarjetas de la segunda ronda (9-6-3-1), de la vuelta del hoyo 10 al 18.", "showCorte": false, "showTrofeos": true, "paraCorte": [], "paraTrofeos": ["Comparación de tarjetas de la segunda ronda (9-6-3-1), de la vuelta del hoyo 10 al 18.", "En caso de persistir el empate, se hará lo mismo para la 1ª vuelta.", "Si persiste el empate, ganará el equipo con menor hándicap."], "nota": "El Comité organizador se reserva el derecho de hacer los cambios necesarios en beneficio del evento y su decisión será inapelable."}', 6, 1)
ON DUPLICATE KEY UPDATE section_type=VALUES(section_type), title=VALUES(title), content=VALUES(content), enabled=1, updated_at=CURRENT_TIMESTAMP;

COMMIT;
