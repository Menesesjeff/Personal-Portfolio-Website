/** Acesso seguro ao localStorage (modo privado, cota cheia ou SSR não quebram o app). */

export const CHAVES = {
  reservas: 'fgv-agenda:reservas',
  fila: 'fgv-agenda:fila-pendente',
  endpoint: 'fgv-agenda:endpoint',
  participante: 'fgv-agenda:participante',
  selecao: 'fgv-agenda:selecao',
  bannerInstalacao: 'fgv-agenda:banner-instalacao-fechado',
  coordenacao: 'fgv-agenda:coord-desbloqueada',
  tokenCoordenacao: 'fgv-agenda:coord-token',
  dadosBancas: 'fgv-agenda:dados-bancas',
} as const;

export interface Armazenamento {
  ler<T>(chave: string, padrao: T): T;
  gravar<T>(chave: string, valor: T): void;
  remover(chave: string): void;
}

function obterStorage(): Storage | null {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null;
  } catch {
    return null;
  }
}

export const armazenamentoLocal: Armazenamento = {
  ler<T>(chave: string, padrao: T): T {
    try {
      const bruto = obterStorage()?.getItem(chave);
      return bruto == null ? padrao : (JSON.parse(bruto) as T);
    } catch {
      return padrao;
    }
  },
  gravar<T>(chave: string, valor: T): void {
    try {
      obterStorage()?.setItem(chave, JSON.stringify(valor));
    } catch {
      /* cota cheia ou bloqueado: ignora */
    }
  },
  remover(chave: string): void {
    try {
      obterStorage()?.removeItem(chave);
    } catch {
      /* ignora */
    }
  },
};

export function criarArmazenamentoMemoria(): Armazenamento {
  const mapa = new Map<string, string>();
  return {
    ler<T>(chave: string, padrao: T): T {
      const v = mapa.get(chave);
      return v == null ? padrao : (JSON.parse(v) as T);
    },
    gravar<T>(chave: string, valor: T) {
      mapa.set(chave, JSON.stringify(valor));
    },
    remover(chave: string) {
      mapa.delete(chave);
    },
  };
}
