/**
 * AdminSponsors Component
 * Container for the Patrocinadores admin tab.
 * Hosts three sub-tabs:
 *   - Preview  → grid columns + live sponsor preview
 *   - Ribbon   → per-page visibility of the scrolling sponsor ribbon
 *   - Carrusel → upcoming carousel configuration (placeholder)
 *
 * All settings are persisted server-side under `site_config.sponsors_config`.
 */

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Image as ImageIcon, Eye, GalleryHorizontal } from 'lucide-react';
import AdminSponsorsPreview from './sponsors/AdminSponsorsPreview';
import AdminSponsorsRibbon from './sponsors/AdminSponsorsRibbon';
import AdminSponsorsCarousel from './sponsors/AdminSponsorsCarousel';
import AdminInheritControl from './AdminInheritControl';

/**
 * AdminSponsors
 * Renders the three sponsor sub-tabs inside the Admin → Patrocinadores section.
 */
const AdminSponsors = () => {
  return (
    <Tabs defaultValue="preview" className="space-y-4">
      {/* Herencia desde el alcance General (multi-torneo). */}
      <AdminInheritControl section="sponsors" />
      <TabsList className="grid w-full grid-cols-3">
        <TabsTrigger value="preview" className="gap-2">
          <ImageIcon className="h-4 w-4" />
          <span className="hidden sm:inline">Preview</span>
        </TabsTrigger>
        <TabsTrigger value="ribbon" className="gap-2">
          <Eye className="h-4 w-4" />
          <span className="hidden sm:inline">Ribbon</span>
        </TabsTrigger>
        <TabsTrigger value="carrusel" className="gap-2">
          <GalleryHorizontal className="h-4 w-4" />
          <span className="hidden sm:inline">Carrusel</span>
        </TabsTrigger>
      </TabsList>

      <TabsContent value="preview">
        <AdminSponsorsPreview />
      </TabsContent>
      <TabsContent value="ribbon">
        <AdminSponsorsRibbon />
      </TabsContent>
      <TabsContent value="carrusel">
        <AdminSponsorsCarousel />
      </TabsContent>
    </Tabs>
  );
};

export default AdminSponsors;
