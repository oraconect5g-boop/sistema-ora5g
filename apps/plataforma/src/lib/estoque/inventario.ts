// Inventário cíclico (lote L4b: ORA-INV-008): mensagens e erro do banco → chave do catálogo.

export const SITUACOES_DO_INVENTARIO = {
  em_contagem: { texto: "em contagem", tom: "info" },
  enviado: { texto: "aguardando aprovação", tom: "aviso" },
  aprovado: { texto: "aprovado", tom: "sucesso" },
  recusado: { texto: "recusado", tom: "perigo" },
  cancelado: { texto: "cancelado", tom: "neutro" },
} as const;

export const ERROS_DO_INVENTARIO = {
  dados: "Dados inválidos: confira os campos.",
  motivo: "Informe o motivo (de 3 a 200 letras); ele fica na auditoria.",
  descricao: "Descreva o inventário (de 3 a 120 letras), por exemplo \"Capas e películas\".",
  itens: "Escolha de 1 a 300 itens para contar (aparelho, chip ou acessório).",
  quantidade: "Informe a quantidade contada (0 a 100.000) ou os IMEI/ICCID lidos.",
  nao_contado: "Conte todos os itens antes de enviar.",
  encerrado: "Este inventário não está mais em contagem.",
  mesma_pessoa: "Quem abriu, contou ou enviou o inventário não decide: outra pessoa com permissão de ajuste decide.",
  mudou: "O estoque de algum item mudou desde a contagem e não comporta o ajuste: abra outro inventário e conte de novo.",
  loja_inativa: "Loja inativa.",
  permissao: "Sem permissão para esta etapa do inventário.",
  falha: "Não deu para gravar agora. Tente de novo em instantes.",
} as const;
export type ErroDoInventario = keyof typeof ERROS_DO_INVENTARIO;

export function erroDoInventario(erro: { code?: string; message?: string } | null | undefined): ErroDoInventario {
  const codigo = erro?.code ?? "";
  const m = (erro?.message ?? "").toLowerCase();
  if (codigo === "42501" || codigo === "P0002") return "permissao";
  if (codigo === "OR025") return "mesma_pessoa";
  if (codigo === "OR001") return "mudou";
  if (codigo === "OR019") return "loja_inativa";
  if (codigo === "22023") {
    const regras: [string, ErroDoInventario][] = [
      ["informe o motivo", "motivo"], ["descreva", "descricao"], ["itens para contar", "itens"], ["algum item", "itens"],
      ["quantidade", "quantidade"], ["imei", "quantidade"], ["conte todos", "nao_contado"], ["não está mais em contagem", "encerrado"],
      ["encerrado", "encerrado"], ["decidido", "encerrado"], ["não faz parte", "dados"],
    ];
    return regras.find(([t]) => m.includes(t))?.[1] ?? "dados";
  }
  return "falha";
}
