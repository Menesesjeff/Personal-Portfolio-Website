import { useEffect, useRef, type ReactNode } from 'react';

export function Modal({
  aberto,
  aoFechar,
  titulo,
  children,
  largura = 'max-w-md',
  telaCheiaMobile = false,
}: {
  aberto: boolean;
  aoFechar: () => void;
  titulo: string;
  children: ReactNode;
  largura?: string;
  telaCheiaMobile?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!aberto) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && aoFechar();
    document.addEventListener('keydown', onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    ref.current?.focus();
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
    };
  }, [aberto, aoFechar]);

  if (!aberto) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/60 backdrop-blur-[2px] sm:items-center sm:p-4"
      onMouseDown={(e) => e.target === e.currentTarget && aoFechar()}
    >
      <div
        ref={ref}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={titulo}
        className={`animar-surgir flex w-full ${largura} flex-col bg-white shadow-2xl outline-none ${
          telaCheiaMobile ? 'h-[100dvh] sm:h-auto sm:max-h-[92vh]' : 'max-h-[92dvh]'
        } rounded-t-2xl sm:rounded-2xl`}
      >
        <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-5 py-3.5">
          <h2 className="text-base font-bold text-fgv-marinho">{titulo}</h2>
          <button
            type="button"
            onClick={aoFechar}
            className="rounded-full p-1.5 text-slate-500 hover:bg-slate-100"
            aria-label="Fechar"
          >
            ✕
          </button>
        </div>
        <div className="safe-bottom overflow-y-auto px-5 py-4">{children}</div>
      </div>
    </div>
  );
}
