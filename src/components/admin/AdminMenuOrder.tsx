/**
 * AdminMenuOrder Component
 * Hierarchical drag-and-drop interface to reorder menu items in the navigation.
 *
 * Top-level rows can be either:
 *   - A standalone page (not assigned to any group), or
 *   - A group (rendered as a folder with its assigned pages nested inside).
 *
 * The admin can:
 *   - Reorder standalone pages and groups at the top level.
 *   - Reorder pages WITHIN a group.
 *   - Move a page from one group into another group.
 *   - Toggle a group's visibility (synced via onGroupsChange).
 *
 * NOTE: Adding/removing a page to/from a group via drag-and-drop is
 * intentionally disabled here because it conflicts with intra-group
 * reordering (the outer "top-level" droppable would steal drops from
 * pages being reordered inside a nested group). Use the
 * "Grupos del Menú" tab to assign pages to / unassign pages from groups.
 * To enforce this, the top-level Droppable uses type "row" while group
 * Droppables use type "page" — @hello-pangea/dnd only allows a draggable
 * to drop into a droppable of the same type.
 *
 * The hierarchical state is flattened into a per-page `menuItemOrder` map
 * (pageId → sequential order number) on every change, which keeps the
 * existing Header rendering logic (which positions groups at their first
 * child's order) fully compatible with no backend changes.
 *
 * Uses @hello-pangea/dnd for drag-and-drop functionality.
 */

