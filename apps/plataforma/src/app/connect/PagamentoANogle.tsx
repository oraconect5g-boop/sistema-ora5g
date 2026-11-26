"use client";

import { useEffect, useRef, useState } from "react";

import type { OpcaoDePago } from "./campos";

const campo = "mt-1 min-h-11 w-full rounded-botao border border-borda bg-white px-3 text-sm outline-none focus:border-acao focus:ring-2 focus:ring-acao/20";

// CONNECT-l (D-062, o proprietário em 25/11: "não com o crédito da Nogle"): o Pix da Nogle é o padrão. Com o serviço recebido
// no caixa, quem paga o link é a loja (o cliente já pagou); sem ele, o cliente paga direto à Nogle, na hora.
// AUD-f (auditoria de e7f55b2): o serviço pago no caixa só aparece se for do plano escolhido no mesmo formulário (a regra do
// banco: ATV-<plano> e REC-<plano>, que continua conferida no registro com OR055); trocar o plano tira a escolha que não serve.
export function PagamentoANogle({ pagos }: { pagos: readonly OpcaoDePago[] }) {
  const raiz = useRef<HTMLFieldSetElement>(null);
  const [plano, setPlano] = useState<string | null>(null);
  const [escolhido, setEscolhido] = useState("");

  // O plano marcado no formulário (os cartões dos planos, name="plano"), lido a cada mudança do formulário.
  useEffect(() => {
    const formulario = raiz.current?.form;
    if (!formulario) return;
    const ler = () => {
      const valor = new FormData(formulario).get("plano");
      setPlano(typeof valor === "string" && valor ? valor : null);
    };
    ler();
    formulario.addEventListener("change", ler);
    return () => formulario.removeEventListener("change", ler);
  }, []);

  const doPlano = plano === null ? [] : pagos.filter((p) => p.plano === plano);
  const valor = doPlano.some((p) => p.id === escolhido) ? escolhido : "";
  return (
    <fieldset ref={raiz} className="space-y-2">
      <legend className="text-sm font-medium">Pagamento à Nogle</legend>
      <label className="flex items-start gap-2 rounded-xl border border-borda p-3 text-sm has-[:checked]:border-acao has-[:checked]:bg-acao/5">
        <input type="radio" name="metodo" value="LINK" defaultChecked className="mt-1 size-4" />
        <span><span className="font-semibold">Pix da Nogle</span> (o padrão): a Nogle devolve o link de pagamento, que aparece na operação. Com o serviço recebido no caixa, quem paga é a loja, com o dinheiro do cliente; sem ele, o cliente paga direto à Nogle, na hora.</span>
      </label>
      <label className="flex items-start gap-2 rounded-xl border border-borda p-3 text-sm has-[:checked]:border-acao has-[:checked]:bg-acao/5">
        <input type="radio" name="metodo" value="SALDO" className="mt-1 size-4" />
        <span><span className="font-semibold">Crédito da carteira da Ora na Nogle</span>: só com o serviço pago no caixa e com crédito na carteira.</span>
      </label>
      <label className="block text-sm font-medium">Serviço pago no caixa
        <select name="venda_item" className={campo} value={valor} onChange={(e) => setEscolhido(e.target.value)}>
          <option value="">Nenhum: o cliente paga o Pix da Nogle direto</option>
          {doPlano.map((p) => <option key={p.id} value={p.id}>{p.rotulo}</option>)}
        </select>
      </label>
      <p className="text-xs text-suave">
        {plano === null ? "Escolha o plano para ver as vendas pagas dele no caixa."
          : doPlano.length === 0 ? "Nenhuma venda deste plano paga no caixa nos últimos 7 dias (as de outro plano não servem)."
            : "Só as vendas deste plano, pagas no caixa nos últimos 7 dias; cada uma vale uma operação só."}
      </p>
    </fieldset>
  );
}
