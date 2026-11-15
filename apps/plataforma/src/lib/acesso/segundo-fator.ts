// O segundo fator (lote ORG-007a: ORA-ORG-007, "autenticação reforçada para perfis privilegiados"; ADR-002 §2.6):
// as regras puras da tela do código (/entrar/codigo) e da Segurança da conta (/conta/seguranca). Quem confere o código
// é o Supabase Auth (TOTP: o código de 6 algarismos de um aplicativo autenticador no celular); quem EXIGE o código de
// quem o ligou é o banco (privado.segundo_fator_em_dia, dentro de todas as permissões). Aqui só se escolhem a
// mensagem, o celular e o nome, sem nunca repetir na tela o texto do serviço.

export const ERROS_DO_CODIGO = {
  formato: "Digite os 6 algarismos que aparecem no aplicativo do celular.",
  codigo: "Código errado ou vencido. Confira se a hora do celular está certa e digite o código que aparece agora.",
  vencido: "O pedido do código venceu. Digite o código que aparece agora no aplicativo.",
  muitas: "Muitas tentativas seguidas. Espere alguns minutos e tente de novo.",
  celular: "Escolha qual dos celulares cadastrados está com você.",
  falha: "Não deu para conferir o código agora. Tente de novo em instantes.",
} as const;
export type ErroDoCodigo = keyof typeof ERROS_DO_CODIGO;

type ErroDoAuth = { code?: string; status?: number } | null | undefined;

/** Recusa do Supabase Auth ao conferir o código → a mensagem (códigos de erro do @supabase/auth-js 2.119). */
export function erroDoCodigo(erro: ErroDoAuth): ErroDoCodigo {
  switch (erro?.code) {
    case "mfa_verification_failed":
    case "mfa_verification_rejected":
      return "codigo";
    case "mfa_challenge_expired":
      return "vencido";
    case "over_request_rate_limit":
      return "muitas";
    case "mfa_factor_not_found":
      return "celular";
    default:
      return erro?.status === 429 ? "muitas" : "falha";
  }
}

export const ERROS_DO_CADASTRO = {
  nome: "Dê um nome ao celular (de 2 a 40 letras), para reconhecer depois.",
  repetido: "Já existe um celular cadastrado com esse nome: use outro.",
  limite: "Limite de celulares cadastrados: tire um que não usa mais.",
  codigo: "Código errado ou vencido. Confira se a hora do celular está certa e digite o código que aparece agora.",
  muitas: "Muitas tentativas seguidas. Espere alguns minutos e tente de novo.",
  desligado: "A verificação em duas etapas está desligada no Supabase deste ambiente: fale com o dono.",
  sessao: "Para mexer nos celulares cadastrados, entre de novo com a senha e o código.",
  falha: "Não deu para concluir agora. Tente de novo em instantes.",
} as const;
export type ErroDoCadastro = keyof typeof ERROS_DO_CADASTRO;

/** Recusa do Supabase Auth ao cadastrar, conferir ou tirar um celular → a mensagem. */
export function erroDoCadastro(erro: ErroDoAuth): ErroDoCadastro {
  switch (erro?.code) {
    case "mfa_factor_name_conflict":
      return "repetido";
    case "too_many_enrolled_mfa_factors":
      return "limite";
    case "mfa_verification_failed":
    case "mfa_verification_rejected":
    case "mfa_challenge_expired":
      return "codigo";
    case "over_request_rate_limit":
      return "muitas";
    case "mfa_totp_enroll_not_enabled":
    case "mfa_totp_verify_not_enabled":
      return "desligado";
    case "insufficient_aal":
      return "sessao";
    default:
      return erro?.status === 429 ? "muitas" : "falha";
  }
}

/** Para onde a tela do código leva depois de conferir: a troca de senha (a recuperação pelo e-mail de quem tem o
 *  segundo fator passa pelo código antes) ou, como sempre, a escolha da loja. Só "senha" vale; o resto é a loja. */
export const depoisDoCodigo = (valor: unknown): "senha" | null => (valor === "senha" ? "senha" : null);
export const caminhoDepoisDoCodigo = (depois: "senha" | null) => (depois === "senha" ? "/conta/senha" : "/escolher-loja");
/** O endereço da tela do código, com a mensagem do erro e o destino de depois. */
export function enderecoDoCodigo(erro: string | null, depois: "senha" | null) {
  const p = new URLSearchParams();
  if (erro) p.set("erro", erro);
  if (depois) p.set("depois", depois);
  const q = p.toString();
  return `/entrar/codigo${q ? `?${q}` : ""}`;
}

/** O código digitado: 6 algarismos (aceita espaço e hífen no meio, como alguns aplicativos mostram). */
export function codigoValido(valor: unknown): string | null {
  const limpo = typeof valor === "string" ? valor.replace(/[\s-]/g, "") : "";
  return /^\d{6}$/.test(limpo) ? limpo : null;
}

/** O nome do celular (para reconhecer na lista e na hora de entrar): de 2 a 40 letras, sem espaço sobrando. */
export function nomeDoCelular(valor: unknown): string | null {
  const nome = typeof valor === "string" ? valor.trim().replace(/\s+/g, " ") : "";
  return nome.length >= 2 && nome.length <= 40 ? nome : null;
}

export type Celular = { id: string; nome: string; cadastradoEm: string };
type FatorDoAuth = { id: string; friendly_name?: string | null; factor_type: string; status: string; created_at: string };

/** Os celulares cadastrados: os fatores TOTP verificados, do mais antigo ao mais novo (o cadastro abandonado não conta). */
export function celularesCadastrados(lista: { all?: readonly FatorDoAuth[] } | null | undefined): Celular[] {
  return (lista?.all ?? [])
    .filter((f) => f.factor_type === "totp" && f.status === "verified")
    .map((f) => ({ id: f.id, nome: f.friendly_name?.trim() || "Celular", cadastradoEm: f.created_at }))
    .sort((a, b) => a.cadastradoEm.localeCompare(b.cadastradoEm));
}

/** Os cadastros que ficaram pela metade (o QR gerado e o código nunca conferido): saem antes de um cadastro novo. */
export function cadastrosAbandonados(lista: { all?: readonly FatorDoAuth[] } | null | undefined): string[] {
  return (lista?.all ?? []).filter((f) => f.factor_type === "totp" && f.status !== "verified").map((f) => f.id);
}

/** O segredo do QR em grupos de 4 letras, para digitar no aplicativo quando a câmera não lê o QR. */
export const segredoEmGrupos = (segredo: string) => segredo.replace(/\s/g, "").replace(/(.{4})(?=.)/g, "$1 ");
