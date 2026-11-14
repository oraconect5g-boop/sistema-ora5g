// Estilos e o campo do motivo dos formulários de /lojas (L2; separados no lote ORG-009).
export const campo = "mt-1 min-h-11 w-full rounded-botao border border-borda bg-white px-3 text-sm outline-none focus:border-acao focus:ring-2 focus:ring-acao/20";
export const rotulo = "block text-sm font-medium";

export function Motivo({ exemplo }: { exemplo: string }) {
  return (
    <label className={rotulo}>Motivo (fica na auditoria)
      <input name="motivo" required minLength={3} maxLength={200} placeholder={exemplo} className={campo} />
    </label>
  );
}
