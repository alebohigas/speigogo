/**
 * PageVisibilityContext
 * Manages page visibility state for admin-controlled menu items
 * Uses localStorage for persistence without backend dependency
 * Includes support for page notes and menu groups
 */

import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { menuConfig, MenuItem } from '@/data/mockData';
import { LayoutMode, ColumnCount } from '@/components/admin/AdminLayoutSettings';
import { MenuGroup } from '@/components/admin/AdminMenuGroups';
import { clearSuperAdminPassword, hasRememberedSuperAdminPassword, validateSuperAdminPassword } from '@/lib/superAdminAuth';
/**
 * Módulos: "apagado en /setup" gana siempre sobre "visible en /admin", incluso
 * para el superadmin. Se consulta el singleton (no un hook) porque este provider
 * se monta antes de que llegue la configuración del servidor.
 */
import { isPageIdModuleDisabled, subscribeModules } from '@/modules/moduleState';
import { subscribeConfigScope } from '@/lib/configScope';


// ============= Types =============

/** Visibility settings for each page by ID */
/** Custom order overrides for menu items */
export interface MenuItemOrder {
  [pageId: string]: number;
}

export interface PageVisibilitySettings {
  [pageId: string]: boolean;
}

/** Notes for each page by ID */
export interface PageNotes {
  [pageId: string]: string;
}

/** Page to group assignments */
export interface PageGroupAssignments {
  [pageId: string]: string;
}

/** Admin layout preferences */
export interface AdminLayoutPreferences {
  layout: LayoutMode;
  columns: ColumnCount;
}

/** Context value interface */
interface PageVisibilityContextType {
  /** Current visibility settings */
  visibilitySettings: PageVisibilitySettings;
  /** Update visibility for a specific page */
  setPageVisibility: (pageId: string, visible: boolean) => void;
  /** Check if a page is visible */
  isPageVisible: (pageId: string) => boolean;
  /** Check if user is admin */
  isAdmin: boolean;
  /** Login as admin */
  loginAsAdmin: (password: string) => Promise<boolean>;
  /** Logout admin */
  logoutAdmin: () => void;
  /** Get all menu items (for admin view) */
  getAllMenuItems: () => MenuItem[];
  /** Get visible menu items (for user view) */
  getVisibleMenuItems: () => MenuItem[];
  /** Page notes */
  pageNotes: PageNotes;
  /** Update note for a page */
  setPageNote: (pageId: string, note: string) => void;
  /** Menu groups */
  menuGroups: MenuGroup[];
  /** Update menu groups */
  setMenuGroups: (groups: MenuGroup[]) => void;
  /** Page group assignments */
  pageGroupAssignments: PageGroupAssignments;
  /** Assign page to group */
  setPageGroupAssignment: (pageId: string, groupId: string | null) => void;
  /** Admin layout preferences */
  layoutPreferences: AdminLayoutPreferences;
  /** Update layout preferences */
  setLayoutPreferences: (prefs: AdminLayoutPreferences) => void;
  /** Custom menu item order overrides */
  menuItemOrder: MenuItemOrder;
  /** Update menu item order */
  setMenuItemOrder: (order: MenuItemOrder) => void;
}

// ============= Constants =============

/** LocalStorage key for visibility settings */
const STORAGE_KEY = 'tournament_page_visibility';

/** LocalStorage key for admin session */
const ADMIN_SESSION_KEY = 'tournament_admin_session';

/** LocalStorage key for page notes */
const NOTES_STORAGE_KEY = 'tournament_page_notes';

/** LocalStorage key for menu groups */
const GROUPS_STORAGE_KEY = 'tournament_menu_groups';

/** LocalStorage key for page group assignments */
const PAGE_GROUPS_STORAGE_KEY = 'tournament_page_group_assignments';

/** LocalStorage key for admin layout preferences */
const LAYOUT_PREFS_STORAGE_KEY = 'tournament_admin_layout_prefs';

/** LocalStorage key for custom menu item order */
const MENU_ORDER_STORAGE_KEY = 'tournament_menu_item_order';

// ============= Context =============

const PageVisibilityContext = createContext<PageVisibilityContextType | undefined>(undefined);

// ============= Provider Component =============

interface PageVisibilityProviderProps {
  children: ReactNode;
}

/**
 * PageVisibilityProvider
 * Wraps the app to provide page visibility state management
 */
