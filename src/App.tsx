/**
 * App.tsx
 * Main application component with routing and providers
 * Includes PageVisibilityProvider for admin-controlled page visibility
 */

import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { PageVisibilityProvider, usePageVisibility } from "@/contexts/PageVisibilityContext";
import { StaffAuthProvider } from "@/contexts/StaffAuthContext";
import { useSiteConfig } from "@/hooks/useSiteConfig";
import { useAppIcon } from "@/hooks/useAppIcon";
import { applyThemeConfig } from "@/lib/theme-palettes";
import { TorneoScopeSync, TorneoSlugLayout } from "@/components/torneos/TorneoScope";

import { useEffect } from "react";
import Index from "./pages/Index";
import Convocatoria from "./pages/Convocatoria";
import Eventos from "./pages/Eventos";
import Jugadores from "./pages/Jugadores";
import Salidas from "./pages/Salidas";
import LiveScoring from "./pages/LiveScoring";
import Live from "./pages/Live";
import Resultados from "./pages/Resultados";
import Historial from "./pages/Historial";
import Competencias from "./pages/Competencias";
import Calendario from "./pages/Calendario";
import Horarios from "./pages/Horarios";
import Menus from '@/pages/Menus';
import Avisos from "./pages/Avisos";
import Premios from "./pages/Premios";
import Patrocinadores from "./pages/Patrocinadores";
import Reglas from "./pages/Reglas";
import SkinRules from "./pages/SkinRules";
import SkinPlayers from "./pages/SkinPlayers";
import SkinScorecards from "./pages/SkinScorecards";
import SkinGame from "./pages/SkinGame";
import Hoteles from "./pages/Hoteles";
import Admin from "./pages/Admin";
import Registro from "./pages/Registro";
import AdminRegistros from "./pages/AdminRegistros";
import Comprobante from "./pages/Comprobante";
import AdminBracketsPage from "./pages/AdminBracketsPage";
import Showcase300 from "./pages/Showcase300";
import ShowcaseRotator from "./pages/ShowcaseRotator";
import AdminShowcaseRotacionPage from "./pages/AdminShowcaseRotacionPage";
// Reporte imprimible de salidas por día (Admin → Salidas → GENERA).
import AdminSalidasImpresion from "./pages/AdminSalidasImpresion";
/** Reporte imprimible TIME LINE (horarios estimados por hoyo). */
import AdminTimeLine from "./pages/AdminTimeLine";
/** Reporte imprimible de TARJETAS de juego (2 por hoja carta). */
import AdminTarjetasImpresion from "./pages/AdminTarjetasImpresion";
// Vista de tarjeta por hora de salida (mismo diseño del encabezado).
import AdminTarjetasHoras from "./pages/AdminTarjetasHoras";

import PuttCalificados from "./pages/PuttCalificados";
import Banderas from "./pages/Banderas";
import MatchPlay from "./pages/MatchPlay";
import Stats from "./pages/Stats";
import Setup from "./pages/Setup";
import NotFound from "./pages/NotFound";
import ProtectedRoute from "./components/auth/ProtectedRoute";
// Guardia de rutas que no pasan por ProtectedRoute (showcase y admin de módulo).
import ModuleGate from "./components/modules/ModuleGate";
// Sincroniza qué módulos están encendidos en este proyecto (ver /setup).
import { useSyncModules } from "@/modules/useModules";
// Forces every client-side navigation to start at the top of the page.
import ScrollToTop from "./components/layout/ScrollToTop";

// ============= Query Client =============
const queryClient = new QueryClient();

/**
 * SiteConfigSync
 * Fetches server-side config and pushes values into PageVisibility context
 * Must be rendered inside PageVisibilityProvider
 */
