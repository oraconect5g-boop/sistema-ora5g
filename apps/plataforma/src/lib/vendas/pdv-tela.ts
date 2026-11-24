// A tela do PDV numa ida só ao banco (lote VEL-a: ORA-QUAL-010 e ORA-POS-002). public.pdv_tela devolve, como a pessoa
// logada e na loja do turno: o caixa aberto dela, a venda em andamento, os itens do carrinho (cada um já com o nome e
// o SKU, o IMEI ou ICCID, a regra de preço, a OS do conserto e a situação do pedido de desconto) e as maquininhas
// ativas da loja. Antes a tela juntava isso em até nove pedidos, em cinco idas seguidas.
// Aqui fica a leitura estrita da resposta: forma fora do combinado é erro (a tela mostra falha), nunca carrinho vazio,
// caixa fechado nem valor zero.
import { ehUuid } from "../acesso/regras";
import { FalhaDoServico, type obterSessao } from "../acesso/sessao";
import { RespostaInesperada } from "../financeiro/painel";
import { contagem, ehObjeto, lista, texto, textoOuNulo, type Linha } from "../leitura-do-banco";
import type { OsDoItem } from "./os-dos-itens";
import { regraDoItem, type RegraDoItem } from "./regra-de-preco";

type Cliente = Awaited<ReturnType<typeof obterSessao>>["supabase"];

export type ItemDoCarrinho = {
  id: string;
  variante_id: string;
  item_serializado_id: string | null;
  tipo: string;
  quantidade: number;
  preco_unitario_centavos: number;
  desconto_centavos: number;
  /** O nome e o SKU da variação; nulo só se quem pede não a lê mais (a tela mostra "Item"). */
  variante: { sku: string; nome: string } | null;
  /** O aparelho ou o chip do item; nulo para acessório e serviço. */
  serial: { imei: string | null; iccid: string | null } | null;
  /** A regra de preço gravada no item (L6b). No carrinho só a campanha aparece. */
  regra: RegraDoItem;
  /** O conserto da ordem de serviço que o item cobra (L12c); nulo para os demais. */
  os: OsDoItem | null;
  /** A situação do pedido de aprovação de desconto mais recente do item; nulo quando não há pedido. */
  aprovacao: string | null;
  /** PAY-014b: o item é de um pedido pago pelo site (vale o preço pago e não sai da venda). */
  pago_pelo_site: boolean;
};

export type TelaDoPdv = {
  /** O caixa aberto de quem pede, nesta loja. */
  caixa: { id: string; aberto_em: string } | null;
  /** A venda em andamento (rascunho ou aguardando aprovação) de quem pede, nesta loja. PAY-014b: o que o pedido do site
   *  desta venda já pagou (nulo quando a venda não atende um pedido pago). */
  venda: { id: string; numero: number; situacao: string; pago_pelo_site_centavos: number | null } | null;
  itens: ItemDoCarrinho[];
  /** As maquininhas ativas da loja (L7a). */
  terminais: { id: string; provedor: string; apelido: string; identificador: string }[];
};

const identificador = (l: Linha, campo: string) => {
  const v = l[campo];
  if (!ehUuid(v)) throw new RespostaInesperada(campo);
  return v;
};
/** Identificador que o banco pode mandar nulo. Campo ausente continua sendo erro. */
const identificadorOuNulo = (l: Linha, campo: string) => (l[campo] === null ? null : identificador(l, campo));
/** Valor em centavos (número do JSON) que o banco pode mandar nulo. Campo ausente, texto ou fração continua sendo erro. */
const centavosOuNulo = (l: Linha, campo: string) => (l[campo] === null ? null : contagem(l, campo));
/** Objeto que o banco pode mandar nulo. Campo ausente continua sendo erro. */
const objetoOuNulo = (l: Linha, campo: string): Linha | null => {
  const v = l[campo];
  if (v === null) return null;
  if (!ehObjeto(v)) throw new RespostaInesperada(campo);
  return v;
};

