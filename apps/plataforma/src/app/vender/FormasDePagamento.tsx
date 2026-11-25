"use client";

import { nomeDoPagamento } from "@ora5g/dominio";
import { Plus, Trash2 } from "lucide-react";
import { useState } from "react";

import { centavosDoTexto, resumoDosPagamentos, textoDosCentavos, valorSugerido, type LinhaNaTela, type OpcaoDeMeio } from "../../lib/vendas/formas-de-pagamento";

const campo = "mt-1 min-h-11 w-full rounded-botao border border-borda bg-white px-3 text-sm outline-none focus:border-acao focus:ring-2 focus:ring-acao/20";
const brl = (centavos: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(centavos / 100);
const MAXIMO_DE_FORMAS = 8;

// As formas de pagamento da venda (lote PDV-c; pedido do proprietário de 18/11): a pessoa toca em "Adicionar forma de
// pagamento", escolhe a forma, e só os campos dela aparecem. A PayJoy e a Aiva mostram o valor financiado (só o do
// celular) e as parcelas; a entrada é outra forma (dinheiro, Pix ou cartão), marcada como a entrada. O servidor e o banco
// conferem tudo de novo; os nomes dos campos são os que lib/vendas/regras.ts lê (pagamento_1_meio, pagamento_1_valor...).
// PAY-014b: na venda do pedido pago pelo site, o pago aparece como uma linha fixa (o banco grava a linha dele na
// conclusão) e `total` é só o que falta cobrar além dele (um item a mais no balcão). PAY-015a: o Pix pela Asaas já pago no
// caixa entra do mesmo jeito (o banco grava a linha de cada QR pago).
export function FormasDePagamento({ total, valorDosCelulares, opcoes, terminais, pagoPeloSite = 0, pagoNoPix = 0 }: {
  total: number;
  valorDosCelulares: number;
  opcoes: OpcaoDeMeio[];
  terminais: { id: string; rotulo: string; provedor: "picpay" | "pagbank" }[];
  pagoPeloSite?: number;
  pagoNoPix?: number;
}) {
  const [linhas, setLinhas] = useState<LinhaNaTela[]>([]);
  const [escolhendo, setEscolhendo] = useState(false);
  const [proxima, setProxima] = useState(1);
  const opcaoDe = (meio: string) => opcoes.find((o) => o.meio === meio);
  const temFinanceira = linhas.some((l) => opcaoDe(l.meio)?.financeira);
  const resumo = resumoDosPagamentos(total, linhas, opcoes);

  function acrescentar(opcao: OpcaoDeMeio) {
    const valor = valorSugerido(opcao, total, valorDosCelulares, linhas, opcoes);
    setLinhas([...linhas, {
      chave: proxima, meio: opcao.meio, valor: valor > 0 ? textoDosCentavos(valor) : "",
      parcelas: opcao.maximoDeParcelas !== null && !opcao.financeira ? "1" : "", comprovante: "", terminal: "", entrada: false,
    }]);
    setProxima(proxima + 1);
    setEscolhendo(false);
  }
  const mudar = (chave: number, mudanca: Partial<LinhaNaTela>) => setLinhas(linhas.map((l) => (l.chave === chave ? { ...l, ...mudanca } : l)));
  const tirar = (chave: number) => setLinhas(linhas.filter((l) => l.chave !== chave));

  return (
    <div className="space-y-3">
      {/* O que já foi pago entra sozinho na conclusão: a venda pode concluir sem outra forma. */}
      {pagoPeloSite + pagoNoPix > 0 && <input type="hidden" name="pago_pelo_site" value="sim" />}
      {pagoPeloSite > 0 && (
        <p className="numeros flex items-center justify-between gap-2 rounded-xl bg-sucesso-clara p-3 text-sm font-semibold text-sucesso">
          <span>Já pago pelo site (Pix)</span><span>{brl(pagoPeloSite)}</span>
        </p>
      )}
      {pagoNoPix > 0 && (
        <p className="numeros flex items-center justify-between gap-2 rounded-xl bg-sucesso-clara p-3 text-sm font-semibold text-sucesso">
          <span>Já pago no Pix pela Asaas</span><span>{brl(pagoNoPix)}</span>
        </p>
      )}
      {linhas.length === 0 && (pagoPeloSite + pagoNoPix > 0 ? (
        <p className="text-sm text-suave">{total === 0
          ? "Nada a cobrar: já está pago. Confira os itens e o cliente e conclua."
          : "Falta só o resto: toque em \"Adicionar forma de pagamento\" e escolha como o cliente paga."}</p>
      ) : (
        <p className="text-sm text-suave">Nenhuma forma de pagamento ainda. Toque em &quot;Adicionar forma de pagamento&quot; e escolha como o cliente paga.</p>
      ))}
      {linhas.map((l, i) => {
        const n = i + 1;
        const opcao = opcaoDe(l.meio);
        if (!opcao) return null;
        const doProvedor = opcao.provedor ? terminais.filter((t) => t.provedor === opcao.provedor) : [];
        const valorLido = centavosDoTexto(l.valor);
        return (
          <fieldset key={l.chave} className="grid gap-2 rounded-xl border border-borda p-2 sm:grid-cols-3">
            <legend className="px-1 text-xs font-semibold">{`Pagamento ${n} · ${nomeDoPagamento({ meio: l.meio, entradaDoFinanciamento: temFinanceira && opcao.podeSerEntrada && l.entrada })}`}</legend>
            <input type="hidden" name={`pagamento_${n}_meio`} value={l.meio} />
            <label className="text-xs font-medium">{opcao.financeira ? "Valor financiado (R$)" : "Valor (R$)"}
              <input name={`pagamento_${n}_valor`} inputMode="decimal" required value={l.valor} onChange={(e) => mudar(l.chave, { valor: e.target.value })}
                aria-invalid={l.valor !== "" && valorLido === null} className={campo} />
            </label>
            {opcao.maximoDeParcelas !== null && (opcao.financeira ? (
              <label className="text-xs font-medium">{`Parcelas (1 a ${opcao.maximoDeParcelas})`}
                <input name={`pagamento_${n}_parcelas`} inputMode="numeric" pattern="[0-9]{1,2}" required value={l.parcelas}
                  onChange={(e) => mudar(l.chave, { parcelas: e.target.value })} className={campo} />
              </label>
            ) : (
              <label className="text-xs font-medium">Parcelas no cartão
                <select name={`pagamento_${n}_parcelas`} value={l.parcelas} onChange={(e) => mudar(l.chave, { parcelas: e.target.value })} className={campo}>
                  {Array.from({ length: opcao.maximoDeParcelas }, (_, k) => k + 1).map((p) => <option key={p} value={String(p)}>{p === 1 ? "1x (à vista)" : `${p}x`}</option>)}
                </select>
              </label>
            ))}
            {(opcao.comprovante || opcao.financeira) && (
              <label className="text-xs font-medium">{l.meio === "vale_troca" ? "Nº do vale" : opcao.financeira ? "Nº do contrato (opcional)" : "Comprovante (código da maquininha ou do Pix)"}
                <input name={`pagamento_${n}_comprovante`} autoComplete="off" required={opcao.comprovante} value={l.comprovante}
                  onChange={(e) => mudar(l.chave, { comprovante: e.target.value })} className={campo} />
              </label>
            )}
            {doProvedor.length > 0 && (
              <label className="text-xs font-medium">Maquininha
                <select name={`pagamento_${n}_terminal`} value={l.terminal} onChange={(e) => mudar(l.chave, { terminal: e.target.value })} className={campo}>
                  <option value="">nenhuma</option>
                  {doProvedor.map((t) => <option key={t.id} value={t.id}>{t.rotulo}</option>)}
                </select>
              </label>
            )}
            {temFinanceira && opcao.podeSerEntrada && (
              <label className="flex min-h-11 items-center gap-2 text-xs font-medium sm:col-span-2">
                <input type="checkbox" name={`pagamento_${n}_entrada_do_financiamento`} value="sim" checked={l.entrada}
                  onChange={(e) => mudar(l.chave, { entrada: e.target.checked })} className="size-5" />
                É a entrada da PayJoy ou da Aiva
              </label>
            )}
            <div className="flex items-end">
              <button type="button" onClick={() => tirar(l.chave)} className="inline-flex min-h-11 items-center gap-1 text-xs font-semibold text-perigo">
                <Trash2 className="size-4" aria-hidden />Tirar esta forma
              </button>
            </div>
          </fieldset>
        );
      })}
      {linhas.length < MAXIMO_DE_FORMAS && (escolhendo ? (
        <div role="group" aria-label="Escolha a forma de pagamento" className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {opcoes.map((o) => (
            <button key={o.meio} type="button" onClick={() => acrescentar(o)} className="min-h-11 rounded-botao bg-white px-3 text-sm font-semibold text-acao ring-1 ring-borda">{o.nome}</button>
          ))}
          <button type="button" onClick={() => setEscolhendo(false)} className="min-h-11 rounded-botao px-3 text-sm text-suave">Cancelar</button>
        </div>
      ) : (
        <button type="button" onClick={() => setEscolhendo(true)} className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-botao bg-white px-3 text-sm font-semibold text-acao ring-1 ring-acao">
          <Plus className="size-4" aria-hidden />Adicionar forma de pagamento
        </button>
      ))}
      <dl className="numeros grid grid-cols-2 gap-1 text-sm" aria-live="polite">
        <dt>{pagoPeloSite + pagoNoPix > 0 ? "A cobrar além do já pago" : "Total da venda"}</dt><dd className="text-right">{brl(total)}</dd>
        <dt>Lançado</dt><dd className="text-right">{brl(resumo.lancado)}</dd>
        {resumo.falta > 0 && <><dt className="font-semibold text-aviso">Falta</dt><dd className="text-right font-semibold text-aviso">{brl(resumo.falta)}</dd></>}
        {resumo.troco > 0 && <><dt>Troco (do dinheiro)</dt><dd className="text-right">{brl(resumo.troco)}</dd></>}
        {resumo.sobraSemTroco > 0 && <><dt className="font-semibold text-perigo">Passou do total sem dinheiro para troco</dt><dd className="text-right font-semibold text-perigo">{brl(resumo.sobraSemTroco)}</dd></>}
        {resumo.financiado > valorDosCelulares && <><dt className="font-semibold text-perigo">Financiado acima do celular</dt><dd className="text-right font-semibold text-perigo">{brl(resumo.financiado - valorDosCelulares)}</dd></>}
      </dl>
    </div>
  );
}
