/**
 * ProtectedRoute Component
 * Checks page visibility settings and blocks access to hidden pages
 * Admins can always access all pages
 */

import { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { usePageVisibility } from '@/contexts/PageVisibilityContext';
import { useSiteConfig } from '@/hooks/useSiteConfig';

// ============= Types =============

interface ProtectedRouteProps {
  /** The page ID to check visibility for */
  pageId: string;
  /** Child components to render if page is visible */
  children: ReactNode;
}

// ============= Component =============

/**
 * ProtectedRoute
 * Wraps page components to enforce visibility settings
 * Redirects to 404 if page is hidden and user is not admin
 *
 * Multi-torneo: la visibilidad depende del alcance activo (general o un
 * torneo concreto). Mientras la configuración de ESE alcance no llega, no se
 * decide nada: antes se usaba la visibilidad anterior (la del alcance previo)
 * y páginas visibles como /resultados se redirigían a 404 al entrar directo
 * por la dirección del torneo.
 */
const ProtectedRoute = ({ pageId, children }: ProtectedRouteProps) => {
  const { isPageVisible } = usePageVisibility();
  const { data, isLoading, isError } = useSiteConfig();

  // Configuración del alcance aún en camino: no redirigir todavía.
  if (isLoading && !data && !isError) return null;

  // Cuando el servidor sí respondió, su visibilidad manda sobre el estado local.
  const serverVisibility = data?.visibility?.[pageId];
  const visible = typeof serverVisibility === 'boolean'
    ? serverVisibility || isPageVisible(pageId)
    : isPageVisible(pageId);

  if (!visible) {
    // Redirect to 404 for hidden pages
    return <Navigate to="/not-found" replace />;
  }

  // Page is visible, render children
  return <>{children}</>;
};

export default ProtectedRoute;
