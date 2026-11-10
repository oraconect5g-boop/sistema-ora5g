/** Logotipo provisório "ora5G" (a marca oficial ainda não foi aprovada; azul escolhido em 10/11/2026). */
export function Marca({ claro = false, tamanho = "text-xl" }: { claro?: boolean; tamanho?: string }) {
  return (
    <span className={`font-extrabold tracking-[-0.03em] ${tamanho} ${claro ? "text-white" : "text-texto"}`}>
      ora<span className={claro ? "text-destaque" : "text-acao"}>5G</span>
    </span>
  );
}

/** Selo quadrado "5G" do menu lateral recolhido. */
export function SeloMarca({ className = "size-12 text-[17px]" }: { className?: string }) {
  return (
    <span aria-hidden className={`grid shrink-0 place-items-center rounded-2xl bg-acao font-extrabold tracking-[-0.03em] text-white ${className}`}>
      5G
    </span>
  );
}