const SiteConfigSync = ({ children }: { children: React.ReactNode }) => {
  const { data } = useSiteConfig();

  /** Set apple-touch-icon & favicon dynamically from tournament logo */
  useAppIcon();

  /**
   * Empuja la configuración de módulos al estado global. Debe ir aquí (una sola
   * vez, lo más arriba posible) porque rutas, menú y /admin la consultan.
   */
  useSyncModules(data?.modules_config);

  const { 
    setMenuItemOrder, 
    setPageVisibility, 
    setMenuGroups, 
    setPageGroupAssignment,
    isAdmin,
  } = usePageVisibility();

  /** Sync server config into context state when data arrives */
  useEffect(() => {
    if (!data) return;

    if (data.menu_order) {
      setMenuItemOrder(data.menu_order);
    }
    if (data.visibility) {
      Object.entries(data.visibility).forEach(([pageId, visible]) => {
        setPageVisibility(pageId, visible);
      });
    }
    if (data.menu_groups) {
      setMenuGroups(data.menu_groups);
    }
    if (data.page_group_assignments) {
      Object.entries(data.page_group_assignments).forEach(([pageId, groupId]) => {
        setPageGroupAssignment(pageId, groupId);
      });
    }
    // Apply the active color palette (if any) to CSS variables on :root
    applyThemeConfig(data.theme_config ?? null);
  }, [data]); // eslint-disable-line react-hooks/exhaustive-deps

  return <>{children}</>;
};

// ============= Páginas públicas (multi-torneo) =============

/**
 * Páginas públicas del sitio, sin la barra inicial.
 * Se montan dos veces:
 *   - en la raíz            → /resultados      (sitio de un solo torneo)
 *   - bajo el nombre corto  → /experience/resultados (sitio con varios torneos)
 * Así las direcciones antiguas siguen funcionando.
 */
const publicPages: { path: string; element: React.ReactNode }[] = [
  { path: 'convocatoria', element: <ProtectedRoute pageId="convocatoria"><Convocatoria /></ProtectedRoute> },
  { path: 'eventos', element: <ProtectedRoute pageId="eventos"><Eventos /></ProtectedRoute> },
  { path: 'jugadores', element: <ProtectedRoute pageId="jugadores"><Jugadores /></ProtectedRoute> },
  { path: 'salidas', element: <ProtectedRoute pageId="salidas"><Salidas /></ProtectedRoute> },
  { path: 'live-scoring', element: <ProtectedRoute pageId="live-scoring"><LiveScoring /></ProtectedRoute> },
  { path: 'live', element: <ProtectedRoute pageId="live"><Live /></ProtectedRoute> },
  { path: 'resultados', element: <ProtectedRoute pageId="resultados"><Resultados /></ProtectedRoute> },
  /* Historial de resultados de ediciones anteriores (hasta 5 años) */
  { path: 'historial', element: <ProtectedRoute pageId="historial"><Historial /></ProtectedRoute> },
  { path: 'competicion', element: <ProtectedRoute pageId="competicion"><Competencias /></ProtectedRoute> },
  { path: 'calendario', element: <ProtectedRoute pageId="calendario"><Calendario /></ProtectedRoute> },
  { path: 'horarios', element: <ProtectedRoute pageId="horarios"><Horarios /></ProtectedRoute> },
  { path: 'menus', element: <ProtectedRoute pageId="menus"><Menus /></ProtectedRoute> },
  { path: 'avisos', element: <ProtectedRoute pageId="avisos"><Avisos /></ProtectedRoute> },
  { path: 'premios', element: <ProtectedRoute pageId="premios"><Premios /></ProtectedRoute> },
  { path: 'patrocinadores', element: <ProtectedRoute pageId="patrocinadores"><Patrocinadores /></ProtectedRoute> },
  { path: 'reglas', element: <ProtectedRoute pageId="reglas"><Reglas /></ProtectedRoute> },
  { path: 'skinrules', element: <ProtectedRoute pageId="skinrules"><SkinRules /></ProtectedRoute> },
  { path: 'skinplayers', element: <ProtectedRoute pageId="skinplayers"><SkinPlayers /></ProtectedRoute> },
  { path: 'skinscorecards', element: <ProtectedRoute pageId="skinscorecards"><SkinScorecards /></ProtectedRoute> },
  { path: 'skingame', element: <ProtectedRoute pageId="skingame"><SkinGame /></ProtectedRoute> },
  { path: 'hoteles', element: <ProtectedRoute pageId="hoteles"><Hoteles /></ProtectedRoute> },
  { path: 'registro', element: <ProtectedRoute pageId="registro"><Registro /></ProtectedRoute> },
  { path: 'banderas', element: <ProtectedRoute pageId="banderas"><Banderas /></ProtectedRoute> },
  { path: 'matchplay', element: <ProtectedRoute pageId="matchplay"><MatchPlay /></ProtectedRoute> },
  { path: 'stats', element: <ProtectedRoute pageId="stats"><Stats /></ProtectedRoute> },
];

