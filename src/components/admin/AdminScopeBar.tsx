/**
 * AdminScopeBar
 * Selector superior de /admin cuando el sitio publica varios torneos.
 *
 *   General · Torneo A · Torneo B · Torneos
 *
 * "General" edita lo compartido (patrocinadores, reglas, O'Yes general…).
 * Cada torneo edita únicamente su propia información y visibilidad.
 * "Torneos" abre el alta de torneos del sitio.
 */

import { useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { Globe, ListPlus, Trophy } from 'lucide-react';
import { setConfigScope, useConfigScope } from '@/lib/configScope';
import { useSiteTorneos } from '@/hooks/useSiteTorneos';

interface AdminScopeBarProps {
  /** Está abierta la pantalla de alta de torneos */
  managing: boolean;
  onManagingChange: (managing: boolean) => void;
}

const AdminScopeBar = ({ managing, onManagingChange }: AdminScopeBarProps) => {
  const scope = useConfigScope();
  const { data } = useSiteTorneos();
  const all = data?.torneos ?? [];
  /** Con menos de dos torneos el sitio es de torneo único: sólo General. */
  const multi = all.length > 1;
  const torneos = multi ? all : [];

  // Si se quitaron torneos mientras se editaba uno, vuelve al alcance general.
  useEffect(() => {
    if (!multi && scope !== 'general') setConfigScope('general');
  }, [multi, scope]);

  const select = (next: string) => {
    onManagingChange(false);
    setConfigScope(next);
  };

  return (
    <div className="mb-6 flex flex-wrap items-center gap-2 rounded-xl border bg-card p-2">
      <Button
        variant={!managing && scope === 'general' ? 'default' : 'ghost'}
        className="gap-2"
        onClick={() => select('general')}
      >
        <Globe className="h-4 w-4" />
        {multi ? 'General' : 'Configuración'}
      </Button>

      {torneos.map((t) => (
        <Button
          key={t.torneoid}
          variant={!managing && scope === String(t.torneoid) ? 'default' : 'ghost'}
          className={cn('gap-2', t.activo === false && 'opacity-60')}
          onClick={() => select(String(t.torneoid))}
        >
          <Trophy className="h-4 w-4" />
          {t.nombre || `Torneo ${t.torneoid}`}
        </Button>
      ))}

      <Button
        variant={managing ? 'default' : 'outline'}
        className="ml-auto gap-2"
        onClick={() => onManagingChange(!managing)}
      >
        <ListPlus className="h-4 w-4" />
        Torneos
      </Button>
    </div>
  );
};

export default AdminScopeBar;
