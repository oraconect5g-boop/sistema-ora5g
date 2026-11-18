// Os pedidos dos marketplaces por arquivo (lote MKTPL-a: ORA-MKTPL-003 e ORA-MKTPL-005 por arquivo, ORA-MKTPL-008; ADR-018).
// O relatório de vendas exportado do painel do vendedor do Mercado Livre, da Shopee ou do TikTok Shop. Nada é suposto do
// formato de um canal: a pessoa diz qual coluna é cada campo, com sugestão pelo nome da coluna; cada linha do arquivo é um
// item, e as linhas com o mesmo número de pedido formam o pedido. Aqui só se montam os pedidos no formato do banco, que
// valida tudo de novo (marketplace_importar).
import { lerDataDoExtrato, lerValorDoExtrato } from "../extratos/leitura";
import { semAcento, type Planilha } from "../importacao/csv";

export const CANAIS_DOS_MARKETPLACES = { mercado_livre: "Mercado Livre", shopee: "Shopee", tiktok_shop: "TikTok Shop" } as const;
export type CanalDoMarketplace = keyof typeof CANAIS_DOS_MARKETPLACES;
/** O banco aceita até 20.000 linhas por arquivo, e até 500 itens por pedido. */
export const LINHAS_DO_ARQUIVO_DO_MARKETPLACE = 20_000;
export const ITENS_POR_PEDIDO = 500;

export const CAMPOS_DO_MARKETPLACE = {
  pedido: { rotulo: "Número do pedido (no canal)", obrigatorio: true, sugestoes: ["n.o de venda", "n.º de venda", "numero da venda", "id do pedido", "numero do pedido", "order id", "pedido", "id da venda"] },
  data: { rotulo: "Data do pedido", obrigatorio: true, sugestoes: ["data da venda", "data do pedido", "data de criacao do pedido", "order creation time", "created time", "data"] },
  situacao: { rotulo: "Situação no canal", obrigatorio: false, sugestoes: ["estado", "status do pedido", "status", "order status", "situacao"] },
  codigo: { rotulo: "Código do anúncio ou SKU", obrigatorio: false, sugestoes: ["sku", "sku do vendedor", "seller sku", "# de anuncio", "id do anuncio", "codigo do anuncio", "sku id", "codigo"] },
  titulo: { rotulo: "Título do anúncio", obrigatorio: false, sugestoes: ["titulo do anuncio", "nome do produto", "product name", "titulo", "produto"] },
  quantidade: { rotulo: "Quantidade", obrigatorio: false, sugestoes: ["unidades", "quantidade", "quantity", "qtd"] },
  valor: { rotulo: "Valor do item (R$, o total da linha)", obrigatorio: false, sugestoes: ["receita por produtos (brl)", "receita por produtos", "subtotal do produto", "sku subtotal after discount", "valor total", "total do produto", "subtotal"] },
  preco: { rotulo: "Preço de uma unidade (R$)", obrigatorio: false, sugestoes: ["preco unitario de venda do anuncio (brl)", "preco unitario", "preco acordado", "unit price", "preco"] },
  tarifas: { rotulo: "Tarifas e comissão (R$)", obrigatorio: false, sugestoes: ["tarifa de venda e impostos (brl)", "tarifa de venda e impostos", "comissao", "taxa de comissao", "taxa de servico", "platform commission", "tarifas"] },
  frete: { rotulo: "Frete pago pelo vendedor (R$)", obrigatorio: false, sugestoes: ["tarifas de envio (brl)", "tarifas de envio", "frete pago pelo vendedor", "taxa de envio", "shipping fee", "frete"] },
  reembolsos: { rotulo: "Cancelamentos e reembolsos (R$)", obrigatorio: false, sugestoes: ["cancelamentos e reembolsos (brl)", "cancelamentos e reembolsos", "valor do reembolso", "refund amount", "reembolso", "reembolsos"] },
  liquido: { rotulo: "Líquido a receber (R$)", obrigatorio: false, sugestoes: ["total (brl)", "valor liquido", "total a receber", "valor do repasse", "settlement amount", "repasse", "liquido"] },
  data_repasse: { rotulo: "Data do repasse", obrigatorio: false, sugestoes: ["data de liberacao do dinheiro", "data de liberacao", "data do repasse", "settlement date", "data de pagamento"] },
} as const;
export type CampoDoMarketplace = keyof typeof CAMPOS_DO_MARKETPLACE;
export const NOMES_DOS_CAMPOS_DO_MARKETPLACE = Object.keys(CAMPOS_DO_MARKETPLACE) as CampoDoMarketplace[];
export type MapaDoMarketplace = Partial<Record<CampoDoMarketplace, number>>;

