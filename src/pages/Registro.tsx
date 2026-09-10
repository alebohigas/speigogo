/**
 * Registro Page (Pre-Registro)
 * --------------------------------------------------------------------
 * Public registration form for the active tournament.
 *
 * The set of rendered fields, their labels and required-state come from
 * /api/registro_fields.php (admin-configurable). Some fields trigger
 * additional UI logic on the client:
 *
 *   - reg_nombre + reg_apellido + reg_fechanac
 *       → if a matching row exists in `jugadores` we auto-fill the rest.
 *   - reg_es_socio (SI/NO) → toggles reg_tipo_socio (Titular/Emérito/Dependiente).
 *   - reg_pais → loads states; reg_estado → loads cities (cascading).
 *   - reg_handicap + reg_sexo + reg_fechanac → restricts the categoría
 *       options to those the player is eligible for.
 *   - reg_archivo → file input, posted as multipart and stored as LONGBLOB.
 *
 * Submission goes to /api/registro.php as multipart/form-data.
 */

import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import Layout from '@/components/layout/Layout';
import PageHero from '@/components/shared/PageHero';
import registroHero from '@/assets/registro-hero.jpg';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, CheckCircle2, Send, HelpCircle, ChevronsUpDown, Check } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Checkbox } from '@/components/ui/checkbox';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useRegistroFields } from '@/hooks/useRegistroFields';
import { useRegistroSocioTipos } from '@/hooks/useRegistroSocioTipos';
import { useCategories } from '@/hooks/usePlayersData';
import { useTournamentInfo } from '@/hooks/useTournamentData';
import { useToast } from '@/hooks/use-toast';
import { useRegistroPrecioMatch } from '@/hooks/useRegistroPrecios';
import { useCategoriasReglas, type CategoriaRegla } from '@/hooks/useCategoriasReglas';
import { useRegistroPreferente } from '@/hooks/useRegistroPreferente';
import { useSiteTorneos } from '@/hooks/useSiteTorneos';
import { useConfigScope } from '@/lib/configScope';
import RegistroTorneoPicker from '@/components/registro/RegistroTorneoPicker';
import type { CategoryDetail } from '@/data/playersData';
import { toProperName } from '@/lib/properName';
import {
  getRegistroSubmitUrl,
  getLocationsCountriesUrl,
  getLocationsStatesUrl,
  getLocationsCitiesUrl,
  getClubsUrl,
  getClubsByTorneoUrl,
  getClubLookupUrl,
  getEmailValidateUrl,
  getRegistroEmailCheckUrl,
  getPlayerLookupByIdUrl,
} from '@/config/api';

// ============= Types =============

/** Row returned by /api/locations.php */
interface LocationRow { id: number; name: string }

/**
 * SIN_CLUB_NOMBRE
 * Nombre del club por defecto (clubid 770042 en `torneos.clubs`) que se
 * envía cuando el jugador no selecciona ningún club de procedencia.
 */
const SIN_CLUB_NOMBRE = 'SIN CLUB';

/**
 * Campos de texto que deben guardarse siempre en NOMBRE PROPIO
 * (Title Case + ortografía en español). Ver `src/lib/properName.ts`.
 */
const PROPER_NAME_FIELDS = ['reg_nombre', 'reg_apellido'] as const;
const isProperNameField = (name: string) =>
  (PROPER_NAME_FIELDS as readonly string[]).includes(name);

/** Row returned by /api/clubs.php */
interface ClubRow {
  id: number;
  nombre: string;
  /** Optional location strings (whichever exist in the `clubs` table). */
  ciudad?: string;
  estado?: string;
  pais?: string;
  /** Optional location IDs (preferred when present — exact match). */
  id_pais?: number;
  id_estado?: number;
  id_ciudad?: number;
}

/** Field-name → suggested placeholder text shown as greyed example. */
const PLACEHOLDERS: Record<string, string> = {
  reg_nombre:     'Ej: Juan Carlos',
  reg_apellido:   'Ej: Pérez González',
  reg_correo:     'tu@correo.com',
  reg_telefono:   '+52 55 1234 5678',
  reg_handicap:   'Entre -6 y 54.0 (ej: 14.2)',
  reg_club:       'Ej: Club de Golf Valle Alto',
  reg_ghin:       'Ej: 123456789',
  numghinspei:    'Ej: 123456789',
  reg_spei:       'Tu ID interno (si lo conoces)',
  reg_notas:      'Notas adicionales para el comité…',
  reg_mensaje:    'Notas adicionales para el comité…',
  reg_fechanac:   'dd/mm/aaaa',
  reg_direccion:  'Calle, número, colonia',
  reg_cp:         'Ej: 64000',
};

// ============= Date helpers (dd/mm/aaaa) =============

/** Parse a dd/mm/aaaa string into {y,m,d} or null if invalid. */
const parseDmy = (s: string): { y: number; m: number; d: number } | null => {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec((s || '').trim());
  if (!m) return null;
  const d = +m[1], mo = +m[2], y = +m[3];
  const dt = new Date(y, mo - 1, d);
  if (dt.getFullYear() !== y || dt.getMonth() !== mo - 1 || dt.getDate() !== d) return null;
  return { y, m: mo, d };
};
/** Convert dd/mm/aaaa → YYYY-MM-DD (or '' if invalid). */
const dmyToIso = (s: string): string => {
  const p = parseDmy(s);
  return p ? `${p.y.toString().padStart(4, '0')}-${String(p.m).padStart(2, '0')}-${String(p.d).padStart(2, '0')}` : '';
};
/** Convert YYYY-MM-DD → dd/mm/aaaa (or '' if invalid). */
const isoToDmy = (s: string): string => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s || '');
  return m ? `${m[3]}/${m[2]}/${m[1]}` : '';
};
/** Auto-mask digit input as dd/mm/aaaa while typing. */
const maskDmy = (raw: string): string => {
  const d = raw.replace(/\D/g, '').slice(0, 8);
  if (d.length <= 2) return d;
  if (d.length <= 4) return `${d.slice(0, 2)}/${d.slice(2)}`;
  return `${d.slice(0, 2)}/${d.slice(2, 4)}/${d.slice(4)}`;
};
/** Validate a dd/mm/aaaa birthdate: not in future, not today, not >120 years ago. */
const validateBirthDmy = (s: string): string => {
  if (!s) return '';
  const p = parseDmy(s);
  if (!p) return 'Formato inválido. Usa dd/mm/aaaa.';
  const dt  = new Date(p.y, p.m - 1, p.d);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (dt >= today)                return 'La fecha no puede ser hoy ni futura.';
  if (p.y < (now.getFullYear() - 120)) return 'Fecha demasiado antigua.';
  return '';
};

// ============= Helpers =============

