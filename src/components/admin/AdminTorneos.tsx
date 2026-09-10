/**
 * AdminTorneos
 * Alta y edición de los torneos que conviven en este sitio.
 *
 * Cada torneo tiene:
 *   - su número de torneo (torneoid) en la base de datos,
 *   - el nombre que se ve en la barra superior,
 *   - un nombre corto para la dirección: /experience/resultados,
 *   - un orden y un interruptor de publicado.
 *
 * Con la lista vacía o con un solo torneo, el sitio se comporta como siempre.
 */

import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { ArrowDown, ArrowUp, Plus, Save, Trash2 } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { getSuperAdminPassword } from '@/lib/superAdminAuth';
import { useSiteTorneos, useSaveSiteTorneos, type SiteTorneo } from '@/hooks/useSiteTorneos';

/** Nombre corto sugerido a partir del nombre del torneo. */
const slugify = (nombre: string, torneoid: number) => {
  const clean = nombre
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9 ]+/g, ' ')
    .split(' ')
    .filter((w) => w && !['torneo', 'de', 'del', 'la', 'el', 'los', 'las', 'anual', 'golf'].includes(w));
  return clean[0] || `torneo${torneoid}`;
};

const AdminTorneos = () => {
  const { data, isLoading } = useSiteTorneos();
  const save = useSaveSiteTorneos();
  const [rows, setRows] = useState<SiteTorneo[]>([]);

  useEffect(() => {
    if (data?.torneos) setRows(data.torneos);
  }, [data?.torneos]);

  const update = (i: number, patch: Partial<SiteTorneo>) =>
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));

  const move = (i: number, dir: -1 | 1) =>
    setRows((prev) => {
      const next = [...prev];
      const j = i + dir;
      if (j < 0 || j >= next.length) return prev;
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });

  const handleSave = () => {
    const clean = rows
      .filter((r) => Number(r.torneoid) > 0)
      .map((r, i) => ({
        ...r,
        torneoid: Number(r.torneoid),
        slug: (r.slug || slugify(r.nombre || '', Number(r.torneoid))).trim(),
        orden: i + 1,
      }));
    save.mutate(
      { torneos: clean, password: getSuperAdminPassword() },
      {
        onSuccess: () => toast({ title: 'Torneos guardados', description: 'La barra superior ya muestra los cambios.' }),
        onError: (e: Error) => toast({ title: 'No se pudo guardar', description: e.message, variant: 'destructive' }),
      }
    );
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Torneos del sitio</CardTitle>
        <CardDescription>
          Da de alta cada torneo que se publica en esta misma página. Cada uno tendrá su propio
          desplegable en la barra superior y su propia configuración en las pestañas de arriba.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading && <p className="text-sm text-muted-foreground">Cargando…</p>}

        {rows.map((row, i) => (
          <div key={i} className="grid gap-3 rounded-lg border p-3 md:grid-cols-[110px_1fr_180px_110px_auto]">
            <div>
              <Label className="text-xs">Torneo #</Label>
              <Input
                type="number"
                value={row.torneoid || ''}
                onChange={(e) => update(i, { torneoid: Number(e.target.value) })}
              />
            </div>
            <div>
              <Label className="text-xs">Nombre visible</Label>
              <Input
                value={row.nombre || ''}
                onChange={(e) => update(i, { nombre: e.target.value })}
                placeholder="Akron Experience"
              />
            </div>
            <div>
              <Label className="text-xs">Nombre corto (dirección)</Label>
              <Input
                value={row.slug || ''}
                onChange={(e) => update(i, { slug: e.target.value.toLowerCase() })}
                placeholder={slugify(row.nombre || '', row.torneoid)}
              />
            </div>
            <div className="flex items-end gap-2">
              <div className="flex flex-col items-center">
                <Label className="text-xs">Publicado</Label>
                <Switch
                  checked={row.activo !== false}
                  onCheckedChange={(v) => update(i, { activo: v })}
                />
              </div>
              <Button variant="outline" size="icon" onClick={() => move(i, -1)} aria-label="Subir">
                <ArrowUp className="h-4 w-4" />
              </Button>
              <Button variant="outline" size="icon" onClick={() => move(i, 1)} aria-label="Bajar">
                <ArrowDown className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="icon"
                onClick={() => setRows((prev) => prev.filter((_, idx) => idx !== i))}
                aria-label="Quitar"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </div>
        ))}

        <div className="flex gap-2">
          <Button
            variant="outline"
            className="gap-2"
            onClick={() =>
              setRows((prev) => [...prev, { torneoid: 0, nombre: '', slug: '', orden: prev.length + 1, activo: true }])
            }
          >
            <Plus className="h-4 w-4" />
            Agregar torneo
          </Button>
          <Button className="gap-2" onClick={handleSave} disabled={save.isPending}>
            <Save className="h-4 w-4" />
            {save.isPending ? 'Guardando…' : 'Guardar torneos'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};

export default AdminTorneos;