export const PageVisibilityProvider = ({ children }: PageVisibilityProviderProps) => {
  // Initialize visibility settings from localStorage or defaults
  const [visibilitySettings, setVisibilitySettings] = useState<PageVisibilitySettings>(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      try {
        return JSON.parse(stored);
      } catch {
        // If parse fails, use defaults
      }
    }
    // Default: all enabled pages are visible
    const defaults: PageVisibilitySettings = {};
    menuConfig.forEach(item => {
      defaults[item.id] = item.enabled;
    });
    return defaults;
  });

  // Admin session state
  const [isAdmin, setIsAdmin] = useState<boolean>(() => {
    // Superadmin writes require the real password in this tab's sessionStorage.
    // Old localStorage-only sessions are intentionally ignored to avoid 401s.
    localStorage.removeItem(ADMIN_SESSION_KEY);
    return sessionStorage.getItem(ADMIN_SESSION_KEY) === 'true' && hasRememberedSuperAdminPassword();
  });

  // Page notes state
  const [pageNotes, setPageNotes] = useState<PageNotes>(() => {
    const stored = localStorage.getItem(NOTES_STORAGE_KEY);
    if (stored) {
      try {
        return JSON.parse(stored);
      } catch {
        // If parse fails, use empty object
      }
    }
    return {};
  });

  // Menu groups state
  const [menuGroups, setMenuGroupsState] = useState<MenuGroup[]>(() => {
    const stored = localStorage.getItem(GROUPS_STORAGE_KEY);
    if (stored) {
      try {
        return JSON.parse(stored);
      } catch {
        // If parse fails, use empty array
      }
    }
    return [];
  });

  // Page group assignments state
  const [pageGroupAssignments, setPageGroupAssignmentsState] = useState<PageGroupAssignments>(() => {
    const stored = localStorage.getItem(PAGE_GROUPS_STORAGE_KEY);
    if (stored) {
      try {
        return JSON.parse(stored);
      } catch {
        // If parse fails, use empty object
      }
    }
    return {};
  });

  // Admin layout preferences
  const [layoutPreferences, setLayoutPreferencesState] = useState<AdminLayoutPreferences>(() => {
    const stored = localStorage.getItem(LAYOUT_PREFS_STORAGE_KEY);
    if (stored) {
      try {
        return JSON.parse(stored);
      } catch {
        // If parse fails, use defaults
      }
    }
    return { layout: 'grid' as LayoutMode, columns: 3 as ColumnCount };
  });

  // Custom menu item order state
  const [menuItemOrder, setMenuItemOrderState] = useState<MenuItemOrder>(() => {
    const stored = localStorage.getItem(MENU_ORDER_STORAGE_KEY);
    if (stored) {
      try {
        return JSON.parse(stored);
      } catch {
        // If parse fails, use empty object
      }
    }
    return {};
  });

  /**
   * Contador que se incrementa cuando cambia el set de módulos apagados, para
   * forzar un re-render del menú y de las rutas protegidas.
   */
  const [, setModulesRevision] = useState(0);
  useEffect(() => subscribeModules(() => setModulesRevision((n) => n + 1)), []);

  /**
   * Multi-torneo: al cambiar el torneo activo (o al llegar su configuración
   * del servidor) hay que releer visibilidad, notas, grupos y orden, porque
   * cada torneo guarda los suyos.
   */
  useEffect(() => {
    const reload = () => {
      const read = <T,>(key: string, fallback: T): T => {
        const raw = localStorage.getItem(key);
        if (!raw) return fallback;
        try {
          return JSON.parse(raw) as T;
        } catch {
          return fallback;
        }
      };
      setVisibilitySettings((prev) => read(STORAGE_KEY, prev));
      setPageNotes((prev) => read(NOTES_STORAGE_KEY, prev));
      setMenuGroupsState((prev) => read(GROUPS_STORAGE_KEY, prev));
      setPageGroupAssignmentsState((prev) => read(PAGE_GROUPS_STORAGE_KEY, prev));
      setMenuItemOrderState((prev) => read(MENU_ORDER_STORAGE_KEY, prev));
    };
    const unsubscribe = subscribeConfigScope(reload);
    window.addEventListener('tournament-config-synced', reload);
    return () => {
      unsubscribe();
      window.removeEventListener('tournament-config-synced', reload);
    };
  }, []);


  // Persist visibility settings to localStorage
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(visibilitySettings));
  }, [visibilitySettings]);

  // Persist admin session only for this browser tab; password lives in sessionStorage too.
  useEffect(() => {
    localStorage.removeItem(ADMIN_SESSION_KEY);
    if (isAdmin && !hasRememberedSuperAdminPassword()) {
      sessionStorage.removeItem(ADMIN_SESSION_KEY);
      setIsAdmin(false);
      return;
    }
    sessionStorage.setItem(ADMIN_SESSION_KEY, isAdmin ? 'true' : 'false');
  }, [isAdmin]);

  // Persist page notes to localStorage
  useEffect(() => {
    localStorage.setItem(NOTES_STORAGE_KEY, JSON.stringify(pageNotes));
  }, [pageNotes]);

  // Persist menu groups to localStorage
  useEffect(() => {
    localStorage.setItem(GROUPS_STORAGE_KEY, JSON.stringify(menuGroups));
  }, [menuGroups]);

  // Persist page group assignments to localStorage
  useEffect(() => {
    localStorage.setItem(PAGE_GROUPS_STORAGE_KEY, JSON.stringify(pageGroupAssignments));
  }, [pageGroupAssignments]);

  // Persist layout preferences to localStorage
  useEffect(() => {
    localStorage.setItem(LAYOUT_PREFS_STORAGE_KEY, JSON.stringify(layoutPreferences));
  }, [layoutPreferences]);

  // Persist menu item order to localStorage
  useEffect(() => {
    localStorage.setItem(MENU_ORDER_STORAGE_KEY, JSON.stringify(menuItemOrder));
  }, [menuItemOrder]);

  /**
   * Set visibility for a specific page
   */
  const setPageVisibility = (pageId: string, visible: boolean) => {
    setVisibilitySettings(prev => ({
      ...prev,
      [pageId]: visible,
    }));
  };

  /**
   * Check if a page is visible
   * Falls back to the page's `enabled` default from menuConfig (NOT `true`),
   * so pages that ship disabled by default (e.g. HISTORIAL) stay hidden until
   * the admin turns the switch on for that tournament.
   * Un módulo apagado desde /setup oculta sus páginas para TODOS, incluido el
   * superadmin (el interruptor de módulos está por encima del de visibilidad).
   */
  const isPageVisible = (pageId: string): boolean => {
    if (isPageIdModuleDisabled(pageId)) return false;
    if (isAdmin) return true; // Admins see all pages
    if (pageId in visibilitySettings) return visibilitySettings[pageId];
    return menuConfig.find((m) => m.id === pageId)?.enabled ?? true;
  };

  /**
   * Login as admin with password
   */
  const loginAsAdmin = async (password: string): Promise<boolean> => {
    if (await validateSuperAdminPassword(password)) {
      setIsAdmin(true);
      return true;
    }
    return false;
  };

  /**
   * Logout admin session
   */
  const logoutAdmin = () => {
    setIsAdmin(false);
    sessionStorage.removeItem(ADMIN_SESSION_KEY);
    clearSuperAdminPassword();
  };

  /**
   * Get effective order for an item (custom override or default)
   */
  const getItemOrder = (item: MenuItem): number => {
    return menuItemOrder[item.id] ?? item.order;
  };

  /**
   * Get all menu items sorted by custom order (for admin dashboard)
   */
  const getAllMenuItems = (): MenuItem[] => {
    return [...menuConfig].sort((a, b) => getItemOrder(a) - getItemOrder(b));
  };

  /**
   * Get visible menu items sorted by custom order (for regular navigation)
   */
  const getVisibleMenuItems = (): MenuItem[] => {
    return menuConfig
      .filter(item => isPageVisible(item.id))
      .sort((a, b) => getItemOrder(a) - getItemOrder(b));
  };

  /**
   * Set note for a specific page
   */
  const setPageNote = (pageId: string, note: string) => {
    setPageNotes(prev => ({
      ...prev,
      [pageId]: note,
    }));
  };

  /**
   * Update menu groups
   */
  const setMenuGroups = (groups: MenuGroup[]) => {
    setMenuGroupsState(groups);
  };

  /**
   * Assign page to group
   */
  const setPageGroupAssignment = (pageId: string, groupId: string | null) => {
    setPageGroupAssignmentsState(prev => {
      if (groupId === null) {
        const { [pageId]: removed, ...rest } = prev;
        return rest;
      }
      return { ...prev, [pageId]: groupId };
    });
  };

  /**
   * Update layout preferences
   */
  const setLayoutPreferences = (prefs: AdminLayoutPreferences) => {
    setLayoutPreferencesState(prefs);
  };

  /**
   * Update menu item order overrides
   */
  const setMenuItemOrder = (order: MenuItemOrder) => {
    setMenuItemOrderState(order);
  };

  const value: PageVisibilityContextType = {
    visibilitySettings,
    setPageVisibility,
    isPageVisible,
    isAdmin,
    loginAsAdmin,
    logoutAdmin,
    getAllMenuItems,
    getVisibleMenuItems,
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
  };

  return (
    <PageVisibilityContext.Provider value={value}>
      {children}
    </PageVisibilityContext.Provider>
  );
};

// ============= Default Context Value =============

/** Default values when context is not available (fallback for safety) */
const defaultContextValue: PageVisibilityContextType = {
  visibilitySettings: {},
  setPageVisibility: () => {},
  isPageVisible: () => true,
  isAdmin: false,
  loginAsAdmin: async () => false,
  logoutAdmin: () => {},
  getAllMenuItems: () => [],
  getVisibleMenuItems: () => [],
  pageNotes: {},
  setPageNote: () => {},
  menuGroups: [],
  setMenuGroups: () => {},
  pageGroupAssignments: {},
  setPageGroupAssignment: () => {},
  layoutPreferences: { layout: 'grid', columns: 3 },
  setLayoutPreferences: () => {},
  menuItemOrder: {},
  setMenuItemOrder: () => {},
};

// ============= Hook =============

/**
 * usePageVisibility hook
 * Access page visibility context from any component
 * Returns default values if used outside provider (for resilience)
 */
export const usePageVisibility = (): PageVisibilityContextType => {
  const context = useContext(PageVisibilityContext);
  // Return default values if context is not available (safety fallback)
  if (context === undefined) {
    console.warn('usePageVisibility: Context not available, using defaults');
    return defaultContextValue;
  }
  return context;
};
