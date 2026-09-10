/**
 * Admin Page
 * Dashboard for managing page visibility settings, notes, and menu groups
 * Protected by password authentication
 */

import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { usePageVisibility } from '@/contexts/PageVisibilityContext';
import Layout from '@/components/layout/Layout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import AdminConvocatoria from '@/components/admin/AdminConvocatoria';
import AdminLiveScoring from '@/components/admin/AdminLiveScoring';
import AdminSponsors from '@/components/admin/AdminSponsors';
import AdminPagina from '@/components/admin/AdminPagina';
import AdminScopeBar from '@/components/admin/AdminScopeBar';
import AdminTorneos from '@/components/admin/AdminTorneos';

import AdminEventos from '@/components/admin/AdminEventos';
import AdminAvisos from '@/components/admin/AdminAvisos';
import AdminMenus from '@/components/admin/AdminMenus';
import AdminPremios from '@/components/admin/AdminPremios';
import AdminHoteles from '@/components/admin/AdminHoteles';
import AdminUploads from '@/components/admin/AdminUploads';
import AdminRegistro from '@/components/admin/AdminRegistro';
import AdminRegistroPrecios from '@/components/admin/AdminRegistroPrecios';
import AdminRegistroPreferente from '@/components/admin/AdminRegistroPreferente';
import AdminSocioTipos from '@/components/admin/AdminSocioTipos';
import AdminCategoriasReglas from '@/components/admin/AdminCategoriasReglas';
/** CRUD de categorías (Tee Salida, Rating, Slope, Par) → pestaña "Categorías". */
import AdminCategorias from '@/components/admin/AdminCategorias';
import AdminBrackets from '@/components/admin/AdminBrackets';
import AdminMatchPlay from '@/components/admin/AdminMatchPlay';
import AdminThemePalette from '@/components/admin/AdminThemePalette';
import AdminShowcase300 from '@/components/admin/AdminShowcase300';
/** Constructor de rotación embebido en la pestaña Showcase 300. */
import { ShowcaseRotacionDashboard } from '@/pages/AdminShowcaseRotacionPage';
import AdminStats from '@/components/admin/AdminStats';
import AdminStatsPage from '@/components/admin/AdminStatsPage';
import AdminHistorial from '@/components/admin/AdminHistorial';
import AdminHeros from '@/components/admin/AdminHeros';
import AdminPopup from '@/components/admin/AdminPopup';
import AdminAnuncio from '@/components/admin/AdminAnuncio';
import AdminBanderas from '@/components/admin/AdminBanderas';
import AdminStaffUsers from '@/components/admin/AdminStaffUsers';
/** Impresión de salidas por día (formulario de filtros → reporte imprimible). */
import AdminSalidasPrint from '@/components/admin/AdminSalidasPrint';
/** Enfrentamientos manuales de MATCH PLAY para las salidas públicas. */
/** Impresión de tarjetas de juego por día y categoría. */
import AdminTarjetasPrint from '@/components/admin/AdminTarjetasPrint';


/** Reporte TIME LINE: hora estimada de cada grupo en los 18 hoyos. */
import AdminTimeLinePrint from '@/components/admin/AdminTimeLinePrint';
import { useStaffAuth, type StaffArea } from '@/contexts/StaffAuthContext';
import { RegistrosDashboard } from '@/pages/AdminRegistros';
import { 
  Shield, 
  LogOut, 
  Lock,
  Settings,
  CheckCircle2,
  XCircle,
  Eye,
  EyeOff,
  FolderTree,
  Database,
  GripVertical,
  Globe,
  Loader2,
  FileText,
  Radio,
  Image as ImageIcon,
  LayoutPanelTop,
  CalendarDays,
  Bell,
  UtensilsCrossed,
  Upload,
  ClipboardList,
  Trophy,
  ListChecks,
  BarChart3,
  MonitorPlay,
  Flag,
  Hotel,
  Users,
  

  Swords,
  Megaphone,
  History,
  Printer,
  Clock,
  Rocket,
  /** Icono de la pestaña "Categorías" (antes "Jugadores"). */
  Layers,
} from 'lucide-react';

