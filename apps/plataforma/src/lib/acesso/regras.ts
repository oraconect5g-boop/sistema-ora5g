// Regras puras do acesso real (ORA-006): o que fazer com a sessão e como validar e explicar as
// ações da equipe. O banco decide a permissão (RLS e funções); aqui só se escolhe a tela e a
// mensagem, sem nunca transformar falha do serviço em "sem acesso".

export type SituacaoSessao = {
  usuario_ativo: boolean;
  sessao_no_turno: boolean;
  unidade_id: string | null;
  unidade_nome: string | null;
  turno_termina_em: string | null;
};

export type DecisaoSessao =
  | { tipo: "seguir" }
  | { tipo: "entrar" }
  | { tipo: "sair"; erro: "bloqueado" | "turno" }
  | { tipo: "escolher_loja" };

export function decidirSessao(entrada: { temUsuario: boolean; situacao: SituacaoSessao | null; exigirLoja: boolean }): DecisaoSessao {
  if (!entrada.temUsuario || !entrada.situacao) return { tipo: "entrar" };
  if (!entrada.situacao.usuario_ativo) return { tipo: "sair", erro: "bloqueado" };
  if (!entrada.situacao.sessao_no_turno) return { tipo: "sair", erro: "turno" };
  if (entrada.exigirLoja && !entrada.situacao.unidade_id) return { tipo: "escolher_loja" };
  return { tipo: "seguir" };
}

// Papéis que cada um pode conceder (espelha as funções do banco; o banco confere de novo).
export const PAPEIS = {
  dono: { nome: "Dono", escopo: "organizacao" },
  administrador: { nome: "Administrador do sistema", escopo: "organizacao" },
  gerente: { nome: "Gerente", escopo: "unidade" },
  vendedor: { nome: "Vendedor", escopo: "unidade" },
  tecnico: { nome: "Técnico de assistência", escopo: "unidade" },
} as const;
export type Papel = keyof typeof PAPEIS;

export function papeisQuePodeConceder(souDono: boolean): Papel[] {
  return souDono ? ["dono", "administrador", "gerente", "vendedor", "tecnico"] : ["gerente", "vendedor", "tecnico"];
}

export const ehPapel = (valor: unknown): valor is Papel => typeof valor === "string" && Object.hasOwn(PAPEIS, valor);

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const ehUuid = (valor: unknown): valor is string => typeof valor === "string" && UUID.test(valor);

export type DadosConvite = { organizacao: string; nome: string; email: string; papel: Papel; unidades: string[]; motivo: string };

export const ERROS_DA_EQUIPE = {
  organizacao: "Organização inválida.",
  nome: "Informe o nome da pessoa.",
  email: "E-mail inválido.",
  papel: "Escolha a função.",
  lojas: "Escolha ao menos uma loja.",
  sem_lojas: "Dono e administrador valem para a rede inteira, sem loja.",
  motivo: "Informe o motivo (fica na auditoria).",
  sem_permissao: "Você não tem permissão para esta mudança.",
  dados: "Confira os dados: algum campo não foi aceito.",
  nao_encontrado: "Não encontrado (talvez já tenha sido alterado por outra pessoa).",
  ja_na_equipe: "Esta pessoa já está na equipe: dê mais uma loja ou função a ela.",
  convite_aberto: "Já existe um convite em aberto para este e-mail.",
  ultimo_dono: "A organização precisa continuar com pelo menos um dono.",
  falha: "Não foi possível concluir agora. Tente de novo em instantes.",
} as const;
export type ErroDaEquipe = keyof typeof ERROS_DA_EQUIPE;

const motivoValido = (valor: unknown) => (typeof valor === "string" && valor.trim().length >= 3 ? valor.trim() : null);
export { motivoValido };

// Confere o formulário antes de chamar o banco (o banco confere tudo de novo).
export function validarConvite(campos: { organizacao: unknown; nome: unknown; email: unknown; papel: unknown; unidades: unknown[]; motivo: unknown }):
  { ok: true; dados: DadosConvite } | { ok: false; erro: ErroDaEquipe } {
  const nome = typeof campos.nome === "string" ? campos.nome.trim().replace(/\s+/g, " ") : "";
  const email = typeof campos.email === "string" ? campos.email.trim().toLowerCase() : "";
  const motivo = motivoValido(campos.motivo);
  if (!ehUuid(campos.organizacao)) return { ok: false, erro: "organizacao" };
  if (nome.length < 2 || nome.length > 120) return { ok: false, erro: "nome" };
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { ok: false, erro: "email" };
  if (!ehPapel(campos.papel)) return { ok: false, erro: "papel" };
  const unidades = [...new Set(campos.unidades.filter(ehUuid))];
  if (PAPEIS[campos.papel].escopo === "unidade" && unidades.length === 0) return { ok: false, erro: "lojas" };
  if (PAPEIS[campos.papel].escopo === "organizacao" && unidades.length > 0) return { ok: false, erro: "sem_lojas" };
  if (!motivo) return { ok: false, erro: "motivo" };
  return { ok: true, dados: { organizacao: campos.organizacao, nome, email, papel: campos.papel, unidades, motivo } };
}

// Erro do banco → código da tela. Código desconhecido vira "falha" (nenhum detalhe vaza).
const DO_BANCO: Record<string, ErroDaEquipe> = {
  "42501": "sem_permissao", "22023": "dados", P0002: "nao_encontrado", OR006: "ja_na_equipe", "23505": "convite_aberto", "23514": "ultimo_dono",
};
export function erroDoBanco(erro: { code?: string } | null | undefined): ErroDaEquipe {
  const codigo = erro?.code;
  return codigo && Object.hasOwn(DO_BANCO, codigo) ? (DO_BANCO[codigo] as ErroDaEquipe) : "falha";
}

// Senha nova: mínimo de 10 caracteres com letras e números; sem espaço nas pontas.
export const ERROS_DE_SENHA = {
  espaco: "A senha não pode começar nem terminar com espaço.",
  curta: "Use pelo menos 10 caracteres.",
  longa: "Use no máximo 72 caracteres.",
  fraca: "Misture letras e números.",
  diferente: "As duas senhas precisam ser iguais.",
  servico: "Não foi possível gravar a senha agora. Tente de novo.",
} as const;
export function validarSenhaNova(senha: unknown, confirmacao: unknown): keyof typeof ERROS_DE_SENHA | null {
  if (typeof senha !== "string" || senha !== senha.trim()) return "espaco";
  if (senha.length < 10) return "curta";
  if (senha.length > 72) return "longa";
  if (!/[A-Za-zÀ-ÿ]/.test(senha) || !/\d/.test(senha)) return "fraca";
  if (senha !== confirmacao) return "diferente";
  return null;
}

// Hora do fim do turno no horário de São Paulo (para mostrar na tela).
export function horaDoFimDoTurno(iso: string | null): string | null {
  if (!iso) return null;
  const data = new Date(iso);
  if (Number.isNaN(data.getTime())) return null;
  return new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" }).format(data);
}
