/**
 * AdminRegistros Page
 * --------------------------------------------------------------------
 * Separate, password-protected dashboard for the Pre-Registro feature.
 * Lists all submissions for the active tournament, allows toggling a
 * "verificado" flag, and provides a download link for the comprobante
 * stored as LONGBLOB in registro.reg_archivo.
 *
 * Auth: independent password (`registros2025`) — not tied to /admin.
 */

import { Fragment, useEffect, useMemo, useState, type FormEvent } from 'react';
import Layout from '@/components/layout/Layout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Loader2, Lock, Shield, FileDown, FileUp, RefreshCw, Search, CheckCircle2, XCircle, ChevronRight, ChevronDown, Eye, Mail, UserMinus, UserCheck, UserX, X } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { useRegistroPreferente } from '@/hooks/useRegistroPreferente';
import { useSiteTorneos } from '@/hooks/useSiteTorneos';
import {
  getRegistroListUrl,
  getRegistroVerifyUrl,
  getRegistroArchivoUrl,
  getRegistroUploadArchivoUrl,
  getRegistroEmailUrl,
  getRegistroUnregisterUrl,
  getRegistroBajaUrl,
  getRegistroPromoteUrl,
  getRegistroWelcomeEmailUrl,
  getEstatuspagoUrl,
} from '@/config/api';

/** localStorage key for the registros admin session token. */
const SESSION_KEY = 'registros_admin_session';
const REGISTROS_PASSWORD = 'registros2025';

/**
 * Formatea un teléfono crudo "(+52 5512345678)" o "+52 5512345678" como
 * "(+52) 5512345678". Si no detecta lada con '+', devuelve el valor original.
 */
const formatPhone = (raw?: string | null): string => {
  const s = (raw || '').trim();
  if (!s) return '';
  const m = s.match(/^\+?\s*(\d{1,4})[\s-]+(.+)$/);
  if (m) return `(+${m[1]}) ${m[2].trim()}`;
  return s;
};

/**
 * displayPhone
 * ------------------------------------------------------------------
 * Teléfono para tabla/detalle/exportación. Si el registro tiene la lada
 * guardada (reg_tel_lada, capturada con el país en el formulario), arma el
 * formato "(+52) 5512345678" a partir de esa lada + los dígitos locales;
 * registros antiguos sin esos campos caen al parseo de formatPhone.
 */
const displayPhone = (r: RegistroRow): string => {
  const raw = (r.reg_telefono || r.reg_celular || '').trim();
  const lada = (r.reg_tel_lada || '').trim();
  if (lada) {
    const digits = raw.replace(/^\+\s*\d{1,4}[\s-]*/, '').trim();
    if (digits) return `(${lada.startsWith('+') ? lada : `+${lada}`}) ${digits}`;
  }
  return formatPhone(raw);
};

/** A single registro row from /api/registro.php */
interface RegistroRow {
  id: number;
  /** ID del torneo al que pertenece este registro (visible para admin). */
  torneoid?: number | string;
  reg_nombre?: string;
  reg_apellido?: string;
  reg_correo?: string;
  reg_telefono?: string;
  /** Alias canónico del teléfono en algunos esquemas. */
  reg_celular?: string;
  /** País de la lada seleccionada en el formulario (id ISO, ej. 'MX'). */
  reg_tel_pais?: string;
  /** Lada telefónica seleccionada en el formulario (ej. '+52'). */
  reg_tel_lada?: string;
  reg_handicap?: string;
  reg_categoria?: string;
  /** Nombre legible de la categoría (JOIN del backend). */
  categoria_name?: string;
  reg_es_socio?: string;
  reg_tipo_socio?: string;
  reg_club?: string;
  reg_fecha?: string;
  created_at?: string;
  /** Fallback adicional de timestamp de alta en esquemas antiguos. */
  fecha_alta?: string;
  /** Timestamp del registro (fecha y hora del alta). */
  fecharegistro?: string;
  reg_verificado?: number | string;
  /** Toggle administrativo: pago confirmado por tesorería. */
  reg_pago_verificado?: number | string;
  /** Monto realmente recibido (capturado por el admin). */
  reg_monto_confirmado?: number | string | null;
  /** Snapshot del precio mostrado al jugador al enviar el form. */
  reg_precio_estimado?: number | string;
  reg_precio_moneda?: string;
  has_archivo?: number | string;
  reg_archivo_nombre?: string;
  /** '1' si el jugador eligió cargo a cuenta de socio. */
  reg_cargo_socio?: number | string;
  /** Número/clave de membresía cuando aplica. */
  reg_numsocio?: string;
  /** Flag: jugador completó el flujo (subió comprobante o cargo a cuenta). */
  enviado?: number | string;
  /** Token opaco para el link público de adjuntar comprobante. */
  /** Token opaco para el link público de adjuntar comprobante. */
  reg_token?: string;
  /** Contador de correos "registro validado" enviados al jugador. */
  reg_email_count?: number | string;
  /** Timestamp del último correo enviado al jugador. */
  reg_email_last?: string;
  /** Contador de correos de BIENVENIDA enviados (sección 4). */
  reg_welcome_count?: number | string;
  /** Timestamp del último correo de bienvenida enviado. */
  reg_welcome_last?: string;
  /** Cupo máximo de la categoría asociada (categorias.maxjugadores). */
  cat_max?: number | string | null;
  /** Jugadores activos actualmente en categoría/torneo (excluye BAJA). */
  cat_count?: number | string | null;
  /** Talla de gorra capturada en el formulario. */
  reg_talla_gorra?: string | null;
  /** Talla de playera (campo akron). */
  akron_talla?: string | null;
  /** Talla de guante (campo akron). */
  akron_talla_guante?: string | null;
  /** Talla de calzado/tenis (campo akron). */
  akron_calzado?: string | null;
  /** Código de promoción capturado por el jugador. */
  akron_codigo?: string | null;
  /** Monto pagado (campo akron, revisión admin). */
  akron_monto_pago?: string | number | null;
  /** Edad al momento del registro (columna real `akron_edad`). */
  akron_edad?: string | number | null;
}

// ============= Login form =============

const LoginForm = ({ onLogin }: { onLogin: (pwd: string) => boolean }) => {
  const [pwd, setPwd] = useState('');
  const [err, setErr] = useState(false);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!onLogin(pwd)) { setErr(true); setPwd(''); }
  };
  return (
    <div className="min-h-[60vh] flex items-center justify-center">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-4">
            <Shield className="w-8 h-8 text-primary" />
          </div>
          <CardTitle className="text-2xl">Pre-Registros</CardTitle>
          <CardDescription>Acceso para el equipo de verificación</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="pwd">Contraseña</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="pwd" type="password" value={pwd}
                  onChange={e => { setPwd(e.target.value); setErr(false); }}
                  className={cn('pl-10', err && 'border-destructive focus-visible:ring-destructive')}
                  placeholder="Ingresa la contraseña"
                />
              </div>
              {err && <p className="text-sm text-destructive">Contraseña incorrecta</p>}
            </div>
            <Button type="submit" className="w-full">Entrar</Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
};

// ============= Dashboard =============