import { cn } from '@/lib/utils';
import { useSiteConfig, useSaveSiteConfig } from '@/hooks/useSiteConfig';
import { useToast } from '@/hooks/use-toast';
import { getSuperAdminPassword } from '@/lib/superAdminAuth';
import { useConfigScope } from '@/lib/configScope';
/** Módulos: los tabs de un módulo apagado no se muestran ni se montan. */
import { useModules } from '@/modules/useModules';
import { Blocks } from 'lucide-react';

// ============= Login Form Component =============

interface AdminLoginFormProps {
  onLogin: (password: string) => Promise<boolean>;
}

/**
 * AdminLoginForm
 * Password input form for admin authentication
 */
const AdminLoginForm = ({ onLogin }: AdminLoginFormProps) => {
  const [usuario, setUsuario] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const { login: staffLogin } = useStaffAuth();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(false); setErrorMsg(null);
    // Si no hay usuario → intentar admin legacy. Si sí → login staff.
    if (!usuario.trim()) {
      setBusy(true);
      const success = await onLogin(password);
      setBusy(false);
      if (!success) { setError(true); setErrorMsg('Contraseña incorrecta'); setPassword(''); }
      return;
    }
    setBusy(true);
    const r = await staffLogin(usuario.trim(), password);
    setBusy(false);
    if (!r.ok) {
      setError(true);
      setErrorMsg(r.error || 'Credenciales inválidas');
      setPassword('');
    }
  };

  return (
    <div className="min-h-[60vh] flex items-center justify-center">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-4">
            <Shield className="w-8 h-8 text-primary" />
          </div>
          <CardTitle className="text-2xl">Acceso Administrativo</CardTitle>
          <CardDescription>
            Ingresa la contraseña para acceder al panel de administración
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="usuario">Usuario (opcional)</Label>
              <Input
                id="usuario"
                type="text"
                value={usuario}
                onChange={(e) => { setUsuario(e.target.value); setError(false); }}
                placeholder="Dejar vacío para admin principal"
                autoComplete="username"
              />
              <p className="text-xs text-muted-foreground">
                Si tienes acceso temporal de staff, ingresa tu usuario.
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Contraseña</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    setError(false);
                  }}
                  className={cn(
                    "pl-10",
                    error && "border-destructive focus-visible:ring-destructive"
                  )}
                  placeholder="Ingresa la contraseña"
                />
              </div>
              {error && (
                <p className="text-sm text-destructive flex items-center gap-1">
                  <XCircle className="h-4 w-4" />
                  {errorMsg || 'Contraseña incorrecta'}
                </p>
              )}
            </div>
            <Button type="submit" className="w-full" disabled={busy}>
              {busy ? 'Validando...' : 'Iniciar Sesión'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
};

// ============= Admin Dashboard Component =============

/**
 * AdminDashboard
 * Main admin interface with tabs for visibility, notes, and menu groups
 */