function lerItem(l: Linha): ItemDoCarrinho {
  const variante = objetoOuNulo(l, "variante");
  const serial = objetoOuNulo(l, "serial");
  const precoId = identificadorOuNulo(l, "preco_id");
  const preco = objetoOuNulo(l, "preco");
  const osId = identificadorOuNulo(l, "os_id");
  const os = objetoOuNulo(l, "os");
  // A linha de preço que deu o valor do item. Item com a regra gravada cuja linha não veio: "regra não lida agora".
  const linhaDePreco = preco && {
    id: identificador(preco, "id"), origem: texto(preco, "origem"), unidade_id: identificadorOuNulo(preco, "unidade_id"),
    motivo: textoOuNulo(preco, "motivo"), fim: textoOuNulo(preco, "fim"),
  };
  // A OS que quem pede não lê mais continua apontada pelo item: o conserto aparece, só sem o número.
  const ordem = os && { numero: contagem(os, "numero"), situacao: texto(os, "situacao") };
  return {
    id: identificador(l, "id"),
    variante_id: identificador(l, "variante_id"),
    item_serializado_id: identificadorOuNulo(l, "item_serializado_id"),
    tipo: texto(l, "tipo"),
    quantidade: contagem(l, "quantidade"),
    preco_unitario_centavos: contagem(l, "preco_unitario_centavos"),
    desconto_centavos: contagem(l, "desconto_centavos"),
    variante: variante && { sku: texto(variante, "sku"), nome: texto(variante, "nome") },
    serial: serial && { imei: textoOuNulo(serial, "imei"), iccid: textoOuNulo(serial, "iccid") },
    regra: regraDoItem(precoId, precoId && linhaDePreco ? new Map([[precoId, linhaDePreco]]) : null),
    os: osId ? { os: osId, numero: ordem?.numero ?? null, situacao: ordem?.situacao ?? null } : null,
    aprovacao: textoOuNulo(l, "aprovacao"),
    pago_pelo_site: identificadorOuNulo(l, "loja_reserva_id") !== null,
  };
}

/** Lê a resposta de public.pdv_tela. Lança RespostaInesperada quando a forma não é a combinada. */
export function lerTelaDoPdv(dado: unknown): TelaDoPdv {
  if (!ehObjeto(dado)) throw new RespostaInesperada("pdv_tela");
  const caixa = objetoOuNulo(dado, "caixa");
  const venda = objetoOuNulo(dado, "venda");
  const itens = lista(dado, "itens").map(lerItem);
  // Item sem venda em andamento não existe: é resposta fora do combinado, não um carrinho solto.
  if (!venda && itens.length > 0) throw new RespostaInesperada("itens");
  return {
    caixa: caixa && { id: identificador(caixa, "id"), aberto_em: texto(caixa, "aberto_em") },
    venda: venda && {
      id: identificador(venda, "id"), numero: contagem(venda, "numero"), situacao: texto(venda, "situacao"),
      pago_pelo_site_centavos: centavosOuNulo(venda, "pago_pelo_site_centavos"),
    },
    itens,
    terminais: lista(dado, "terminais").map((t) => ({
      id: identificador(t, "id"), provedor: texto(t, "provedor"), apelido: texto(t, "apelido"), identificador: texto(t, "identificador"),
    })),
  };
}

/** Busca a tela do PDV de quem pede. Falha do banco e resposta fora do combinado são falha do serviço (página de erro). */
export async function consultarTelaDoPdv(supabase: Cliente): Promise<TelaDoPdv> {
  const resposta = await supabase.rpc("pdv_tela");
  if (resposta.error) throw new FalhaDoServico("pdv_tela");
  try {
    return lerTelaDoPdv(resposta.data);
  } catch {
    throw new FalhaDoServico("pdv_tela");
  }
}
