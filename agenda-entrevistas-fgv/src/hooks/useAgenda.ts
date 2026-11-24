import { useEffect, useMemo, useSyncExternalStore } from 'react';
import { CONFIG } from '../config';
import { armazenamentoLocal } from '../services/armazenamento';
import { Sincronizador, type EstadoSync } from '../services/sincronizador';

let instancia: Sincronizador | null = null;
export function obterSincronizador(): Sincronizador {
  if (!instancia) instancia = new Sincronizador(armazenamentoLocal, CONFIG.appsScriptUrl);
  return instancia;
}

/** Estado das reservas + sincronização periódica com a planilha. */
export function useAgenda(): EstadoSync & { sync: Sincronizador } {
  const sync = useMemo(obterSincronizador, []);
  const estado = useSyncExternalStore(
    (cb) => sync.assinar(cb),
    () => sync.atual,
  );

  useEffect(() => {
    void sync.sincronizar();
    const tick = () => {
      if (document.visibilityState === 'visible') void sync.sincronizar();
    };
    const id = window.setInterval(tick, CONFIG.intervaloSyncMs);
    window.addEventListener('online', tick);
    document.addEventListener('visibilitychange', tick);
    return () => {
      window.clearInterval(id);
      window.removeEventListener('online', tick);
      document.removeEventListener('visibilitychange', tick);
    };
  }, [sync, estado.endpoint]);

  return { ...estado, sync };
}
