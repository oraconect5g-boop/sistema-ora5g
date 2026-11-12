// Regras puras das telas de venda e caixa (ADR-004). O banco decide tudo de novo; aqui só se lê
// o formulário e se escolhe a mensagem. Mensagem só por código de catálogo (o endereço não injeta texto).
import { lerReais, MEIOS, type MeioPagamento } from "@ora5g/dominio";

export const ERROS_DA_VENDA = {
  sem_estoque: "Não há quantidade suficiente nesta loja.",
  indisponivel: "Este aparelho ou chip não está disponível (já reservado, vendido ou com a reserva vencida). Tire e coloque de novo.",
  outra_loja: "Este IMEI/ICCID é de outra loja.",
  chave: "Essa ação já foi feita com outro conteúdo. Recarregue a tela.",
  preco_mudou: "O preço de um item mudou. Tire e coloque o item de novo para ver o preço novo.",
  sem_caixa: "Abra o seu caixa antes de concluir a venda.",
  pagamento: "O pagamento não confere: some os valores, informe o comprovante de cartão e Pix e o e-mail na PayJoy.",
  aprovacao: "Há desconto sem aprovação válida. Peça a aprovação ou tire o desconto.",
  sem_permissao: "Você não tem permissão para isso.",
  nao_encontrado: "Não encontrado (talvez já tenha sido alterado).",
  dados: "Confira os dados digitados.",
  ja_aberto: "Você já tem um caixa aberto nesta loja.",
  limite: "O valor passa do que há no caixa ou deixa o estoque negativo.",
  valor: "Valor em reais inválido. Use, por exemplo, 1.299,90.",
  motivo: "Informe o motivo (fica na auditoria).",
  connect: "Há operação da Ora Connect em andamento ou feita ligada a esta venda (chip ativado ou serviço pago): a gerência resolve a operação antes de cancelar.",
  nota_emitida: "Esta venda tem nota fiscal emitida: o cancelamento ou a devolução fiscal vem antes (com o contador).",
  financiada: "Venda financiada (PayJoy/Aiva): a devolução parcial passa pela financeira; use o cancelamento total.",
  com_devolucao: "Esta venda já tem devolução: devolva os itens que restam em vez de cancelar tudo.",
  vale: "Vale-troca não encontrado ou sem saldo suficiente: confira o número e o valor.",
  vale_numero: "Vale-troca: informe o número do vale no campo do comprovante.",
  conferencia: "Confira o IMEI/ICCID e a condição do item devolvido: o IMEI/ICCID precisa ser o do item vendido.",
  comprovante: "Informe o código do comprovante do estorno (de 4 a 60 caracteres): maquininha, banco ou protocolo da financeira.",
  explicacao: "Explique por que o item não voltou (pelo menos 10 caracteres).",
  reembolso: "O reembolso precisa somar o valor devolvido, só nos meios que a venda usou e até o que cada um pagou.",
  sem_item: "Escolha a quantidade de pelo menos um item para devolver.",
  condicao: "Escolha a condição de cada item devolvido (novo, seminovo ou avariado): nada volta ao estoque como novo sem alguém decidir.",
  maquininha: "Escolha a maquininha usada (da loja e do mesmo provedor do pagamento).",
  cliente: "Cliente não encontrado nesta rede (ou inativo): busque de novo pelo CPF ou telefone.",
  falha: "Não foi possível concluir agora. Tente de novo em instantes.",
} as const;
export type ErroDaVenda = keyof typeof ERROS_DA_VENDA;