/** Como os valores do pedido (tarifas, frete, reembolsos, líquido) vêm no arquivo. */
export const MODOS_DOS_VALORES = {
  em_cada_linha: "Cada linha tem o valor do próprio item (somar as linhas do pedido)",
  repetidos: "O valor do pedido inteiro se repete em todas as linhas dele (contar uma vez)",
} as const;
export type ModoDosValores = keyof typeof MODOS_DOS_VALORES;

/** Sugestão pelo nome da coluna; a ordem das sugestões vale (a mais específica primeiro). */
export function sugerirMapaDoMarketplace(cabecalho: readonly string[]): MapaDoMarketplace {
  const usados = new Set<number>();
  const mapa: MapaDoMarketplace = {};
  for (const campo of NOMES_DOS_CAMPOS_DO_MARKETPLACE) {
    for (const sugestao of CAMPOS_DO_MARKETPLACE[campo].sugestoes as readonly string[]) {
      const indice = cabecalho.findIndex((c, i) => !usados.has(i) && semAcento(c) === sugestao);
      if (indice >= 0) {
        mapa[campo] = indice;
        usados.add(indice);
        break;
      }
    }
  }
  return mapa;
}

/** O mapeamento do formulário: cada coluna uma vez; o pedido, a data e o valor do item (ou o preço) obrigatórios. */
export function lerMapaDoMarketplace(campo: (nome: string) => unknown, colunas: number): MapaDoMarketplace | null {
  const mapa: MapaDoMarketplace = {};
  const usados = new Set<number>();
  for (const nome of NOMES_DOS_CAMPOS_DO_MARKETPLACE) {
    const valor = campo(`coluna_${nome}`);
    if (valor === null || valor === undefined || valor === "") continue;
    if (typeof valor !== "string" || !/^\d{1,3}$/.test(valor)) return null;
    const indice = Number(valor);
    if (indice >= colunas || usados.has(indice)) return null;
    usados.add(indice);
    mapa[nome] = indice;
  }
  return mapa.pedido === undefined || mapa.data === undefined || (mapa.valor === undefined && mapa.preco === undefined) ? null : mapa;
}

export const mapaDoMarketplaceParaGravar = (cabecalho: readonly string[], mapa: MapaDoMarketplace, modo: ModoDosValores) => ({
  modo, colunas: Object.fromEntries(NOMES_DOS_CAMPOS_DO_MARKETPLACE.filter((c) => mapa[c] !== undefined).map((c) => [c, cabecalho[mapa[c] as number] ?? ""])),
});

export type ItemDoMarketplace = { numero: number; codigo?: string; titulo?: string; quantidade: number; valor: number };
export type PedidoDoMarketplace = {
  id_externo: string; data: string; situacao?: string; bruto: number; tarifas?: number; frete?: number; reembolsos?: number; liquido?: number;
  data_repasse?: string; itens: ItemDoMarketplace[];
};
export type ProblemaDoMarketplace = { numero: number; campo: CampoDoMarketplace | "itens"; texto: string };
export type PedidosDoMarketplace = { pedidos: PedidoDoMarketplace[]; linhas: number; deFora: number; problemas: ProblemaDoMarketplace[] };

const espacos = (t: string) => t.replace(/\s+/g, " ").trim();
const ehTotal = (texto: string) => /^(total|totais|resumo)\b/.test(semAcento(texto));
const VALORES_DO_PEDIDO = ["tarifas", "frete", "reembolsos", "liquido"] as const;

/** Uma quantidade inteira (de 1 a 100.000); vazia vale 1. */
function lerQuantidade(texto: string): number {
  const t = texto.trim();
  const n = /^\d+$/.test(t) ? Number(t) : /^\d+[.,]0+$/.test(t) ? Number(t.split(/[.,]/)[0]) : Number.NaN;
  if (!Number.isSafeInteger(n) || n < 1 || n > 100_000) throw new RangeError("quantidade");
  return n;
}

/**
 * Monta os pedidos: cada linha é um item; as linhas com o mesmo número de pedido formam o pedido (na ordem do arquivo). O
 * bruto é a soma dos itens; as tarifas, o frete, os reembolsos e o líquido somam as linhas ("em_cada_linha") ou valem uma
 * vez por pedido ("repetidos": a linha que traz o valor; linhas que discordam são problema). Ficam de fora, contadas, as
 * linhas sem número de pedido ou sem data (total, resumo). Valor com sinal de menos (o canal escreve a tarifa como saída)
 * vale pelo tamanho.
 */
