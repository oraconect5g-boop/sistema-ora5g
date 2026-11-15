// A confirmação de senha recente (lote ORG-006b: ORA-ORG-006; ADR-002 §2.6): aprovar desconto, aprovar nota, conferir o
// caixa, autorizar saída de dinheiro e mexer na equipe pedem a senha (ou o código do segundo fator) digitada nos últimos
// 30 minutos. Quem exige é o banco (OR033, privado.exigir_autenticacao_recente); aqui, para onde a tela leva e de onde
// volta, e as mensagens. Só voltam endereços desta lista: nada de mandar a pessoa para fora do sistema.

/** O código com que o banco pede a confirmação (packages/banco: migration confirmacao_recente, privado.exigir_autenticacao_recente). */
export const CODIGO_DA_CONFIRMACAO = "OR033";
export const precisaConfirmar = (erro: { code?: string } | null | undefined) => erro?.code === CODIGO_DA_CONFIRMACAO;

/** As telas das ações que pedem a confirmação; a volta é uma delas (com o resto do endereço) ou o Início. */
// QUAL-011a: o relatório dos dados do titular (/clientes/<id>/titular) também pede a confirmação.
const VOLTAS = ["/equipe", "/aprovacoes", "/notas", "/caixa", "/clientes"] as const;
export function voltaDaConfirmacao(valor: unknown): string {
  if (typeof valor !== "string" || valor.length > 300 || valor.includes("//") || valor.includes("\\")) return "/inicio";
  const base = VOLTAS.find((v) => valor === v || valor.startsWith(`${v}?`) || valor.startsWith(`${v}#`) || valor.startsWith(`${v}/`));
  return base && /^[\w\-/?=&#%.]*$/.test(valor) ? valor : "/inicio";
}
/** O endereço da tela de confirmação, com a volta e, se houver, a mensagem do erro. */
export function enderecoDaConfirmacao(volta: string, erro?: ErroDaConfirmacao) {
  const p = new URLSearchParams({ volta: voltaDaConfirmacao(volta) });
  if (erro) p.set("erro", erro);
  return `/conta/confirmar?${p}`;
}

export const ERROS_DA_CONFIRMACAO = {
  senha: "Digite a sua senha.",
  credenciais: "Senha incorreta.",
  codigo: "Código errado ou vencido. Confira se a hora do celular está certa e digite o código que aparece agora.",
  muitas: "Muitas tentativas seguidas. Espere alguns minutos e tente de novo.",
  bloqueado: "Seu acesso está bloqueado. Fale com o dono ou o administrador.",
  falha: "Não deu para confirmar agora. Tente de novo em instantes.",
} as const;
export type ErroDaConfirmacao = keyof typeof ERROS_DA_CONFIRMACAO;

/** A recusa do Supabase Auth ao conferir a senha → a mensagem (neutra: não diz mais do que "senha incorreta"). */
export function erroDaSenha(erro: { code?: string; status?: number } | null | undefined): ErroDaConfirmacao {
  if (erro?.code === "over_request_rate_limit" || erro?.status === 429) return "muitas";
  if (erro?.code === "user_banned") return "bloqueado";
  if (erro?.code === "invalid_credentials" || erro?.status === 400) return "credenciais";
  return "falha";
}
