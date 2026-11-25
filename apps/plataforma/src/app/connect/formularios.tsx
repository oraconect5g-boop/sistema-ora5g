import type { TipoOperacao } from "@ora5g/dominio/nogle";

import { FalhaDoServico, type obterSessao } from "../../lib/acesso/sessao";
import { inicioDaJanela } from "../../lib/connect/regras";
import { centavosDoBanco } from "../../lib/dinheiro";
import { brl } from "../../lib/formato";

// Lote CONNECT-m (25/11/2026): as peças dos formulários das abas Ativar chip, Recarga e Portabilidade, no formato da
// demonstração (os planos em cartões), com as regras reais: o plano e os códigos vêm das listas oficiais da Nogle, o serviço
// pago no caixa é o item da venda concluída (ainda livre) e o pagamento à Nogle é o Pix da Nogle ou a carteira (a D-062).

type Sessao = Awaited<ReturnType<typeof obterSessao>>;
export const campo = "mt-1 min-h-11 w-full rounded-botao border border-borda bg-white px-3 text-sm outline-none focus:border-acao focus:ring-2 focus:ring-acao/20";
export const rotulo = "block text-sm font-medium";
/** Situações em que a operação ainda usa o serviço pago no caixa (o mesmo pago vale uma operação só). */
const VIVAS = new Set(["registrada", "enviando", "aguardando_operadora", "resultado_desconhecido", "confirmada", "erro_operadora"]);

/** O que o formulário de um tipo de operação precisa: se ele está liberado, as listas da Nogle e os serviços pagos livres. */
export async function lerFormulario(sessao: Sessao, tipo: TipoOperacao) {
  const { supabase, situacao } = sessao;
  const unidade = situacao.unidade_id as string;
  const [habilitacoes, referencias, usados, pagos] = await Promise.all([
    supabase.from("connect_habilitacoes").select("tipo, habilitada"),
    supabase.from("connect_referencias").select("tipo, codigo, nome, uf, valor_centavos").eq("ativo", true).order("nome").limit(3000),
    supabase.from("connect_operacoes").select("venda_item_id, situacao").eq("unidade_id", unidade).not("venda_item_id", "is", null)
      .order("criado_em", { ascending: false }).limit(200),
    // CONNECT-f: o nome da variação é o do plano (REC-<plano>, ATV-<plano>): a pessoa vê qual plano foi pago.
    supabase.from("venda_itens").select("id, tipo, preco_unitario_centavos, quantidade, desconto_centavos, variantes(nome), vendas!inner(numero, situacao, unidade_id, concluida_em)")
      .eq("tipo", tipo).eq("vendas.situacao", "concluida").eq("vendas.unidade_id", unidade).gte("vendas.concluida_em", inicioDaJanela(7)).limit(50),
  ]);
  if (habilitacoes.error || referencias.error || usados.error || pagos.error) throw new FalhaDoServico("connect_formulario");
  const ocupados = new Set(usados.data.filter((o) => VIVAS.has(o.situacao)).map((o) => o.venda_item_id));
  return {
    liberada: habilitacoes.data.some((h) => h.tipo === tipo && h.habilitada),
    lista: (t: string) => referencias.data.filter((r) => r.tipo === t),
    pagosLivres: pagos.data.filter((p) => !ocupados.has(p.id)),
  };
}
type Formulario = Awaited<ReturnType<typeof lerFormulario>>;
type Pago = Formulario["pagosLivres"][number];
type Referencia = ReturnType<Formulario["lista"]>[number];

const OpcaoDePago = ({ p }: { p: Pago }) => (
  <option value={p.id}>{`Venda nº ${p.vendas.numero}${p.variantes?.nome ? ` · ${p.variantes.nome}` : ""} · ${brl(centavosDoBanco(p.preco_unitario_centavos) * p.quantidade - centavosDoBanco(p.desconto_centavos))}`}</option>
);

/** Os planos da lista oficial da Nogle em cartões (como na demonstração): o valor de face vem da Nogle, nunca da tela. */
export function PlanosEmCartoes({ planos }: { planos: readonly Referencia[] }) {
  return (
    <fieldset>
      <legend className="text-sm font-medium">Plano (lista da Nogle)</legend>
      <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
        {planos.map((p) => (
          <label key={p.codigo} className="flex min-h-16 cursor-pointer flex-col justify-center rounded-xl border border-borda bg-white p-3 text-sm has-[:checked]:border-acao has-[:checked]:bg-acao/5 has-[:checked]:ring-2 has-[:checked]:ring-acao/20 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-acao/40">
            <input type="radio" name="plano" value={p.codigo} required className="sr-only" />
            <span className="font-semibold">{p.nome}</span>
            <span className="numeros font-semibold text-acao">{brl(centavosDoBanco(p.valor_centavos ?? 0))}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

// CONNECT-l (D-062, o proprietário em 25/11: "não com o crédito da Nogle"): o Pix da Nogle é o padrão. Com o serviço
// recebido no caixa, quem paga o link é a loja (o cliente já pagou); sem ele, o cliente paga direto à Nogle, na hora.
export function PagamentoANogle({ pagos }: { pagos: readonly Pago[] }) {
  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-medium">Pagamento à Nogle</legend>
      <label className="flex items-start gap-2 rounded-xl border border-borda p-3 text-sm has-[:checked]:border-acao has-[:checked]:bg-acao/5">
        <input type="radio" name="metodo" value="LINK" defaultChecked className="mt-1 size-4" />
        <span><span className="font-semibold">Pix da Nogle</span> (o padrão): a Nogle devolve o pagamento, que aparece aqui com o QR Code. Com o serviço recebido no caixa, a loja paga com o dinheiro do cliente; sem ele, o cliente paga direto à Nogle, na hora.</span>
      </label>
      <label className="flex items-start gap-2 rounded-xl border border-borda p-3 text-sm has-[:checked]:border-acao has-[:checked]:bg-acao/5">
        <input type="radio" name="metodo" value="SALDO" className="mt-1 size-4" />
        <span><span className="font-semibold">Crédito da carteira da Ora na Nogle</span>: só com o serviço pago no caixa e com crédito na carteira.</span>
      </label>
      <label className={rotulo}>Serviço pago no caixa
        <select name="venda_item" className={campo} defaultValue=""><option value="">Nenhum: o cliente paga o Pix da Nogle direto</option>{pagos.map((p) => <OpcaoDePago key={p.id} p={p} />)}</select>
      </label>
      <p className="text-xs text-suave">A venda escolhida tem de ser do mesmo plano da operação e vale uma operação só.</p>
    </fieldset>
  );
}

/** O serviço pago no caixa da portabilidade (opcional: a portabilidade não tem pagamento à Nogle). */
export function ServicoPagoOpcional({ pagos }: { pagos: readonly Pago[] }) {
  return (
    <label className={rotulo}>Serviço pago no caixa (se houver)
      <select name="venda_item" className={campo} defaultValue=""><option value="">—</option>{pagos.map((p) => <OpcaoDePago key={p.id} p={p} />)}</select>
    </label>
  );
}