import { useState, useEffect, useMemo } from 'react';
import {
  DragDropContext,
  Droppable,
  Draggable,
  type DropResult,
} from '@hello-pangea/dnd';
import {
  GripVertical,
  Eye,
  EyeOff,
  RotateCcw,
  FolderOpen,
  ChevronDown,
  ChevronRight,
  FileText,
  Trophy,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { MenuItem } from '@/data/mockData';
import type { MenuGroup } from './AdminMenuGroups';
import { useConfigScope } from '@/lib/configScope';
import { useSiteTorneos } from '@/hooks/useSiteTorneos';

// ============= Types =============

/**
 * A top-level row in the order UI. Either a standalone page or a group
 * containing an ordered list of pages.
 */
type TopLevelRow =
  | { kind: 'page'; pageId: string }
  | { kind: 'group'; groupId: string; pageIds: string[] };

interface AdminMenuOrderProps {
  /** All menu items */
  menuItems: MenuItem[];
  /** Current visibility settings */
  visibilitySettings: Record<string, boolean>;
  /** Custom order overrides (pageId → order number) */
  menuItemOrder: Record<string, number>;
  /** Callback when order changes */
  onOrderChange: (order: Record<string, number>) => void;
  /** Group assignments (pageId → groupId) — used to build hierarchy */
  pageGroupAssignments: Record<string, string>;
  /** Defined groups (with visibility flag) */
  menuGroups: MenuGroup[];
  /** Callback when groups change (e.g. visibility toggle) */
  onGroupsChange?: (groups: MenuGroup[]) => void;
  /** Callback when a page's group assignment changes via drag-and-drop */
  onPageGroupChange?: (pageId: string, groupId: string | null) => void;
}

// ============= Component =============

const AdminMenuOrder = ({
  menuItems,
  visibilitySettings,
  menuItemOrder,
  onOrderChange,
  pageGroupAssignments,
  menuGroups,
  onGroupsChange,
  onPageGroupChange,
}: AdminMenuOrderProps) => {
  const scope = useConfigScope();
  const { data: siteTorneos } = useSiteTorneos();
  const tournamentItems = useMemo<MenuItem[]>(
    () => scope === 'general'
      ? (siteTorneos?.torneos ?? [])
          .filter((torneo) => torneo.activo !== false)
          .map((torneo, index) => ({
            id: `torneo-${torneo.torneoid}`,
            label: torneo.nombre || `Torneo ${torneo.torneoid}`,
            path: `/${torneo.slug}`,
            order: Number(torneo.orden) > 0 ? Number(torneo.orden) : index + 1,
            enabled: true,
          }))
      : [],
    [scope, siteTorneos?.torneos],
  );
  const orderItems = useMemo(
    () => [...menuItems, ...tournamentItems],
    [menuItems, tournamentItems],
  );

  // --------- Lookup maps ---------
  const pagesById = useMemo(() => {
    const m = new Map<string, MenuItem>();
    orderItems.forEach((p) => m.set(p.id, p));
    return m;
  }, [orderItems]);

  /**
   * Build the hierarchical TopLevelRow[] from the current flat order +
   * group assignments. Groups are placed at the position of their
   * first-ordered member; pages inside a group are sorted among themselves
   * by their per-page order.
   */
  const buildHierarchy = (): TopLevelRow[] => {
    const sorted = [...orderItems].sort((a, b) => {
      const oa = menuItemOrder[a.id] ?? a.order;
      const ob = menuItemOrder[b.id] ?? b.order;
      return oa - ob;
    });

    const rows: TopLevelRow[] = [];
    const seenGroups = new Set<string>();
    const seenPages = new Set<string>();

    for (const item of sorted) {
      if (seenPages.has(item.id)) continue;
      const groupId = pageGroupAssignments[item.id];

      if (groupId) {
        if (seenGroups.has(groupId)) continue;
        // Collect ALL pages assigned to this group, sorted by their order
        const groupPages = sorted
          .filter((p) => pageGroupAssignments[p.id] === groupId)
          .map((p) => p.id);
        rows.push({ kind: 'group', groupId, pageIds: groupPages });
        seenGroups.add(groupId);
        groupPages.forEach((pid) => seenPages.add(pid));
      } else {
        rows.push({ kind: 'page', pageId: item.id });
        seenPages.add(item.id);
      }
    }

    // Append any defined groups that have no pages yet (so admin can still see them)
    for (const g of menuGroups) {
      if (!seenGroups.has(g.id)) {
        rows.push({ kind: 'group', groupId: g.id, pageIds: [] });
        seenGroups.add(g.id);
      }
    }

    return rows;
  };

  const [rows, setRows] = useState<TopLevelRow[]>(buildHierarchy);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(
    () => new Set(menuGroups.map((g) => g.id)),
  );

  /** Re-sync hierarchy when external state changes */
  useEffect(() => {
    setRows(buildHierarchy());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [menuItemOrder, orderItems, pageGroupAssignments, menuGroups]);

  /**
   * Flatten the hierarchical rows into a sequential per-page order map and
   * notify the parent. Pages inside a group get consecutive numbers, so the
   * Header's "group at first-child position" logic renders the desired layout.
   */
  const commitOrder = (next: TopLevelRow[]) => {
    const order: Record<string, number> = {};
    let counter = 1;
    for (const row of next) {
      if (row.kind === 'page') {
        order[row.pageId] = counter++;
      } else {
        for (const pid of row.pageIds) {
          order[pid] = counter++;
        }
      }
    }
    onOrderChange(order);
  };

  /** Toggle expand/collapse for a group row */
  const toggleGroupExpansion = (groupId: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(groupId)) next.delete(groupId);
      else next.add(groupId);
      return next;
    });
  };

  /** Toggle a group's `visible` flag and notify parent */
  const toggleGroupVisibility = (groupId: string) => {
    if (!onGroupsChange) return;
    onGroupsChange(
      menuGroups.map((g) =>
        g.id === groupId ? { ...g, visible: g.visible === false ? true : false } : g,
      ),
    );
  };

  /**
   * Handle drag end across the hierarchy.
   *
   * Droppable IDs:
   *   - "top-level"           → the top-level list (type "row")
   *   - "group:<groupId>"     → the page list inside a group (type "page")
   *
   * Draggable IDs:
   *   - "row:<index>"         → top-level row (page or group)
   *   - "page:<pageId>"       → a page inside a group
   *
   * Because top-level uses type "row" and group lists use type "page",
   * pages dragged inside a group cannot be accidentally dropped into the
   * top-level area — fixing the bug where intra-group reordering would
   * eject the page from its group.
   */
  const handleDragEnd = (result: DropResult) => {
    const { source, destination, draggableId } = result;
    if (!destination) return;

    const srcId = source.droppableId;
    const dstId = destination.droppableId;

    // -------- Case 1: Reorder within top-level --------
    if (srcId === 'top-level' && dstId === 'top-level') {
      const next = [...rows];
      const [moved] = next.splice(source.index, 1);
      next.splice(destination.index, 0, moved);
      setRows(next);
      commitOrder(next);
      return;
    }

    // -------- Case 2: Reorder within the same group --------
    if (srcId.startsWith('group:') && srcId === dstId) {
      const groupId = srcId.slice('group:'.length);
      const next = rows.map((r) => {
        if (r.kind === 'group' && r.groupId === groupId) {
          const ids = [...r.pageIds];
          const [moved] = ids.splice(source.index, 1);
          ids.splice(destination.index, 0, moved);
          return { ...r, pageIds: ids };
        }
        return r;
      });
      setRows(next);
      commitOrder(next);
      return;
    }

    // -------- Case 3: Move a page from one group to another --------
    // (Type isolation prevents cross-type drops, so cases for moving
    // in/out of groups via the top-level area are intentionally absent.)
    if (
      srcId.startsWith('group:') &&
      dstId.startsWith('group:') &&
      srcId !== dstId
    ) {
      const fromGroupId = srcId.slice('group:'.length);
      const toGroupId = dstId.slice('group:'.length);
      const pageId = draggableId.startsWith('page:')
        ? draggableId.slice('page:'.length)
        : null;
      if (!pageId) return;

      const next = rows.map((r) => {
        if (r.kind === 'group' && r.groupId === fromGroupId) {
          return { ...r, pageIds: r.pageIds.filter((id) => id !== pageId) };
        }
        if (r.kind === 'group' && r.groupId === toGroupId) {
          const ids = [...r.pageIds];
          ids.splice(destination.index, 0, pageId);
          return { ...r, pageIds: ids };
        }
        return r;
      });
      setRows(next);
      commitOrder(next);
      onPageGroupChange?.(pageId, toGroupId);
      setExpandedGroups((prev) => new Set(prev).add(toGroupId));
    }
  };

  /**
   * Reset to default order from menuConfig
   */
  const handleReset = () => {
    onOrderChange({});
  };

  // --------- Render helpers ---------

  /** Render a single page row (used both at top level and inside a group) */
  const renderPageRow = (pageId: string, isInsideGroup: boolean) => {
    const page = pagesById.get(pageId);
    if (!page) return null;
    const isVisible = visibilitySettings[pageId] ?? true;
    const isTournament = pageId.startsWith('torneo-');

    return (
      <div
        className={cn(
          'flex items-center gap-3 p-3 rounded-lg border transition-all',
          'bg-card hover:bg-accent/10',
          !isVisible && 'opacity-50',
          isInsideGroup && 'border-dashed',
        )}
      >
        {isTournament ? (
          <Trophy className="h-4 w-4 text-secondary shrink-0" />
        ) : (
          <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
        )}
        <span className="font-medium flex-1 truncate">{page.label}</span>
        {isTournament && <Badge variant="outline">Torneo</Badge>}
        {isVisible ? (
          <Eye className="h-4 w-4 text-primary" />
        ) : (
          <EyeOff className="h-4 w-4 text-muted-foreground" />
        )}
      </div>
    );
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <GripVertical className="h-5 w-5 text-primary" />
              Orden del Menú
            </CardTitle>
            <CardDescription>
              Arrastra torneos, grupos y páginas para reordenarlos. Dentro de un grupo, las
              páginas pueden reordenarse y moverse a otro grupo. Para añadir o quitar
              una página de un grupo, usa la pestaña "Grupos del Menú".
            </CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={handleReset} className="gap-1">
            <RotateCcw className="h-4 w-4" />
            Restablecer
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <DragDropContext onDragEnd={handleDragEnd}>
          <Droppable droppableId="top-level" type="row">
            {(provided, snapshot) => (
              <div
                ref={provided.innerRef}
                {...provided.droppableProps}
                className={cn(
                  'rounded-lg transition-colors p-1',
                  snapshot.isDraggingOver && 'bg-accent/30',
                )}
              >
                {rows.map((row, index) => {
                  // El identificador debe ser estable: si depende del índice,
                  // la librería pierde la referencia al reordenar y el bloque
                  // termina siempre al final o deja de responder.
                  const rowId =
                    row.kind === 'page' ? `row-page:${row.pageId}` : `row-group:${row.groupId}`;
                  return (
                  <Draggable
                    key={rowId}
                    draggableId={rowId}
                    index={index}
                  >
                    {(dragProvided, dragSnapshot) => (
                      <div
                        ref={dragProvided.innerRef}
                        {...dragProvided.draggableProps}
                        className={cn(
                          'rounded-lg transition-shadow mb-2',
                          dragSnapshot.isDragging && 'shadow-lg ring-2 ring-primary/30',
                        )}
                      >
                        {row.kind === 'page' ? (
                          // -------- Standalone page row --------
                          <div className="flex items-center gap-2">
                            <div
                              {...dragProvided.dragHandleProps}
                              className="cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground p-2"
                            >
                              <GripVertical className="h-5 w-5" />
                            </div>
                            <div className="flex-1">{renderPageRow(row.pageId, false)}</div>
                          </div>
                        ) : (
                          // -------- Group row (with nested droppable) --------
                          <GroupRow
                            row={row}
                            group={menuGroups.find((g) => g.id === row.groupId)}
                            isExpanded={expandedGroups.has(row.groupId)}
                            onToggleExpand={() => toggleGroupExpansion(row.groupId)}
                            onToggleVisibility={() => toggleGroupVisibility(row.groupId)}
                            dragHandleProps={dragProvided.dragHandleProps}
                            renderPageRow={renderPageRow}
                          />
                        )}
                      </div>
                    )}
                  </Draggable>
                  );
                })}
                {provided.placeholder}
              </div>
            )}
          </Droppable>
        </DragDropContext>

        {rows.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-6">
            No hay páginas ni grupos para ordenar.
          </p>
        )}
      </CardContent>
    </Card>
  );
};