export const RegistrosDashboard = ({ password }: { password: string }) => {
  const [rows, setRows] = useState<RegistroRow[]>([]);
  const [loading, setLoading] = useState(false);
  /**
   * Las 4 secciones del flujo de pre-registro:
   *   sec1 — Sin validar registro (enviado=0)
   *   sec2 — Pendiente verificación de pago (enviado=1, status_pago in {0})
   *   sec3 — Verificar registro (status_pago=1, verificado=0)
   *   sec4 — Registros completados (verificado=1, status_pago in {1,99})
   */
  /**
   * Las secciones del flujo de pre-registro:
   *   sec1 — Sin validar registro
   *   sec2 — Pendiente verificación de pago
   *   sec3 — Verificar registro
   *   sec4 — Registros completados
   *   sec5 — Lista de espera (status_pago=5)
   *   sec6 — Registros cancelados (status_pago=6)
   */
  const [section, setSection] = useState<'sec1' | 'sec2' | 'sec3' | 'sec4' | 'sec5' | 'sec6'>('sec1');
  const [search, setSearch] = useState('');
  /**
   * Opciones del dropdown de status_pago — primeras 6 filas del
   * catálogo `estatuspago` cargadas una sola vez al montar.
   */
  const [estatusOpts, setEstatusOpts] = useState<{ value: number; label: string }[]>([]);
  /**
   * Filtros adicionales (folio exacto, categoría, fecha de registro).
   * El estado vive sólo en este componente, por lo que cada admin tiene
   * sus propios filtros sin afectar a otros revisores en sesiones
   * distintas (no se persisten en backend).
   */
  const [folioFilter, setFolioFilter] = useState('');
  const [categoriaFilter, setCategoriaFilter] = useState<string>('__all__');
  /**
   * Filtro por torneo (multi-torneo). '__active__' = el torneo activo del
   * dominio (comportamiento histórico), '__all__' = registros de todos los
   * torneos dados de alta en esta página, o un torneoid concreto.
   */
  const [torneoFilter, setTorneoFilter] = useState<string>('__active__');
  /** Torneos del dominio (para el selector y las etiquetas por fila). */
  const { data: siteTorneos } = useSiteTorneos();
  const torneoNameById = useMemo(() => {
    const m = new Map<number, string>();
    for (const t of siteTorneos?.torneos || []) m.set(t.torneoid, t.nombre);
    return m;
  }, [siteTorneos?.torneos]);
  /** Modo de comparación de fecha: 'on' = en, 'after' = después, 'before' = antes. */
  const [dateMode, setDateMode] = useState<'on' | 'after' | 'before'>('on');
  /** Fecha (YYYY-MM-DD) usada con `dateMode` para filtrar `reg_fecha`. */
  const [dateValue, setDateValue] = useState('');
  /**
   * Orden de la lista por fecha/hora de registro. 'newest' = más nuevos
   * arriba (default), 'oldest' = más viejos arriba para atender primero
   * los que llevan más tiempo esperando.
   */
  const [sortOrder, setSortOrder] = useState<'newest' | 'oldest'>('newest');
  /** Set de IDs cuyos detalles están expandidos en la tabla. */
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const toggleExpand = (id: number) =>
    setExpanded(prev => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  /** Comprobante actualmente abierto en el modal de vista previa. */
  const [previewRow, setPreviewRow] = useState<RegistroRow | null>(null);
  const { toast } = useToast();

  /**
   * Config de "Registro Preferente" del torneo. Se usa para resaltar en
   * la tabla los registros capturados durante la ventana preferente
   * cuyo club NO está autorizado (posibles socios inválidos que el
   * comité debe revisar). Solo compara por nombre de club normalizado.
   */
  const { data: preferenteCfg } = useRegistroPreferente();

  /**
   * True cuando el registro `r` fue capturado dentro de la ventana
   * preferente global (o de un club específico) pero su `reg_club` NO
   * está entre los clubes autorizados de esa ventana. Se muestra con un
   * borde ámbar en la fila para facilitar la revisión administrativa.
   */
  const isPreferenteMismatch = (r: RegistroRow): boolean => {
    if (!preferenteCfg) return false;
    const rowDate = (r.reg_fecha || r.created_at || (r as any).fecha_alta || r.fecharegistro || '').toString().slice(0, 10);
    if (!rowDate) return false;
    const globalStart = preferenteCfg.fecha_inicio || '';
    const globalEnd   = preferenteCfg.fecha_fin    || '';
    const withinGlobal = !!globalStart && !!globalEnd && rowDate >= globalStart && rowDate <= globalEnd;
    // Cualquier ventana por-club también cuenta como período preferente.
    const withinAnyClub = (preferenteCfg.clubs || []).some(c =>
      c.fecha_inicio && c.fecha_fin && rowDate >= c.fecha_inicio && rowDate <= c.fecha_fin
    );
    if (!withinGlobal && !withinAnyClub) return false;
    // Dentro de ventana preferente: validar club autorizado.
    const key = (s: string) => (s || '')
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .toLowerCase().replace(/\s+/g, ' ').trim();
    const clubKey = key(r.reg_club || '');
    if (!clubKey) return true; // sin club → mismatch
    const authorized = (preferenteCfg.clubs || []).some(c => key(c.nombre) === clubKey);
    return !authorized;
  };

  /**
   * Timestamp comparable (string) del alta del registro. Se usa tanto para
   * ordenar como para detectar los que excedieron el cupo. Prefiere
   * `fecharegistro` (DATETIME preciso) y cae a otros campos si no existe.
   */
  const getRowTs = (r: RegistroRow): string =>
    String(r.fecharegistro || r.reg_fecha || r.created_at || (r as any).fecha_alta || '');

  /**
   * IDs de pre-registros que exceden el cupo máximo de su categoría.
   * Regla: dentro de cada categoría, se ordenan los registros por
   * `fecharegistro` ascendente y se marcan como excedentes los que caen
   * en posición > `cat_max`. Los cancelados (status_pago=6) se excluyen
   * del conteo. Categorías sin `cat_max` o con 99 se consideran ilimitadas.
   */
  const overflowIds = useMemo(() => {
    const groups = new Map<string, RegistroRow[]>();
    for (const r of rows) {
      if (Number(r.reg_pago_verificado) === 6) continue;
      const key = String(r.reg_categoria || r.categoria_name || '').trim();
      if (!key) continue;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(r);
    }
    const overflow = new Set<number>();
    for (const arr of groups.values()) {
      arr.sort((a, b) => getRowTs(a).localeCompare(getRowTs(b)));
      const maxC = Number(arr[0]?.cat_max) || 0;
      if (!maxC || maxC === 99) continue;
      for (let i = maxC; i < arr.length; i++) overflow.add(arr[i].id);
    }
    return overflow;
  }, [rows]);

  /** Tracks which rows have an in-flight action button (per id+kind). */
  const [busy, setBusy] = useState<Record<string, boolean>>({});
  const markBusy = (key: string, v: boolean) =>
    setBusy(prev => ({ ...prev, [key]: v }));

  /**
   * Sube un comprobante desde el popup de Registros completados.
   * La validación del navegador evita archivos no permitidos o mayores de
   * 15 MB; el endpoint vuelve a validar tipo, tamaño y autorización antes
   * de insertar el binario y el nombre original en la base de datos.
   */
  const uploadArchivo = async (row: RegistroRow, file: File) => {
    const extension = file.name.split('.').pop()?.toLowerCase() || '';
    const allowedExtensions = new Set(['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'pdf']);
    const allowedMimes = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/bmp', 'application/pdf']);
    if (!allowedExtensions.has(extension) || (file.type && !allowedMimes.has(file.type))) {
      toast({ title: 'Archivo no válido', description: 'Solo se permiten imágenes o archivos PDF.', variant: 'destructive' });
      return;
    }
    if (file.size <= 0 || file.size > 15 * 1024 * 1024) {
      toast({ title: 'Archivo no válido', description: 'El archivo debe pesar entre 1 byte y 15 MB.', variant: 'destructive' });
      return;
    }

    const key = `upload-${row.id}`;
    markBusy(key, true);
    try {
      const formData = new FormData();
      formData.append('id', String(row.id));
      formData.append('password', password);
      formData.append('reg_archivo', file, file.name);
      const res = await fetch(getRegistroUploadArchivoUrl(), { method: 'POST', body: formData });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || 'No se pudo subir el archivo');

      const savedName = String(json.reg_archivo_nombre || file.name);
      setRows(prev => prev.map(r => r.id === row.id
        ? { ...r, has_archivo: 1, reg_archivo_nombre: savedName }
        : r));
      setPreviewRow(prev => prev?.id === row.id
        ? { ...prev, has_archivo: 1, reg_archivo_nombre: savedName }
        : prev);
      toast({ title: 'Archivo adjunto guardado', description: savedName });
    } catch (err: any) {
      toast({ title: 'Error al subir archivo', description: err.message, variant: 'destructive' });
    } finally {
      markBusy(key, false);
    }
  };

  /** Fetch the latest list (always scoped to current torneoid). */
  const refresh = async () => {
    setLoading(true);
    try {
      // Filtro por torneo: activo (default), uno concreto o todos.
      const torneoArg = torneoFilter === '__all__'
        ? 'all' as const
        : torneoFilter === '__active__'
          ? undefined
          : parseInt(torneoFilter, 10);
      const res = await fetch(getRegistroListUrl(password, torneoArg));
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Error al cargar');
      setRows(json.rows || []);
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { refresh(); /* eslint-disable-next-line */ }, []);

  /** Cargar catálogo `estatuspago` (primeras 6 opciones) una sola vez. */
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(getEstatuspagoUrl());
        const json = await res.json();
        if (Array.isArray(json.rows)) setEstatusOpts(json.rows);
      } catch {
        /* silencioso: el dropdown queda vacío si falla */
      }
    })();
  }, []);

  /**
   * Admin update genérico: envía cualquier combinación de campos
   * (verified, pago_verificado, monto_confirmado) al endpoint verify
   * y aplica el cambio optimistamente en la fila local.
   * Si `verified` pasa a 1, el backend dispara correo al jugador.
   */
  const updateRegistro = async (
    row: RegistroRow,
    patch: { verified?: 0 | 1; pago_verificado?: 0 | 1; status_pago?: number; monto_confirmado?: string | null },
  ) => {
    try {
      const res = await fetch(getRegistroVerifyUrl(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: row.id, password, ...patch }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Error');
      setRows(prev => prev.map(r => {
        if (r.id !== row.id) return r;
        const next: RegistroRow = { ...r };
        if (patch.verified !== undefined)         next.reg_verificado       = patch.verified;
        if (patch.pago_verificado !== undefined)  next.reg_pago_verificado  = patch.pago_verificado;
        if (patch.status_pago !== undefined)      next.reg_pago_verificado  = patch.status_pago;
        if (patch.monto_confirmado !== undefined) next.reg_monto_confirmado = patch.monto_confirmado ?? '';
        return next;
      }));
    } catch (err: any) {
      toast({ title: 'Error al actualizar', description: err.message, variant: 'destructive' });
    }
  };

  /**
   * Sección 3/4 → enviar correo de BIENVENIDA al jugador. Reemplaza al
   * toggle "Registro verificado": YA NO actualiza el campo `verificado`
   * en la tabla `registro`, sólo dispara el correo e incrementa el
   * contador `reg_welcome_count` que se muestra en la UI.
   */
  const sendWelcome = async (row: RegistroRow) => {
    const key = `welcome-${row.id}`;
    markBusy(key, true);
    try {
      const res = await fetch(getRegistroWelcomeEmailUrl(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: row.id, password }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || 'Error');
      toast({ title: 'Correo de bienvenida enviado', description: `Enviado a ${json.to || ''}` });
      // Optimistic: incrementa el contador de bienvenidas. El clasificador
      // usa `reg_welcome_count > 0` para mover la fila a "Registros
      // completados" — NO se toca `registro.verificado`.
      setRows(prev => prev.map(rr => rr.id === row.id
        ? { ...rr, reg_welcome_count: (Number(rr.reg_welcome_count) || 0) + 1 }
        : rr));
    } catch (e: any) {
      toast({ title: 'Error al enviar bienvenida', description: e.message, variant: 'destructive' });
    } finally {
      markBusy(key, false);
    }
  };

  /**
   * Sección 1 → POST /registro_email.php para mandarle al jugador el
   * correo "registro validado, sube tu comprobante".
   * NO marca enviado=1: eso ocurre cuando el jugador realmente sube
   * el comprobante desde la página pública.
   */
  const sendEmail = async (row: RegistroRow) => {
    const key = `email-${row.id}`;
    markBusy(key, true);
    try {
      const res = await fetch(getRegistroEmailUrl(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: row.id, password }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Error');
      toast({ title: 'Correo enviado', description: `Enviado a ${json.to}` });
      // Optimistic: incrementa el contador local para que el botón cambie
      // a "Volver a enviar" sin esperar a un refresh manual.
      setRows(prev => prev.map(rr => rr.id === row.id
        ? { ...rr, reg_email_count: (Number(rr.reg_email_count) || 0) + 1 }
        : rr));
    } catch (err: any) {
      toast({ title: 'Error al enviar correo', description: err.message, variant: 'destructive' });
    } finally {
      markBusy(key, false);
    }
  };


  /**
   * Sección 4 → toggle status_pago entre 1 (registrado) y 99
   * (des-registrado). Mismo botón cambia texto/icono según estado.
   */
  const toggleUnregister = async (row: RegistroRow) => {
    const key = `unreg-${row.id}`;
    markBusy(key, true);
    try {
      const res = await fetch(getRegistroUnregisterUrl(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: row.id, password }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Error');
      setRows(prev => prev.map(r => r.id === row.id
        ? { ...r, reg_pago_verificado: json.status_pago }
        : r));
      toast({
        title: json.status_pago === 99 ? 'Des-registrado' : 'Registrado',
      });
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    } finally {
      markBusy(key, false);
    }
  };

  /**
   * Sección 4 → marca al jugador en `jugadores` con estatus='BAJA'.
   * No toca el registro mismo.
   */
  const darDeBaja = async (row: RegistroRow) => {
    if (!confirm(`¿Dar de baja al jugador ${row.reg_nombre || ''} ${row.reg_apellido || ''} en la tabla jugadores?`)) return;
    const key = `baja-${row.id}`;
    markBusy(key, true);
    try {
      const res = await fetch(getRegistroBajaUrl(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: row.id, password }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Error');
      toast({
        title: 'Jugador dado de baja',
        description: `${json.jugadores_updated} fila(s) actualizada(s) en jugadores.`,
      });
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    } finally {
      markBusy(key, false);
    }
  };

  /**
   * Sección 5 (Lista de espera) → POST /registro_promote.php para mover
   * el registro al flujo normal: status_pago pasa de 67 a 0 y se envía
   * automáticamente el correo con datos bancarios. Refresca la lista al
   * terminar para que la fila desaparezca de sec5 y aparezca en sec2.
   */
  const promoteFromWaitlist = async (row: RegistroRow) => {
    const key = `promote-${row.id}`;
    markBusy(key, true);
    try {
      const res = await fetch(getRegistroPromoteUrl(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: row.id, password }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Error');
      toast({
        title: 'Registro agregado a la categoría',
        description: `Correo de pago enviado a ${json.to}.`,
      });
      await refresh();
    } catch (err: any) {
      toast({ title: 'Error al promover', description: err.message, variant: 'destructive' });
    } finally {
      markBusy(key, false);
    }
  };

  /**
   * Clasifica una fila en una de las secciones según `status_pago`
   * (PK del catálogo `estatuspago`):
   *   sec1 — sin evidencia (sin comprobante ni cargo) y status_pago=0
   *   sec2 — Pendiente verificación de pago:
   *            • status_pago = 0 con comprobante/cargo, o
   *            • status_pago = 1 (POR VALIDAR)
   *            • status_pago = 3 (POR COBRAR)
   *   sec3 — Verificar registro:
   *            • status_pago = 2 (PAGADO)
   *            • status_pago = 4 (CORTESIA)
   *   sec4 — Completados (verificado=1)
   *   sec5 — Lista de espera (status_pago = 5)
   *   sec6 — Registros cancelados (status_pago = 6)
   */
  /**
   * Helper: una fila se considera "completada" cuando ya se le envió al
   * menos un correo de BIENVENIDA (`reg_welcome_count > 0`). NUNCA se
   * usa `registro.verificado` para esta decisión — ese campo se respeta
   * tal cual está en la BD y no se modifica desde este dashboard.
   */
  const isCompletado = (r: RegistroRow): boolean =>
    (Number(r.reg_welcome_count) || 0) > 0;

  const classify = (r: RegistroRow): 'sec1' | 'sec2' | 'sec3' | 'sec4' | 'sec5' | 'sec6' => {
    const hasFile   = Number(r.has_archivo) === 1;
    const cargo     = String(r.reg_cargo_socio ?? '') === '1';
    const statusP   = Number(r.reg_pago_verificado);
    // Estados terminales/laterales tienen prioridad sobre el flujo normal.
    if (statusP === 5) return 'sec5';
    if (statusP === 6) return 'sec6';
    // "Completado" = ya recibió correo de bienvenida (no depende de verificado).
    if (isCompletado(r)) return 'sec4';
    // PAGADO o CORTESIA → listos para verificar registro.
    if (statusP === 2 || statusP === 4) return 'sec3';
    // POR VALIDAR / POR COBRAR → pendiente de verificación de pago.
    if (statusP === 1 || statusP === 3) return 'sec2';
    // status_pago = 0: pasa a sec2 sólo si hay evidencia real (comprobante o cargo).
    if (hasFile || cargo) return 'sec2';
    return 'sec1';
  };

  /** Conteos por sección — alimentan los tabs. */
  const counts = useMemo(() => {
    const c = { sec1: 0, sec2: 0, sec3: 0, sec4: 0, sec5: 0, sec6: 0 } as Record<'sec1'|'sec2'|'sec3'|'sec4'|'sec5'|'sec6', number>;
    for (const r of rows) c[classify(r)]++;
    return c;
  }, [rows]);

  /**
   * Extrae la fecha (YYYY-MM-DD) de un registro intentando varios
   * campos posibles. Devuelve '' si no hay ninguno.
   */
  const getRowDate = (r: RegistroRow): string => {
    const raw = (r.reg_fecha || r.created_at || (r as any).fecha_alta || r.fecharegistro || '') as string;
    const m = String(raw).match(/^(\d{4}-\d{2}-\d{2})/);
    return m ? m[1] : '';
  };

  /**
   * Lista única y ordenada de categorías presentes en los registros
   * actuales — se usa para alimentar el <Select> de filtro de categoría.
   */
  const categoriasDisponibles = useMemo(() => {
    const set = new Set<string>();
    for (const r of rows) {
      const c = (r.categoria_name || '').trim();
      if (c) set.add(c);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'es'));
  }, [rows]);

  /** Filtrado final por sección + búsqueda libre + filtros explícitos. */
  const filtered = useMemo(() => {
    const term  = search.trim().toLowerCase();
    const folio = folioFilter.trim();
    return rows.filter(r => {
      if (classify(r) !== section) return false;

      // Búsqueda libre (nombre, correo, teléfono, club, monto pagado).
      if (term) {
        const hay = [r.reg_nombre, r.reg_apellido, r.reg_correo, r.reg_telefono, r.reg_club, r.akron_monto_pago]
          .filter(Boolean).join(' ').toLowerCase();
        if (!hay.includes(term)) return false;
      }

      // Folio (id exacto o prefijo numérico).
      if (folio && !String(r.id).startsWith(folio)) return false;

      // Categoría (match exacto por nombre legible).
      if (categoriaFilter !== '__all__') {
        if ((r.categoria_name || '').trim() !== categoriaFilter) return false;
      }

      // Fecha de registro: comparación lexicográfica YYYY-MM-DD.
      if (dateValue) {
        const d = getRowDate(r);
        if (!d) return false;
        if (dateMode === 'on'     && d !== dateValue) return false;
        if (dateMode === 'after'  && !(d >  dateValue)) return false;
        if (dateMode === 'before' && !(d <  dateValue)) return false;
      }

      return true;
    });
  }, [rows, section, search, folioFilter, categoriaFilter, dateMode, dateValue]);

  /**
   * Aplica el orden por fecha/hora de registro elegido por el admin.
   * Se hace después de filtrar para no mover elementos ocultos.
   */
  const sorted = useMemo(() => {
    const arr = [...filtered];
    arr.sort((a, b) => {
      const ta = getRowTs(a), tb = getRowTs(b);
      return sortOrder === 'newest' ? tb.localeCompare(ta) : ta.localeCompare(tb);
    });
    return arr;
  }, [filtered, sortOrder]);

  /** Limpia todos los filtros (excepto la sección activa). */
  const clearFilters = () => {
    setSearch('');
    setFolioFilter('');
    setCategoriaFilter('__all__');
    setDateMode('on');
    setDateValue('');
  };
  const hasActiveFilters =
    !!search || !!folioFilter || categoriaFilter !== '__all__' || !!dateValue;

  /**
   * exportCsv
   * ------------------------------------------------------------------
   * Descarga los registros actualmente filtrados/ordenados como CSV
   * compatible con Excel (BOM UTF-8 + separador ";"), incluyendo
   * "Monto a pagar" (reg_precio_estimado), "Monto pagado"
   * (akron_monto_pago) y el estado del comprobante.
   */
  const exportCsv = () => {
    if (sorted.length === 0) {
      toast({ title: 'No hay registros para exportar', variant: 'destructive' });
      return;
    }
    /** Escapa un valor para CSV (comillas dobles + separador ";"). */
    const cell = (v: unknown) => {
      const s = v == null ? '' : String(v);
      return `"${s.replace(/"/g, '""')}"`;
    };
    /** Normaliza importes a decimal plano para que Excel los lea como número. */
    const money = (v: unknown) => {
      if (v == null || String(v).trim() === '') return '';
      const n = Number(String(v).replace(/[^0-9.\-]/g, ''));
      return Number.isFinite(n) ? n.toFixed(2) : '';
    };
    /** Etiqueta legible del estatus de pago (tabla estatuspago). */
    const estatusLabel = (r: RegistroRow) => {
      const opt = estatusOpts.find(o => String(o.value) === String(r.reg_pago_verificado));
      return opt ? opt.label : '';
    };
    /** Estado del comprobante: cargo a cuenta / archivo adjunto / sin comprobante. */
    const comprobanteEstado = (r: RegistroRow) => {
      const partes: string[] = [];
      if (String(r.reg_cargo_socio ?? '') === '1') partes.push('Cargo a cuenta');
      if (Number(r.has_archivo) === 1) partes.push('Comprobante adjunto');
      return partes.length ? partes.join(' + ') : 'Sin comprobante';
    };

    const headers = [
      'Folio', 'Fecha registro', 'Nombre', 'Apellido', 'Correo', 'Teléfono',
      'País tel.', 'Lada',
      'Club', 'Categoría', 'Handicap', 'Socio', 'Tipo socio', 'Clave socio',
      'Monto a pagar', 'Monto pagado', 'Monto confirmado', 'Moneda',
      'Comprobante', 'Archivo', 'Estatus de pago', 'Sección',
    ];
    const sectionLabel = SECTIONS.find(s => s.id === section)?.label || section;
    const lines = [headers.map(cell).join(';')];
    for (const r of sorted) {
      lines.push([
        r.id,
        r.reg_fecha || r.created_at || (r as any).fecha_alta || '',
        r.reg_nombre || '',
        r.reg_apellido || '',
        r.reg_correo || '',
        displayPhone(r),
        r.reg_tel_pais || '',
        r.reg_tel_lada || '',
        r.reg_club || '',
        r.categoria_name || '',
        r.reg_handicap ?? '',
        r.reg_es_socio === 'SI' ? 'Sí' : 'No',
        r.reg_tipo_socio || '',
        r.reg_numsocio || '',
        money(r.reg_precio_estimado),
        money(r.akron_monto_pago),
        money(r.reg_monto_confirmado),
        r.reg_precio_moneda || 'MXN',
        comprobanteEstado(r),
        r.reg_archivo_nombre || '',
        estatusLabel(r),
        sectionLabel,
      ].map(cell).join(';'));
    }

    // BOM para que Excel respete los acentos.
    const blob = new Blob(['\uFEFF' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const stamp = new Date().toISOString().slice(0, 10);
    a.href = url;
    a.download = `pre-registros_${section}_${stamp}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast({ title: `Exportados ${sorted.length} registro(s)` });
  };

  /** Tabs definidos arriba — orden importa (botones). */
  const SECTIONS: { id: 'sec1'|'sec2'|'sec3'|'sec4'|'sec5'|'sec6'; label: string }[] = [
    { id: 'sec1', label: 'Sin validar registro' },
    { id: 'sec2', label: 'Pendiente verificación de pago' },
    { id: 'sec3', label: 'Verificar registro' },
    { id: 'sec4', label: 'Registros completados' },
    { id: 'sec5', label: 'Lista de espera' },
    { id: 'sec6', label: 'Registros cancelados' },
  ];

  return (
    <div className="container mx-auto px-4 py-8 space-y-4">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Pre-Registros</h1>
          <p className="text-muted-foreground">
            {rows.length} pre-registros · {counts.sec1} sin validar · {counts.sec2} pendiente pago · {counts.sec3} por verificar · {counts.sec4} completados · {counts.sec5} en lista de espera · {counts.sec6} cancelados
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={exportCsv} disabled={loading || sorted.length === 0} className="gap-2">
            <FileDown className="h-4 w-4" /> Exportar CSV / Excel
          </Button>
          <Button variant="outline" onClick={refresh} disabled={loading} className="gap-2">
            <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} /> Actualizar
          </Button>
        </div>
      </div>

      {/* Section tabs + search */}
      <Card>
        <CardContent className="pt-6 space-y-3">
          {/* Tabs de sección */}
          <div className="flex flex-nowrap gap-2 overflow-x-auto pb-1 scrollbar-hide">
            {SECTIONS.map(s => (
              <Button
                key={s.id}
                variant={section === s.id ? 'default' : 'outline'}
                size="sm"
                className="shrink-0 whitespace-nowrap"
                onClick={() => setSection(s.id)}
              >
                {s.label} <span className="ml-2 opacity-70">({counts[s.id]})</span>
              </Button>
            ))}
          </div>

          {/*
            Barra de filtros. Cada control es independiente y combinable
            (AND). El estado vive sólo en este navegador, así que dos
            admins revisando al mismo tiempo no comparten filtros.
          */}
          <div className="grid grid-cols-1 md:grid-cols-12 gap-2">
            {/* Búsqueda libre */}
            <div className="relative md:col-span-4">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                className="pl-10"
                placeholder="Buscar nombre, correo, club…"
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>

            {/* Folio (#id) */}
            <Input
              className="md:col-span-2"
              placeholder="Folio (#id)"
              inputMode="numeric"
              value={folioFilter}
              onChange={e => setFolioFilter(e.target.value.replace(/\D+/g, ''))}
            />

            {/* Categoría */}
            <div className="md:col-span-3">
              <Select value={categoriaFilter} onValueChange={setCategoriaFilter}>
                <SelectTrigger><SelectValue placeholder="Categoría" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">Todas las categorías</SelectItem>
                  {categoriasDisponibles.map(c => (
                    <SelectItem key={c} value={c}>{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Fecha: modo + valor */}
            <div className="md:col-span-2">
              <Select value={dateMode} onValueChange={(v) => setDateMode(v as 'on'|'after'|'before')}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="on">Fecha: en</SelectItem>
                  <SelectItem value="after">Fecha: después de</SelectItem>
                  <SelectItem value="before">Fecha: antes de</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Input
              type="date"
              className="md:col-span-1"
              value={dateValue}
              onChange={e => setDateValue(e.target.value)}
            />
          </div>

          {/* Resumen + botón limpiar */}
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <div className="flex items-center gap-3">
              <span>{filtered.length} resultado(s)</span>
              {/* Selector de orden por fecha/hora de registro. */}
              <div className="flex items-center gap-1">
                <span>Ordenar:</span>
                <Select value={sortOrder} onValueChange={(v) => setSortOrder(v as 'newest' | 'oldest')}>
                  <SelectTrigger className="h-7 w-[180px] text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="newest">Más nuevos primero</SelectItem>
                    <SelectItem value="oldest">Más viejos primero</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            {hasActiveFilters && (
              <Button variant="ghost" size="sm" className="gap-1 h-7" onClick={clearFilters}>
                <X className="h-3 w-3" /> Limpiar filtros
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-8 flex items-center gap-2 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Cargando…
            </div>
          ) : filtered.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">No hay registros para mostrar.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="w-8 p-3"></th>
                    <th className="text-left p-3">Jugador</th>
                    <th className="text-left p-3">Contacto</th>
                    <th className="text-left p-3">Categoría / Hcp</th>
                    <th className="text-left p-3">Club</th>
                    <th className="text-left p-3">Socio</th>
                    <th className="text-center p-3">Pago / Comprobante</th>
                    <th className="text-center p-3">Monto cobrado</th>
                    {/*
                      Columnas siempre visibles en todas las secciones para
                      que el admin pueda capturar monto confirmado y mover
                      el `status_pago` desde cualquier vista.
                    */}
                    <th className="text-center p-3">Monto confirmado recibido</th>
                    <th className="text-center p-3 leading-tight">
                      <span className="block">Estatus</span>
                      <span className="block">de pago</span>
                    </th>
                    <th className="text-center p-3">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {sorted.map(r => {
                    const verified = Number(r.reg_verificado) === 1;
                    const pagoVerif = Number(r.reg_pago_verificado) === 1;
                    const hasFile = Number(r.has_archivo) === 1;
                    const cargoCuenta = String(r.reg_cargo_socio ?? '') === '1';
                    const isOverflow = overflowIds.has(r.id);
                    const moneda = r.reg_precio_moneda || 'MXN';
                    const montoCobrado = r.reg_precio_estimado !== undefined && r.reg_precio_estimado !== null && String(r.reg_precio_estimado) !== ''
                      ? `${Number(r.reg_precio_estimado).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${moneda}`
                      : '—';
                    /**
                     * montoPagado: importe capturado por el jugador en la
                     * pantalla de comprobante (registro.akron_monto_pago).
                     * Se resalta en primary cuando coincide con el monto cobrado.
                     */
                    const montoPagadoNum = r.akron_monto_pago != null && String(r.akron_monto_pago).trim() !== ''
                      ? Number(String(r.akron_monto_pago).replace(/[^0-9.\-]/g, ''))
                      : null;
                    const montoPagado = montoPagadoNum != null && Number.isFinite(montoPagadoNum)
                      ? `${montoPagadoNum.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${moneda}`
                      : '—';
                    const cobradoNum = Number(r.reg_precio_estimado);
                    const montoMatch = montoPagadoNum != null && Number.isFinite(montoPagadoNum) && Number.isFinite(cobradoNum)
                      && Math.abs(montoPagadoNum - cobradoNum) < 0.01;
                    return (
                    <Fragment key={r.id}>
                    <tr
                      className={cn(
                        'border-t hover:bg-muted/30 cursor-pointer [&>td]:align-middle',
                        isPreferenteMismatch(r) && 'bg-amber-50 border-l-4 border-l-amber-500',
                        isOverflow && 'bg-rose-50 border-l-4 border-l-rose-500'
                      )}
                      onClick={() => toggleExpand(r.id)}
                      title={
                        isOverflow
                          ? 'Este pre-registro excede el cupo máximo de la categoría (lista de espera por orden de llegada).'
                          : isPreferenteMismatch(r)
                            ? 'Registro capturado durante la ventana preferente con un club no autorizado — revisar membresía.'
                            : undefined
                      }
                    >
                        <td className="p-3 text-center">
                          <button
                            type="button"
                            className="text-muted-foreground hover:text-foreground"
                            onClick={(e) => { e.stopPropagation(); toggleExpand(r.id); }}
                            aria-label={expanded.has(r.id) ? 'Colapsar' : 'Expandir'}
                          >
                            {expanded.has(r.id)
                              ? <ChevronDown className="h-4 w-4" />
                              : <ChevronRight className="h-4 w-4" />}
                          </button>
                        </td>
                        <td className="p-3">
                          <div className="font-medium">{[r.reg_nombre, r.reg_apellido].filter(Boolean).join(' ') || '—'}</div>
                          <div className="text-xs text-muted-foreground">#{r.id} · {r.reg_fecha || r.created_at || (r as any).fecha_alta || '—'}</div>
                        </td>
                        <td className="p-3">
                          <div>{r.reg_correo || '—'}</div>
                          <div className="text-xs text-muted-foreground">{displayPhone(r)}</div>
                        </td>
                        <td className="p-3">
                          <div>{r.categoria_name || '—'}</div>
                          <div className="text-xs text-muted-foreground">Hcp: {r.reg_handicap ?? '—'}</div>
                          {isOverflow && (
                            <div className="mt-1">
                              <Badge variant="outline" className="text-rose-700 border-rose-400 bg-rose-50 text-xs">
                                ⚠ Excede cupo{r.cat_max ? ` (max ${r.cat_max})` : ''}
                              </Badge>
                            </div>
                          )}
                          {section === 'sec5' && (() => {
                            /*
                             * En lista de espera, mostrar conteo de ocupación
                             * de la categoría: "n/max". max=0 o 99 se consideran
                             * ilimitados (no debería ocurrir en sec5 pero se
                             * cubre por completitud).
                             */
                            const maxC = Number(r.cat_max) || 0;
                            const cnt  = Number(r.cat_count) || 0;
                            const unlimited = !maxC || maxC === 99;
                            return (
                              <div className="text-xs mt-1">
                                <span className="text-muted-foreground">Cupo: </span>
                                <span className={cn(
                                  'font-mono font-semibold',
                                  unlimited
                                    ? 'text-muted-foreground'
                                    : cnt < maxC ? 'text-primary' : 'text-destructive'
                                )}>
                                  {unlimited ? `${cnt}/∞` : `${cnt}/${maxC}`}
                                </span>
                              </div>
                            );
                          })()}
                        </td>
                        <td className="p-3">
                          <div>{r.reg_club || '—'}</div>
                        </td>
                        <td className="p-3">
                          {r.reg_es_socio === 'SI' ? (
                            <Badge variant="default">Socio · {r.reg_tipo_socio || '—'}</Badge>
                          ) : (
                            <Badge variant="secondary">No socio</Badge>
                          )}
                          {isPreferenteMismatch(r) && (
                            <div className="mt-1">
                              <Badge variant="outline" className="text-amber-700 border-amber-400 bg-amber-50 text-xs">
                                ⚠ Club no autorizado en ventana preferente
                              </Badge>
                            </div>
                          )}
                          {cargoCuenta && (
                            <div className="mt-1 text-xs text-muted-foreground">
                              Clave: <span className="font-mono">{r.reg_numsocio || '—'}</span>
                            </div>
                          )}
                        </td>
                        <td className="p-3 text-center">
                          {/*
                            Muestra el badge "Cargo a cuenta" y/o el botón
                            "Ver comprobante" — pueden coexistir si el jugador
                            eligió cargo a cuenta y además subió archivo.
                          */}
                          <div className="flex flex-col items-center gap-1">
                            {cargoCuenta && (
                              <Badge variant="default" className="bg-primary/15 text-primary border border-primary/30 hover:bg-primary/20">
                                Cargo a cuenta
                              </Badge>
                            )}
                            {/* Verificar registro (sec3) y Completados (sec4)
                                permiten adjuntar/ver comprobante. */}
                            {(hasFile || section === 'sec3' || section === 'sec4') && (
                              <Button
                                size="sm"
                                variant="outline"
                                className="gap-1 h-auto min-h-10 whitespace-normal w-32"
                                onClick={(e) => { e.stopPropagation(); setPreviewRow(r); }}
                              >
                                <Eye className="h-4 w-4" /> {hasFile ? 'Ver comprobante' : 'Adjuntar archivo'}
                              </Button>
                            )}
                            {!cargoCuenta && !hasFile && (
                              <span className="text-muted-foreground text-xs">—</span>
                            )}
                          </div>
                        </td>
                        {/* Monto cobrado (snapshot mostrado al jugador al enviar el form). */}
                        <td className="p-3 text-center font-mono text-xs">{montoCobrado}</td>
                        {/* Campo: monto confirmado recibido (se persiste onBlur). Disponible en todas las secciones. */}
                        <td className="p-3 text-center" onClick={(e) => e.stopPropagation()}>
                          <Input
                            type="number"
                            step="0.01"
                            defaultValue={r.reg_monto_confirmado != null ? String(r.reg_monto_confirmado) : ''}
                            placeholder="0.00"
                            className="h-8 w-28 text-right font-mono"
                            onBlur={(e) => {
                              const val = e.currentTarget.value.trim();
                              const current = r.reg_monto_confirmado != null ? String(r.reg_monto_confirmado) : '';
                              if (val !== current) updateRegistro(r, { monto_confirmado: val });
                            }}
                          />
                        </td>
                        {/*
                          Toggle: pago verificado por tesorería.
                          Regla: sólo se puede activar si el monto confirmado recibido
                          coincide exactamente con el monto cobrado (reg_precio_estimado).
                          Si no coinciden, el switch queda deshabilitado.
                        */}
                        <td className="p-3 text-center" onClick={(e) => e.stopPropagation()}>
                          {(() => {
                            /**
                             * Dropdown alimentado por la tabla `estatuspago`
                             * (primeras 6 opciones). El valor (PK) se guarda
                             * directamente en `registro.status_pago`.
                             *
                             * Siempre habilitado (siempre que existan opciones):
                             * el admin puede mover el estatus libremente, sin
                             * importar si el monto confirmado coincide o no
                             * con el monto cobrado.
                             */
                            const current = Number(r.reg_pago_verificado);
                            const currentStr = Number.isFinite(current) ? String(current) : '';
                            return (
                              <div className="flex items-center justify-center gap-2">
                                <Select
                                  value={currentStr}
                                  disabled={estatusOpts.length === 0}
                                  onValueChange={(v) => updateRegistro(r, { status_pago: Number(v) })}
                                >
                                  <SelectTrigger className={cn(
                                    "text-xs w-36",
                                    section === 'sec4' ? "h-auto min-h-10 whitespace-normal" : "h-10"
                                  )}>
                                    <SelectValue placeholder="—" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {estatusOpts.map(opt => (
                                      <SelectItem key={opt.value} value={String(opt.value)}>
                                        {opt.label}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </div>
                            );
                          })()}
                        </td>
                        {/*
                          Acciones por sección:
                          sec1 → "Enviar correo" siempre disponible (recordatorio al jugador).
                          sec3/sec4 → "Enviar bienvenida" dispara el correo de
                                      bienvenida y muestra el contador de envíos.
                                      YA NO actualiza el campo `verificado`.
                        */}
                        <td className="p-3 text-center" onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center justify-center gap-2 flex-wrap">
                            {section === 'sec1' && (
                              <Button
                                size="sm"
                                variant="outline"
                                className="gap-1 h-auto min-h-10 whitespace-normal w-36"
                                disabled={!!busy[`email-${r.id}`] || !r.reg_correo}
                                onClick={() => sendEmail(r)}
                              >
                                {busy[`email-${r.id}`]
                                  ? <Loader2 className="h-4 w-4 animate-spin" />
                                  : <Mail className="h-4 w-4" />}
                                {Number(r.reg_email_count) > 0 ? 'Volver a enviar' : 'Enviar correo'}
                              </Button>
                            )}
                            {(section === 'sec3' || section === 'sec4') && (() => {
                              const wcount = Number(r.reg_welcome_count) || 0;
                              return (
                                <div className="flex flex-col items-center gap-1">
                                  <Button
                                    size="sm"
                                    className="gap-1 h-auto min-h-10 whitespace-normal w-36"
                                    disabled={!!busy[`welcome-${r.id}`] || !r.reg_correo}
                                    onClick={() => sendWelcome(r)}
                                  >
                                    {busy[`welcome-${r.id}`]
                                      ? <Loader2 className="h-4 w-4 animate-spin" />
                                      : <Mail className="h-4 w-4" />}
                                    {wcount > 0 ? 'Reenviar bienvenida' : 'Enviar bienvenida'}
                                  </Button>
                                  {wcount > 0 && (
                                    <span className="text-[10px] text-muted-foreground">
                                      Enviados: {wcount}
                                      {r.reg_welcome_last ? ` · ${r.reg_welcome_last}` : ''}
                                    </span>
                                  )}
                                </div>
                              );
                            })()}
                            {(section === 'sec2' || section === 'sec6') && (
                              <span className="text-muted-foreground text-xs">—</span>
                            )}
                            {section === 'sec5' && (() => {
                              /*
                               * Lista de espera: el botón "Agregar a categoría"
                               * sólo se habilita si hay cupo disponible
                               * (cat_count < cat_max). Al hacer click, el
                               * backend cambia status_pago=67 → 0 y envía el
                               * correo de datos bancarios automáticamente.
                               */
                              const maxC = Number(r.cat_max) || 0;
                              const cnt  = Number(r.cat_count) || 0;
                              const unlimited = !maxC || maxC === 99;
                              const hasRoom = unlimited || cnt < maxC;
                              return (
                                <Button
                                  size="sm"
                                  variant={hasRoom ? 'default' : 'outline'}
                                  className="gap-1 h-auto min-h-10 whitespace-normal w-36"
                                  disabled={!hasRoom || !!busy[`promote-${r.id}`]}
                                  title={hasRoom
                                    ? 'Mover al flujo normal y enviar correo de pago'
                                    : 'La categoría sigue llena'}
                                  onClick={() => promoteFromWaitlist(r)}
                                >
                                  {busy[`promote-${r.id}`]
                                    ? <Loader2 className="h-4 w-4 animate-spin" />
                                    : <UserCheck className="h-4 w-4" />}
                                  Agregar a categoría
                                </Button>
                              );
                            })()}
                          </div>
                        </td>
                      </tr>
                      {expanded.has(r.id) && (
                        <tr className="border-t bg-muted/20">
                          <td></td>
                          <td colSpan={10} className="p-4">
                            {/* Detalle completo: lista todos los campos llenados del registro. */}
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-2 text-sm">
                              {[
                                ['Nombre', r.reg_nombre],
                                ['Apellido', r.reg_apellido],
                                ['Correo', r.reg_correo],
                                ['Teléfono', displayPhone(r)],
                                ['Handicap', r.reg_handicap],
                                ['Categoría', r.categoria_name],
                                ['Club', r.reg_club],
                                ['¿Es socio?', r.reg_es_socio],
                                ['Tipo de socio', r.reg_tipo_socio],
                                ['Cargo a cuenta', String(r.reg_cargo_socio ?? '') === '1' ? 'Sí' : 'No'],
                                ['Número de socio', r.reg_numsocio],
                                ['Edad', r.akron_edad],
                                ['Fecha registro', r.reg_fecha || r.created_at || (r as any).fecha_alta],
                                ['Fecha y hora de registro',
                                  r.fecharegistro
                                    ? (() => {
                                        /**
                                         * `fecharegistro` se guarda en UTC (DATETIME MySQL sin
                                         * sufijo de zona) desde el momento del submit. Aquí lo
                                         * parseamos como UTC y lo formateamos en la zona horaria
                                         * local del navegador del admin.
                                         */
                                        const s = String(r.fecharegistro).trim();
                                        const m = s.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/);
                                        if (!m) return s;
                                        const [, Y, Mo, D, H, Mi, S] = m.map(Number);
                                        const local = new Date(Date.UTC(Y, Mo - 1, D, H, Mi, S));
                                        const pad = (n: number) => String(n).padStart(2, '0');
                                        return `${pad(local.getDate())}/${pad(local.getMonth() + 1)}/${local.getFullYear()} ${pad(local.getHours())}:${pad(local.getMinutes())}:${pad(local.getSeconds())}`;
                                      })()
                                    : '—'
                                ],
                                ['Precio estimado', r.reg_precio_estimado != null && String(r.reg_precio_estimado) !== '' ? `${Number(r.reg_precio_estimado).toLocaleString('es-MX',{minimumFractionDigits:2,maximumFractionDigits:2})} ${r.reg_precio_moneda || 'MXN'}` : ''],
                                ['Monto confirmado', r.reg_monto_confirmado],
                                ['Pago verificado', Number(r.reg_pago_verificado) === 1 ? 'Sí' : 'No'],
                                ['Registro verificado', Number(r.reg_verificado) === 1 ? 'Sí' : 'No'],
                                ['Comprobante', Number(r.has_archivo) === 1 ? (r.reg_archivo_nombre || 'archivo cargado') : ''],
                                /**
                                 * Campos opcionales (tallas / akron). Solo se incluyen en la
                                 * lista cuando el jugador los llenó — así no aparecen como
                                 * "—" en registros donde el admin no habilitó esos campos.
                                 */
                                ...([
                                  ['Talla de playera',       r.akron_talla],
                                  ['Talla de guante',        r.akron_talla_guante],
                                  ['Talla de gorra',         r.reg_talla_gorra],
                                  ['Talla de calzado/tenis', r.akron_calzado],
                                  ['Código de promoción',    r.akron_codigo],
                                  ['Monto pagado',           r.akron_monto_pago],
                                  // País/lada capturados con el teléfono
                                  ['País tel.',              r.reg_tel_pais],
                                  ['Lada',                   r.reg_tel_lada],
                                ] as Array<[string, unknown]>).filter(([, v]) =>
                                  v != null && String(v).trim() !== ''
                                ),
                              ].map(([label, value]) => {
                                const v = value == null || value === '' ? '—' : String(value);
                                return (
                                  <div key={String(label)} className="flex flex-col">
                                    <span className="text-xs uppercase tracking-wide text-muted-foreground">{label}</span>
                                    <span className="font-medium break-words">{v}</span>
                                  </div>
                                );
                              })}
                             </div>
                             {/*
                              * Control administrativo de archivo adjunto dentro del
                              * detalle expandido de Registros completados. Cada fila
                              * usa un id propio para evitar colisiones entre inputs.
                              */}
                             {(section === 'sec3' || section === 'sec4') && (
                               <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-md border bg-background p-3">
                                 <div>
                                   <Label htmlFor={`registro-archivo-adjunto-${r.id}`} className="text-sm font-semibold">
                                     SUBIR ARCHIVO ADJUNTO
                                   </Label>
                                   <p className="text-xs text-muted-foreground">
                                     {Number(r.has_archivo) === 1
                                       ? `Actual: ${r.reg_archivo_nombre || 'archivo cargado'} · puedes reemplazarlo`
                                       : 'Imagen o PDF · máximo 15 MB'}
                                   </p>
                                 </div>
                                 <div className="flex items-center gap-2">
                                   <Input
                                     id={`registro-archivo-adjunto-${r.id}`}
                                     type="file"
                                     accept="image/*,.pdf"
                                     className="max-w-[230px] text-xs"
                                     disabled={!!busy[`upload-${r.id}`]}
                                     onChange={(e) => {
                                       const file = e.currentTarget.files?.[0];
                                       e.currentTarget.value = '';
                                       if (file) void uploadArchivo(r, file);
                                     }}
                                   />
                                   {busy[`upload-${r.id}`] && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
                                 </div>
                               </div>
                             )}
                           </td>
                        </tr>
                      )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Modal de vista previa del comprobante (imagen o PDF inline). */}
      <Dialog open={!!previewRow} onOpenChange={(o) => !o && setPreviewRow(null)}>
        <DialogContent className="max-w-5xl w-[95vw] h-[90vh] flex flex-col p-4">
          <DialogHeader>
            <DialogTitle className="pr-6">
              <span className="truncate block">
                Comprobante · {previewRow ? `${previewRow.reg_nombre ?? ''} ${previewRow.reg_apellido ?? ''}`.trim() : ''}
                {previewRow?.reg_archivo_nombre ? ` — ${previewRow.reg_archivo_nombre}` : ''}
              </span>
            </DialogTitle>
          </DialogHeader>
          {previewRow && (() => {
            const url = getRegistroArchivoUrl(previewRow.id, password);
            const name = (previewRow.reg_archivo_nombre || '').toLowerCase();
            const isImage = /\.(png|jpe?g|gif|webp|bmp|svg)$/.test(name);
            const hasPreviewFile = Number(previewRow.has_archivo) === 1;
            if (!hasPreviewFile) {
              return <div className="flex-1 rounded bg-muted/20 items-center justify-center text-sm text-muted-foreground flex p-8 text-center">
                Este registro todavía no tiene un archivo adjunto.
              </div>;
            }
            return isImage ? (
              <div className="flex-1 overflow-auto bg-muted/30 rounded flex items-center justify-center">
                <img src={url} alt="Comprobante" className="max-w-full max-h-full object-contain" />
              </div>
            ) : (
              <iframe src={url} title="Comprobante" className="flex-1 w-full rounded border" />
            );
          })()}
          {previewRow && Number(previewRow.has_archivo) === 1 && (
            <Button asChild variant="secondary" className="gap-2 w-full sm:w-auto self-start">
              <a
                href={getRegistroArchivoUrl(previewRow.id, password)}
                download={previewRow.reg_archivo_nombre || `comprobante_${previewRow.id}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                <FileDown className="h-4 w-4" /> Descargar comprobante
              </a>
            </Button>
          )}
          {previewRow && (section === 'sec3' || section === 'sec4') && (
            <div className="flex items-center justify-between gap-3 rounded-md border bg-muted/20 p-3">
              <div className="min-w-0">
                <Label htmlFor="registro-archivo-adjunto" className="text-sm font-semibold">
                  SUBIR ARCHIVO ADJUNTO
                </Label>
                <p className="text-xs text-muted-foreground">Imagen o PDF · máximo 15 MB · reemplaza el archivo actual</p>
              </div>
              <div className="shrink-0">
                <Input
                  id="registro-archivo-adjunto"
                  type="file"
                  accept="image/*,.pdf"
                  className="sr-only"
                  disabled={!!busy[`upload-${previewRow.id}`]}
                  onChange={(e) => {
                    const file = e.currentTarget.files?.[0];
                    e.currentTarget.value = '';
                    if (file) void uploadArchivo(previewRow, file);
                  }}
                />
                <Button asChild variant="outline" className="gap-2" disabled={!!busy[`upload-${previewRow.id}`]}>
                  <label htmlFor="registro-archivo-adjunto" className="cursor-pointer">
                    {busy[`upload-${previewRow.id}`]
                      ? <Loader2 className="h-4 w-4 animate-spin" />
                      : <FileUp className="h-4 w-4" />}
                    Seleccionar archivo
                  </label>
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

// ============= Page =============

const AdminRegistros = () => {
  const [authed, setAuthed] = useState<boolean>(() => sessionStorage.getItem(SESSION_KEY) === '1');

  /** Compare against the local constant; on success persist for the session. */
  const onLogin = (pwd: string) => {
    if (pwd === REGISTROS_PASSWORD) {
      sessionStorage.setItem(SESSION_KEY, '1');
      setAuthed(true);
      return true;
    }
    return false;
  };

  return (
    <Layout>
      {authed ? <RegistrosDashboard password={REGISTROS_PASSWORD} /> : <LoginForm onLogin={onLogin} />}
    </Layout>
  );
};

export default AdminRegistros;