const DO_BANCO: Record<string, ErroDaVenda> = {
  OR001: "sem_estoque", OR002: "indisponivel", OR003: "outra_loja", OR004: "chave", OR005: "indisponivel", OR007: "preco_mudou",
  OR008: "sem_caixa", OR009: "pagamento", OR010: "aprovacao", "42501": "sem_permissao", P0002: "nao_encontrado",
  "22023": "dados", "23505": "ja_aberto", "23514": "limite", OR013: "connect", OR015: "nota_emitida", OR016: "financiada", OR017: "com_devolucao", OR018: "vale",
};
export function erroDaVenda(erro: { code?: string } | null | undefined): ErroDaVenda {
  const codigo = erro?.code;
  return codigo && Object.hasOwn(DO_BANCO, codigo) ? (DO_BANCO[codigo] as ErroDaVenda) : "falha";
}

export const ehMeio = (valor: unknown): valor is MeioPagamento => typeof valor === "string" && Object.hasOwn(MEIOS, valor);

export function lerValor(texto: unknown): number | null {
  if (typeof texto !== "string" || texto.trim() === "") return null;
  try {
    return lerReais(texto);
  } catch {
    return null;
  }
}

export type LinhaDePagamento = { meio: MeioPagamento; valor: number; entrada?: number; meio_entrada?: MeioPagamento; comprovante?: string; terminal?: string };
/** Meios que passam por maquininha (o provedor decide quais maquininhas servem: L7a). */
export const PROVEDOR_DO_MEIO: Partial<Record<MeioPagamento, "picpay" | "pagbank">> = { pix_picpay: "picpay", cartao_picpay: "picpay", cartao_pagseguro: "pagbank" };

// Lê até N linhas do formulário (pagamento_1_meio, pagamento_1_valor...); linha sem valor é ignorada.
export function lerPagamentos(dados: { get: (nome: string) => unknown }, linhas = 3): { ok: true; pagamentos: LinhaDePagamento[] } | { ok: false; erro: ErroDaVenda } {
  const pagamentos: LinhaDePagamento[] = [];
  for (let i = 1; i <= linhas; i++) {
    const bruto = dados.get(`pagamento_${i}_valor`);
    if (typeof bruto !== "string" || bruto.trim() === "") continue;
    const meio = dados.get(`pagamento_${i}_meio`);
    const valor = lerValor(bruto);
    if (!ehMeio(meio) || valor === null || valor <= 0) return { ok: false, erro: valor === null ? "valor" : "pagamento" };
    const linha: LinhaDePagamento = { meio, valor };
    const comprovante = dados.get(`pagamento_${i}_comprovante`);
    if (typeof comprovante === "string" && comprovante.trim()) linha.comprovante = comprovante.trim().slice(0, 60);
    // Maquininha usada (L7a): só nos meios de maquininha; o banco confere se é da loja, ativa e do mesmo provedor.
    const terminal = dados.get(`pagamento_${i}_terminal`);
    if (PROVEDOR_DO_MEIO[meio] && typeof terminal === "string" && /^[0-9a-f-]{36}$/.test(terminal)) linha.terminal = terminal;
    if (meio === "vale_troca") {
      // O número do vale vai no campo do comprovante; o banco confere o vale e o saldo.
      const numero = (linha.comprovante ?? "").replace(/\D/g, "");
      if (!/^\d{1,12}$/.test(numero)) return { ok: false, erro: "vale_numero" };
      linha.comprovante = `VT-${Number(numero)}`;
    }
    if (MEIOS[meio].financeira) {
      const entradaBruta = dados.get(`pagamento_${i}_entrada`);
      const entrada = typeof entradaBruta === "string" && entradaBruta.trim() ? lerValor(entradaBruta) : 0;
      if (entrada === null) return { ok: false, erro: "valor" };
      if (entrada > 0) {
        linha.entrada = entrada;
        // Sem o campo, a entrada é em dinheiro; meio inválido é recusado, nunca trocado por dinheiro (#52).
        const meioEntrada = dados.get(`pagamento_${i}_meio_entrada`);
        if (typeof meioEntrada === "string" && meioEntrada !== "" && (!ehMeio(meioEntrada) || MEIOS[meioEntrada].financeira || meioEntrada === "vale_troca" || meioEntrada === "link_pagamento")) {
          return { ok: false, erro: "pagamento" };
        }
        linha.meio_entrada = ehMeio(meioEntrada) ? meioEntrada : "dinheiro";
        // Entrada por Pix ou cartão: o comprovante da entrada vai no campo do comprovante da linha (#46).
        if (MEIOS[linha.meio_entrada].comprovante && (linha.comprovante ?? "").length < 4) return { ok: false, erro: "pagamento" };
      }
    }
    pagamentos.push(linha);
  }
  return pagamentos.length ? { ok: true, pagamentos } : { ok: false, erro: "pagamento" };
}


