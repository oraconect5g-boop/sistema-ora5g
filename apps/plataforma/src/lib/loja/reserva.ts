// A reserva do site com retirada na loja (lote ONLINE-b: ORA-ONLINE-006; ADR-009). Quem decide é o banco
// (public.loja_reservar: o produto do site, a loja, o preço do balcão, o estoque, 24 horas, até 2 reservas ativas por
// WhatsApp e 20 por loja por hora). Aqui: a leitura do formulário, as mensagens e o limite por endereço de internet.
import { brl } from "../formato";

export type ConfirmacaoDaReserva = {
  codigo: string; expira_em: string; preco_centavos: number; produto: string; variacao: string;
  loja: { nome: string; endereco: string | null; cidade: string | null };
};

export const ERROS_DA_RESERVA = {
  dados: "Confira o nome (de 2 a 80 letras) e o WhatsApp com DDD (11 números).",
  aceite: "Para reservar, marque que concorda com o uso do nome e do WhatsApp para esta reserva.",
  limite_whatsapp: "Este WhatsApp já tem 2 reservas ativas. Retire uma delas na loja ou espere vencer.",
  limite_loja: "Muitas reservas nesta loja agora. Tente de novo daqui a pouco.",
  limite_rede: "Muitas reservas seguidas deste aparelho. Tente de novo mais tarde.",
  sem_estoque: "Acabou de acabar: esta loja não tem mais este produto agora. Veja outra loja.",
  indisponivel: "Este produto não está mais disponível para reserva nesta loja.",
  repetida: "Esta reserva já foi feita com outros dados. Recarregue a página e tente de novo.",
  sem_reserva: "A reserva pelo site ainda não está disponível. Enquanto isso, procure a loja.",
  falha: "Não deu para reservar agora. Tente de novo em instantes.",
} as const;
export type ErroDaReserva = keyof typeof ERROS_DA_RESERVA;

/** A recusa do banco pelo código. */
export function erroDaReserva(erro: { code?: string } | null | undefined): ErroDaReserva {
  switch (erro?.code) {
    case "22023": return "dados";
    case "OR034": return "limite_whatsapp";
    case "OR035": return "limite_loja";
    case "OR001": return "sem_estoque";
    // "Não está à venda na loja online": OR036 desde o ONLINE-c; P0002 é o código antigo (banco sem a migration).
    case "OR036": case "P0002": return "indisponivel";
    case "OR004": return "repetida";
    // A função ainda não existe no banco (migration do ONLINE-b não aplicada).
    case "PGRST202": case "42883": return "sem_reserva";
    default: return "falha";
  }
}

/** O WhatsApp digitado: só os números, sem o 55 do país; celular com DDD (11 números) ou nulo. */
export function whatsappDoFormulario(valor: unknown): string | null {
  if (typeof valor !== "string") return null;
  let numeros = valor.replace(/\D/g, "");
  if (numeros.length === 13 && numeros.startsWith("55")) numeros = numeros.slice(2);
  return /^[1-9]{2}9\d{8}$/.test(numeros) ? numeros : null;
}
/** O WhatsApp revelado para a loja, legível: "(41) 98765-0001". */
export function whatsappLegivel(numero: string): string {
  return /^\d{11}$/.test(numero) ? `(${numero.slice(0, 2)}) ${numero.slice(2, 7)}-${numero.slice(7)}` : numero;
}
/** O nome digitado: de 2 a 80 letras, sem espaços sobrando; senão, nulo. */
export function nomeDoFormulario(valor: unknown): string | null {
  if (typeof valor !== "string") return null;
  const nome = valor.replace(/\s+/g, " ").trim();
  return nome.length >= 2 && nome.length <= 80 ? nome : null;
}

/**
 * O limite por endereço de internet, na memória do servidor: até `maximo` reservas por `janelaMs` (padrão: 5 por hora).
 * Complementa os limites do banco (por WhatsApp e por loja); reinicia com o servidor, o que basta contra o abuso comum.
 */
export function criarLimitador(maximo = 5, janelaMs = 3_600_000, agora: () => number = Date.now) {
  const vezes = new Map<string, number[]>();
  return (endereco: string): boolean => {
    const instante = agora();
    const recentes = (vezes.get(endereco) ?? []).filter((t) => instante - t < janelaMs);
    if (recentes.length >= maximo) {
      vezes.set(endereco, recentes);
      return false;
    }
    recentes.push(instante);
    vezes.set(endereco, recentes);
    if (vezes.size > 10_000) for (const [chave, lista] of vezes) if (lista.every((t) => instante - t >= janelaMs)) vezes.delete(chave);
    return true;
  };
}