export default AdminMenuOrder;

// ============= GroupRow Subcomponent =============

interface GroupRowProps {
  row: Extract<TopLevelRow, { kind: 'group' }>;
  group: MenuGroup | undefined;
  isExpanded: boolean;
  onToggleExpand: () => void;
  onToggleVisibility: () => void;
  dragHandleProps: any;
  renderPageRow: (pageId: string, isInsideGroup: boolean) => React.ReactNode;
}

/**
 * GroupRow
 * Renders a group as a top-level row containing a header (drag handle,
 * expand toggle, visibility toggle, name, page count) and an inner
 * Droppable list of its assigned pages when expanded.
 */
const GroupRow = ({
  row,
  group,
  isExpanded,
  onToggleExpand,
  onToggleVisibility,
  dragHandleProps,
  renderPageRow,
}: GroupRowProps) => {
  const isVisible = group?.visible !== false;

  return (
    <div
      className={cn(
        'rounded-lg border bg-card overflow-hidden',
        !isVisible && 'opacity-60',
      )}
    >
      {/* Group header */}
      <div className="flex items-center gap-2 p-3 bg-muted/40">
        <div
          {...dragHandleProps}
          className="cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground"
        >
          <GripVertical className="h-5 w-5" />
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={onToggleExpand}
          title={isExpanded ? 'Colapsar' : 'Expandir'}
        >
          {isExpanded ? (
            <ChevronDown className="h-4 w-4" />
          ) : (
            <ChevronRight className="h-4 w-4" />
          )}
        </Button>
        <FolderOpen className="h-4 w-4 text-primary shrink-0" />
        <span className="font-semibold flex-1 truncate">
          {group?.name ?? 'Grupo sin nombre'}
        </span>
        <Badge variant="secondary" className="text-xs">
          {row.pageIds.length} {row.pageIds.length === 1 ? 'página' : 'páginas'}
        </Badge>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={onToggleVisibility}
          title={isVisible ? 'Ocultar grupo' : 'Mostrar grupo'}
        >
          {isVisible ? (
            <Eye className="h-4 w-4 text-primary" />
          ) : (
            <EyeOff className="h-4 w-4 text-muted-foreground" />
          )}
        </Button>
      </div>

      {/* Nested droppable for pages inside the group */}
      {isExpanded && (
        <Droppable droppableId={`group:${row.groupId}`} type="page">
          {(provided, snapshot) => (
            <div
              ref={provided.innerRef}
              {...provided.droppableProps}
              className={cn(
                'p-2 pl-8 min-h-[44px] transition-colors',
                snapshot.isDraggingOver && 'bg-accent/20',
              )}
            >
              {row.pageIds.length === 0 && !snapshot.isDraggingOver && (
                <p className="text-xs text-muted-foreground italic py-2 px-2">
                  Asigna páginas a este grupo desde la pestaña "Grupos del Menú".
                </p>
              )}
              {row.pageIds.map((pageId, idx) => (
                <Draggable
                  key={pageId}
                  draggableId={`page:${pageId}`}
                  index={idx}
                >
                  {(dragProvided, dragSnapshot) => (
                    <div
                      ref={dragProvided.innerRef}
                      {...dragProvided.draggableProps}
                      className={cn(
                        'flex items-center gap-2 rounded-lg mb-1',
                        dragSnapshot.isDragging && 'shadow-md ring-2 ring-primary/30',
                      )}
                    >
                      <div
                        {...dragProvided.dragHandleProps}
                        className="cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground p-2"
                      >
                        <GripVertical className="h-4 w-4" />
                      </div>
                      <div className="flex-1">{renderPageRow(pageId, true)}</div>
                    </div>
                  )}
                </Draggable>
              ))}
              {provided.placeholder}
            </div>
          )}
        </Droppable>
      )}
    </div>
  );
};