const AdminDashboard = () => {
  const { 
    visibilitySettings, 
    setPageVisibility, 
    logoutAdmin,
    getAllMenuItems,
    pageNotes,
    setPageNote,
    menuGroups,
    setMenuGroups,
    pageGroupAssignments,
    setPageGroupAssignment,
    layoutPreferences,
    setLayoutPreferences,
    menuItemOrder,
    setMenuItemOrder,
  } = usePageVisibility();
  const { session: staffSession, logout: staffLogout } = useStaffAuth();
  const { isAdmin } = usePageVisibility();
  /** Multi-torneo: pantalla de alta de torneos del sitio. */
  const [managingTorneos, setManagingTorneos] = useState(false);

  /** Mapa tab → área. Si no está en el mapa, sólo admin completo lo ve. */
  const TAB_AREA: Record<string, StaffArea | undefined> = {
    archivos: 'uploads',
    convocatoria: 'convocatoria',
    eventos: 'eventos',
    avisos: 'avisos',
    menus: 'menus',
    premios: 'premios',
    hoteles: 'hoteles',
    popup: 'pop',
    banderas: 'banderas',
    anuncio: undefined,
    sponsors: undefined,
    registro: 'preregistros',
    registros: 'preregistros',
    brackets: 'brackets',
    matchplay: 'matchplay',
    live: 'live',
    stats: 'stats',
    'stats-page': 'stats',
    // Categorías de jugadores: restringido a superadmin.
    jugadores: undefined,
    usuarios: undefined,
    config: undefined,
    pagina: undefined,
    reglas: 'reglas',
    // Heros (fondos por página/torneo) queda restringido a superadmin.
    heros: undefined,
    // ALIEN SYSTEM: la pestaña contenedora se resuelve aparte (cualquiera de
    // sus 3 sub-áreas da acceso). Ver visibleAdminTabs / ALIEN_AREAS.
    alien: undefined,
  };
  const isStaffOnly = !!staffSession && !isAdmin;
  /** Estado de módulos del proyecto (ver /setup y src/modules/registry.ts). */
  const { isAdminTabEnabled, isEnabled: isModuleOn } = useModules();
  /** Áreas de staff → tab values del panel principal. */
  const AREA_TO_TAB: Record<StaffArea, string> = {
    preregistros: 'registros',
    brackets: 'brackets',
    matchplay: 'matchplay',
    live: 'live',
    banderas: 'banderas',
    pop: 'popup',
    eventos: 'eventos',
    avisos: 'avisos',
    menus: 'menus',
    premios: 'premios',
    hoteles: 'hoteles',
    convocatoria: 'convocatoria',
    reglas: 'convocatoria',
    uploads: 'archivos',
    stats: 'stats',
    alien_tarjetas: 'alien',
    alien_timeline: 'alien',
    alien_salidas: 'alien',
  };
  /** Áreas que dan acceso a ALIEN SYSTEM (y a su sub-pestaña respectiva). */
  const ALIEN_AREAS: StaffArea[] = ['alien_tarjetas', 'alien_timeline', 'alien_salidas'];
  /** true si el usuario activo puede ver una sub-pestaña de ALIEN SYSTEM. */
  const canAlien = (a: StaffArea) => !isStaffOnly || !!staffSession?.areas.includes(a);
  /** Tab inicial: la primera área del staff, siempre que su módulo esté activo. */
  const staffFirstTab = isStaffOnly && staffSession && staffSession.areas.length
    ? (AREA_TO_TAB[staffSession.areas[0]] || 'config')
    : 'config';
  const staffDefaultTab = isAdminTabEnabled(staffFirstTab) ? staffFirstTab : 'config';
  /** Pestaña activa (controlada para poder agrupar las secciones). */
  const [activeTab, setActiveTab] = useState<string>(staffDefaultTab);
  /**
   * Filtra tabs por MÓDULO (apagado en /setup = no existe para nadie) y luego
   * por permisos del usuario activo.
   */
  const visibleAdminTabs = <T extends { value: string }>(tabs: T[]): T[] => {
    const byModule = tabs.filter(t => isAdminTabEnabled(t.value));
    if (!isStaffOnly) return byModule;
    return byModule.filter(t => {
      if (t.value === 'alien') {
        return ALIEN_AREAS.some(a => staffSession!.areas.includes(a));
      }
      const area = TAB_AREA[t.value];
      return !!area && staffSession!.areas.includes(area);
    });
  };
  const navigate = useNavigate();
  const { data: siteConfig, isLoading: isLoadingSiteConfig } = useSiteConfig();
  const configScope = useConfigScope();
  const saveSiteConfig = useSaveSiteConfig();
  const { toast } = useToast();
  const [homeTitleInput, setHomeTitleInput] = useState('');

  useEffect(() => {
    setHomeTitleInput(siteConfig?.home_config?.title ?? '');
  }, [siteConfig?.home_config?.title]);
  
  const menuItems = getAllMenuItems();
  const visibleCount = Object.values(visibilitySettings).filter(Boolean).length;
  const hiddenCount = menuItems.length - visibleCount;

  /**
   * Save a specific config field to the server for all visitors
   */
  const syncToServer = (fields: Record<string, any>) => {
    saveSiteConfig.mutate(
      { password: getSuperAdminPassword(), ...fields },
      {
        onError: (err) => {
          toast({
            title: 'Error al sincronizar',
            description: err.message,
            variant: 'destructive',
          });
        },
      }
    );
  };

  /** Wrapper: set visibility and sync to server */
  const handleSetVisibility = (pageId: string, visible: boolean) => {
    const updated = { ...visibilitySettings, [pageId]: visible };
    setPageVisibility(pageId, visible);
    syncToServer({ visibility: updated });
  };

  /** Wrapper: set menu order and sync to server */
  const handleSetMenuOrder = (order: Record<string, number>) => {
    setMenuItemOrder(order);
    syncToServer({ menu_order: Object.keys(order).length > 0 ? order : null });
  };

  /** Wrapper: set menu groups and sync to server */
  const handleSetMenuGroups = (groups: any[]) => {
    setMenuGroups(groups);
    syncToServer({ menu_groups: groups.length > 0 ? groups : null });
  };

  /** Wrapper: set page group assignment and sync to server */
  const handleSetPageGroupAssignment = (pageId: string, groupId: string | null) => {
    setPageGroupAssignment(pageId, groupId);
    const updated = { ...pageGroupAssignments };
    if (groupId === null) {
      delete updated[pageId];
    } else {
      updated[pageId] = groupId;
    }
    syncToServer({ page_group_assignments: Object.keys(updated).length > 0 ? updated : null });
  };

  const handleLogout = () => {
    logoutAdmin();
    if (staffSession) { staffLogout(); }
    navigate('/');
  };

  /**
   * Get group name for a page
   */
  const getGroupName = (pageId: string): string | undefined => {
    const groupId = pageGroupAssignments[pageId];
    if (!groupId) return undefined;
    const group = menuGroups.find(g => g.id === groupId);
    return group?.name;
  };

  /**
   * Get grid column class based on column count
   */
  const getGridClass = () => {
    switch (layoutPreferences.columns) {
      case 2:
        return 'grid-cols-1 sm:grid-cols-2';
      case 4:
        return 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4';
      default: // 3
        return 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3';
    }
  };

  return (
    <div className="container mx-auto px-4 py-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
            <Settings className="w-6 h-6 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Panel de Administración</h1>
            <p className="text-muted-foreground">Gestiona páginas, grupos y configuración del menú</p>
          </div>
        </div>
        <Button variant="outline" onClick={handleLogout} className="gap-2">
          <LogOut className="h-4 w-4" />
          Cerrar Sesión
        </Button>
        {/* Acceso a la configuración de módulos: exclusivo del superadmin. */}
        {isAdmin && (
          <Button variant="outline" className="gap-2" onClick={() => navigate('/setup')}>
            <Blocks className="h-4 w-4" />
            Módulos
          </Button>
        )}
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-primary" />
              <div>
                <p className="text-xl font-bold">{visibleCount}</p>
                <p className="text-xs text-muted-foreground">Visibles</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-2">
              <EyeOff className="w-5 h-5 text-muted-foreground" />
              <div>
                <p className="text-xl font-bold">{hiddenCount}</p>
                <p className="text-xs text-muted-foreground">Ocultas</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-2">
              <FolderTree className="w-5 h-5 text-accent-foreground" />
              <div>
                <p className="text-xl font-bold">{menuGroups.length}</p>
                <p className="text-xs text-muted-foreground">Grupos</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-2">
              <Shield className="w-5 h-5 text-primary" />
              <div>
                <p className="text-xl font-bold">{menuItems.length}</p>
                <p className="text-xs text-muted-foreground">Total</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Multi-torneo: qué configuración se está editando */}
      {isAdmin && (
        <AdminScopeBar managing={managingTorneos} onManagingChange={setManagingTorneos} />
      )}

      {managingTorneos ? (
        <AdminTorneos />
      ) : (
      <>
      {/* Tabs for different admin sections */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">

        {/*
          Admin navigation — dos niveles:
            Fila 1 → secciones ("Configuración de Página", "Visualización",
                     "Juego y jugadores", "Control").
            Fila 2 → pestañas de la sección activa.
          Las pestañas siguen siendo un único <Tabs> controlado, así que los
          permisos por área de staff y los módulos apagados se respetan igual.
        */}
        {(() => {
          /** Catálogo completo de pestañas (etiqueta + icono). */
          const adminTabs: { value: string; icon: any; label: string }[] = [
            { value: 'config',       icon: Database,        label: 'Config' },
            { value: 'pagina',       icon: LayoutPanelTop,  label: 'Página' },
            { value: 'avisos',       icon: Bell,            label: 'Avisos' },
            { value: 'anuncio',      icon: Megaphone,       label: 'Anuncio' },
            { value: 'popup',        icon: MonitorPlay,     label: 'POP' },
            { value: 'sponsors',     icon: ImageIcon,       label: 'Patrocinadores' },
            { value: 'heros',        icon: ImageIcon,       label: 'Heros' },
            { value: 'stats',        icon: BarChart3,       label: 'Estadísticas' },

            { value: 'archivos',     icon: Upload,          label: 'Archivos' },
            { value: 'convocatoria', icon: FileText,        label: 'Convocatoria' },
            { value: 'eventos',      icon: CalendarDays,    label: 'Eventos' },
            { value: 'menus',        icon: UtensilsCrossed, label: 'Menús' },
            { value: 'premios',      icon: Trophy,          label: 'Premios' },
            { value: 'hoteles',      icon: Hotel,           label: 'Hoteles' },
            { value: 'banderas',     icon: Flag,            label: 'Banderas' },

            { value: 'live',         icon: Radio,           label: 'Live' },
            { value: 'showcase-rotacion', icon: MonitorPlay, label: 'Showcase 300' },
            { value: 'registro',     icon: ClipboardList,   label: 'Pre-Registro' },
            { value: 'jugadores',    icon: Layers,          label: 'Categorías' },
            { value: 'brackets',     icon: Trophy,          label: 'Brackets Putt' },
            { value: 'matchplay',    icon: Swords,          label: 'Match Play' },
            { value: 'stats-page',   icon: BarChart3,       label: 'Página /stats' },
            /**
             * ALIEN SYSTEM — herramientas operativas de impresión
             * (Tarjetas, Time Line, Salidas) en sub-pestañas.
             */
            { value: 'alien',        icon: Rocket,          label: 'ALIEN SYSTEM' },

            { value: 'registros',    icon: ListChecks,      label: 'Registros' },
            { value: 'usuarios',     icon: Users,           label: 'Usuarios' },
            { value: 'historial',    icon: History,         label: 'Historial' },
          ];

          /** Secciones y el orden de sus pestañas. */
          const sections: { id: string; label: string; icon: any; tabs: string[] }[] = [
            {
              id: 'configuracion',
              label: 'Configuración de Página',
              icon: Settings,
              tabs: ['config', 'pagina', 'avisos', 'anuncio', 'popup', 'sponsors', 'heros', 'stats'],
            },
            {
              id: 'visualizacion',
              label: 'Visualización',
              icon: ImageIcon,
              tabs: ['archivos', 'convocatoria', 'eventos', 'menus', 'premios', 'hoteles', 'banderas'],
            },
            {
              id: 'juego',
              label: 'Juego y jugadores',
              icon: Trophy,
              tabs: ['live', 'showcase-rotacion', 'registro', 'jugadores', 'brackets', 'matchplay', 'stats-page', 'alien'],
            },
            {
              id: 'control',
              label: 'Control',
              icon: Shield,
              tabs: ['registros', 'usuarios', 'historial'],
            },
          ];

          // Filtrar por módulo activo y por área para staff temporal.
          const allowed = visibleAdminTabs(adminTabs);
          const byValue = new Map(allowed.map((t) => [t.value, t]));

          /** Secciones que conservan al menos una pestaña visible. */
          const usable = sections
            .map((s) => ({ ...s, items: s.tabs.map((v) => byValue.get(v)).filter(Boolean) as typeof allowed }))
            .filter((s) => s.items.length > 0);

          if (usable.length === 0) return null;

          const current = usable.find((s) => s.items.some((t) => t.value === activeTab)) ?? usable[0];

          return (
            <div className="space-y-2">
              {/* Fila 1 — secciones */}
              <div className="flex flex-wrap w-full gap-1 rounded-md bg-muted p-1">
                {usable.map(({ id, label, icon: Icon, items }) => (
                  <Button
                    key={id}
                    type="button"
                    variant={current.id === id ? 'default' : 'ghost'}
                    size="sm"
                    className="gap-2 flex-1 min-w-[150px]"
                    onClick={() => {
                      if (!items.some((t) => t.value === activeTab)) setActiveTab(items[0].value);
                    }}
                  >
                    <Icon className="h-4 w-4" />
                    {label}
                  </Button>
                ))}
              </div>

              {/* Fila 2 — pestañas de la sección activa */}
              <TabsList className="flex flex-wrap w-full h-auto gap-1 p-1">
                {current.items.map(({ value, icon: Icon, label }) => (
                  <TabsTrigger key={value} value={value} className="gap-2 flex-1 min-w-[120px]">
                    <Icon className="h-4 w-4" />
                    <span className="hidden sm:inline">{label}</span>
                  </TabsTrigger>
                ))}
              </TabsList>
            </div>
          );
        })()}

        {/* Configuration Tab */}
        <TabsContent value="config" className="space-y-4">
          {/* General edits its shared Home; tournament scopes show their identity. */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Globe className="h-5 w-5 text-primary" />
                {configScope === 'general' ? 'Texto del Home General' : 'Configuración del Torneo'}
              </CardTitle>
              <CardDescription>
                {configScope === 'general'
                  ? 'Configura el título de la portada compartida donde viven todos los torneos.'
                  : 'Esta configuración pertenece únicamente al torneo seleccionado.'}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4 max-w-md">
                {isLoadingSiteConfig ? (
                  <div className="flex items-center gap-2 text-muted-foreground text-sm">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Cargando texto del Home...
                  </div>
                ) : configScope === 'general' ? (
                  <div className="space-y-2">
                    <Label htmlFor="general-home-title">Título principal</Label>
                    <div className="flex gap-2">
                      <Input
                        id="general-home-title"
                        value={homeTitleInput}
                        onChange={(event) => setHomeTitleInput(event.target.value)}
                        placeholder="Torneo de Golf"
                        maxLength={120}
                      />
                      <Button
                        onClick={() => saveSiteConfig.mutate(
                          {
                            scope: 'general',
                            password: getSuperAdminPassword(),
                            home_config: {
                              buttons: siteConfig?.home_config?.buttons ?? [null, null],
                              ...siteConfig?.home_config,
                              title: homeTitleInput.trim() || null,
                            },
                          },
                          {
                            onSuccess: () => toast({
                              title: 'Texto del Home guardado',
                              description: 'La portada General ya muestra el nuevo título.',
                            }),
                            onError: (err) => toast({
                              title: 'No se pudo guardar',
                              description: err.message,
                              variant: 'destructive',
                            }),
                          },
                        )}
                        disabled={saveSiteConfig.isPending}
                      >
                        {saveSiteConfig.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Guardar'}
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Si se deja vacío, la portada mostrará “Torneo de Golf”.
                    </p>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-primary" />
                    Torneo ID: <span className="font-mono font-bold">{configScope}</span>
                  </p>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Theme palette picker — applies per-domain via site_config.theme_config */}
          <AdminThemePalette />

        </TabsContent>

        {/* Archivos Tab — upload images + PDFs to the server */}
        <TabsContent value="archivos">
          <AdminUploads />
        </TabsContent>

        {/* Página Tab — groups Visibilidad, Orden y Grupos as nested sub-tabs */}
        <TabsContent value="pagina">
          <AdminPagina
            menuItems={menuItems}
            visibilitySettings={visibilitySettings}
            pageNotes={pageNotes}
            pageGroupAssignments={pageGroupAssignments}
            menuGroups={menuGroups}
            layoutPreferences={layoutPreferences}
            menuItemOrder={menuItemOrder}
            getGroupName={getGroupName}
            getGridClass={getGridClass}
            onSetVisibility={handleSetVisibility}
            onSetPageNote={setPageNote}
            onSetLayoutPreferences={setLayoutPreferences}
            onSetMenuOrder={handleSetMenuOrder}
            onSetMenuGroups={handleSetMenuGroups}
            onSetPageGroupAssignment={handleSetPageGroupAssignment}
          />
        </TabsContent>

        {/* Convocatoria Tab */}
        <TabsContent value="convocatoria">
          <AdminConvocatoria />
        </TabsContent>

        {/* Eventos Tab — controls poster grid layout (desktop & mobile) */}
        <TabsContent value="eventos">
          <AdminEventos />
        </TabsContent>

        {/* Avisos Tab — controls Avisos page poster grid layout (desktop & mobile) */}
        <TabsContent value="avisos">
          <AdminAvisos />
        </TabsContent>

        {/* Menús Tab — manages Menús page poster grid layout (desktop & mobile) */}
        <TabsContent value="menus">
          <AdminMenus />
        </TabsContent>

        {/* Premios Tab — manages Premios page poster grid (uploads + layout). */}
        <TabsContent value="premios">
          <AdminPremios />
        </TabsContent>

        {/* Hoteles Tab — manages Hoteles page poster grid (uploads + layout). */}
        <TabsContent value="hoteles">
          <AdminHoteles />
        </TabsContent>

        {/* POP UP Tab — site-wide popup overlay (image + target pages + duration). */}
        <TabsContent value="popup">
          <AdminPopup />
        </TabsContent>

        {/* Anuncio Tab — scrolling text ribbon rendered between the header
            and the sponsor ribbon on every page of the site. */}
        <TabsContent value="anuncio">
          <AdminAnuncio />
        </TabsContent>

        {/* Banderas Tab — pin sheet por hoyo (tabla `banderas`). */}
        <TabsContent value="banderas">
          <AdminBanderas />
        </TabsContent>

        {/* Live Scoring Tab */}
        <TabsContent value="live">
          <AdminLiveScoring />
        </TabsContent>

        {/* Showcase 300 — accesos a los reportes de lobby/TV y, debajo, el
            constructor de rotación ya desplegado (antes vivía en otra
            ventana en /admin/showcase-rotacion). */}
        <TabsContent value="showcase-rotacion" className="space-y-6">
          <AdminShowcase300 />
          <ShowcaseRotacionDashboard />
        </TabsContent>

        {/* Sponsors Tab — controls how the Patrocinadores page renders sponsor logos */}
        <TabsContent value="sponsors">
          <AdminSponsors />
        </TabsContent>

        {/* Pre-Registro Tab — configures public registration form fields */}
        <TabsContent value="registro">
          <Tabs defaultValue="campos" className="space-y-4">
            <TabsList>
              <TabsTrigger value="campos">Campos del formulario</TabsTrigger>
              <TabsTrigger value="categorias">Categorías elegibles</TabsTrigger>
              <TabsTrigger value="precios">Precios de inscripción</TabsTrigger>
              <TabsTrigger value="preferente">Registro preferente</TabsTrigger>
              <TabsTrigger value="socios">Relación de Socios</TabsTrigger>
            </TabsList>
            <TabsContent value="campos">
              <AdminRegistro />
            </TabsContent>
            <TabsContent value="categorias">
              <AdminCategoriasReglas />
            </TabsContent>
            <TabsContent value="precios">
              <AdminRegistroPrecios />
            </TabsContent>
            {/* Registro preferente — ventana previa donde solo socios de
                clubes autorizados (tabla `clubs_registro`) pueden
                pre-registrarse. Fuera del rango se abre a todos los clubes. */}
            <TabsContent value="preferente">
              <AdminRegistroPreferente />
            </TabsContent>
            {/* Relación de Socios — mapea etiquetas específicas del club
                (Honorario, Jubilado, Esposa, ...) al tipo del sistema
                (TITULAR/EMERITO/DEPENDIENTE) usado por el motor de precios. */}
            <TabsContent value="socios">
              <AdminSocioTipos />
            </TabsContent>
          </Tabs>
        </TabsContent>
        {/* Registros Tab — duplica /admin/registros dentro del panel admin
            principal. Usa la misma contraseña interna (`registros2025`) que
            el endpoint verify; el listado público sigue disponible en
            /admin/registros para personal del club / ayudantes. */}
        <TabsContent value="registros">
          <RegistrosDashboard password="registros2025" />
        </TabsContent>
        {/* Brackets Putt Tab — config + visibilidad + captura de resultados
            (mode="full") para que el admin principal pueda hacerlo todo
            desde /admin. Ayudantes usan /admin/brackets (mode="scores"). */}
        <TabsContent value="brackets">
          <AdminBrackets mode="full" />
        </TabsContent>

        {/* Match Play Tab — captura ganadores y reseteo de matches en
            las categorías con sistema='MATCH PLAY'. Reusa el área
            staff `brackets` para permisos. */}
        <TabsContent value="matchplay">
          <AdminMatchPlay />
        </TabsContent>

        {/* Historial Tab — tabla de años anteriores (año + torneo_id) que
            alimenta la página pública /historial. */}
        <TabsContent value="historial">
          <AdminHistorial />
        </TabsContent>

        {/* Categorías Tab — CRUD de categorías del torneo con Tee de Salida,
            Rating, Slope y Par (campo_tee) + todas las columnas reales de
            torneos.categorias. Alimenta /jugadores. */}
        <TabsContent value="jugadores">
          <AdminCategorias />
        </TabsContent>

        {/* Heros Tab — sube/genera con IA, selecciona y activa la imagen de
            fondo (hero) de cada página pública por torneo. */}
        <TabsContent value="heros">
          <AdminHeros />
        </TabsContent>

        {/* Estadísticas Tab — override or auto-compute the home stats ribbon
            numbers per tournament (domain). See AdminStats.tsx. */}
        <TabsContent value="stats">
          <AdminStats />
        </TabsContent>

        {/*
          ALIEN SYSTEM — sección contenedora de las herramientas operativas.
          Sub-pestañas: Tarjetas, Time Line y Salidas.
        */}
        <TabsContent value="alien">
          <Tabs
            defaultValue={canAlien('alien_tarjetas') ? 'tarjetas' : canAlien('alien_timeline') ? 'timeline' : 'salidas'}
            className="space-y-4"
          >
            <TabsList className="flex flex-wrap w-full h-auto gap-1 p-1">
              {canAlien('alien_tarjetas') && (
                <TabsTrigger value="tarjetas" className="gap-2 flex-1 min-w-[120px]">
                  <ClipboardList className="h-4 w-4" /> Tarjetas
                </TabsTrigger>
              )}
              {canAlien('alien_timeline') && (
                <TabsTrigger value="timeline" className="gap-2 flex-1 min-w-[120px]">
                  <Clock className="h-4 w-4" /> Time Line
                </TabsTrigger>
              )}
              {canAlien('alien_salidas') && (
                <TabsTrigger value="salidas" className="gap-2 flex-1 min-w-[120px]">
                  <Printer className="h-4 w-4" /> Salidas
                </TabsTrigger>
              )}
            </TabsList>

            {/* Tarjetas — impresión de tarjetas de juego por día y categoría. */}
            {canAlien('alien_tarjetas') && (
              <TabsContent value="tarjetas">
                <AdminTarjetasPrint />
              </TabsContent>
            )}

            {/* Time Line — horarios estimados por hoyo de cada grupo de salida. */}
            {canAlien('alien_timeline') && (
              <TabsContent value="timeline">
                <AdminTimeLinePrint />
              </TabsContent>
            )}

            {/* Salidas — impresión del reporte de salidas por día. */}
            {canAlien('alien_salidas') && (
              <TabsContent value="salidas">
                <AdminSalidasPrint />
              </TabsContent>
            )}

          </Tabs>
        </TabsContent>




        {/* Página /stats — controla visibilidad, orden y overrides
            manuales de las 3 secciones (Clubes, Categoría, Jugador). */}
        <TabsContent value="stats-page">
          <AdminStatsPage />
        </TabsContent>

        {/* Usuarios Tab — solo admin completo. CRUD de staff temporal con
            áreas asignadas por checkbox y rango de fechas. */}
        {!isStaffOnly && (
          <TabsContent value="usuarios">
            <AdminStaffUsers />
          </TabsContent>
        )}
      </Tabs>
      </>
      )}



      {/* Info Note */}
      <div className="mt-6 p-4 rounded-lg bg-muted/50 border border-border">
        <p className="text-sm text-muted-foreground">
          <strong>Nota:</strong> Como administrador, siempre podrás ver todas las páginas. 
          Los cambios se aplican inmediatamente para los usuarios normales.
          Las notas son solo para referencia interna del administrador.
        </p>
      </div>
    </div>
  );
};

// ============= Main Admin Page =============

/**
 * Admin Page Component
 * Handles authentication and displays dashboard
 */
const Admin = () => {
  const { isAdmin, loginAsAdmin } = usePageVisibility();
  const { session: staffSession } = useStaffAuth();

  return (
    <Layout>
      {(isAdmin || staffSession) ? (
        <AdminDashboard />
      ) : (
        <AdminLoginForm onLogin={loginAsAdmin} />
      )}
    </Layout>
  );
};

export default Admin;