// ============= App Component =============
const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <PageVisibilityProvider>
        <StaffAuthProvider>
          <SiteConfigSync>
          <Toaster />
          <Sonner />
          <BrowserRouter>
            <ScrollToTop />
            <TorneoScopeSync />
            <Routes>
              {/* Public Routes */}
              <Route path="/" element={<Index />} />
              <Route path="/admin" element={<Admin />} />
              {/* Configuración de módulos del proyecto (solo superadmin). */}
              <Route path="/setup" element={<Setup />} />
              {/* Reporte imprimible de salidas por día. */}
              <Route path="/admin/salidas-impresion" element={<AdminSalidasImpresion />} />
              <Route path="/admin/time-line" element={<AdminTimeLine />} />
              {/* Tarjetas de juego imprimibles (Stroke Play / Stableford). */}
              <Route path="/admin/tarjetas-impresion" element={<AdminTarjetasImpresion />} />
              {/* Vista por hora de salida: quiénes juegan en cada hora. */}
              <Route path="/admin/tarjetas-horas" element={<AdminTarjetasHoras />} />

              {/* Rutas de admin que pertenecen a un módulo opcional. */}
              <Route path="/admin/registros" element={<ModuleGate moduleId="registro"><AdminRegistros /></ModuleGate>} />
              <Route path="/admin/brackets" element={<ModuleGate moduleId="matchplay"><AdminBracketsPage /></ModuleGate>} />
              <Route path="/admin/showcase-rotacion" element={<ModuleGate moduleId="showcase"><AdminShowcaseRotacionPage /></ModuleGate>} />
              {/* Public: player upload page after admin sends the email link */}
              <Route path="/registro/comprobante" element={<ModuleGate moduleId="registro"><Comprobante /></ModuleGate>} />

              {/* Protected Routes - visibility controlled by admin */}
              {publicPages.map((p) => (
                <Route key={p.path} path={`/${p.path}`} element={p.element} />
              ))}

              {/* Standalone Showcase 300 reports (no Layout, auto-refresh 5min) */}
              <Route path="/showcase/:tipo" element={<ModuleGate moduleId="showcase"><Showcase300 /></ModuleGate>} />
              {/* Rotador customizable de slides (lee config del #hash). */}
              <Route path="/showcase/rotacion" element={<ModuleGate moduleId="showcase"><ShowcaseRotator /></ModuleGate>} />
              {/* Standalone: clasificados Putt Finales por sexo (m|f). */}
              <Route path="/showcase/calificados/:sexo" element={<ModuleGate moduleId="showcase"><PuttCalificados /></ModuleGate>} />

              {/* Mismas páginas bajo el nombre corto de cada torneo. */}
              <Route path="/:torneoSlug" element={<TorneoSlugLayout />}>
                <Route index element={<Index />} />
                {publicPages.map((p) => (
                  <Route key={p.path} path={p.path} element={p.element} />
                ))}
              </Route>

              {/* 404 Route */}
              <Route path="*" element={<NotFound />} />
            </Routes>
            </BrowserRouter>
          </SiteConfigSync>
        </StaffAuthProvider>
      </PageVisibilityProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

          </SiteConfigSync>
        </StaffAuthProvider>
      </PageVisibilityProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
