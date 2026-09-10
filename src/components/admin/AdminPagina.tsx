/**
 * AdminPagina Component
 * Container for the Admin → Página tab.
 *
 * Groups three sub-tabs:
 *   - Visibilidad → toggle pages on/off and assign per-page notes
 *   - Orden       → drag-and-drop ordering of menu items
 *   - Grupos      → manage menu groupings and page-to-group assignments
 *
 * This component is purely presentational/structural; each child sub-tab
 * owns its own state interactions with PageVisibilityContext + site_config.
 */

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Eye, GripVertical, FolderTree, MousePointerClick } from 'lucide-react';
import { cn } from '@/lib/utils';
import AdminLayoutSettings from './AdminLayoutSettings';
import AdminPageCard from './AdminPageCard';
import AdminMenuOrder from './AdminMenuOrder';
import AdminMenuGroups, { type MenuGroup } from './AdminMenuGroups';
import AdminHomeButtons from './AdminHomeButtons';
import type { MenuItem } from '@/data/mockData';
import type {
  PageVisibilitySettings,
  PageNotes,
  PageGroupAssignments,
  AdminLayoutPreferences,
  MenuItemOrder,
} from '@/contexts/PageVisibilityContext';

// ============= Props =============

interface AdminPaginaProps {
  /** All menu items registered in the app */
  menuItems: MenuItem[];
  /** Current page visibility map */
  visibilitySettings: PageVisibilitySettings;
  /** Notes attached to each page (admin-only) */
  pageNotes: PageNotes;
  /** Groups each page is assigned to */
  pageGroupAssignments: PageGroupAssignments;
  /** Defined menu groups */
  menuGroups: MenuGroup[];
  /** Layout preferences (grid/list + columns) for the visibility cards view */
  layoutPreferences: AdminLayoutPreferences;
  /** Custom drag-and-drop order for menu items */
  menuItemOrder: MenuItemOrder;
  /** Resolve a page's group display name (for badges on cards) */
  getGroupName: (pageId: string) => string | undefined;
  /** Build the responsive grid class based on layout preferences */
  getGridClass: () => string;

  /** Handlers — wired by the parent so they sync to the server */
  onSetVisibility: (pageId: string, visible: boolean) => void;
  onSetPageNote: (pageId: string, note: string) => void;
  onSetLayoutPreferences: (prefs: AdminLayoutPreferences) => void;
  onSetMenuOrder: (order: MenuItemOrder) => void;
  onSetMenuGroups: (groups: MenuGroup[]) => void;
  onSetPageGroupAssignment: (pageId: string, groupId: string | null) => void;
}

// ============= Component =============

/**
 * AdminPagina
 * Renders Visibilidad / Orden / Grupos as nested sub-tabs.
 */
const AdminPagina = ({
  menuItems,
  visibilitySettings,
  pageNotes,
  pageGroupAssignments,
  menuGroups,
  layoutPreferences,
  menuItemOrder,
  getGroupName,
  getGridClass,
  onSetVisibility,
  onSetPageNote,
  onSetLayoutPreferences,
  onSetMenuOrder,
  onSetMenuGroups,
  onSetPageGroupAssignment,
}: AdminPaginaProps) => {
  return (
    <Tabs defaultValue="visibility" className="space-y-4">
      <TabsList className="grid w-full grid-cols-4">
        <TabsTrigger value="visibility" className="gap-2">
          <Eye className="h-4 w-4" />
          <span className="hidden sm:inline">Visibilidad</span>
        </TabsTrigger>
        <TabsTrigger value="order" className="gap-2">
          <GripVertical className="h-4 w-4" />
          <span className="hidden sm:inline">Orden</span>
        </TabsTrigger>
        <TabsTrigger value="groups" className="gap-2">
          <FolderTree className="h-4 w-4" />
          <span className="hidden sm:inline">Grupos</span>
        </TabsTrigger>
        <TabsTrigger value="home" className="gap-2">
          <MousePointerClick className="h-4 w-4" />
          <span className="hidden sm:inline">Botones Home</span>
        </TabsTrigger>
      </TabsList>

      {/* ---------------- Visibilidad ---------------- */}
      <TabsContent value="visibility" className="space-y-4">
        <AdminLayoutSettings
          layout={layoutPreferences.layout}
          onLayoutChange={(layout) =>
            onSetLayoutPreferences({ ...layoutPreferences, layout })
          }
          columns={layoutPreferences.columns}
          onColumnsChange={(columns) =>
            onSetLayoutPreferences({ ...layoutPreferences, columns })
          }
        />

        <Card>
          <CardHeader>
            <CardTitle>Control de Visibilidad</CardTitle>
            <CardDescription>
              Activa/desactiva páginas y añade notas para cada una. Las páginas ocultas no
              aparecen en el menú.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div
              className={cn(
                layoutPreferences.layout === 'grid'
                  ? `grid ${getGridClass()} gap-4`
                  : 'space-y-3'
              )}
            >
              {/* Las páginas ocultas (en gris) se muestran al final de la lista. */}
              {[...menuItems]
                .sort((a, b) => {
                  const va = (visibilitySettings[a.id] ?? true) ? 0 : 1;
                  const vb = (visibilitySettings[b.id] ?? true) ? 0 : 1;
                  return va - vb;
                })
                .map((item) => (
                <AdminPageCard
                  key={item.id}
                  pageId={item.id}
                  label={item.label}
                  path={item.path}
                  isVisible={visibilitySettings[item.id] ?? true}
                  onToggle={(visible) => onSetVisibility(item.id, visible)}
                  note={pageNotes[item.id] || ''}
                  onNoteChange={(note) => onSetPageNote(item.id, note)}
                  layout={layoutPreferences.layout}
                  groupName={getGroupName(item.id)}
                />
              ))}
            </div>
          </CardContent>
        </Card>
      </TabsContent>

      {/* ---------------- Orden ---------------- */}
      <TabsContent value="order">
        <AdminMenuOrder
          menuItems={menuItems}
          visibilitySettings={visibilitySettings}
          menuItemOrder={menuItemOrder}
          onOrderChange={onSetMenuOrder}
          pageGroupAssignments={pageGroupAssignments}
          menuGroups={menuGroups}
          onGroupsChange={onSetMenuGroups}
          onPageGroupChange={onSetPageGroupAssignment}
        />
      </TabsContent>

      {/* ---------------- Grupos ---------------- */}
      <TabsContent value="groups">
        <AdminMenuGroups
          menuItems={menuItems}
          groups={menuGroups}
          onGroupsChange={onSetMenuGroups}
          pageGroupAssignments={pageGroupAssignments}
          onPageGroupChange={onSetPageGroupAssignment}
          pageVisibility={visibilitySettings}
        />
      </TabsContent>

      {/* ---------------- Botones Home ---------------- */}
      <TabsContent value="home">
        <AdminHomeButtons />
      </TabsContent>
    </Tabs>
  );
};

export default AdminPagina;