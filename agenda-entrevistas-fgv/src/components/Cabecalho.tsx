import type { StatusSync } from '../services/sincronizador';

export function LogoFGV({ className = '' }: { className?: string }) {
  return (
    <span className={`inline-flex items-center rounded-lg bg-[#ededed] px-2 py-1 shadow-sm ${className}`}>
      <img src="icons/logo-header.png" alt="FGV DGPE" width={176} height={94} className="h-full w-auto" />
    </span>
  );
}

const ROTULO_STATUS: Record<StatusSync, { texto: string; cor: string; ponto: string }> = {
  local: { texto: 'Modo local', cor: 'bg-slate-100 text-slate-700', ponto: 'bg-slate-400' },
  sincronizando: { texto: 'Sincronizando…', cor: 'bg-sky-100 text-sky-800', ponto: 'bg-sky-500 animate-pulse' },
  online: { texto: 'Sincronizado', cor: 'bg-emerald-100 text-emerald-800', ponto: 'bg-emerald-500' },
  offline: { texto: 'Offline · cache', cor: 'bg-amber-100 text-amber-800', ponto: 'bg-amber-500' },
  erro: { texto: 'Erro de sincronização', cor: 'bg-red-100 text-red-800', ponto: 'bg-red-500' },
};

export function BadgeSync({
  status,
  ultimaSync,
  pendentes,
  mensagem,
}: {
  status: StatusSync;
  ultimaSync: string | null;
  pendentes: number;
  mensagem: string | null;
}) {
  const r = ROTULO_STATUS[status];
  const hora = ultimaSync
    ? new Date(ultimaSync).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
    : null;
  const titulo =
    status === 'local'
      ? 'Planilha não configurada: as reservas ficam salvas apenas neste aparelho.'
      : (mensagem ?? (hora ? `Última sincronização às ${hora}` : ''));
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${r.cor}`}
      title={titulo}
      role="status"
      aria-live="polite"
    >
      <span className={`h-2 w-2 rounded-full ${r.ponto}`} aria-hidden />
      {r.texto}
      {status === 'online' && hora && <span className="font-normal opacity-75">· {hora}</span>}
      {pendentes > 0 && <span className="font-normal">· {pendentes} pendente(s)</span>}
    </span>
  );
}

export function Cabecalho(props: {
  status: StatusSync;
  ultimaSync: string | null;
  pendentes: number;
  mensagem: string | null;
}) {
  return (
    <header className="safe-top">
      <div className="bg-fgv-escuro text-[11px] text-slate-300 sm:text-xs">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-1.5">
          <span className="truncate">
            <strong className="text-white">FGV</strong> | Diretoria de Desenvolvimento da Gestão Pública e Políticas
            Educacionais
          </span>
          <a
            href="https://dgpe.fgv.br"
            target="_blank"
            rel="noopener noreferrer"
            className="shrink-0 font-semibold text-sky-300 hover:text-white hover:underline"
          >
            dgpe.fgv.br
          </a>
        </div>
      </div>
      <div className="bg-fgv-marinho text-white shadow-md">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-5 gap-y-3 px-4 py-4">
          <LogoFGV className="h-12 shrink-0 sm:h-14" />
          <div className="order-last w-full min-w-0 sm:order-none sm:w-auto sm:flex-1">
            <p className="text-[11px] font-semibold uppercase tracking-widest text-sky-300">
              Entrevistas Redistribuídas<span className="hidden sm:inline"> · Processo Seletivo Unificado</span>
            </p>
            <h1 className="text-xl font-bold leading-tight sm:text-2xl">Agenda das Bancas</h1>
          </div>
          <div className="ml-auto sm:ml-0">
            <BadgeSync {...props} />
          </div>
        </div>
      </div>
    </header>
  );
}