export const CONDICOES_DE_RETORNO = { novo: "Novo (lacrado)", seminovo: "Seminovo", avariado: "Avariado" } as const;
export type CondicaoDeRetorno = keyof typeof CONDICOES_DE_RETORNO;
export type ItemDevolvivel = { id: string; restante: number; fisico: boolean; serializado?: boolean };
export type PedidoDeDevolucao = {
  itens: { item: string; quantidade: number; condicao?: CondicaoDeRetorno; identificador?: string }[];
  reembolsos: { meio: MeioPagamento; valor: number }[];
};

/**
 * Formulário de devolução (adendo do ADR-004): devolver_<item> = quantidade (até o que resta),
 * condicao_<item> nos itens físicos, identificador_<item> (IMEI/ICCID conferido no balcão, #51) nos
 * aparelhos e chips; reembolso_N_meio/_valor em até 3 linhas (vale-troca é um meio).
 * O banco confere de novo valores, meios, limites e a identidade do item.
 */
export function lerDevolucao(dados: { get: (nome: string) => unknown }, itens: readonly ItemDevolvivel[], linhas = 3):
  { ok: true; pedido: PedidoDeDevolucao } | { ok: false; erro: ErroDaVenda } {
  const pedido: PedidoDeDevolucao = { itens: [], reembolsos: [] };
  for (const item of itens) {
    const bruto = dados.get(`devolver_${item.id}`);
    const texto = typeof bruto === "string" ? bruto.trim() : "";
    if (texto === "" || texto === "0") continue;
    if (!/^\d{1,4}$/.test(texto) || Number(texto) > item.restante) return { ok: false, erro: "dados" };
    const linha: PedidoDeDevolucao["itens"][number] = { item: item.id, quantidade: Number(texto) };
    if (item.fisico) {
      // A condição é escolhida por quem recebe (ORA-INV-010): sem ela, nada volta ao estoque como novo.
      const condicao = dados.get(`condicao_${item.id}`);
      if (typeof condicao !== "string" || !Object.hasOwn(CONDICOES_DE_RETORNO, condicao)) return { ok: false, erro: "condicao" };
      linha.condicao = condicao as CondicaoDeRetorno;
    }
    if (item.serializado) {
      const identificador = String(dados.get(`identificador_${item.id}`) ?? "").replace(/\D/g, "");
      if (!/^\d{14,20}$/.test(identificador)) return { ok: false, erro: "conferencia" };
      linha.identificador = identificador;
    }
    pedido.itens.push(linha);
  }
  if (pedido.itens.length === 0) return { ok: false, erro: "sem_item" };
  for (let i = 1; i <= linhas; i++) {
    const bruto = dados.get(`reembolso_${i}_valor`);
    if (typeof bruto !== "string" || bruto.trim() === "") continue;
    const meio = dados.get(`reembolso_${i}_meio`);
    const valor = lerValor(bruto);
    if (valor === null || valor <= 0) return { ok: false, erro: "valor" };
    if (!ehMeio(meio) || MEIOS[meio].financeira || meio === "link_pagamento") return { ok: false, erro: "reembolso" };
    pedido.reembolsos.push({ meio, valor });
  }
  return pedido.reembolsos.length ? { ok: true, pedido } : { ok: false, erro: "reembolso" };
}
