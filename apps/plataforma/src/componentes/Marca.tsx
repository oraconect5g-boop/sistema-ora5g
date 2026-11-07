/** Logotipo provisório "ora5G" (a marca oficial ainda não foi aprovada). */
export function Marca({ claro = false, tamanho = "text-xl" }: { claro?: boolean; tamanho?: string }) {
  return (
    <span className={`font-extrabold tracking-tight ${tamanho} ${claro ? "text-white" : "text-navegacao"}`}>
      ora<span className={claro ? "text-destaque" : "text-acao"}>5G</span>
    </span>
  );
}
