/**
 * Header Component
 * Main navigation header with responsive mobile menu
 * Supports grouped navigation with dropdown menus
 * Implements dynamic overflow detection: when menu items exceed
 * available space, excess items are collapsed into the hamburger menu
 * Respects page visibility settings from admin context.
 *
 * Admin preview mode:
 *   When the current user is admin, the header reflects the EXACT order
 *   and visibility configured in /admin → Página → Orden / Visibilidad.
 *   Hidden pages and hidden groups remain navigable but are rendered with
 *   a dimmed style and an "EyeOff" icon, so the admin can preview the
 *   real menu structure without losing access to hidden routes.
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Menu, X, Shield, ChevronDown, MoreHorizontal, EyeOff } from 'lucide-react';
import { useTournamentInfo } from '@/hooks/useTournamentData';
import { usePageVisibility } from '@/contexts/PageVisibilityContext';
import { cn } from '@/lib/utils';
import { useSiteTorneos } from '@/hooks/useSiteTorneos';
import { useSiteConfig } from '@/hooks/useSiteConfig';
import { buildMultiTorneoNav } from '@/lib/multiTorneoNav';

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import type { MenuItem } from '@/data/mockData';
import {
  NavigationMenu,
  NavigationMenuContent,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
  NavigationMenuTrigger,
} from '@/components/ui/navigation-menu';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';

// ============= Types =============

/** Navigation item that can be a single link or a group with children */
interface NavItem {
  type: 'link' | 'group';
  id: string;
  label: string;
  path?: string;
  /** Children of a group; each child carries a per-page hidden flag for admin preview */
  children?: (MenuItem & { hidden?: boolean })[];
  /** Whether to wrap text (display words stacked) */
  wrapText?: boolean;
  /**
   * Admin-only flag. True when this item (page or group) is configured as
   * hidden in the admin panel but is still rendered because the user is
   * admin (preview mode). Triggers dimmed styling.
   */
  hidden?: boolean;
}

// ============= Hook: useOverflowMenu =============

/**
 * Custom hook that measures nav items and determines how many fit in the
 * available horizontal space.
 *
 * Strategy:
 *   1. We render an INVISIBLE measurement copy of every nav item using the
 *      EXACT same markup the visible nav uses (so groups include their
 *      chevron, hidden icons are accounted for, etc.). Each measurement
 *      element carries `data-nav-item`.
 *   2. On every relevant change we recompute available width:
 *        availableWidth = headerInnerWidth - logoWidth - rightReservedWidth
 *      where `rightReservedWidth` is the live-measured admin badge (or 0)
 *      plus a small safety gap (just enough to not visually overlap).
 *   3. We greedily fit items left → right. The overflow "..." button is
 *      only reserved AFTER we know at least one item is being dropped,
 *      avoiding the agressive early-cutoff that previously left a lot of
 *      empty space on the right.
 *
 * Returns the number of items that fit (split index for visible vs overflow).
 */
