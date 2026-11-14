// Estilos e campos comuns dos formulários do cadastro de produtos (L3a; separados no lote CAT-009).
export const campo = "mt-1 min-h-11 w-full rounded-botao border border-borda bg-white px-3 text-sm outline-none focus:border-acao focus:ring-2 focus:ring-acao/20";
export const rotulo = "block text-sm font-medium";
export const resumo = "flex min-h-10 cursor-pointer items-center gap-2 text-sm font-semibold text-acao";

export function Motivo({ exemplo }: { exemplo: string }) {
  return (
    <label className={rotulo}>Motivo (fica na auditoria)
      <input name="motivo" required minLength={3} maxLength={200} placeholder={exemplo} className={campo} />
    </label>
  );
}