/**
 * O endereço de quem pede: o ÚLTIMO da lista x-forwarded-for, o que o servidor de entrada (o Apache da homologação)
 * acrescenta; o começo da lista vem de quem pede e pode ser inventado. Sem o Apache, o Next preenche com o endereço
 * da conexão. Sem nenhum, "desconhecido".
 */
export function enderecoDeQuemPede(cabecalhos: { get: (nome: string) => string | null }): string {
  return cabecalhos.get("x-forwarded-for")?.split(",").map((e) => e.trim()).filter(Boolean).at(-1) ?? "desconhecido";
}

/** Quanto falta para vencer, por extenso curto ("23 h", "40 min", "venceu"). */
export function tempoAteVencer(expiraEm: string, agora = Date.now()): string {
  const minutos = Math.floor((Date.parse(expiraEm) - agora) / 60_000);
  if (minutos <= 0) return "venceu";
  if (minutos < 60) return `${minutos} min`;
  return `${Math.floor(minutos / 60)} h`;
}

// --- A loja (a tela "Reservas do site") ---
/** A tabela das reservas ainda não existe no banco (migration do ONLINE-b não aplicada): PGRST205 da API ou 42P01. */
export const reservasAusentes = (erro: { code?: string } | null | undefined) => erro?.code === "PGRST205" || erro?.code === "42P01";

export const ERROS_DA_LOJA = {
  nao_encontrada: "Reserva não encontrada nesta loja (talvez seja de outra loja ou já tenha mudado).",
  motivo: "Informe o motivo do cancelamento (de 3 a 200 letras).",
  cancelada: "Esta reserva foi cancelada.",
  vencida: "Esta reserva venceu: venda pelo PDV, se ainda houver estoque.",
  atendida: "Esta reserva já foi atendida: a venda segue no PDV.",
  sem_permissao: "Você não tem permissão para isso.",
  falha: "Não deu para concluir agora. Tente de novo em instantes.",
} as const;
export type ErroDaLoja = keyof typeof ERROS_DA_LOJA;

/** A recusa do banco nas ações da loja, pela mensagem (22023) e pelo código. */
export function erroDaLoja(erro: { code?: string; message?: string } | null | undefined): ErroDaLoja {
  const mensagem = erro?.message ?? "";
  if (erro?.code === "22023") {
    if (/venceu/i.test(mensagem)) return "vencida";
    if (/cancelada/i.test(mensagem)) return "cancelada";
    if (/atendida/i.test(mensagem)) return "atendida";
    return "motivo";
  }
  if (erro?.code === "P0002") return "nao_encontrada";
  if (erro?.code === "42501") return "sem_permissao";
  return "falha";
}

/** Os valores da reserva atendida que o PDV mostra (só números; nada da pessoa vai no endereço). */
export function avisoDaReservaNoPdv(anunciado: unknown, atual: unknown): { anunciado: number; atual: number } | null {
  const numero = (v: unknown) => (typeof v === "string" && /^\d{1,12}$/.test(v) ? Number(v) : null);
  const a = numero(anunciado);
  const b = numero(atual);
  return a === null || b === null ? null : { anunciado: a, atual: b };
}

/**
 * O aviso do PDV quando a loja atende a reserva: a venda abre com a unidade reservada. Se o preço de hoje subiu, a oferta
 * anunciada no site vale (Código de Defesa do Consumidor, art. 30): o vendedor dá a diferença de desconto no item.
 */
export function avisoDaReservaAtendida(anunciado: unknown, atual: unknown): { tom: "aviso" | "sucesso"; texto: string } {
  const precos = avisoDaReservaNoPdv(anunciado, atual);
  const inicio = "Venda da reserva do site aberta com a unidade reservada.";
  if (precos && precos.atual > precos.anunciado) {
    return { tom: "aviso", texto: `${inicio} O preço anunciado foi ${brl(precos.anunciado)} e o de hoje é ${brl(precos.atual)}: a oferta vale, dê ${brl(precos.atual - precos.anunciado)} de desconto no item.` };
  }
  return { tom: "sucesso", texto: `${inicio} Confira o cliente, o pagamento e conclua.` };
}