export function montarPedidosDoMarketplace(planilha: Planilha, mapa: MapaDoMarketplace, modo: ModoDosValores): PedidosDoMarketplace {
  const porPedido = new Map<string, PedidoDoMarketplace>();
  // No modo "repetidos", o valor do pedido que já apareceu numa linha dele (para conferir as outras).
  const vistos = new Map<string, Partial<Record<(typeof VALORES_DO_PEDIDO)[number], number>>>();
  const problemas: ProblemaDoMarketplace[] = [];
  let deFora = 0;
  let linhas = 0;
  planilha.linhas.forEach((celulas, i) => {
    const numero = planilha.numeros[i] ?? i + 2;
    const celula = (campo: CampoDoMarketplace) => {
      const indice = mapa[campo];
      return indice === undefined ? "" : espacos(celulas[indice] ?? "");
    };
    const idExterno = celula("pedido").replace(/^#/, "");
    const dataTexto = celula("data");
    if (idExterno === "" || dataTexto === "" || ehTotal(idExterno)) {
      deFora += 1;
      return;
    }
    linhas += 1;
    const antes = problemas.length;
    const ler = <T>(campo: CampoDoMarketplace, texto: string, leitor: (t: string) => T): T | undefined => {
      try {
        return leitor(texto);
      } catch {
        problemas.push({ numero, campo, texto: texto.slice(0, 40) });
        return undefined;
      }
    };
    if (!/^[^\s]{1,80}$/.test(idExterno)) problemas.push({ numero, campo: "pedido", texto: idExterno.slice(0, 40) });
    const data = ler("data", dataTexto, (t) => lerDataDoExtrato(t, planilha.formato));
    const dinheiro = (campo: CampoDoMarketplace) => {
      const texto = celula(campo);
      return texto === "" ? undefined : ler(campo, texto, (t) => Math.abs(lerValorDoExtrato(t, planilha.formato)));
    };
    const quantidadeTexto = celula("quantidade");
    const quantidade = quantidadeTexto === "" ? 1 : ler("quantidade", quantidadeTexto, lerQuantidade);
    const valorDaLinha = dinheiro("valor");
    const preco = dinheiro("preco");
    const valor = valorDaLinha ?? (preco !== undefined && quantidade !== undefined ? preco * quantidade : undefined);
    if (valorDaLinha === undefined && preco === undefined && celula("valor") === "" && celula("preco") === "") problemas.push({ numero, campo: mapa.valor !== undefined ? "valor" : "preco", texto: "" });
    const valores = Object.fromEntries(VALORES_DO_PEDIDO.map((c) => [c, dinheiro(c)])) as Record<(typeof VALORES_DO_PEDIDO)[number], number | undefined>;
    const dataRepasseTexto = celula("data_repasse");
    const dataRepasse = dataRepasseTexto === "" ? undefined : ler("data_repasse", dataRepasseTexto, (t) => lerDataDoExtrato(t, planilha.formato));
    const codigo = celula("codigo");
    if (codigo.length > 80) problemas.push({ numero, campo: "codigo", texto: codigo.slice(0, 40) });
    if (problemas.length > antes || data === undefined || quantidade === undefined || valor === undefined) return;

    let pedido = porPedido.get(idExterno);
    if (!pedido) {
      pedido = { id_externo: idExterno, data, bruto: 0, itens: [] };
      porPedido.set(idExterno, pedido);
      vistos.set(idExterno, {});
    }
    if (pedido.itens.length >= ITENS_POR_PEDIDO) {
      problemas.push({ numero, campo: "itens", texto: idExterno.slice(0, 40) });
      return;
    }
    const item: ItemDoMarketplace = { numero, quantidade, valor };
    if (codigo !== "") item.codigo = codigo;
    const titulo = celula("titulo");
    if (titulo !== "") item.titulo = titulo.slice(0, 200).trim();
    pedido.itens.push(item);
    pedido.bruto += valor;
    const situacao = celula("situacao");
    if (situacao !== "") pedido.situacao = situacao.slice(0, 80).trim();
    if (dataRepasse !== undefined && pedido.data_repasse === undefined) pedido.data_repasse = dataRepasse;
    const visto = vistos.get(idExterno) ?? {};
    for (const campo of VALORES_DO_PEDIDO) {
      const v = valores[campo];
      if (v === undefined) continue;
      if (modo === "em_cada_linha") {
        pedido[campo] = (pedido[campo] ?? 0) + v;
      } else if (visto[campo] === undefined) {
        visto[campo] = v;
        pedido[campo] = v;
      } else if (visto[campo] !== v) {
        problemas.push({ numero, campo, texto: `${idExterno}`.slice(0, 40) });
      }
    }
  });
  return { pedidos: [...porPedido.values()], linhas, deFora, problemas };
}