/** Calculate age in completed years from a YYYY-MM-DD birthdate. */
const calcAge = (yyyymmdd: string): number | null => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(yyyymmdd)) return null;
  const [y, m, d] = yyyymmdd.split('-').map(Number);
  const dob = new Date(y, m - 1, d);
  if (isNaN(dob.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - dob.getFullYear();
  const beforeBirthday =
    now.getMonth() < dob.getMonth() ||
    (now.getMonth() === dob.getMonth() && now.getDate() < dob.getDate());
  if (beforeBirthday) age -= 1;
  return age;
};

/**
 * Infer an age range from a category name when the backend `categorias`
 * table does not have `age_range_min` / `age_range_max` populated (legacy
 * setups encode the range in the name itself). Supports patterns like:
 *   "SENIOR 55-64", "SENIOR 55 - 64", "55 a 64", "55+", "65 +", "55 y mas".
 * Returns { min, max } where either side may be null when unbounded.
 * Returns null when no recognisable age token is found.
 */
const parseAgeFromName = (name: string): { min: number | null; max: number | null } | null => {
  if (!name) return null;
  const s = name.toLowerCase();
  // Range: "55-64", "55 - 64", "55 a 64"
  let m = s.match(/(\d{2,3})\s*(?:-|–|a)\s*(\d{2,3})/);
  if (m) {
    const a = parseInt(m[1], 10);
    const b = parseInt(m[2], 10);
    if (a >= 30 && b >= a && b <= 120) return { min: a, max: b };
  }
  // Open-ended: "55+", "55 +", "55 y mas", "55 o mas"
  m = s.match(/(\d{2,3})\s*(?:\+|y\s*mas|o\s*mas|y\s*más|o\s*más)/);
  if (m) {
    const a = parseInt(m[1], 10);
    if (a >= 30 && a <= 120) return { min: a, max: null };
  }
  return null;
};

/**
 * parseHcpFromName
 * Algunos torneos definen el rango de hándicap en el propio nombre de la
 * categoría — p.ej. "B (10.6 A 14.5)", "Campeonato (-5 A 0.9)". Esta
 * función extrae ese rango para reforzar el filtro cuando el valor de
 * `hcpIdxMin/Max` en BD no coincide con la etiqueta visible. Devuelve
 * null si no encuentra un patrón "(min A max)" reconocible.
 */
const parseHcpFromName = (name: string): { min: number; max: number } | null => {
  if (!name) return null;
  const s = name.toLowerCase();
  // Acepta enteros y decimales, con signo opcional. Separador "a" rodeado
  // de espacios. Toleramos "(", "[" como apertura para mayor robustez.
  const m = s.match(/[\(\[]\s*(-?\d+(?:\.\d+)?)\s*a\s*(-?\d+(?:\.\d+)?)\s*[\)\]]/);
  if (!m) return null;
  const a = parseFloat(m[1]);
  const b = parseFloat(m[2]);
  if (isNaN(a) || isNaN(b) || b < a) return null;
  return { min: a, max: b };
};

/**
 * Normalize a string for tolerant matching: lowercase, trimmed, and with
 * combining diacritics stripped ("México" → "mexico", "Nuevo León" →
 * "nuevo leon"). Used when matching club location strings against the
 * country/state/city dropdown lists.
 */
const norm = (s: string): string =>
  (s || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();

/**
 * Aliases used when matching club.estado strings to the `states` dropdown.
 * The `clubs` table sometimes stores short forms ("CDMX") while the
 * `states` table uses the full name ("Ciudad de México"). Keys/values are
 * pre-normalized (no accents, lowercase). All entries are bidirectional.
 */
const STATE_ALIASES: Record<string, string[]> = {
  'cdmx':              ['ciudad de mexico', 'distrito federal', 'df', 'mexico df', 'mexico city'],
  'ciudad de mexico':  ['cdmx', 'distrito federal', 'df'],
  'edomex':            ['estado de mexico', 'mexico'],
  'estado de mexico':  ['edomex'],
  'nuevo leon':        ['nl', 'n.l.'],
  'baja california':   ['bc', 'b.c.'],
  'baja california sur': ['bcs', 'b.c.s.'],
  'quintana roo':      ['qroo', 'q. roo', 'qr'],
  'san luis potosi':   ['slp', 's.l.p.'],
};

/** Returns true if two location strings refer to the same place,
 *  considering the alias table above. Both inputs may be raw. */
const locMatches = (a: string, b: string): boolean => {
  const na = norm(a);
  const nb = norm(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  if ((STATE_ALIASES[na] || []).some(x => norm(x) === nb)) return true;
  if ((STATE_ALIASES[nb] || []).some(x => norm(x) === na)) return true;
  return false;
};

/** Parse finite numbers coming from PHP JSON, form text, or nullable rule fields. */
const toFiniteNumber = (value: unknown): number | null => {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

/** Normalize rule/player gender codes so legacy values like "M ", "Hombre" or "Masculino" still match "M". */
const normalizeGenderCode = (value: unknown): string => {
  const key = ruleKey(value);
  if (!key) return '';
  if (['m', 'masculino', 'hombre', 'caballero', 'caballeros', 'male'].includes(key)) return 'M';
  if (['f', 'femenino', 'mujer', 'dama', 'damas', 'female'].includes(key)) return 'F';
  return key.toUpperCase();
};

/** Compare handicap values at one decimal (the DB stores DECIMAL(4,1)) with a tiny epsilon for safe inclusive bounds. */
const normalizeHcpIndex = (value: number): number => Math.round(value * 10) / 10;

/** Normalized key for category/rule matching: trims, removes accents, collapses whitespace. */
const ruleKey = (value: unknown): string =>
  norm(String(value ?? '')).replace(/\s+/g, ' ');

/** True when an eligibility rule applies to the given category (by name). */
const ruleMatchesCategory = (
  rule: CategoriaRegla,
  category: Pick<CategoryDetail, 'id' | 'name'>
): boolean => {
  const rk = ruleKey(rule.categoria);
  if (!rk) return false;
  return rk === ruleKey(category.name) || rk === ruleKey(category.id);
};

/** True if the player matches a single eligibility rule. */
const playerMatchesRule = (
  rule: CategoriaRegla,
  player: { sex: string; age: number | null; hcp: number | null }
): boolean => {
  const ruleGender = normalizeGenderCode(rule.genero);
  const playerGender = normalizeGenderCode(player.sex);
  if (ruleGender && playerGender && ruleGender !== playerGender) return false;
  if (player.age !== null) {
    const emin = toFiniteNumber(rule.edad_min);
    const emax = toFiniteNumber(rule.edad_max);
    if (emin !== null && emin > 0 && player.age < emin) return false;
    if (emax !== null && emax > 0 && player.age > emax) return false;
  }
  if (player.hcp !== null) {
    const hmin = toFiniteNumber(rule.hcp_min);
    const hmax = toFiniteNumber(rule.hcp_max);
    const hcp = normalizeHcpIndex(player.hcp);
    if (hmin !== null && hcp < hmin - Number.EPSILON) return false;
    if (hmax !== null && hcp > hmax + Number.EPSILON) return false;
  }
  return true;
};

// ============= Phone country codes =============
/**
 * Lista de ladas mostrada en el <Select> de teléfono.
 * - México va PRIMERO y es el país default del formulario.
 * - `id` es la clave única usada como value del <Select> (EE. UU. y Canadá
 *   comparten la lada +1, por eso el value NO puede ser el código).
 * - `len` = dígitos típicos del número local (sin lada).
 * - `flex` = tolerancia ± sobre `len` para países con numeración variable
 *   (la mayoría de Europa). Sin `flex` la longitud es exacta.
 */
const PHONE_CODES: { id: string; code: string; flag: string; label: string; len: number; flex?: number }[] = [
  { id: 'MX', code: '+52',  flag: '🇲🇽', label: 'México',          len: 10 },
  { id: 'US', code: '+1',   flag: '🇺🇸', label: 'EE. UU.',         len: 10 },
  { id: 'CA', code: '+1',   flag: '🇨🇦', label: 'Canadá',          len: 10 },
  // ——— Unión Europea ———
  { id: 'DE', code: '+49',  flag: '🇩🇪', label: 'Alemania',        len: 10, flex: 2 },
  { id: 'AT', code: '+43',  flag: '🇦🇹', label: 'Austria',         len: 10, flex: 3 },
  { id: 'BE', code: '+32',  flag: '🇧🇪', label: 'Bélgica',         len: 9,  flex: 1 },
  { id: 'BG', code: '+359', flag: '🇧🇬', label: 'Bulgaria',        len: 9,  flex: 1 },
  { id: 'CY', code: '+357', flag: '🇨🇾', label: 'Chipre',          len: 8  },
  { id: 'HR', code: '+385', flag: '🇭🇷', label: 'Croacia',         len: 9,  flex: 1 },
  { id: 'DK', code: '+45',  flag: '🇩🇰', label: 'Dinamarca',       len: 8  },
  { id: 'SK', code: '+421', flag: '🇸🇰', label: 'Eslovaquia',      len: 9  },
  { id: 'SI', code: '+386', flag: '🇸🇮', label: 'Eslovenia',       len: 8  },
  { id: 'ES', code: '+34',  flag: '🇪🇸', label: 'España',          len: 9  },
  { id: 'EE', code: '+372', flag: '🇪🇪', label: 'Estonia',         len: 8,  flex: 1 },
  { id: 'FI', code: '+358', flag: '🇫🇮', label: 'Finlandia',       len: 9,  flex: 2 },
  { id: 'FR', code: '+33',  flag: '🇫🇷', label: 'Francia',         len: 9  },
  { id: 'GR', code: '+30',  flag: '🇬🇷', label: 'Grecia',          len: 10 },
  { id: 'HU', code: '+36',  flag: '🇭🇺', label: 'Hungría',         len: 9,  flex: 1 },
  { id: 'IE', code: '+353', flag: '🇮🇪', label: 'Irlanda',         len: 9,  flex: 1 },
  { id: 'IT', code: '+39',  flag: '🇮🇹', label: 'Italia',          len: 10, flex: 1 },
  { id: 'LV', code: '+371', flag: '🇱🇻', label: 'Letonia',         len: 8  },
  { id: 'LT', code: '+370', flag: '🇱🇹', label: 'Lituania',        len: 8  },
  { id: 'LU', code: '+352', flag: '🇱🇺', label: 'Luxemburgo',      len: 9,  flex: 2 },
  { id: 'MT', code: '+356', flag: '🇲🇹', label: 'Malta',           len: 8  },
  { id: 'NL', code: '+31',  flag: '🇳🇱', label: 'Países Bajos',    len: 9  },
  { id: 'PL', code: '+48',  flag: '🇵🇱', label: 'Polonia',         len: 9  },
  { id: 'PT', code: '+351', flag: '🇵🇹', label: 'Portugal',        len: 9  },
  { id: 'CZ', code: '+420', flag: '🇨🇿', label: 'Chequia',         len: 9  },
  { id: 'RO', code: '+40',  flag: '🇷🇴', label: 'Rumanía',         len: 9  },
  { id: 'SE', code: '+46',  flag: '🇸🇪', label: 'Suecia',          len: 9,  flex: 2 },
  // ——— Latinoamérica ———
  { id: 'AR', code: '+54',  flag: '🇦🇷', label: 'Argentina',       len: 10 },
  { id: 'BR', code: '+55',  flag: '🇧🇷', label: 'Brasil',          len: 11 },
  { id: 'CL', code: '+56',  flag: '🇨🇱', label: 'Chile',           len: 9  },
  { id: 'CO', code: '+57',  flag: '🇨🇴', label: 'Colombia',        len: 10 },
  { id: 'VE', code: '+58',  flag: '🇻🇪', label: 'Venezuela',       len: 10 },
  { id: 'PE', code: '+51',  flag: '🇵🇪', label: 'Perú',            len: 9  },
  { id: 'EC', code: '+593', flag: '🇪🇨', label: 'Ecuador',         len: 9  },
  { id: 'GT', code: '+502', flag: '🇬🇹', label: 'Guatemala',       len: 8  },
  { id: 'SV', code: '+503', flag: '🇸🇻', label: 'El Salvador',     len: 8  },
  { id: 'CR', code: '+506', flag: '🇨🇷', label: 'Costa Rica',      len: 8  },
];

// ============= Component =============

const Registro = () => {
  const { data: fieldsData, isLoading: loadingFields } = useRegistroFields();
  /**
   * Multi-torneo: en la portada común (alcance general) se pregunta
   * primero a cuál torneo desea inscribirse el jugador.
   */
  const configScopeActual = useConfigScope();
  const { data: siteTorneosData } = useSiteTorneos();
  const torneosSitio = (siteTorneosData?.torneos ?? []).filter(
    (t) => t.activo !== false && !!t.slug,
  );
  const needsTorneoPick = configScopeActual === 'general' && torneosSitio.length > 1;
  /**
   * Mapa de tipos de socio configurados por el admin
   * (nombre-visible → tipo del sistema). Cuando no hay filas en BD el
   * hook devuelve un default de 3 elementos (Titular / Emérito /
   * Dependiente) para preservar el comportamiento histórico.
   */
  const { data: socioTiposData } = useRegistroSocioTipos();
  const { data: categories = [] } = useCategories();
  const { data: tournamentInfo } = useTournamentInfo();
  /**
   * Reglas de ELEGIBILIDAD de categoría (edad/género/hcp). Vienen de la
   * tabla `categorias_reglas` — separada de los precios para evitar
   * acoplar "qué puedo elegir" con "cuánto pago". Cuando una categoría
   * tiene una o más reglas activas, el jugador debe encajar en al menos
   * una para verla en el dropdown.
   */
  const { data: reglasData } = useCategoriasReglas();
  const reglas = useMemo(() => reglasData?.rules || [], [reglasData?.rules]);
  /**
   * Configuración de "Registro preferente": ventana previa donde SOLO
   * socios de clubes autorizados pueden pre-registrarse. Cuando
   * `active_now = true` el formulario impone restricciones adicionales.
   */
  const { data: preferenteCfg } = useRegistroPreferente();
  const { toast } = useToast();

  /** Values for every form field, keyed by field_name. */
  const [values, setValues] = useState<Record<string, string>>({});
  /** Selected file for reg_archivo (kept outside `values` since it's binary). */
  const [file, setFile] = useState<File | null>(null);
  /** Submission state */
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  /**
   * Cuando el backend marca al registro como lista de espera
   * (status_pago=67), el mensaje de éxito cambia para informar al
   * jugador que aún no tiene lugar confirmado.
   */
  const [submittedWaitlist, setSubmittedWaitlist] = useState(false);
  /** Forces a fresh form DOM tree after "Enviar otro pre-registro" to prevent browser autofill from restoring stale values. */
  const [formInstanceKey, setFormInstanceKey] = useState(0);

  /** Cascading dropdown data + selected ids */
  const [countries, setCountries] = useState<LocationRow[]>([]);
  const [states, setStates]       = useState<LocationRow[]>([]);
  const [cities, setCities]       = useState<LocationRow[]>([]);

  /** Full club list (for the reg_club autocomplete datalist). */
  const [clubs, setClubs] = useState<ClubRow[]>([]);

  /**
   * Clubs registered for THIS tournament (from `clubs_registro`).
   * Used to restrict the reg_club autocomplete when the applicant
   * marks reg_es_socio = SI: a socio can only belong to a club
   * registered for the current torneoid.
   */
  const [socioClubs, setSocioClubs] = useState<ClubRow[]>([]);

  /**
   * Tracks the last "nombre|apellido|fechanac" key for which we performed
   * an existing-player lookup, so we don't re-fire on every keystroke or
   * overwrite an edited club value.
   */
  const [lastLookupKey, setLastLookupKey] = useState<string>('');

  /** Tracks whether we already auto-filled the club from "soy socio = SI"
   *  so toggling NO doesn't keep clobbering manual edits. */
  const [socioClubAutofilled, setSocioClubAutofilled] = useState(false);

  /**
   * Mensaje en rojo bajo el selector "¿Eres socio?" cuando el sistema
   * detecta que el jugador ya está registrado en un club distinto al
   * club sede / clubes autorizados del torneo. Además se fuerza NO.
   */
  const [, setSocioMismatch] = useState<string>('');

  /**
   * Error inline bajo el input de club: se dispara cuando el jugador
   * escribió texto libre que no coincide con ninguna opción del catálogo
   * (dropdown). Bloquea el submit hasta que elija uno de la lista o
   * seleccione "Sin club".
   */
  const [clubError, setClubError] = useState<string>('');
  /**
   * clubOpen
   * Controla la apertura del combobox de "Club de procedencia".
   * El campo es de SOLO SELECCIÓN: el usuario no puede escribir en el
   * valor final, únicamente filtrar y elegir un club del catálogo
   * (`torneos.clubs`). Si se omite, al enviar se usa SIN_CLUB_NOMBRE.
   */
  const [clubOpen, setClubOpen] = useState(false);

  /** Inline error message for the handicap field (shown on blur). */
  const [handicapError, setHandicapError] = useState<string>('');

  /** Inline error / suggestion for the email field (shown on blur). */
  const [emailError, setEmailError] = useState<string>('');
  const [emailSuggestion, setEmailSuggestion] = useState<string>('');
  const [emailChecking, setEmailChecking] = useState(false);

  /** Inline error for the phone field. */
  const [phoneError, setPhoneError] = useState<string>('');
  /** Selected dial code (defaults to MX). */
  /** País de la lada seleccionada (id de PHONE_CODES). México = default. */
  const [phoneCodeId, setPhoneCodeId] = useState<string>('MX');
  /** Local 10-digit (or country-specific) phone digits, no spaces. */
  const [phoneLocal, setPhoneLocal] = useState<string>('');

  /** Inline error for the birthdate field (dd/mm/aaaa). */
  const [birthError, setBirthError] = useState<string>('');
  /** Visible dd/mm/aaaa string for the birthdate input. */
  const [birthDmy, setBirthDmy]     = useState<string>('');

  /** Tracks the last lookup key for SPEI/GHIN to avoid spamming. */
  const [lastIdLookup, setLastIdLookup] = useState<string>('');

  /**
   * Indica que el valor actual de `akron_edad` fue auto-calculado a partir de
   * `reg_fechanac` (no escrito por el usuario). Cuando es true se renderiza
   * el input en gris y disabled. Se limpia si el usuario borra la fecha o
   * decide editar manualmente.
   */
  const [edadAuto, setEdadAuto] = useState<boolean>(false);

  /**
   * Field config sorted by display_order, enabled only.
   * UX rule: `reg_sexo` and `reg_fechanac` MUST always render right
   * before `reg_categoria` because they drive the eligible-categories
   * filter. We re-order them client-side regardless of admin display_order.
   */
  const visibleFields = useMemo(() => {
    if (!fieldsData?.fields) return [];
    const enabled = [...fieldsData.fields]
      .filter(f => !!f.is_enabled)
      .sort((a, b) => a.display_order - b.display_order);

    const sexo = enabled.find(f => f.field_name === 'reg_sexo');
    const fnac = enabled.find(f => f.field_name === 'reg_fechanac');
    const edad = enabled.find(f => f.field_name === 'akron_edad');
    const cat  = enabled.find(f => f.field_name === 'reg_categoria');
    if (!cat || (!sexo && !fnac && !edad)) return enabled;

    const without = enabled.filter(
      f => f.field_name !== 'reg_sexo'
        && f.field_name !== 'reg_fechanac'
        && f.field_name !== 'akron_edad'
    );
    const catIdx = without.findIndex(f => f.field_name === 'reg_categoria');
    const head = without.slice(0, catIdx);
    const tail = without.slice(catIdx); // starts with reg_categoria
    return [
      ...head,
      ...(sexo ? [sexo] : []),
      ...(fnac ? [fnac] : []),
      ...(edad ? [edad] : []),
      ...tail,
    ];
  }, [fieldsData]);

  /** Quick lookup: is a given field configured/enabled? */
  const isFieldEnabled = (name: string) => visibleFields.some(f => f.field_name === name);
  const isFieldRequired = (name: string) =>
    !!visibleFields.find(f => f.field_name === name && f.is_required);
  /**
   * cargoSocioEnabled
   * True solo si el admin activó `reg_cargo_socio` en
   * "Pre-Registro · Configuración de campos". Si está apagado, el bloque
   * "Cargo a cuenta de socio" no se renderiza en el formulario público.
   */
  const cargoSocioEnabled = isFieldEnabled('reg_cargo_socio');

  /** Generic value setter used by all form controls and validation effects. */
  const setValue = useCallback((name: string, v: string) =>
    setValues(prev => ({ ...prev, [name]: v })), []);

  /** Normalize club names for strict, accent-insensitive membership checks. */
  const clubKey = useCallback((clubName: string) => norm(clubName).replace(/\s+/g, ' '), []);

  /** True when a player's stored club matches the tournament's authorized socio club list. */
  const isAuthorizedSocioClub = useCallback((clubName: string): boolean => {
    const key = clubKey(clubName);
    if (!key) return false;
    const socioKeys = socioClubs.map(c => clubKey(c.nombre));
    const hostKey = tournamentInfo?.club ? clubKey(tournamentInfo.club) : '';
    let result: boolean;
    if (socioClubs.length > 0) {
      result = socioKeys.includes(key);
    } else {
      result = !!hostKey && hostKey === key;
    }
    return result;
  }, [clubKey, socioClubs, tournamentInfo?.club]);

  /** Red message shown when the player is not allowed to claim host-club membership. */
  const getSocioBlockedMessage = useCallback((reason: 'missing' | 'not_found' | 'wrong_club' | 'no_club' | 'error', realClub = ''): string => {
    if (reason === 'missing') {
      return 'Para validar “Sí, soy socio” necesitamos nombre, apellido y correo (o SPEI/GHIN). Puedes continuar tu registro, el comité revisará la membresía.';
    }
    if (reason === 'not_found') {
      return 'No encontramos a este jugador en nuestra base de datos de socios. Puedes continuar tu registro; el comité revisará tu información.';
    }
    if (reason === 'wrong_club') {
      return `Nuestro sistema tiene a este jugador registrado en el club ${realClub}. Puedes continuar tu registro; el comité revisará la membresía.`;
    }
    if (reason === 'no_club') {
      return 'Encontramos al jugador en la base de datos, pero no tiene club registrado para validar su membresía. Puedes continuar tu registro; el comité revisará la información.';
    }
    return 'No pudimos validar la membresía del jugador en este momento. Puedes continuar; el comité revisará la información.';
  }, []);

  /**
   * Muestra el mensaje de advertencia de socio sin forzar el valor de
   * `reg_es_socio` a "NO". El jugador puede continuar el proceso con
   * su selección; el comité administrativo decidirá al revisar el
   * pre-registro (los casos se resaltan en /admin/registros).
   */
  const forceNoSocio = useCallback((message: string, _realClub = '') => {
    setSocioMismatch(message);
  }, []);

  /**
   * Validate the "Sí, soy socio" answer against `jugadores` every time the
   * dropdown changes. If the player does not exist, has no club, or belongs
   * to a non-authorized club, the selection is immediately reverted to NO.
   */
  const handleSocioAnswerChange = useCallback(async (answer: string) => {
    if (answer !== 'SI') {
      setSocioMismatch('');
      setValue('reg_es_socio', answer);
      return;
    }

    // El usuario eligió SI: aceptamos la selección de inmediato. La
    // validación contra la base solo controla el mensaje de advertencia,
    // nunca revierte el valor (política vigente).
    setValue('reg_es_socio', 'SI');

    const nombre = (values.reg_nombre || '').trim();
    const apellido = (values.reg_apellido || '').trim();
    const fechanac = (values.reg_fechanac || '').trim();
    const correo   = (values.reg_correo   || '').trim();
    const spei = (values.reg_spei || '').trim();
    const ghin = (values.numghinspei || values.reg_ghin || '').trim();
    const hasId = spei.length >= 3 || ghin.length >= 3;
    /**
     * El lookup por nombre requiere nombre + apellido + correo. El correo
     * es lo que distingue homónimos, sin él NO validamos socio.
     */
    const hasNameLookup = nombre.length >= 2 && apellido.length >= 2 && correo.length >= 5;

    if (!hasId && !hasNameLookup) {
      setSocioMismatch(getSocioBlockedMessage('missing'));
      return;
    }

    try {
      const lookupUrl = hasId
        ? getPlayerLookupByIdUrl(spei, ghin)
        : getClubLookupUrl(nombre, apellido, fechanac, correo, spei, ghin);
      const res = await fetch(lookupUrl);
      const j = await res.json().catch(() => ({}));
      setValues(v => ({ ...v, __player_found: j?.found ? '1' : '0' }));

      if (!j?.found) {
        setSocioMismatch(getSocioBlockedMessage('not_found'));
        return;
      }

      const realClub = String(j.club || '').trim();
      if (!realClub) {
        setSocioMismatch(getSocioBlockedMessage('no_club'));
        return;
      }

      if (!isAuthorizedSocioClub(realClub)) {
        setSocioMismatch(getSocioBlockedMessage('wrong_club', realClub));
        return;
      }

      setSocioMismatch('');
      setSocioClubAutofilled(false);
      setValues(v => ({ ...v, reg_club: realClub }));
    } catch {
      setSocioMismatch(getSocioBlockedMessage('error'));
    }
  }, [forceNoSocio, getSocioBlockedMessage, isAuthorizedSocioClub, setValue, values]);

  /**
   * Strict numeric handicap regex: optional minus sign, digits, optional single decimal digit.
   * Accepts integers or numbers with exactly one decimal place (e.g. -5, -4.9, 14.2, 54.0).
   * Empty string is treated as "not yet entered" (no error).
   */
  const HANDICAP_RE = /^-?\d+(\.\d)?$/;
  /** Accepted handicap range for pre-registro (inclusive). */
  const HANDICAP_MIN = -5;
  const HANDICAP_MAX = 54.0;

  /** onBlur validator for the handicap field. */
  const validateHandicapOnBlur = () => {
    const v = (values.reg_handicap || '').trim();
    if (v === '') { setHandicapError(''); return; }
    if (!HANDICAP_RE.test(v)) {
      const msg = 'Hándicap inválido. Usa números enteros o con un solo decimal (ej: 14.2)';
      setHandicapError(msg);
      toast({ title: 'Hándicap inválido', description: msg, variant: 'destructive' });
      return;
    }
    const num = parseFloat(v);
    if (num < HANDICAP_MIN || num > HANDICAP_MAX) {
      const msg = `El hándicap debe estar entre ${HANDICAP_MIN} y ${HANDICAP_MAX}.`;
      setHandicapError(msg);
      toast({ title: 'Hándicap fuera de rango', description: msg, variant: 'destructive' });
      return;
    }
    setHandicapError('');
  };

  // ============= Email validation =============

  /** Strict client-side email syntax. RFC-ish; rejects spaces, multiple @, etc. */
  const EMAIL_RE = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;

  /** Validate email on blur: regex + server MX check + typo suggestion. */
  const validateEmailOnBlur = async () => {
    const v = (values.reg_correo || '').trim();
    setEmailSuggestion('');
    if (v === '') { setEmailError(''); return; }
    if (!EMAIL_RE.test(v)) {
      const msg = 'Correo inválido. Verifica el formato (ej: nombre@dominio.com)';
      setEmailError(msg);
      toast({ title: 'Correo inválido', description: msg, variant: 'destructive' });
      return;
    }
    setEmailChecking(true);
    try {
      const res = await fetch(getEmailValidateUrl(v));
      const j = await res.json().catch(() => ({}));
      if (j?.valid) {
        // Syntax/MX OK — now check duplicate (nombre+apellido+correo).
        // Sólo bloqueamos si los TRES campos coinciden con un registro
        // previo de este torneo. Si nombre o apellido aún están vacíos,
        // el servidor devuelve `exists:false` y el POST hará el chequeo
        // definitivo.
        const nombre   = (values.reg_nombre   || '').trim();
        const apellido = (values.reg_apellido || '').trim();
        try {
          const dupRes = await fetch(getRegistroEmailCheckUrl(v, nombre, apellido));
          const dupJ = await dupRes.json().catch(() => ({}));
          if (dupJ?.exists) {
            const msg = 'Ya existe un pre-registro con el mismo nombre, apellido y correo en este torneo. Si necesitas registrar a otra persona, cambia el nombre o el apellido.';
            setEmailError(msg);
            toast({ title: 'Pre-registro duplicado', description: msg, variant: 'destructive' });
            return;
          }
        } catch { /* network error → no bloquear; el POST lo revalidará */ }
        setEmailError('');
        return;
      }
      if (j?.reason === 'typo' && j?.suggestion) {
        setEmailSuggestion(j.suggestion);
        const msg = `¿Quisiste decir ${j.suggestion}?`;
        setEmailError(msg);
        toast({ title: 'Posible error en el correo', description: msg, variant: 'destructive' });
      } else if (j?.reason === 'no_mx') {
        const msg = 'El dominio del correo no existe o no recibe correos.';
        setEmailError(msg);
        toast({ title: 'Correo inválido', description: msg, variant: 'destructive' });
      } else {
        const msg = 'Correo inválido.';
        setEmailError(msg);
        toast({ title: 'Correo inválido', description: msg, variant: 'destructive' });
      }
    } catch {
      // Network failure — don't block, server check is best-effort.
      setEmailError('');
    } finally {
      setEmailChecking(false);
    }
  };

  /** Apply the typo suggestion banner. */
  const acceptEmailSuggestion = () => {
    if (!emailSuggestion) return;
    setValue('reg_correo', emailSuggestion);
    setEmailError('');
    setEmailSuggestion('');
  };

  // ============= Phone validation =============

  /** Entrada completa del país seleccionado (lada, bandera, longitudes). */
  const phoneEntry = useMemo(
    () => PHONE_CODES.find(p => p.id === phoneCodeId) ?? PHONE_CODES[0],
    [phoneCodeId]
  );

  /** Lada del país seleccionado, ej. "+52". */
  const phoneCode = phoneEntry.code;

  /** Rango de dígitos aceptado: exacto si no hay `flex`, rango si lo hay. */
  const phoneFlex = phoneEntry.flex ?? 0;
  const phoneLenMin = phoneEntry.len - phoneFlex;
  const phoneLenMax = phoneEntry.len + phoneFlex;

  /** Texto de ayuda para la longitud esperada. */
  const phoneLenHint = phoneFlex > 0
    ? `entre ${phoneLenMin} y ${phoneLenMax} dígitos`
    : `${phoneEntry.len} dígitos`;

  /** Re-compose reg_telefono whenever code or local digits change as a safety mirror for derived phone state. */
  useEffect(() => {
    if (!phoneLocal) {
      setValue('reg_telefono', '');
      return;
    }
    setValue('reg_telefono', `${phoneCode} ${phoneLocal}`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phoneCode, phoneLocal]);

  /** Validate the phone on blur (length + digits-only). */
  const validatePhoneOnBlur = () => {
    if (!phoneLocal) { setPhoneError(''); return; }
    if (!/^\d+$/.test(phoneLocal)) {
      const msg = 'Sólo se permiten números (sin espacios ni guiones).';
      setPhoneError(msg);
      toast({ title: 'Teléfono inválido', description: msg, variant: 'destructive' });
      return;
    }
    if (phoneLocal.length < phoneLenMin || phoneLocal.length > phoneLenMax) {
      const msg = phoneFlex > 0
        ? `Debe tener ${phoneLenHint}.`
        : `Debe tener exactamente ${phoneEntry.len} dígitos.`;
      setPhoneError(msg);
      toast({ title: 'Teléfono inválido', description: msg, variant: 'destructive' });
      return;
    }
    setPhoneError('');
  };

  /** Load countries on mount (only if the field is enabled). */
  useEffect(() => {
    if (!isFieldEnabled('reg_pais')) return;
    fetch(getLocationsCountriesUrl())
      .then(r => r.json())
      .then((rows: LocationRow[]) => setCountries(rows || []))
      .catch(() => setCountries([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleFields.length]);

  /** Cascade states when country changes. */
  useEffect(() => {
    const cid = values.reg_pais;
    if (!cid) { setStates([]); return; }
    fetch(getLocationsStatesUrl(cid))
      .then(r => r.json())
      .then((rows: LocationRow[]) => setStates(rows || []))
      .catch(() => setStates([]));
    // Note: we intentionally do NOT auto-clear estado/ciudad here so that
    // the club-autofill chain (which sets pais → states load → estado →
    // cities load → ciudad) doesn't wipe its own intermediate value. The
    // user-driven dropdowns also re-validate against the loaded list.
  }, [values.reg_pais]);

  /** Cascade cities when state changes. */
  useEffect(() => {
    const sid = values.reg_estado;
    if (!sid) { setCities([]); return; }
    fetch(getLocationsCitiesUrl(sid))
      .then(r => r.json())
      .then((rows: LocationRow[]) => setCities(rows || []))
      .catch(() => setCities([]));
  }, [values.reg_estado]);

  /** Load full clubs list once, when reg_club is enabled. */
  useEffect(() => {
    if (!isFieldEnabled('reg_club')) return;
    fetch(getClubsUrl())
      .then(r => r.json())
      .then(j => setClubs(Array.isArray(j?.clubs) ? j.clubs : []))
      .catch(() => setClubs([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleFields.length]);

  /**
   * Load the tournament-specific clubs list (from `clubs_registro`) once
   * per active torneoid. This drives the restricted datalist that the
   * reg_club input uses when reg_es_socio = SI.
   */
  useEffect(() => {
    if (!isFieldEnabled('reg_club')) return;
    fetch(getClubsByTorneoUrl())
      .then(r => r.json())
      .then(j => setSocioClubs(Array.isArray(j?.clubs) ? j.clubs : []))
      .catch(() => setSocioClubs([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleFields.length]);

  /**
   * When the user has filled nombre + apellido + correo, look up an
   * existing `jugadores` row and pre-fill the club. Los tres campos son
   * OBLIGATORIOS: sin correo hay riesgo alto de falsos positivos por
   * homónimos ("Juan Pérez"), así que el server hace un AND estricto.
   */
  useEffect(() => {
    if (!isFieldEnabled('reg_club')) return;
    const nombre   = (values.reg_nombre   || '').trim();
    const apellido = (values.reg_apellido || '').trim();
    const fechanac = (values.reg_fechanac || '').trim();
    const correo   = (values.reg_correo   || '').trim();
    const spei     = (values.reg_spei     || '').trim();
    const ghin     = (values.numghinspei  || values.reg_ghin || '').trim();
    if (nombre.length < 2 || apellido.length < 2 || correo.length < 5) return;
    const key = `${nombre.toLowerCase()}|${apellido.toLowerCase()}|${correo.toLowerCase()}|${fechanac}|${spei}|${ghin}`;
    if (key === lastLookupKey) return;

    let cancelled = false;
    const t = setTimeout(() => {
      setLastLookupKey(key);
      fetch(getClubLookupUrl(nombre, apellido, fechanac, correo, spei, ghin))
        .then(r => r.json())
        .then(j => {
          if (cancelled) return;
          // Tag whether we found this player at all — the socio dropdown
          // uses this same server truth every time the player tries "SI".
          setValues(v => ({ ...v, __player_found: j?.found ? '1' : '0' }));
          if (!j?.found) {
            if (values.reg_es_socio === 'SI') {
              forceNoSocio(getSocioBlockedMessage('not_found'));
            }
            return;
          }
          if (!j?.club) {
            if (values.reg_es_socio === 'SI') {
              forceNoSocio(getSocioBlockedMessage('no_club'));
            }
            return;
          }
          /**
           * Verificación cruzada: si el jugador declaró (o va a declarar)
           * SÍ soy socio, comprobamos que su club en la BD coincida con
           * alguno de los clubes autorizados del torneo (`socioClubs`).
           * Si NO coincide, forzamos reg_es_socio = 'NO', autollenamos su
           * club real y mostramos el mensaje en rojo especificado por el
           * cliente. Esto se ejecuta también cuando reg_es_socio aún está
           * vacío, para prevenir que el jugador marque SI incorrectamente.
           */
          const realClub = String(j.club).trim();
          const isAuthorized = isAuthorizedSocioClub(realClub);
          if (!isAuthorized) {
            // Mostrar advertencia sin forzar el valor; el comité valida.
            forceNoSocio(getSocioBlockedMessage('wrong_club', realClub), realClub);
          } else {
            setSocioMismatch('');
          }
          return;
        })
        .catch(() => { /* silent — autofill is best-effort */ });
    }, 400);
    return () => { cancelled = true; clearTimeout(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [values.reg_nombre, values.reg_apellido, values.reg_correo, values.reg_fechanac, values.reg_spei, values.numghinspei, values.reg_ghin, visibleFields.length, socioClubs]);

  /**
   * Es-socio autofill rules:
   *  - SI  → reg_club = club del torneo anfitrión, PERO sólo como sugerencia:
   *          si el torneo tiene más de un club autorizado (p. ej. durante el
   *          registro preferente hay varios clubes con preferencia), no se
   *          sobrescribe una selección hecha por el jugador — un socio de un
   *          club preferente distinto al sede debe poder conservar su club.
   *  - NO  → if we previously autofilled from SI, clear it so the user
   *          (or the player-lookup effect above) can fill the real club.
   */
  useEffect(() => {
    const ans = values.reg_es_socio;
    if (ans === 'SI') {
      const hostClub = tournamentInfo?.club || (socioClubs.length === 1 ? socioClubs[0].nombre : '');
      // Varios clubes autorizados → el jugador elige; sólo prellenamos si
      // el campo está vacío o si el valor previo lo pusimos nosotros.
      const multipleAuthorized = socioClubs.length > 1;
      if (hostClub) {
        setValues(v => {
          if (v.reg_club === hostClub) return v;
          if (multipleAuthorized && v.reg_club && !socioClubAutofilled) return v;
          return { ...v, reg_club: hostClub };
        });
        setSocioClubAutofilled(true);
      }
    } else if (ans === 'NO' && socioClubAutofilled) {
      setSocioClubAutofilled(false);
      // Clear the SI-injected value so the player-lookup effect (or the
      // user) can re-populate it. If we already have player data the
      // lookup effect will refill on the next debounce tick.
      setValues(v => ({ ...v, reg_club: '' }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [values.reg_es_socio, tournamentInfo?.club, socioClubs, clubKey]);

  /**
   * When the typed club name matches a known club row, auto-fill país /
   * estado / ciudad by case-insensitive name match against the cascading
   * dropdown lists. We only set values that resolve cleanly to an ID.
   */
  useEffect(() => {
    const clubName = norm(values.reg_club || '');
    if (!clubName) return;
    const match = clubs.find(c => norm(c.nombre) === clubName);
    if (!match) return;

    // 1) Country resolution priority:
    //    a) explicit id_pais from clubs table
    //    b) name match (accent-insensitive) against countries list
    //    c) sensible default of "mexico" / "méxico" / "mx" / "mex"
    let country = match.id_pais
      ? countries.find(c => c.id === match.id_pais)
      : undefined;
    if (!country) {
      const paisName = norm(match.pais || '');
      country = paisName
        ? countries.find(c => norm(c.name) === paisName)
        : countries.find(c => ['mexico', 'mx', 'mex'].includes(norm(c.name)));
    }
    if (country && values.reg_pais !== String(country.id)) {
      // País cambia → invalidar estado/ciudad anteriores para que la
      // cascada se recalcule contra las nuevas listas. Sin esto, los
      // valores viejos persisten y bloquean la actualización al cambiar
      // de club entre países/estados distintos.
      setValues(v => ({ ...v, reg_pais: String(country.id), reg_estado: '', reg_ciudad: '' }));
      return; // wait for states to load on next render
    }

    // 2) State (depends on states list being loaded for current country)
    let st = match.id_estado && states.length
      ? states.find(s => s.id === match.id_estado)
      : undefined;
    if (!st && states.length) {
      const estadoName = norm(match.estado || '');
      if (estadoName) {
        st = states.find(s => locMatches(s.name, match.estado || ''))
          || states.find(s => norm(s.name).includes(estadoName)
                           || estadoName.includes(norm(s.name)));
      }
    }
    if (st && values.reg_estado !== String(st.id)) {
      // Estado cambia → invalidar ciudad anterior por la misma razón.
      setValues(v => ({ ...v, reg_estado: String(st.id), reg_ciudad: '' }));
      return;
    }
    // Si el club no aporta estado y hay uno previo, límpialo para no
    // dejar un valor huérfano del club anterior.
    if (!st && states.length && values.reg_estado) {
      setValues(v => ({ ...v, reg_estado: '', reg_ciudad: '' }));
      return;
    }

    // 3) City (depends on cities list being loaded for current state)
    let ci = match.id_ciudad && cities.length
      ? cities.find(c => c.id === match.id_ciudad)
      : undefined;
    if (!ci && cities.length) {
      const ciudadName = norm(match.ciudad || '');
      if (ciudadName) {
        ci = cities.find(c => locMatches(c.name, match.ciudad || ''))
          || cities.find(c => norm(c.name).includes(ciudadName)
                           || ciudadName.includes(norm(c.name)));
      }
    }
    if (ci && values.reg_ciudad !== String(ci.id)) {
      setValues(v => ({ ...v, reg_ciudad: String(ci.id) }));
    } else if (!ci && cities.length && values.reg_ciudad) {
      // Ciudad previa no existe para el nuevo club/estado → limpiar.
      setValues(v => ({ ...v, reg_ciudad: '' }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [values.reg_club, clubs, countries, states, cities]);

  /**
   * tipo_socio usado por filtros/precio:
   *  - SI + subtipo → TITULAR/EMERITO/DEPENDIENTE
   *  - SI sin subtipo → SOCIO
   *  - NO → NO_SOCIO
   *  - vacío → undefined para no excluir categorías antes de capturar socio.
   */
  const tipoSocioForPricing = useMemo(() => {
    if (values.reg_es_socio === 'SI') return values.reg_tipo_socio || 'SOCIO';
    if (values.reg_es_socio === 'NO') return 'NO_SOCIO';
    return undefined;
  }, [values.reg_es_socio, values.reg_tipo_socio]);

  /**
   * Núcleo de elegibilidad — dado (sex, age, hcpRaw) devuelve qué categorías
   * son válidas y, por cada exclusión, el motivo legible. Se extrae como
   * función para poder reutilizarla tanto en el filtro del formulario como
   * en la auditoría automática de cobertura de handicaps (sweep -5 → 40.6).
   */
  const evaluateEligibility = useCallback((
    hcpRaw: number,
    sex: string,
    age: number | null,
  ) => {
    const globalMinHcp = categories
      .filter(c => c.hcpMax > 0)
      .reduce<number | null>((min, c) => (min === null || c.hcpMin < min ? c.hcpMin : min), null);
    const hcp = !isNaN(hcpRaw) && globalMinHcp !== null && hcpRaw < globalMinHcp
      ? globalMinHcp
      : hcpRaw;
    const evaluations = categories.map(c => {
      const catReglas = reglas.filter(r => !!r.is_active && ruleMatchesCategory(r, { id: c.id, name: c.name }));

      /**
       * Explicit admin rules are the source of truth when present. This avoids
       * mixing stale `categorias.hcpIdxMin/Max` values with the eligibility
       * rules: age-restricted categories (e.g. Campeonato Mayor) are removed by
       * age first, while normal categories can still use their explicit HCP
       * range even if the base category range differs.
       */
      if (catReglas.length > 0) {
        const playerCtx = { sex, age, hcp: !isNaN(hcpRaw) ? normalizeHcpIndex(hcpRaw) : null };
        const anyMatch = catReglas.some(r => playerMatchesRule(r, playerCtx));
        if (!anyMatch) {
          /** Resumen legible de cada regla para que el admin sepa qué editar. */
          const dump = catReglas.map(r => {
            const parts: string[] = [];
            parts.push(`género=${r.genero ?? '∗'}`);
            parts.push(`edad ${r.edad_min ?? '−∞'}–${r.edad_max ?? '+∞'}`);
            parts.push(`hcp ${r.hcp_min ?? '−∞'}–${r.hcp_max ?? '+∞'}`);
            return `[${parts.join(', ')}]`;
          }).join(' ');
          return {
            c,
            ok: false,
            reason: `Ninguna de ${catReglas.length} regla(s) explícita(s) coincide. Reglas: ${dump}. Jugador: sexo=${sex||'?'}, edad=${age??'?'}, hcp=${!isNaN(hcpRaw)?hcpRaw:'?'}`,
          };
        }
        return { c, ok: true, reason: '' };
      }

      if (!isNaN(hcp) && c.hcpMax > 0 && (hcp < c.hcpMin || hcp > c.hcpMax)) {
        return { c, ok: false, reason: `Hcp ${hcp} fuera del rango BD ${c.hcpMin}–${c.hcpMax}` };
      }
      if (!isNaN(hcp)) {
        const hcpFromName = parseHcpFromName(c.name || '');
        if (hcpFromName && (hcp < hcpFromName.min || hcp > hcpFromName.max)) {
          return { c, ok: false, reason: `Hcp ${hcp} fuera del rango del nombre ${hcpFromName.min}–${hcpFromName.max}` };
        }
      }
      if (sex && c.gender && (c.gender === 'M' || c.gender === 'F') && c.gender !== sex) {
        return { c, ok: false, reason: `Género ${c.gender} ≠ ${sex}` };
      }
      if (age !== null) {
        const fromName = parseAgeFromName(c.name || '');
        const minDb = c.ageMin != null && c.ageMin > 0 ? c.ageMin : null;
        const maxDb = c.ageMax != null && c.ageMax > 0 ? c.ageMax : null;
        const min = minDb ?? (fromName ? fromName.min : null);
        const max = maxDb ?? (fromName ? fromName.max : null);
        if (min != null && age < min) return { c, ok: false, reason: `Edad ${age} < mínima ${min}` };
        if (max != null && age > max) return { c, ok: false, reason: `Edad ${age} > máxima ${max}` };
      }
      return { c, ok: true, reason: '' };
    });
    return {
      eligible: evaluations.filter(e => e.ok).map(e => e.c),
      exclusions: evaluations.filter(e => !e.ok),
      hcp,
      hcpRaw,
      sex,
      age,
    };
  }, [categories, reglas]);

  /** Eligible categories given hcp/sex/age (when those values are present). */
  const categoryFilterResult = useMemo(() => {
    const hcpRaw = parseFloat(values.reg_handicap);
    const sex  = (values.reg_sexo || '').toUpperCase();
    // Edad: prioriza la calculada desde fechanac; si no, usa la capturada
    // manualmente en akron_edad (cuando el admin desactivó fechanac).
    const ageFromBirth = calcAge(values.reg_fechanac || '');
    const ageManual    = parseInt(values.akron_edad || '', 10);
    const age = ageFromBirth !== null
      ? ageFromBirth
      : (!isNaN(ageManual) ? ageManual : null);
    return evaluateEligibility(hcpRaw, sex, age);
  }, [evaluateEligibility, values.reg_handicap, values.reg_sexo, values.reg_fechanac, values.akron_edad]);

  /**
   * Auditoría de cobertura de hándicap: barre HCP de -5.0 a 40.6 en pasos
   * de 0.1 para los sexos M y F (usando la edad capturada) y detecta los
   * tramos sin ninguna categoría elegible. Sirve para garantizar que NO
   * existan agujeros de cobertura. Sólo se calcula bajo ?debug=1.
   */
  const hcpCoverageAudit = useMemo(() => {
    if (typeof window === 'undefined' || !window.location.search.includes('debug=1')) return null;
    if (!categories.length) return null;
    const ageFromBirth = calcAge(values.reg_fechanac || '');
    const ageManual    = parseInt(values.akron_edad || '', 10);
    const age = ageFromBirth !== null ? ageFromBirth : (!isNaN(ageManual) ? ageManual : null);
    /** Para un sexo dado, devuelve la lista de intervalos [from..to] de HCP sin categoría. */
    const auditSex = (sex: 'M' | 'F') => {
      const gaps: { from: number; to: number }[] = [];
      let current: { from: number; to: number } | null = null;
      for (let i = -50; i <= 406; i++) {
        const hcp = Math.round(i) / 10;
        const res = evaluateEligibility(hcp, sex, age);
        if (res.eligible.length === 0) {
          if (current) current.to = hcp;
          else current = { from: hcp, to: hcp };
        } else if (current) {
          gaps.push(current);
          current = null;
        }
      }
      if (current) gaps.push(current);
      return gaps;
    };
    return { M: auditSex('M'), F: auditSex('F'), age };
  }, [categories, reglas, evaluateEligibility, values.reg_fechanac, values.akron_edad]);

  const eligibleCategories = categoryFilterResult.eligible;

  /** If changed age/gender/hcp makes the selected category invalid, clear it immediately. */
  useEffect(() => {
    if (!values.reg_categoria) return;
    const stillEligible = eligibleCategories.some(c => String(c.id) === String(values.reg_categoria));
    if (!stillEligible) setValues(v => ({ ...v, reg_categoria: '' }));
  }, [eligibleCategories, values.reg_categoria]);


  // ============= Precio estimado de inscripción =============

  /**
   * Resuelve el NOMBRE de la categoría seleccionada (la BD de precios
   * guarda nombres, no IDs, para sobrevivir entre torneos).
   */
  const selectedCategoryName = useMemo(() => {
    const id = values.reg_categoria;
    if (!id) return undefined;
    return categories.find(c => c.id === id)?.name;
  }, [categories, values.reg_categoria]);

  /** Edad calculada a partir de la fecha de nacimiento ya validada. */
  const ageForPricing = useMemo(
    () => {
      const fromBirth = calcAge(values.reg_fechanac || '');
      if (fromBirth !== null) return fromBirth;
      const manual = parseInt(values.akron_edad || '', 10);
      return !isNaN(manual) ? manual : null;
    },
    [values.reg_fechanac, values.akron_edad]
  );

  /**
   * Auto-completar `akron_edad` a partir de `reg_fechanac` cuando ambos campos
   * están activos. Sincroniza el flag `edadAuto` para que el input se
   * renderice en gris/disabled. Si la fecha se borra o invalida, libera el
   * campo para captura manual.
   */
  useEffect(() => {
    if (!isFieldEnabled('akron_edad')) return;
    const age = calcAge(values.reg_fechanac || '');
    if (age !== null) {
      // Auto-rellenar (sólo si cambia, para no entrar en loop infinito).
      if (values.akron_edad !== String(age)) {
        setValues(v => ({ ...v, akron_edad: String(age) }));
      }
      if (!edadAuto) setEdadAuto(true);
    } else {
      // Fecha vacía/inválida — si el valor previo era auto, limpiarlo.
      if (edadAuto) {
        setEdadAuto(false);
        setValues(v => ({ ...v, akron_edad: '' }));
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [values.reg_fechanac, visibleFields.length]);

  /**
   * Consulta reactiva al endpoint de matching de precio.
   * Tras el split (2026-05-22), el precio depende ÚNICAMENTE del tipo de
   * socio. Se ejecuta sólo cuando ya hay categoría elegida + tipo de
   * socio resuelto (así evitamos mostrar un precio antes de que el
   * usuario haya completado los datos relevantes).
   */
  const { data: precioMatchData, isFetching: precioFetching } = useRegistroPrecioMatch({
    tipo_socio: tipoSocioForPricing,
    genero: (values.reg_sexo || '').toUpperCase() || undefined,
    edad: ageForPricing ?? undefined,
    enabled: !!(selectedCategoryName && tipoSocioForPricing),
  });
  const precioMatch = precioMatchData?.match || null;

  /**
   * Formateador de moneda con `Intl`. Por defecto MXN-es-MX.
   * Cae a "$1,234" si la moneda no es estándar ISO.
   */
  const formatPrice = (amount: number, currency: string) => {
    try {
      return new Intl.NumberFormat('es-MX', {
        style: 'currency',
        currency: currency || 'MXN',
        minimumFractionDigits: 0,
      }).format(amount);
    } catch {
      return `$${amount.toLocaleString('es-MX')} ${currency}`;
    }
  };

  /**
   * SPEI / GHIN lookup: when either reg_spei or numghinspei has a long
   * enough value, query /api/clubs.php?action=lookup&spei=…&ghin=… and
   * pre-fill any empty top-level fields (nombre, apellido, correo, club,
   * sexo, fechanac). Existing user input is never overwritten.
   */
  useEffect(() => {
    const spei = (values.reg_spei || '').trim();
    const ghin = (values.numghinspei || values.reg_ghin || '').trim();
    if (spei.length < 3 && ghin.length < 3) return;
    const key = `${spei}|${ghin}`;
    if (key === lastIdLookup) return;
    let cancelled = false;
    const t = setTimeout(() => {
      setLastIdLookup(key);
      fetch(getPlayerLookupByIdUrl(spei, ghin))
        .then(r => r.json())
        .then(j => {
          if (cancelled || !j?.found) return;
          /** Only fill empty fields — never clobber user input. */
          setValues(v => {
            const next = { ...v };
            const fill = (k: string, val: any) => {
              if (val == null || val === '') return;
              if (!next[k]) next[k] = String(val);
            };
            fill('reg_nombre',   j.nombre);
            fill('reg_apellido', j.apellido);
            fill('reg_correo',   j.correo);
            fill('reg_club',     j.club);
            const sx = j.sexo || j.genero;
            if (sx) fill('reg_sexo', String(sx).toUpperCase().startsWith('F') ? 'F' : 'M');
            if (j.fechanac && /^\d{4}-\d{2}-\d{2}/.test(j.fechanac)) {
              fill('reg_fechanac', j.fechanac.slice(0, 10));
              if (!birthDmy) setBirthDmy(isoToDmy(j.fechanac));
            }
            return next;
          });
        })
        .catch(() => { /* silent */ });
    }, 500);
    return () => { cancelled = true; clearTimeout(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [values.reg_spei, values.numghinspei, values.reg_ghin]);

  /** Submit the form as multipart/form-data. */
  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    // Validate "Clave de Socio" cuando el jugador eligió cargar a cuenta.
    if (values.reg_es_socio === 'SI' && values.reg_cargo_socio === '1') {
      const clave = (values.reg_numsocio || '').trim();
      if (!clave) {
        toast({
          title: 'Clave de Socio requerida',
          description: 'Captura el número o clave de tu membresía del club.',
          variant: 'destructive',
        });
        return;
      }
    }
    // Validate birthdate dd/mm/aaaa if rendered.
    if (isFieldEnabled('reg_fechanac')) {
      const err = validateBirthDmy(birthDmy);
      if (err) {
        setBirthError(err);
        toast({ title: 'Fecha de nacimiento inválida', description: err, variant: 'destructive' });
        return;
      }
    }
    // Block submission when the handicap value is malformed.
    if (isFieldEnabled('reg_handicap')) {
      const v = (values.reg_handicap || '').trim();
      if (v && (!HANDICAP_RE.test(v) || parseFloat(v) < HANDICAP_MIN || parseFloat(v) > HANDICAP_MAX)) {
        validateHandicapOnBlur();
        return;
      }
    }
    /**
     * BLOQUEO DURO: SIN CATEGORÍA ELEGIBLE (HÁNDICAP FUERA DE RANGO)
     * ---------------------------------------------------------------
     * Si el campo de categoría está habilitado y los datos capturados
     * (hándicap / sexo / edad) NO producen ninguna categoría elegible,
     * el pre-registro NO se envía: no se guarda en la BD y no sale el
     * correo de confirmación. Antes sólo se mostraba el aviso rojo en
     * el formulario pero el envío continuaba con la categoría vacía.
     */
    if (isFieldEnabled('reg_categoria')) {
      const hcpGiven = !!(values.reg_handicap || '').trim();
      const sexGiven = !isFieldEnabled('reg_sexo') || !!(values.reg_sexo || '').trim();
      if (hcpGiven && sexGiven && eligibleCategories.length === 0) {
        toast({
          title: 'Sin categoría disponible',
          description:
            'No existen categorías disponibles para tu edad/hándicap/género registrados. ' +
            'Favor de contactar a la oficina del club directamente para más información.',
          variant: 'destructive',
        });
        return;
      }
      /**
       * Categoría obligatoria sin seleccionar: el Select custom no tiene
       * validación nativa de `required`, así que lo verificamos aquí.
       */
      if (isFieldRequired('reg_categoria') && !values.reg_categoria) {
        toast({
          title: 'Categoría requerida',
          description: 'Selecciona la categoría en la que deseas participar.',
          variant: 'destructive',
        });
        return;
      }
    }
    // Block submission when email failed validation.
    if (isFieldEnabled('reg_correo') && (emailError || (values.reg_correo && !EMAIL_RE.test(values.reg_correo.trim())))) {
      validateEmailOnBlur();
      return;
    }
    // Block submission when phone is incomplete or invalid.
    if (isFieldEnabled('reg_telefono')) {
      const requiredPhone = isFieldRequired('reg_telefono');
      if (requiredPhone && !phoneLocal) {
        setPhoneError('Ingresa tu teléfono.');
        toast({ title: 'Teléfono requerido', variant: 'destructive' });
        return;
      }
      if (phoneLocal && (phoneLocal.length < phoneLenMin || phoneLocal.length > phoneLenMax || !/^\d+$/.test(phoneLocal))) {
        validatePhoneOnBlur();
        return;
      }
    }

    /**
     * VALIDACIÓN ESTRICTA DE CLUB
     * ---------------------------------------------------------------
     * El campo `reg_club` es un input tipo autocomplete (datalist) que
     * permite escribir texto libre. Debemos prohibir guardar un valor
     * que NO exista en el catálogo mostrado. Si el jugador no encuentra
     * su club, debe seleccionar "Sin club" y avisar a info@speitour.mx.
     */
    if (isFieldEnabled('reg_club')) {
      const typed = (values.reg_club || '').trim();
      if (typed) {
        const isSocio = values.reg_es_socio === 'SI';
        const universe = isSocio && socioClubs.length > 0 ? socioClubs : clubs;
        const match = universe.some(
          c => c.nombre.trim().toLowerCase() === typed.toLowerCase()
        );
        if (!match) {
          const msg = '¿No encuentras tu club? Selecciona "Sin club" de la lista ' +
                      'y añade el nombre real de tu club en el campo "Notas adicionales" ' +
                      'para que el comité pueda agregarlo.';
          setClubError(msg);
          toast({ title: 'Club no válido', description: msg, variant: 'destructive' });
          return;
        }
      }
    }

    /**
     * VENTANA DE REGISTRO PREFERENTE
     * ---------------------------------------------------------------
     * Si el servidor reporta `active_now = true`, sólo permitimos el
     * envío si el jugador declaró ser socio (`reg_es_socio = SI`) Y el
     * club seleccionado está en la lista `allowed_club_ids` con ventana
     * vigente hoy. En caso contrario, bloqueamos con un toast.
     */
    if (preferenteCfg?.active_now) {
      /**
       * La condición real es el CLUB: si el club seleccionado está entre los
       * clubes con ventana preferente vigente hoy, se acepta — sin importar
       * si es el club sede o no, y sin exigir la bandera `reg_es_socio = SI`
       * (el comité valida la membresía después). Buscamos el club tanto en la
       * lista del torneo como en el catálogo completo, comparando de forma
       * insensible a acentos/mayúsculas.
       */
      const typedKey = clubKey(values.reg_club || '');
      const chosen =
        socioClubs.find(c => clubKey(c.nombre) === typedKey) ||
        clubs.find(c => clubKey(c.nombre) === typedKey);
      const allowedIds = preferenteCfg.allowed_club_ids || [];
      const clubAllowed = !!chosen && allowedIds.includes(chosen.id);
      if (!clubAllowed) {
        toast({
          title: 'Registro preferente activo',
          description:
            'En este momento sólo pueden pre-registrarse socios de los clubes autorizados. ' +
            'Si consideras que esto es un error, indícalo en el campo "Notas adicionales".',
          variant: 'destructive',
        });
        return;
      }
    }

    setSubmitting(true);
    try {
      const fd = new FormData();
      /**
       * Fallback GHIN (FMG / USGA): si el campo está habilitado pero el
       * jugador no capturó ningún valor, enviamos 9999 para que la base de
       * datos siempre tenga un número de referencia. Aplica tanto al campo
       * histórico `reg_ghin` como a su equivalente `numghinspei`.
       */
      const isGhinField = (name: string) => name === 'reg_ghin' || name === 'numghinspei';
      Object.entries(values).forEach(([k, v]) => {
        // Skip our internal/private flags (prefixed with __).
        if (k.startsWith('__')) return;
        /**
         * Fallback CLUB: si el jugador no seleccionó club, enviamos
         * "SIN CLUB" (clubid 770042 en `torneos.clubs`).
         */
        const isClubField = k === 'reg_club';
        let finalValue = isGhinField(k) && (!v || v === '') ? '9999' : v;
        if (isClubField && (!v || String(v).trim() === '')) finalValue = SIN_CLUB_NOMBRE;
        /**
         * NOMBRE PROPIO: nombre y apellido siempre se envían normalizados
         * (mayúsculas/minúsculas + ortografía), aunque el campo no haya
         * perdido el foco antes de enviar.
         */
        if (isProperNameField(k)) finalValue = toProperName(finalValue);
        if (finalValue !== '' && finalValue !== undefined && finalValue !== null) fd.append(k, finalValue);
      });
      if (file) fd.append('reg_archivo', file);
      /**
       * Garantía extra del fallback GHIN: si el campo está habilitado en el
       * formulario pero nunca fue tocado (no existe la llave en `values`),
       * igual enviamos 9999 para que la BD siempre reciba un valor.
       */
      (['reg_ghin', 'numghinspei'] as const).forEach((ghinName) => {
        if (isFieldEnabled(ghinName) && !fd.has(ghinName)) fd.append(ghinName, '9999');
      });
      /**
       * Garantía extra del fallback de club: si el campo está habilitado
       * pero nunca se seleccionó nada, enviamos "SIN CLUB".
       */
      if (isFieldEnabled('reg_club') && !fd.has('reg_club')) fd.append('reg_club', SIN_CLUB_NOMBRE);
      /**
       * País y lada del teléfono: además del número completo
       * (reg_telefono = "+52 5512345678") enviamos el país seleccionado
       * (id de PHONE_CODES, ej. 'MX') y la lada ('+52') para que la BD
       * conserve el formato correcto en el reporte y la exportación.
       */
      if (isFieldEnabled('reg_telefono') && phoneLocal.trim()) {
        fd.append('reg_tel_pais', phoneEntry.id);
        fd.append('reg_tel_lada', phoneEntry.code);
      }
      /**
       * Marca de tiempo de envío capturada en el cliente. Enviamos:
       *  - `reg_client_utc`: ISO 8601 en UTC (Z), lo que el servidor guarda
       *    en `registro.fecharegistro` como hora absoluta de referencia.
       *  - `reg_client_tz_offset`: minutos de offset respecto a UTC del
       *    navegador del jugador (auditoría / soporte de zona horaria).
       * Esto reemplaza el uso de NOW() del servidor, que dependía de la zona
       * horaria del host y producía desfases al mostrarse en otras regiones.
       */
      const nowClient = new Date();
      fd.append('reg_client_utc', nowClient.toISOString());
      fd.append('reg_client_tz_offset', String(-nowClient.getTimezoneOffset()));
      // Snapshot del precio mostrado al jugador (auditoría / referencia
      // para el comité). Se calcula en la BD vía registro_precios; aquí
      // sólo persistimos lo que el jugador vio al pulsar enviar.
      if (precioMatch) {
        fd.append('reg_precio_estimado', String(precioMatch.precio));
        fd.append('reg_precio_moneda',   precioMatch.moneda || 'MXN');
        fd.append('reg_precio_regla_id', String(precioMatch.id));
      }

      /**
       * Lista de espera: si la categoría seleccionada ya está llena
       * (registeredCount >= maxjugadores y max>0/<>99), pedimos
       * confirmación al jugador antes de enviar. El servidor revalida
       * el cupo y marca status_pago=67 cuando aplica.
       */
      const selectedCatId = values.reg_categoria;
      const selectedCat = eligibleCategories.find(c => String(c.id) === String(selectedCatId));
      if (selectedCat) {
        const maxC = Number(selectedCat.maxPlayers) || 0;
        const regC = Number(selectedCat.registeredCount) || 0;
        const unlimitedC = !maxC || maxC === 99;
        if (!unlimitedC && regC >= maxC) {
          const ok = window.confirm(
            'La categoria seleccionada esta llena. Serás registrado en lista de espera '
            + 'y si se desocupa el lugar de alguien registrado antes que tu, avanzarás '
            + 'en la cola para la categoría seleccionada.'
          );
          if (!ok) { setSubmitting(false); return; }
          fd.append('_waitlist', '1');
        }
      }

      const res = await fetch(getRegistroSubmitUrl(), { method: 'POST', body: fd });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !(json as any).saved) {
        // Duplicate-email case (HTTP 409): surface the canonical message
        // inline next to the email field so el jugador lo vea sin scroll.
        if (res.status === 409) {
          setEmailError(
            (json as any).error
            || 'Ya existe un pre-registro con el mismo nombre, apellido y correo en este torneo.'
          );
        }
        throw new Error((json as any).error || 'Error al enviar el formulario');
      }
      const isWaitlist = !!(json as any).waitlist;
      setSubmittedWaitlist(isWaitlist);
      setSubmitted(true);
      toast({
        title: isWaitlist ? '¡Pre-registro en lista de espera!' : '¡Pre-registro enviado!',
        description: isWaitlist
          ? 'Recibirás un correo con los detalles de tu registro en lista de espera.'
          : 'Recibirás confirmación por correo.',
      });
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    } finally {
      setSubmitting(false);
    }
  };

  /** Render one field row by its config entry. */
  const renderField = (name: string, label: string, required: boolean) => {
    const placeholder = PLACEHOLDERS[name] ?? '';
    const id = `f-${name}`;
    const common = { id, required, placeholder } as const;

    // ----- Specialized renderers -----
    if (name === 'reg_es_socio') {
      return (
        <div className="space-y-2" key={name}>
          <Label htmlFor={id}>{label}{required && <span className="text-destructive"> *</span>}</Label>
          <Select
            value={values[name] || ''}
            onValueChange={handleSocioAnswerChange}
          >
            <SelectTrigger id={id}><SelectValue placeholder="Selecciona una opción" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="SI">Sí, soy socio</SelectItem>
              <SelectItem value="NO">No</SelectItem>
            </SelectContent>
          </Select>
        </div>
      );
    }

    if (name === 'reg_tipo_socio') {
      const enabled = values.reg_es_socio === 'SI';
      /**
       * Opciones del dropdown: usa la relación configurada por el admin
       * (etiqueta del club → tipo del sistema). Se conservan solo los
       * activos. El value del <SelectItem> es el system_type real, para
       * que el motor de precios siga resolviendo por TITULAR / EMERITO /
       * DEPENDIENTE aunque el label sea "Honorario", "Esposa", etc.
       */
      const socioItems = (socioTiposData?.items ?? [])
        .filter((it) => it.is_enabled)
        .sort((a, b) => a.display_order - b.display_order);
      const fallback: { club_label: string; system_type: string }[] = [
        { club_label: 'Titular',     system_type: 'TITULAR' },
        { club_label: 'Emérito',     system_type: 'EMERITO' },
        { club_label: 'Dependiente', system_type: 'DEPENDIENTE' },
      ];
      const options = socioItems.length > 0 ? socioItems : fallback;
      return (
        <div className="space-y-2" key={name}>
          <Label htmlFor={id}>{label}{required && enabled && <span className="text-destructive"> *</span>}</Label>
          <Select value={values[name] || ''} onValueChange={v => setValue(name, v)} disabled={!enabled}>
            <SelectTrigger id={id}>
              <SelectValue placeholder={enabled ? 'Selecciona el tipo' : 'Solo para socios'} />
            </SelectTrigger>
            <SelectContent>
              {options.map((opt, i) => (
                <SelectItem key={`${opt.system_type}-${i}`} value={opt.system_type}>
                  {opt.club_label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      );
    }

    if (name === 'reg_sexo') {
      // UX: stored as M/F in the DB, presented as Hombre/Mujer with the
      // localized label "Género" regardless of what the admin configured.
      return (
        <div className="space-y-2" key={name}>
          <Label htmlFor={id}>Género{required && <span className="text-destructive"> *</span>}</Label>
          <Select value={values[name] || ''} onValueChange={v => setValue(name, v)}>
            <SelectTrigger id={id}><SelectValue placeholder="Selecciona" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="M">Hombre</SelectItem>
              <SelectItem value="F">Mujer</SelectItem>
            </SelectContent>
          </Select>
        </div>
      );
    }

    if (name === 'reg_categoria') {
      return (
        <div className="space-y-2" key={name}>
          {/* Label + Popover help (works on tap mobile and click desktop,
              same pattern as the HI/HJ/HN headers in /jugadores). */}
          <div className="flex items-center gap-1.5">
            <Label htmlFor={id}>{label}{required && <span className="text-destructive"> *</span>}</Label>
            <Popover>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  aria-label="¿Cómo se eligen las categorías?"
                  className="inline-flex items-center text-muted-foreground hover:text-foreground cursor-help"
                >
                  <HelpCircle className="h-4 w-4" />
                </button>
              </PopoverTrigger>
              <PopoverContent side="top" className="max-w-[260px] w-auto text-xs p-3">
                Las categorías mostradas se filtran automáticamente con base en
                tu <strong>género</strong>, <strong>edad</strong> (fecha de
                nacimiento) y <strong>hándicap</strong>.
              </PopoverContent>
            </Popover>
          </div>
          <Select value={values[name] || ''} onValueChange={v => setValue(name, v)}>
            <SelectTrigger id={id}>
              <SelectValue placeholder={eligibleCategories.length ? 'Selecciona categoría' : 'Completa hcp/sexo/edad'} />
            </SelectTrigger>
            <SelectContent>
              {eligibleCategories.map(c => (
                (() => {
                  /**
                   * Render category label con sufijo de disponibilidad:
                   *   "[name] (registrados/max) N espacios disponibles".
                   * Si la categoría llegó a su cupo (registrados >= max),
                   * se muestra "LLENO" y el item queda deshabilitado en
                   * el Select (pero sigue visible para el jugador).
                   * Se omite el sufijo cuando max es 0 o 99 (ilimitado).
                   */
                  const max = Number(c.maxPlayers) || 0;
                  const reg = Number(c.registeredCount) || 0;
                  const unlimited = !max || max === 99;
                  const left = Math.max(max - reg, 0);
                  const full = !unlimited && left <= 0;
                  const label = unlimited
                    ? c.name
                    : full
                      ? `${c.name} (${reg}/${max}) — LLENO (lista de espera)`
                      : `${c.name} (${reg}/${max}) ${left} espacios disponibles`;
                  return (
                    /*
                     * No deshabilitar categorías llenas: el jugador puede
                     * inscribirse de todos modos y entrará a "lista de
                     * espera" (status_pago=67 en BD). Un confirm en el
                     * submit le avisa antes de registrar.
                     */
                    <SelectItem key={c.id} value={c.id}>
                      {label}
                    </SelectItem>
                  );
                })()
              ))}
            </SelectContent>
          </Select>
          {/* Aviso al jugador cuando ya capturó sexo + edad + hándicap y
              ninguna categoría aplica. Mensaje no técnico: lo redirige a
              la oficina del club en lugar de exponer las reglas internas. */}
          {eligibleCategories.length === 0
            && !!categoryFilterResult.sex
            && categoryFilterResult.age !== null
            && !isNaN(categoryFilterResult.hcpRaw) && (
            <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
              No existen categorías disponibles para tu edad/hándicap/género
              registrados. Favor de contactar a la oficina del club
              directamente para más información.
            </div>
          )}
          {/* Auditoría automática de cobertura HCP (-5 → 40.6 paso 0.1)
              por sexo. Aparece solo con ?debug=1. Muestra los rangos de
              hándicap que NO tienen ninguna categoría elegible, para
              detectar agujeros sin tener que probar valor por valor. */}
          {hcpCoverageAudit && (
            <details className="text-xs border border-dashed border-amber-500/40 rounded-md p-2 bg-amber-50/30" open>
              <summary className="cursor-pointer font-medium text-amber-700">
                Auditoría cobertura HCP (-5 → 40.6, paso 0.1)
              </summary>
              <div className="mt-2 space-y-2">
                <p className="text-muted-foreground">
                  Edad usada: <strong>{hcpCoverageAudit.age ?? '— (sin edad)'}</strong>.
                  Lista los tramos de hándicap SIN categoría elegible.
                </p>
                {(['M','F'] as const).map(sex => (
                  <div key={sex}>
                    <p className="font-medium">Sexo {sex}:</p>
                    {hcpCoverageAudit[sex].length === 0 ? (
                      <p className="text-emerald-700">✓ Cobertura completa, sin agujeros.</p>
                    ) : (
                      <ul className="ml-4 list-disc">
                        {hcpCoverageAudit[sex].map((g, i) => (
                          <li key={i} className="text-destructive">
                            HCP {g.from.toFixed(1)} → {g.to.toFixed(1)} sin categoría
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                ))}
              </div>
            </details>
          )}
        </div>
      );
    }

    if (name === 'reg_correo') {
      // Email input with onBlur server-side MX/typo validation. Inline
      // suggestion banner lets the user accept "did you mean ..." with one click.
      return (
        <div className="space-y-2" key={name}>
          <Label htmlFor={id}>{label}{required && <span className="text-destructive"> *</span>}</Label>
          <Input
            id={id}
            type="email"
            inputMode="email"
            autoComplete="email"
            required={required}
            placeholder={PLACEHOLDERS[name] ?? 'tu@correo.com'}
            value={values[name] || ''}
            onChange={e => {
              setValue(name, e.target.value);
              if (emailError) setEmailError('');
              if (emailSuggestion) setEmailSuggestion('');
            }}
            onBlur={validateEmailOnBlur}
            aria-invalid={!!emailError}
            className={emailError ? 'border-destructive focus-visible:ring-destructive' : ''}
          />
          {emailChecking && (
            <p className="text-xs text-muted-foreground">Verificando dominio…</p>
          )}
          {emailError && !emailSuggestion && (
            <p className="text-xs text-destructive">{emailError}</p>
          )}
          {emailSuggestion && (
            <p className="text-xs text-destructive">
              ¿Quisiste decir{' '}
              <button
                type="button"
                className="underline font-medium"
                onClick={acceptEmailSuggestion}
              >
                {emailSuggestion}
              </button>
              ?
            </p>
          )}
        </div>
      );
    }

    if (name === 'reg_telefono') {
      // Composite phone input: dial-code <Select> with flag emoji + digits-only
      // text input. Joined value is mirrored into reg_telefono ("+52 5512345678").
      return (
        <div className="space-y-2" key={name}>
          <Label htmlFor={id}>{label}{required && <span className="text-destructive"> *</span>}</Label>
          <div className="flex gap-2">
            {/* El value del Select es el `id` del país (no la lada) porque
                EE. UU. y Canadá comparten +1 y Radix exige values únicos. */}
            <Select
              value={phoneCodeId}
              onValueChange={(countryId) => {
                setPhoneCodeId(countryId);
                const entry = PHONE_CODES.find(p => p.id === countryId) ?? PHONE_CODES[0];
                setValue('reg_telefono', phoneLocal ? `${entry.code} ${phoneLocal}` : '');
                if (phoneError) setPhoneError('');
              }}
            >
              <SelectTrigger className="w-[120px]" aria-label="Lada">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PHONE_CODES.map(p => (
                  <SelectItem key={p.id} value={p.id}>
                    <span className="mr-2">{p.flag}</span>{p.code}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              key={`phone-local-${formInstanceKey}`}
              id={id}
              type="tel"
              inputMode="numeric"
              autoComplete="off"
              name={`reg_telefono_${formInstanceKey}`}
              required={required}
              maxLength={phoneLenMax}
              placeholder={phoneLenHint}
              value={phoneLocal}
              onChange={e => {
                // Strip everything that isn't a digit; cap at expected length.
                const digits = e.target.value.replace(/\D/g, '').slice(0, phoneLenMax);
                setPhoneLocal(digits);
                setValue('reg_telefono', digits ? `${phoneCode} ${digits}` : '');
                if (phoneError) setPhoneError('');
              }}
              onBlur={validatePhoneOnBlur}
              aria-invalid={!!phoneError}
              className={phoneError ? 'border-destructive focus-visible:ring-destructive flex-1' : 'flex-1'}
            />
          </div>
          {phoneError ? (
            <p className="text-xs text-destructive">{phoneError}</p>
          ) : (
            <p className="text-xs text-muted-foreground">
              Selecciona la lada y escribe {phoneLenHint} sin espacios.
            </p>
          )}
        </div>
      );
    }

    if (name === 'reg_club') {
      /**
       * Club de procedencia — combobox de SOLO SELECCIÓN.
       * ------------------------------------------------------------------
       * Se muestra un botón con flecha (chevron) que despliega el catálogo
       * de clubes de `torneos.clubs` (o los clubes inscritos al torneo
       * cuando reg_es_socio = SI). El buscador interno sólo filtra: el
       * valor guardado siempre proviene de un club del catálogo, por lo que
       * NO se puede sobrescribir con texto libre. Si se omite, al enviar se
       * usa "SIN CLUB" (clubid 770042).
       */
      const isSocio = values.reg_es_socio === 'SI';
      /**
       * Catálogo base: clubes inscritos al torneo cuando es socio, o el
       * catálogo completo (`torneos.clubs`) cuando NO es socio.
       */
      const baseOptions = isSocio && socioClubs.length > 0 ? socioClubs : clubs;
      /**
       * Registro preferente activo + NO socio ⇒ el dropdown SÓLO muestra los
       * "Clubes autorizados" con ventana preferente vigente hoy
       * (`allowed_club_ids`), aunque el campo esté activo/obligatorio.
       */
      const allowedIds = preferenteCfg?.allowed_club_ids || [];
      let listOptions = baseOptions;
      if (!isSocio && preferenteCfg?.active_now && allowedIds.length > 0) {
        const filtered = baseOptions.filter(c => allowedIds.includes(Number(c.id)));
        // Fallback: si el catálogo aún no cargó, usa los nombres del config.
        listOptions = filtered.length > 0
          ? filtered
          : (preferenteCfg.clubs || [])
              .filter(c => allowedIds.includes(Number(c.id)))
              .map(c => ({ id: c.id, nombre: c.nombre })) as typeof baseOptions;
      }
      const currentClub = values[name] || '';
      return (
        <div className="space-y-2" key={name}>
          <Label htmlFor={id}>{label}{required && <span className="text-destructive"> *</span>}</Label>
          <Popover open={clubOpen} onOpenChange={setClubOpen}>
            <PopoverTrigger asChild>
              <Button
                id={id}
                type="button"
                variant="outline"
                role="combobox"
                aria-expanded={clubOpen}
                aria-invalid={!!clubError}
                className={`w-full justify-between font-normal ${clubError ? 'border-destructive focus-visible:ring-destructive' : ''} ${currentClub ? '' : 'text-muted-foreground'}`}
              >
                <span className="truncate">{currentClub || 'Selecciona tu club'}</span>
                <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
              </Button>
            </PopoverTrigger>
            <PopoverContent
              className="p-0 w-[--radix-popover-trigger-width] max-w-[calc(100vw-2rem)]"
              align="start"
            >
              <Command>
                {/* El buscador SÓLO filtra la lista; no escribe el valor. */}
                <CommandInput placeholder="Buscar club…" />
                <CommandList className="max-h-64">
                  <CommandEmpty>Sin resultados. Selecciona "SIN CLUB".</CommandEmpty>
                  <CommandGroup>
                    {listOptions.map(c => (
                      <CommandItem
                        key={c.id}
                        value={c.nombre}
                        onSelect={() => {
                          setValue(name, c.nombre);
                          if (clubError) setClubError('');
                          setClubOpen(false);
                        }}
                      >
                        <Check
                          className={`mr-2 h-4 w-4 ${currentClub === c.nombre ? 'opacity-100' : 'opacity-0'}`}
                        />
                        <span className="truncate">{c.nombre}</span>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
          {/* Mensaje de error cuando el jugador escribió un club que no
              coincide con ninguna opción del catálogo. Ver validación en
              onSubmit(). */}
          {clubError && (
            <p className="text-sm text-destructive">{clubError}</p>
          )}
        </div>
      );
    }

    if (name === 'reg_pais') {
      return (
        <div className="space-y-2" key={name}>
          <Label htmlFor={id}>{label}{required && <span className="text-destructive"> *</span>}</Label>
          <Select value={values[name] || ''} onValueChange={v => setValue(name, v)}>
            <SelectTrigger id={id}><SelectValue placeholder="Selecciona país" /></SelectTrigger>
            <SelectContent>
              {countries.map(c => (
                <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      );
    }

    if (name === 'reg_estado') {
      return (
        <div className="space-y-2" key={name}>
          <Label htmlFor={id}>{label}{required && <span className="text-destructive"> *</span>}</Label>
          <Select value={values[name] || ''} onValueChange={v => setValue(name, v)} disabled={!values.reg_pais}>
            <SelectTrigger id={id}>
              <SelectValue placeholder={values.reg_pais ? 'Selecciona estado' : 'Selecciona país primero'} />
            </SelectTrigger>
            <SelectContent>
              {states.map(s => (
                <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      );
    }

    if (name === 'reg_ciudad') {
      return (
        <div className="space-y-2" key={name}>
          <Label htmlFor={id}>{label}{required && <span className="text-destructive"> *</span>}</Label>
          <Select value={values[name] || ''} onValueChange={v => setValue(name, v)} disabled={!values.reg_estado}>
            <SelectTrigger id={id}>
              <SelectValue placeholder={values.reg_estado ? 'Selecciona ciudad' : 'Selecciona estado primero'} />
            </SelectTrigger>
            <SelectContent>
              {cities.map(c => (
                <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      );
    }

    if (name === 'reg_archivo') {
      // Si el jugador marcó "Cargo a cuenta de socio", se omite por
      // completo la subida de comprobante de pago (el cargo se hace
      // directamente a su cuenta de membresía).
      if (values.reg_cargo_socio === '1') return null;
      return (
        <div className="space-y-2" key={name}>
          <Label htmlFor={id}>{label}{required && <span className="text-destructive"> *</span>}</Label>
          <Input
            id={id}
            type="file"
            accept="image/*,application/pdf"
            required={required}
            onChange={e => setFile(e.target.files?.[0] ?? null)}
          />
          <p className="text-xs text-muted-foreground">PDF o imagen, máximo 15 MB.</p>
        </div>
      );
    }

    if (name === 'reg_notas') {
      return (
        <div className="space-y-2 md:col-span-2" key={name}>
          <Label htmlFor={id}>{label}{required && <span className="text-destructive"> *</span>}</Label>
          <Textarea
            id={id} required={required} placeholder={placeholder}
            value={values[name] || ''}
            onChange={e => setValue(name, e.target.value)}
            rows={4}
          />
        </div>
      );
    }

    /** Default: text/email/number/date input. */
    let type: string = 'text';
    if (name === 'reg_correo')     type = 'email';
    if (name === 'reg_telefono')   type = 'tel';

    /**
     * Specialized birthdate input: dd/mm/aaaa with auto-mask while typing,
     * and on-blur validation against future/today/200-years-ago. The ISO
     * version is mirrored into values.reg_fechanac so all downstream
     * effects (categoría eligibility, jugadores lookup, server-side
     * akron_edad) keep working unchanged.
     */
    if (name === 'reg_fechanac') {
      return (
        <div className="space-y-2" key={name}>
          <Label htmlFor={id}>{label}{required && <span className="text-destructive"> *</span>}</Label>
          <Input
            id={id}
            type="text"
            inputMode="numeric"
            autoComplete="bday"
            placeholder="dd/mm/aaaa"
            maxLength={10}
            required={required}
            value={birthDmy}
            onChange={e => {
              const masked = maskDmy(e.target.value);
              setBirthDmy(masked);
              if (birthError) setBirthError('');
              setValue('reg_fechanac', dmyToIso(masked));
            }}
            onBlur={() => {
              const err = validateBirthDmy(birthDmy);
              setBirthError(err);
              if (err) {
                toast({ title: 'Fecha inválida', description: err, variant: 'destructive' });
              }
            }}
            aria-invalid={!!birthError}
            className={birthError ? 'border-destructive focus-visible:ring-destructive' : ''}
          />
          {birthError ? (
            <p className="text-xs text-destructive">{birthError}</p>
          ) : (
            <p className="text-xs text-muted-foreground">Formato dd/mm/aaaa</p>
          )}
        </div>
      );
    }

    // Specialized handicap input: text + decimal inputMode so mobile keyboards
    // expose the dot, and a strict regex pattern that rejects commas / letters.
    if (name === 'reg_handicap') {
      return (
        <div className="space-y-2" key={name}>
          <Label htmlFor={id}>{label}{required && <span className="text-destructive"> *</span>}</Label>
          <Input
            id={id}
            type="text"
            inputMode="decimal"
            pattern="-?[0-9]+(\.[0-9])?"
            title={`El hándicap debe estar entre ${HANDICAP_MIN} y ${HANDICAP_MAX}.`}
            placeholder={PLACEHOLDERS[name]}
            required={required}
            value={values[name] || ''}
            onChange={e => {
              setValue(name, e.target.value);
              if (handicapError) setHandicapError('');
            }}
            onBlur={validateHandicapOnBlur}
            aria-invalid={!!handicapError}
            className={handicapError ? 'border-destructive focus-visible:ring-destructive' : ''}
          />
          {handicapError && (
            <p className="text-xs text-destructive">{handicapError}</p>
          )}
        </div>
      );
    }

    /**
     * Edad: input numérico que se autocompleta desde reg_fechanac cuando
     * está disponible (`edadAuto = true` → input gris/disabled), o queda
     * editable cuando no hay fecha (porque el admin desactivó fechanac o
     * porque el jugador aún no la ha llenado).
     *
     * Reglas:
     *  - Si `reg_fechanac` está activo y tiene valor válido → auto y disabled.
     *  - Si NO hay fecha o es inválida → editable; el usuario captura su edad.
     */
    if (name === 'akron_edad') {
      const fechanacEnabled = isFieldEnabled('reg_fechanac');
      return (
        <div className="space-y-2" key={name}>
          <Label htmlFor={id}>{label}{required && <span className="text-destructive"> *</span>}</Label>
          <Input
            id={id}
            type="number"
            inputMode="numeric"
            min={0}
            max={120}
            required={required}
            placeholder="Ej: 42"
            value={values[name] || ''}
            onChange={e => {
              const v = e.target.value.replace(/[^\d]/g, '').slice(0, 3);
              setValue(name, v);
              // Si el usuario edita manualmente liberamos el flag auto.
              if (edadAuto) setEdadAuto(false);
            }}
            className="[appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
          />
          <p className="text-xs text-muted-foreground">
            {edadAuto && fechanacEnabled
              ? 'Auto-calculada desde tu fecha de nacimiento (puedes editarla manualmente).'
              : fechanacEnabled
                ? 'Se calcula automáticamente cuando llenas la fecha de nacimiento.'
                : 'Años cumplidos.'}
          </p>
        </div>
      );
    }

    return (
      <div className="space-y-2" key={name}>
        <Label htmlFor={id}>{label}{required && <span className="text-destructive"> *</span>}</Label>
        <Input
          {...common}
          type={type}
          value={values[name] || ''}
          onChange={e => setValue(name, e.target.value)}
            /**
             * Nombre/Apellido: al salir del campo se normaliza a NOMBRE PROPIO
             * (p. ej. "LOPEZ" -> "López") para que el jugador vea exactamente
             * cómo quedará registrado.
             */
            onBlur={
              isProperNameField(name)
                ? () => setValue(name, toProperName(values[name] || ''))
                : undefined
            }
        />
        {isProperNameField(name) && (values[name] || '').trim() && (
          <div className="flex items-center gap-1.5">
            <span className="inline-flex items-center rounded-full bg-primary/10 px-2 py-0.5 text-primary font-medium text-xs shrink-0">
              Así quedará:
            </span>
            {/*
              Preview editable: el jugador puede ajustar directamente la
              versión normalizada. Los cambios se escriben al mismo valor del
              campo principal, y al perder el foco se vuelve a aplicar
              NOMBRE PROPIO. El envío final también normaliza, por lo que la
              transformación se mantiene aunque el usuario no salga del campo.
            */}
            <Input
              type="text"
              value={toProperName(values[name] || '')}
              onChange={e => setValue(name, e.target.value)}
              onBlur={() => setValue(name, toProperName(values[name] || ''))}
              className="h-6 text-xs px-2 py-0.5 flex-1 min-w-0"
              aria-label={`Editar ${label} normalizado`}
            />
        </div>
      )}
    </div>
  );
  };

  return (
    <Layout>
      <PageHero
        title="Pre-Registro"
        subtitle="Inscríbete al torneo. Verificaremos tus datos y te enviaremos confirmación por correo."
        backgroundImage={registroHero}
      />

      <section className="py-12 bg-background">
        <div className="container mx-auto px-4 max-w-3xl">
          {/* Sitios con varios torneos: primero se pregunta a cuál entrar. */}
          {needsTorneoPick ? (
            <RegistroTorneoPicker torneos={torneosSitio} />
          ) : submitted ? (
            <Card>
              <CardContent className="py-12 text-center space-y-4">
                <CheckCircle2 className="w-16 h-16 mx-auto text-primary" />
                <h2 className="text-2xl font-bold">
                  {submittedWaitlist
                    ? '¡Pre-registro en lista de espera!'
                    : '¡Pre-registro recibido!'}
                </h2>
                <p className="text-muted-foreground">
                  {submittedWaitlist
                    ? 'La categoría seleccionada está llena. Has sido agregado a la lista de espera por orden de fecha de solicitud. Recibirás un correo con los detalles de tu pre-registro y se te contactará si se libera un lugar.'
                    : 'Hemos guardado tu solicitud. El comité revisará tus datos y te contactará por correo para confirmar tu inscripción.'}
                </p>
                <Button
                  variant="outline"
                  onClick={() => {
                    /*
                     * Reset COMPLETO del formulario para permitir un segundo
                     * pre-registro sin recargar. Limpiar sólo `values` deja
                     * estado derivado obsoleto (teléfono, fecha, lookups,
                     * autofill de socio…) que impide que las secciones
                     * condicionales debajo de la info básica se desplieguen
                     * al re-llenar los campos.
                     */
                    setFormInstanceKey(k => k + 1);
                    setSubmitted(false);
                    setSubmittedWaitlist(false);
                    setValues({});
                    setFile(null);
                    setPhoneCodeId('MX');
                    setPhoneLocal('');
                    setPhoneError('');
                    setBirthDmy('');
                    setBirthError('');
                    setEmailError('');
                    setEmailSuggestion('');
                    setEmailChecking(false);
                    setHandicapError('');
                    setEdadAuto(false);
                    setLastLookupKey('');
                    setLastIdLookup('');
                    setSocioClubAutofilled(false);
                    setStates([]);
                    setCities([]);
                    if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' });
                  }}
                >
                  Enviar otro pre-registro
                </Button>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardHeader>
                <CardTitle>Formulario de Pre-Registro</CardTitle>
              </CardHeader>
              <CardContent>
                {loadingFields ? (
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" /> Cargando formulario…
                  </div>
                ) : (
                  <form key={formInstanceKey} onSubmit={onSubmit} className="space-y-8">
                    {/* Banner: ventana de registro preferente activa.
                        Informa al jugador antes de que llene el formulario
                        que sólo socios de clubes autorizados pueden
                        pre-registrarse ahora. */}
                    {preferenteCfg?.active_now && (
                      <div className="rounded-md border border-amber-500/50 bg-amber-50 dark:bg-amber-950/30 p-4 text-sm text-amber-900 dark:text-amber-200">
                        <strong>Registro preferente activo.</strong> En este periodo únicamente
                        pueden pre-registrarse los socios de los clubes autorizados por el
                        comité. Al terminar el rango preferente, el registro se abrirá al
                        público general.
                      </div>
                    )}
                    {(() => {
                      // Group enabled fields by section while preserving order.
                      const order: Array<{ key: string; title: string }> = [
                        { key: 'basica',      title: 'Información básica' },
                        { key: 'socios',      title: '¿Eres socio?' },
                        { key: 'adicionales', title: 'Información adicional' },
                      ];
                      const grouped: Record<string, typeof visibleFields> = {};
                      visibleFields.forEach(f => {
                        const k = (f.section as string) || 'basica';
                        (grouped[k] ||= []).push(f);
                      });
                      // Any custom section keys not in `order` go after.
                      Object.keys(grouped).forEach(k => {
                        if (!order.find(o => o.key === k)) {
                          order.push({ key: k, title: k.charAt(0).toUpperCase() + k.slice(1) });
                        }
                      });

                      /**
                       * Progressive reveal: section N renders only when every
                       * required field in sections 0..N-1 has a value.
                       */
                      const isSectionComplete = (key: string) => {
                        const list = grouped[key] || [];
                        return list.every(f => {
                          if (!f.is_required) return true;
                          // Conditional required: tipo_socio only when es_socio = SI
                          if (f.field_name === 'reg_tipo_socio' && values.reg_es_socio !== 'SI') return true;
                          // Conditional required: cargo/numsocio only when es_socio = SI
                          if (['reg_cargo_socio', 'reg_numsocio'].includes(f.field_name) && values.reg_es_socio !== 'SI') return true;
                          // Composite phone input stores its visible digits outside `values`; use it directly so progressive reveal updates immediately.
                          if (f.field_name === 'reg_telefono') return !!phoneLocal.trim();
                          return !!(values[f.field_name] || '').trim();
                        });
                      };

                      const blocks: JSX.Element[] = [];
                      let revealUpTo = true;
                      order.forEach((sec, idx) => {
                        const list = grouped[sec.key];
                        if (!list || list.length === 0) return;
                        if (!revealUpTo) return;

                        blocks.push(
                          <section key={sec.key} className="space-y-4">
                            {/* Section header + thin divider as visual spacer */}
                            <div className="space-y-2">
                              <h3 className="text-base font-semibold text-foreground">{sec.title}</h3>
                              <div className="h-px bg-border" />
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                              {list
                                .filter(f => {
                                  // Hide socio-only fields when es_socio = NO.
                                  if (['reg_tipo_socio', 'reg_cargo_socio', 'reg_numsocio'].includes(f.field_name) && values.reg_es_socio !== 'SI') return false;
                                  return true;
                                })
                                .map(f => renderField(f.field_name, f.field_label, !!f.is_required))}
                            </div>

                            {/* Cargo a cuenta de socio — rendered inside the "socios" section,
                                al final, después de tipo de socio. Requiere:
                                1) que el campo `reg_cargo_socio` esté ACTIVADO en
                                   "Pre-Registro · Configuración de campos" (admin), y
                                2) que el jugador marque "Soy socio = SI". */}
                            {sec.key === 'socios' && values.reg_es_socio === 'SI' && cargoSocioEnabled && (
                              <div className="rounded-lg border border-border bg-muted/30 p-4 space-y-3">
                                <div className="flex items-start gap-3">
                                  <Checkbox
                                    id="reg_cargo_socio"
                                    checked={values.reg_cargo_socio === '1'}
                                    onCheckedChange={(c) => {
                                      const on = c === true;
                                      setValue('reg_cargo_socio', on ? '1' : '');
                                      if (!on) setValue('reg_numsocio', '');
                                      // Si se activa el cargo a cuenta, no se requiere
                                      // comprobante de pago; lo limpiamos por si se
                                      // había subido previamente.
                                      if (on) setFile(null);
                                    }}
                                  />
                                  <Label htmlFor="reg_cargo_socio" className="font-medium cursor-pointer leading-tight">
                                    Cargo a cuenta de socio
                                  </Label>
                                </div>
                                {values.reg_cargo_socio === '1' && (
                                  <div className="space-y-2 pl-7">
                                    <div className="flex items-center gap-2">
                                      <Label htmlFor="reg_numsocio">
                                        Clave de Socio<span className="text-destructive"> *</span>
                                      </Label>
                                      <TooltipProvider>
                                        <Tooltip>
                                          <TooltipTrigger type="button" className="text-muted-foreground hover:text-foreground">
                                            <HelpCircle className="h-4 w-4" />
                                          </TooltipTrigger>
                                          <TooltipContent>
                                            Este es el numero o clave de la membresia del club
                                          </TooltipContent>
                                        </Tooltip>
                                      </TooltipProvider>
                                    </div>
                                    <Input
                                      id="reg_numsocio"
                                      required
                                      value={values.reg_numsocio || ''}
                                      onChange={(e) => setValue('reg_numsocio', e.target.value)}
                                      placeholder="Ej: 1234"
                                    />
                                    <p className="text-xs text-foreground/80">
                                      Al enviar este registro acepto que se realice el cargo correspondiente
                                      de la inscripción a mi cuenta. Solo Socios de:{' '}
                                      <span className="font-semibold">{tournamentInfo?.club || '—'}</span>
                                    </p>
                                  </div>
                                )}
                              </div>
                            )}
                          </section>
                        );

                        // Decide if the next section should be revealed.
                        if (idx < order.length - 1 && !isSectionComplete(sec.key)) {
                          revealUpTo = false;
                        }
                      });
                      return blocks;
                    })()}
                    {/* Costo de inscripción calculado a partir de los datos
                        del jugador y la tabla `registro_precios` (admin).
                        Sólo se muestra cuando hay al menos un dato útil. */}
                    {(selectedCategoryName || tipoSocioForPricing || values.reg_sexo) && (
                      <div className="rounded-lg border-2 border-primary/30 bg-primary/5 p-4 space-y-2">
                        <div className="flex items-start justify-between gap-3 flex-wrap">
                          <div>
                            <p className="text-xs uppercase tracking-wide text-muted-foreground font-semibold">
                              Costo estimado de inscripción
                            </p>
                            {precioFetching ? (
                              <p className="text-sm text-muted-foreground flex items-center gap-2 mt-1">
                                <Loader2 className="h-3 w-3 animate-spin" /> Calculando…
                              </p>
                            ) : precioMatch ? (
                              <>
                                <p className="text-3xl font-bold text-primary">
                                  {formatPrice(precioMatch.precio, precioMatch.moneda)}
                                </p>
                                {precioMatch.etiqueta && (
                                  <p className="text-sm text-foreground mt-0.5">{precioMatch.etiqueta}</p>
                                )}
                                {precioMatch.incluye && (
                                  <p className="text-xs text-muted-foreground mt-1">{precioMatch.incluye}</p>
                                )}
                              </>
                            ) : (
                              <>
                                <p className="text-sm text-muted-foreground mt-1">
                                  Aún no hay un precio configurado para esta combinación de datos.
                                  Contacta al comité para confirmar tu costo.
                                </p>
                                {/* Diagnóstico: muestra los parámetros enviados
                                    al matcher de precios para que el admin pueda
                                    revisar por qué ninguna regla aplica. */}
                                <p className="text-[11px] text-muted-foreground mt-2 font-mono">
                                  Datos usados: tipo de socio={tipoSocioForPricing || '—'}
                                </p>
                              </>
                            )}
                          </div>
                        </div>
                        <p className="text-[11px] text-muted-foreground italic">
                          El monto es una estimación calculada con base en tus datos.
                          La confirmación oficial la realiza el comité del torneo.
                        </p>
                      </div>
                    )}
                    <div className="flex justify-end pt-2">
                      <Button type="submit" disabled={submitting} className="gap-2" size="lg">
                        {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                        Enviar pre-registro
                      </Button>
                    </div>
                  </form>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      </section>
    </Layout>
  );
};

export default Registro;