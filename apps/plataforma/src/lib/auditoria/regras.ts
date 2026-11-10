// Auditoria real (revisão de 10/11/2026): o banco grava quem fez o quê, quando e em qual loja (só
// inserção, ORA-QUAL-003); quem tem auditoria.ver lê pelo RLS. Aqui só os nomes legíveis das ações.
// O "antes" e o "depois" não vão para a tela: podem ter dado pessoal (LGPD) e a decisão de mostrar
// fica para o proprietário.

const ASSUNTOS: Record<string, string> = {
  vendas: "Venda", venda_itens: "Item da venda", venda_pagamentos: "Pagamento", venda_devolucoes: "Devolução", vales_troca: "Vale-troca",
  aprovacoes_desconto: "Aprovação de desconto", caixas: "Caixa", caixa_movimentos: "Movimento de caixa", estornos_externos: "Estorno",
  notas_pedidos: "Pedido de nota", connect_operacoes: "Operação Ora Connect", connect_habilitacoes: "Habilitação da Ora Connect",
  transferencias: "Transferência", itens_serializados: "Aparelho ou chip", estoque_reservas: "Reserva de estoque", fotos_produto: "Foto do produto",
  produtos: "Produto", variantes: "Variação do produto", precos: "Preço", custos: "Custo", categorias: "Categoria", marcas: "Marca",
  organizacoes: "Rede", empresas: "Empresa", unidades: "Loja", perfis_usuario: "Pessoa", vinculos: "Acesso", convites: "Convite",
  papeis: "Papel", permissoes: "Permissão", papel_permissoes: "Permissões do papel", fiscal_politicas: "Política fiscal",
};
const OPERACOES: Record<string, string> = {
  criado: "criado", alterado: "alterado", removido: "removido", encerrado: "encerrado", bloqueado: "bloqueado", desbloqueado: "desbloqueado",
};
const ESPECIAIS: Record<string, string> = {
  "sessao.unidade_selecionada": "Escolheu a loja do turno",
  "sessao.unidade_negada": "Tentou entrar numa loja sem acesso",
  "sessao.fora_do_turno": "Tentou usar uma sessão fora do turno",
  "sessao.de_outro_usuario": "Tentou usar a sessão de outra pessoa",
  "estoque.item_conferido": "Conferiu um aparelho ou chip",
  "estoque.reserva_de_outro_liberada": "Liberou a reserva de outra pessoa",
};

/** "vendas.criado" vira "Venda criado(a)"; o que não se conhece aparece com o próprio código. */
export function nomeDaAcao(acao: string): string {
  if (Object.hasOwn(ESPECIAIS, acao)) return ESPECIAIS[acao] as string;
  const [assunto = "", operacao = ""] = acao.split(".");
  if (Object.hasOwn(ASSUNTOS, assunto) && Object.hasOwn(OPERACOES, operacao)) return `${ASSUNTOS[assunto]}: ${OPERACOES[operacao]}`;
  return acao;
}

/** Tentativas negadas e bloqueios aparecem destacados. */
export const acaoDeAlerta = (acao: string) => /^sessao\.(unidade_negada|fora_do_turno|de_outro_usuario)$|\.bloqueado$|^vinculos\.encerrado$/.test(acao);

export const PERIODOS_DA_AUDITORIA = { hoje: { rotulo: "Hoje", dias: 0 }, "7": { rotulo: "7 dias", dias: 6 }, "30": { rotulo: "30 dias", dias: 29 } } as const;