const useOverflowMenu = (
  navRef: React.RefObject<HTMLDivElement>,
  logoRef: React.RefObject<HTMLDivElement>,
  rightSlotRef: React.RefObject<HTMLDivElement>,
  itemCount: number,
) => {
  const [visibleCount, setVisibleCount] = useState(itemCount);

  /** Approximate width of the "..." overflow trigger (icon + chevron + padding) */
  const OVERFLOW_BTN_WIDTH = 56;
  /** Tiny safety gap so the rightmost item never visually touches the next slot */
  const SAFETY_GAP = 8;

  const measure = useCallback(() => {
    const nav = navRef.current;
    const logo = logoRef.current;
    if (!nav || !logo) return;

    // Use the header's full inner width (the .container > .flex parent)
    const headerInner =
      nav.closest<HTMLElement>('.container')?.clientWidth ??
      nav.parentElement?.clientWidth ??
      window.innerWidth;

    const logoWidth = logo.offsetWidth;
    const rightReserved = rightSlotRef.current?.offsetWidth ?? 0;

    // Space the nav can actually consume before overlapping logo on the left
    // or the admin/right slot on the right.
    const availableWidth = headerInner - logoWidth - rightReserved - SAFETY_GAP;

    const items = Array.from(
      nav.querySelectorAll<HTMLElement>('[data-nav-item]'),
    );
    const widths = items.map((el) => el.offsetWidth + 4); // +4 = gap-1 between items
    const total = widths.reduce((a, b) => a + b, 0);

    // If everything fits, no overflow button needed → render all items.
    if (total <= availableWidth) {
      setVisibleCount(items.length);
      return;
    }

    // Otherwise, fit as many as possible while reserving room for "..."
    const budget = availableWidth - OVERFLOW_BTN_WIDTH;
    let used = 0;
    let fit = 0;
    for (let i = 0; i < widths.length; i++) {
      if (used + widths[i] <= budget) {
        used += widths[i];
        fit++;
      } else {
        break;
      }
    }
    // Always show at least 1 item so the bar isn't empty on tiny widths
    setVisibleCount(Math.max(1, fit));
  }, [navRef, logoRef, rightSlotRef]);

  useEffect(() => {
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [measure]);

  // Re-measure when item count or label content changes
  useEffect(() => {
    const t = setTimeout(measure, 50);
    return () => clearTimeout(t);
  }, [itemCount, measure]);

  // Observe the measurement container for any size change (e.g. async logo load)
  useEffect(() => {
    if (!navRef.current) return;
    const ro = new ResizeObserver(() => measure());
    ro.observe(navRef.current);
    if (logoRef.current) ro.observe(logoRef.current);
    if (rightSlotRef.current) ro.observe(rightSlotRef.current);
    return () => ro.disconnect();
  }, [navRef, logoRef, rightSlotRef, measure]);

  return visibleCount;
};

// ============= Component =============

const Header = () => {
  const { data: tournamentInfo } = useTournamentInfo();
  /** Logo del encabezado: siempre el de la tabla de torneos (`logo_header`). */
  const headerLogoUrl = tournamentInfo?.logoHeaderUrl || tournamentInfo?.logoUrl || '';
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [openMobileGroup, setOpenMobileGroup] = useState<string | null>(null);
  const location = useLocation();
  const headerRef = useRef<HTMLElement>(null);
  const navRef = useRef<HTMLDivElement>(null);
  const logoRef = useRef<HTMLDivElement>(null);
  /** Tracks the right-side reserved slot (Admin link/badge), if any */
  const rightSlotRef = useRef<HTMLDivElement>(null);

  /** Expose the sticky header height so downstream sticky elements can offset by it. */
  useEffect(() => {
    const header = headerRef.current;
    if (!header) return;
    const update = () => {
      document.documentElement.style.setProperty(
        '--header-height',
        `${header.getBoundingClientRect().height}px`,
      );
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(header);
    window.addEventListener('resize', update);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', update);
    };
  }, []);
  
  // Get visible menu items and groups from context
  const { 
    getVisibleMenuItems, 
    getAllMenuItems,
    isAdmin, 
    menuGroups, 
    pageGroupAssignments,
    isPageVisible,
    visibilitySettings,
  } = usePageVisibility();
  /**
   * In admin preview mode we want the header to mirror the configured
   * order/visibility exactly — including hidden items (rendered dimmed).
   * For regular users we keep the legacy behavior: only visible items.
   */
  const sourceItems = isAdmin ? getAllMenuItems() : getVisibleMenuItems();

  /** Per-page hidden flag (admin preview only) */
  const isPageHiddenForAdmin = (pageId: string): boolean => {
    if (!isAdmin) return false;
    return visibilitySettings[pageId] === false;
  };

  /**
   * Build navigation structure with groups and standalone items
   * Groups appear where their first page would be in the menu order
   */
  const buildNavItems = (): NavItem[] => {
    const navItems: NavItem[] = [];
    const processedPages = new Set<string>();
    const processedGroups = new Set<string>();

    /*
     * IMPORTANT: do NOT re-sort by `item.order` here.
     *
     * `sourceItems` already comes from the context (`getAllMenuItems` /
     * `getVisibleMenuItems`), which applies the admin's custom
     * `menuItemOrder` overrides on top of the default order. The MenuItem
     * objects themselves still carry their ORIGINAL `.order` value from
     * `menuConfig`, so re-sorting by `.order` would discard the admin's
     * custom drag-and-drop order and revert to the static defaults.
     *
     * Trusting the array order keeps groups positioned at the slot of
     * their first ordered child page, exactly like the admin sees it.
     */
    const sortedItems = sourceItems;

    for (const item of sortedItems) {
      if (processedPages.has(item.id)) continue;

      const groupId = pageGroupAssignments[item.id];
      
      if (groupId && !processedGroups.has(groupId)) {
        const group = menuGroups.find(g => g.id === groupId);

        // In admin mode: include groups even if hidden (dimmed). For users:
        // skip groups marked invisible.
        const groupIsHidden = !group || group.visible === false;
        const includeGroup = isAdmin || !groupIsHidden;

        if (group && includeGroup) {
          // Pages in this group. In admin preview, include hidden pages too
          // (annotated with `hidden: true`); for users, filter them out.
          const groupPages = sortedItems
            .filter((p) => pageGroupAssignments[p.id] === groupId)
            .filter((p) => isAdmin || isPageVisible(p.id))
            .map((p) => ({ ...p, hidden: isPageHiddenForAdmin(p.id) }));

          if (groupPages.length > 0) {
            navItems.push({
              type: 'group',
              id: groupId,
              label: group.name,
              children: groupPages,
              wrapText: group.wrapText,
              hidden: isAdmin && groupIsHidden,
            });
            groupPages.forEach((p) => processedPages.add(p.id));
          }
        }
        processedGroups.add(groupId);
      } else if (!groupId) {
        navItems.push({
          type: 'link',
          id: item.id,
          label: item.label,
          path: item.path,
          hidden: isPageHiddenForAdmin(item.id),
        });
        processedPages.add(item.id);
      }
    }

    return navItems;
  };

  /**
   * Multi-torneo: si el dominio tiene torneos dados de alta, la barra muestra
   * un desplegable por torneo (con sus páginas propias) más los enlaces
   * compartidos. Si no hay torneos, se conserva el menú de siempre.
   */
  // Con un solo torneo (o ninguno) el sitio funciona como siempre: menú plano
  // del torneo configurado, sin desplegables por torneo.
  const { data: multiTorneo } = useSiteTorneos();
  const hasTorneos = (multiTorneo?.torneos?.length ?? 0) > 1;
  const navItems: NavItem[] = hasTorneos
    ? (buildMultiTorneoNav(multiTorneo!.torneos, multiTorneo!.configs) as NavItem[])
    : buildNavItems();


  // Overflow detection: determine how many items fit in the header
  const visibleCount = useOverflowMenu(navRef, logoRef, rightSlotRef, navItems.length);
  const visibleNavItems = navItems.slice(0, visibleCount);
  const overflowNavItems = navItems.slice(visibleCount);

  /** Check if any child route in a group is active */
  const isGroupActive = (children: MenuItem[]): boolean => {
    return children.some(child => location.pathname === child.path);
  };

  /** Render a single desktop nav item (link or group trigger) */
  const renderDesktopNavItem = (item: NavItem) => {
    if (item.type === 'link') {
      return (
        <Link
          to={item.path!}
          className={cn(
            "nav-link text-foreground/80 hover:text-primary px-3 py-2 text-sm whitespace-nowrap",
            location.pathname === item.path && "text-primary active",
            // Admin preview: dim hidden pages
            item.hidden && "opacity-50 italic",
          )}
          title={item.hidden ? 'Página oculta (visible solo para admin)' : undefined}
        >
          <span className="inline-flex items-center gap-1">
            {item.label}
            {item.hidden && <EyeOff className="h-3 w-3" />}
          </span>
        </Link>
      );
    }
    return (
      <>
        <NavigationMenuTrigger
          className={cn(
            "bg-transparent hover:bg-transparent data-[state=open]:bg-transparent",
            "text-foreground/80 hover:text-primary data-[state=open]:text-primary text-sm",
            isGroupActive(item.children!) && "text-primary",
            item.wrapText && "flex-col leading-tight text-center h-auto py-1 min-h-[40px]",
            // Admin preview: dim hidden groups
            item.hidden && "opacity-50 italic",
          )}
          title={item.hidden ? 'Grupo oculto (visible solo para admin)' : undefined}
        >
          {item.wrapText ? (
            <span className="flex flex-col items-center text-xs">
              {item.label.split(' ').map((word, i) => (
                <span key={i}>{word}</span>
              ))}
              {item.hidden && <EyeOff className="h-3 w-3 mt-0.5" />}
            </span>
          ) : (
            <span className="inline-flex items-center gap-1">
              {item.label}
              {item.hidden && <EyeOff className="h-3 w-3" />}
            </span>
          )}
        </NavigationMenuTrigger>
        <NavigationMenuContent>
          <ul className="grid w-[200px] gap-1 p-2">
            {item.children!.map((child) => (
              <li key={child.id}>
                <NavigationMenuLink asChild>
                  <Link
                    to={child.path}
                    className={cn(
                      "block select-none rounded-md px-3 py-2 text-sm leading-none no-underline outline-none transition-colors",
                      "hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground",
                      location.pathname === child.path && "bg-accent text-accent-foreground",
                      child.hidden && "opacity-50 italic",
                    )}
                    title={child.hidden ? 'Página oculta (visible solo para admin)' : undefined}
                  >
                    <span className="inline-flex items-center gap-1">
                      {child.label}
                      {child.hidden && <EyeOff className="h-3 w-3" />}
                    </span>
                  </Link>
                </NavigationMenuLink>
              </li>
            ))}
          </ul>
        </NavigationMenuContent>
      </>
    );
  };

  /** Render a mobile nav item (link or collapsible group) */
  const renderMobileNavItem = (item: NavItem) => {
    if (item.type === 'link') {
      return (
        <Link
          key={item.id}
          to={item.path!}
          onClick={() => setIsMenuOpen(false)}
          className={cn(
            "px-4 py-3 text-sm font-medium rounded-lg transition-colors",
            location.pathname === item.path
              ? "bg-primary text-primary-foreground"
              : "text-foreground/80 hover:bg-muted",
            item.hidden && "opacity-50 italic",
          )}
        >
          <span className="inline-flex items-center gap-2">
            {item.label}
            {item.hidden && <EyeOff className="h-3.5 w-3.5" />}
          </span>
        </Link>
      );
    }
    return (
      <Collapsible
        key={item.id}
        open={openMobileGroup === item.id}
        onOpenChange={(open) => setOpenMobileGroup(open ? item.id : null)}
      >
        <CollapsibleTrigger asChild>
          <button
            className={cn(
              "w-full flex items-center justify-between px-4 py-3 text-sm font-medium rounded-lg transition-colors",
              isGroupActive(item.children!)
                ? "bg-primary/10 text-primary"
                : "text-foreground/80 hover:bg-muted",
              item.hidden && "opacity-50 italic",
            )}
          >
            <span className="inline-flex items-center gap-2">
              {item.label}
              {item.hidden && <EyeOff className="h-3.5 w-3.5" />}
            </span>
            <ChevronDown className={cn(
              "h-4 w-4 transition-transform",
              openMobileGroup === item.id && "rotate-180"
            )} />
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="ml-4 mt-1 flex flex-col gap-1 border-l-2 border-border pl-4">
            {item.children!.map((child) => (
              <Link
                key={child.id}
                to={child.path}
                onClick={() => setIsMenuOpen(false)}
                className={cn(
                  "px-3 py-2 text-sm rounded-lg transition-colors",
                  location.pathname === child.path
                    ? "bg-primary text-primary-foreground"
                    : "text-foreground/70 hover:bg-muted",
                  child.hidden && "opacity-50 italic",
                )}
              >
                <span className="inline-flex items-center gap-2">
                  {child.label}
                  {child.hidden && <EyeOff className="h-3 w-3" />}
                </span>
              </Link>
            ))}
          </div>
        </CollapsibleContent>
      </Collapsible>
    );
  };

  return (
    <header ref={headerRef} className="sticky top-0 z-50 w-full bg-white/95 backdrop-blur-md border-b border-border">
      <div className="container mx-auto">
        {/*
          Header row height.
          Mobile uses content-driven vertical space so the ribbon expands with
          the actual rendered logo size, not with an empty square box.
          Desktop stays at the original compact height.
        */}
        {/*
          Mobile: content-driven height for the enlarged mobile logo.
          Desktop: ribbon now uses min-h so it grows with the larger desktop
          logo instead of clipping it inside the previous fixed h-20 (80px).
        */}
        {/* Mobile min-h reduced ~5% (7rem → 6.65rem) to match smaller logo. */}
        <div className="flex items-center justify-between min-h-[6.65rem] md:min-h-[6.5rem] py-3 md:py-2">
          {/* Logo */}
          <div ref={logoRef} className="flex-shrink-0 overflow-visible">
            <Link to="/" className="flex items-center gap-3 overflow-visible">
              {headerLogoUrl ? (
                <img 
                  src={headerLogoUrl} 
                  alt={tournamentInfo?.name || 'Logo'}
                  // Mobile logo: larger visible height, auto width, and a
                  // slight scale boost so logos with transparent padding still
                  // look materially bigger inside the ribbon.
                  // Desktop logo: original 96px square sizing is preserved.
                  // Mobile: keeps the previously tuned size.
                  // Desktop: enlarged to h-[5.5rem] with auto width so the
                  // wide lockup (icon + wordmark) renders at its real aspect
                  // ratio and visually fills the ribbon.
                  // Mobile logo height set to 4rem (h-16) per user request.
                  // Desktop: enlarged to h-[5.5rem] with auto width so the
                  // wide lockup (icon + wordmark) renders at its real aspect
                  // ratio and visually fills the ribbon.
                  className="block h-[5rem] w-auto max-w-[13.3rem] origin-left scale-100 object-contain object-left md:h-[5.5rem] md:w-auto md:max-w-[16rem] md:scale-100 rounded-lg"
                />
              ) : (
                <div className="w-12 h-12 md:w-14 md:h-14 rounded-lg gradient-hero flex items-center justify-center text-primary-foreground font-display font-bold text-xl">
                  {tournamentInfo?.id || ''}
                </div>
              )}
            </Link>
          </div>

          {/* Desktop Navigation with overflow detection */}
          <div className="hidden lg:flex items-center gap-1 flex-1 justify-end min-w-0">
            {/*
              Invisible measurement container.
              Renders each nav item with the SAME shape it has when visible,
              so widths are accurate:
                - Links: same px-3 py-2 text-sm.
                - Groups: same trigger padding + ChevronDown icon (added by
                  NavigationMenuTrigger). We approximate it here with the
                  same paddings + a chevron-sized spacer so the measurement
                  matches the real <NavigationMenuTrigger> rendering.
                - Hidden items include the EyeOff icon spacer.
            */}
            <div
              ref={navRef}
              className="absolute opacity-0 pointer-events-none flex items-center gap-1"
              aria-hidden="true"
            >
              {navItems.map((item) => (
                <div
                  key={item.id}
                  data-nav-item
                  className="inline-flex items-center gap-1 px-4 py-2 text-sm font-medium whitespace-nowrap"
                >
                  {item.label}
                  {item.hidden && <EyeOff className="h-3 w-3" />}
                  {item.type === 'group' && <ChevronDown className="h-4 w-4" />}
                </div>
              ))}
            </div>

            {/* Visible navigation items */}
            <NavigationMenu>
              <NavigationMenuList>
                {visibleNavItems.map((item) => (
                  <NavigationMenuItem key={item.id}>
                    {renderDesktopNavItem(item)}
                  </NavigationMenuItem>
                ))}

                {/* Overflow dropdown - shows excess items */}
                {overflowNavItems.length > 0 && (
                  <NavigationMenuItem>
                    <NavigationMenuTrigger
                      className="bg-transparent hover:bg-transparent data-[state=open]:bg-transparent text-foreground/80 hover:text-primary data-[state=open]:text-primary"
                    >
                      <MoreHorizontal className="h-5 w-5" />
                    </NavigationMenuTrigger>
                    <NavigationMenuContent>
                      <ul className="grid w-[220px] gap-1 p-2">
                        {overflowNavItems.map((item) => (
                          item.type === 'link' ? (
                            <li key={item.id}>
                              <NavigationMenuLink asChild>
                                <Link
                                  to={item.path!}
                                  className={cn(
                                    "block select-none rounded-md px-3 py-2 text-sm leading-none no-underline outline-none transition-colors",
                                    "hover:bg-accent hover:text-accent-foreground",
                                    location.pathname === item.path && "bg-accent text-accent-foreground",
                                    item.hidden && "opacity-50 italic",
                                  )}
                                >
                                  <span className="inline-flex items-center gap-1">
                                    {item.label}
                                    {item.hidden && <EyeOff className="h-3 w-3" />}
                                  </span>
                                </Link>
                              </NavigationMenuLink>
                            </li>
                          ) : (
                            <li key={item.id} className="space-y-1">
                              <span className={cn(
                                "block px-3 py-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider inline-flex items-center gap-1",
                                item.hidden && "opacity-50 italic",
                              )}>
                                {item.label}
                                {item.hidden && <EyeOff className="h-3 w-3" />}
                              </span>
                              {item.children!.map((child) => (
                                <NavigationMenuLink key={child.id} asChild>
                                  <Link
                                    to={child.path}
                                    className={cn(
                                      "block select-none rounded-md px-3 py-2 text-sm leading-none no-underline outline-none transition-colors pl-5",
                                      "hover:bg-accent hover:text-accent-foreground",
                                      location.pathname === child.path && "bg-accent text-accent-foreground",
                                      child.hidden && "opacity-50 italic",
                                    )}
                                  >
                                    <span className="inline-flex items-center gap-1">
                                      {child.label}
                                      {child.hidden && <EyeOff className="h-3 w-3" />}
                                    </span>
                                  </Link>
                                </NavigationMenuLink>
                              ))}
                            </li>
                          )
                        ))}
                      </ul>
                    </NavigationMenuContent>
                  </NavigationMenuItem>
                )}

                {/* Admin indicator and link */}
                {isAdmin && (
                  <NavigationMenuItem>
                    <div ref={rightSlotRef}>
                      <Link
                        to="/admin"
                        className={cn(
                          "nav-link flex items-center gap-1 px-3 py-2 text-sm",
                          location.pathname === '/admin'
                            ? "text-primary"
                            : "text-foreground/80 hover:text-primary"
                        )}
                      >
                        <Shield className="h-4 w-4" />
                        <span>Admin</span>
                      </Link>
                    </div>
                  </NavigationMenuItem>
                )}
              </NavigationMenuList>
            </NavigationMenu>
          </div>

          {/* Mobile Menu Button */}
          <div className="flex items-center gap-2 lg:hidden">
            {isAdmin && (
              <Badge variant="outline" className="gap-1">
                <Shield className="h-3 w-3" />
                Admin
              </Badge>
            )}
            <Button
              variant="ghost"
              size="icon"
              className="!h-14 !w-14"
              onClick={() => setIsMenuOpen(!isMenuOpen)}
            >
              {isMenuOpen ? (
                <X className="!h-9 !w-9" strokeWidth={2.5} />
              ) : (
                /* Custom hamburger icon with tighter bar spacing */
                <svg className="!h-9 !w-9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round">
                  <line x1="4" y1="7" x2="20" y2="7" />
                  <line x1="4" y1="12" x2="20" y2="12" />
                  <line x1="4" y1="17" x2="20" y2="17" />
                </svg>
              )}
            </Button>
          </div>
        </div>

        {/* Mobile Navigation - includes ALL items + overflow items */}
        {isMenuOpen && (
          <nav className="lg:hidden py-4 border-t border-border animate-fade-in">
            <div className="flex flex-col gap-1">
              {navItems.map((item) => renderMobileNavItem(item))}
              {/* Admin link in mobile menu */}
              {isAdmin && (
                <Link
                  to="/admin"
                  onClick={() => setIsMenuOpen(false)}
                  className={cn(
                    "px-4 py-3 text-sm font-medium rounded-lg transition-colors flex items-center gap-2",
                    location.pathname === '/admin'
                      ? "bg-primary text-primary-foreground"
                      : "text-foreground/80 hover:bg-muted"
                  )}
                >
                  <Shield className="h-4 w-4" />
                  Panel de Admin
                </Link>
              )}
            </div>
          </nav>
        )}
      </div>
    </header>
  );
};

export default Header;
