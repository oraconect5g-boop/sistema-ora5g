// Mensagens da fila fiscal (ADR-006). O banco decide tudo; aqui só se escolhe o texto pelo código.
export const ERROS_DAS_NOTAS = {
  ja_pedida: "Esta venda já tem pedido de nota em aberto ou nota emitida.",
  nota_emitida: "Nota já emitida: o cancelamento é fiscal, no emissor, com o contador. A venda só é cancelada depois.",
  chave: "Essa ação já foi feita com outro conteúdo. Recarregue a tela.",
  sem_permissao: "Você não tem permissão para isso.",
  nao_encontrado: "Pedido ou venda não encontrado (talvez já tenha sido alterado).",
  dados: "Confira os dados: CPF/CNPJ válido, chave de acesso com 44 dígitos e do CNPJ desta loja.",
  motivo: "Informe o motivo (fica na auditoria).",
  fonte: "Registre a fonte do prazo (orientação do contador) com pelo menos 10 caracteres.",
  cliente_sem_documento: "O cliente da venda não tem CPF/CNPJ no cadastro: corrija o cadastro ou informe o documento aqui.",
  cliente_sem_endereco: "O cliente da venda não tem o endereço completo no cadastro (CEP, rua, número, bairro, cidade e UF): complete o cadastro dele e peça a nota de novo.",
  ja_emitida: "Esta nota já foi emitida (ou o pedido foi cancelado): os dados do destinatário saem do sistema depois da emissão.",
  documento_tipo: "Envie o PDF (DANFE) ou o XML da nota, do jeito que o emissor entregou.",
  documento_grande: "Arquivo maior que 5 MB: envie o PDF ou o XML da nota, sem outros arquivos junto.",
  documento_outra_nota: "Este XML não é desta nota: a chave de acesso dentro dele é outra.",
  protocolo: "Protocolo de autorização inválido: são 15 dígitos.",
  protocolo_outro: "O protocolo digitado é diferente do que está no XML (ou do já registrado nesta nota): confira.",
  falha: "Não foi possível concluir agora. Tente de novo em instantes.",
} as const;
export type ErroDasNotas = keyof typeof ERROS_DAS_NOTAS;

const DO_BANCO: Record<string, ErroDasNotas> = {
  OR004: "chave", OR014: "ja_pedida", OR015: "nota_emitida", "42501": "sem_permissao", P0002: "nao_encontrado", "22023": "dados",
};
export function erroDasNotas(erro: { code?: string; message?: string } | null | undefined): ErroDasNotas {
  const codigo = erro?.code;
  if (codigo === "22023" && /não tem cpf\/cnpj no cadastro/i.test(erro?.message ?? "")) return "cliente_sem_documento";
  if (codigo === "22023" && /não tem o endereço completo no cadastro/i.test(erro?.message ?? "")) return "cliente_sem_endereco";
  if (codigo === "22023" && /só aparecem enquanto a nota espera/i.test(erro?.message ?? "")) return "ja_emitida";
  if (codigo === "22023" && /já tem outro protocolo/i.test(erro?.message ?? "")) return "protocolo_outro";
  if (codigo === "22023" && /protocolo de autorização inválido/i.test(erro?.message ?? "")) return "protocolo";
  return codigo && Object.hasOwn(DO_BANCO, codigo) ? (DO_BANCO[codigo] as ErroDasNotas) : "falha";
}

/** "há 5 min", "há 2 h 10 min", "há 3 d". */
export function haQuanto(minutos: number): string {
  if (minutos < 60) return `há ${minutos} min`;
  if (minutos < 24 * 60) return `há ${Math.floor(minutos / 60)} h${minutos % 60 ? ` ${minutos % 60} min` : ""}`;
  return `há ${Math.floor(minutos / (24 * 60))} d`;
}
