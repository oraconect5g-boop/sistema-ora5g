// Lojas da rede (L2) montadas com a sessão e o Supabase SIMULADOS: nenhuma credencial, nenhuma rede.
// Confere permissão, lista, pendências da inativação, histórico e o que as ações mandam ao banco.
// As regras do banco estão provadas em packages/banco/src/lojas.test.ts.
import { isValidElement, type ReactElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const LOJA = "00000000-0000-4000-8000-0000000000cc";
const OUTRA = "00000000-0000-4000-8000-0000000000dd";
const DONO = "00000000-0000-4000-8000-0000000000aa";
const EMPRESA = "00000000-0000-4000-8000-0000000000ee";
const ORG = "00000000-0000-4000-8000-0000000000ff";

const cenario = vi.hoisted(() => ({
  permissoes: new Set<string>(),
  chamadas: [] as { nome: string; argumentos: Record<string, unknown> }[],
  respostas: {} as Record<string, { data: unknown; error: null | { code: string; message?: string } }>,
  tabelas: {} as Record<string, Record<string, unknown>[]>,
  /** Erro de leitura por tabela (ORG-009: sem regiões no cenário, o banco "ainda não tem" a tabela). */
  erros: {} as Record<string, { code: string }>,
}));

vi.mock("next/headers", () => ({ cookies: async () => ({ getAll: () => [], set: () => undefined }) }));
vi.mock("next/navigation", () => ({ redirect: (destino: string) => { throw new Error(`redirecionou para ${destino}`); } }));

class Consulta {
  linhas: Record<string, unknown>[];
  erro: { code: string } | null;
  constructor(nome: string) {
    this.linhas = [...(cenario.tabelas[nome] ?? [])];
    this.erro = cenario.erros[nome] ?? (nome === "regioes" && !cenario.tabelas.regioes ? { code: "PGRST205" } : null);
  }
  select() { return this; }
  range(de: number, ate: number) { this.linhas = this.linhas.slice(de, ate + 1); return this; }
  eq(coluna: string, valor: unknown) { this.linhas = this.linhas.filter((l) => l[coluna] === undefined || l[coluna] === valor); return this; }
  in() { return this; }
  is() { return this; }
  order() { return this; }
  limit() { return this; }
  maybeSingle() { return Promise.resolve({ data: this.linhas[0] ?? null, error: null }); }
  then(resolver: (r: { data: Record<string, unknown>[] | null; error: { code: string } | null }) => unknown) {
    return Promise.resolve(this.erro ? { data: null, error: this.erro } : { data: this.linhas, error: null }).then(resolver);
  }
}
const sessaoFicticia = {
  // VEL-b: as permissões vêm no molde da sessão, pela mesma regra do rpc simulado.
  get molde() { return { permissoes: { has: (p: string) => Boolean(cenario.permissoes.has(p)) }, nome: null, vinculos: [], pendencias: { aprovacoes: 0, notas: 0 } }; },
  usuario: { id: DONO },
  situacao: { usuario_ativo: true, sessao_no_turno: true, unidade_id: LOJA, unidade_nome: "Santa Cândida (teste)", turno_termina_em: "2026-11-10T23:00:00Z" },
  supabase: {
    from: (nome: string) => new Consulta(nome),
    rpc: async (nome: string, argumentos: Record<string, unknown> = {}) => {
      if (nome === "tem_permissao") return { data: cenario.permissoes.has(String(argumentos.p_permissao)), error: null };
      cenario.chamadas.push({ nome, argumentos });
      return cenario.respostas[nome] ?? { data: null, error: null };
    },
  },
};
vi.mock("../../lib/acesso/sessao", () => ({ FalhaDoServico: class extends Error {}, obterSessao: async () => sessaoFicticia }));

import { atualizarLoja, criarLoja, definirConfiguracao, definirRegiaoDaLoja, definirSituacao, salvarRegiao } from "./acoes";
import Lojas from "./page";

function texto(v: unknown): string {
  if (Array.isArray(v)) return v.map(texto).join(" ");
  if (typeof v === "string" || typeof v === "number") return String(v);
  if (isValidElement<Record<string, unknown>>(v)) {
    // Os componentes das regiões (ORG-009) e o motivo são simples: renderiza para ver o texto e os campos.
    if (typeof v.type === "function" && ["CartaoDasRegioes", "RegiaoDaLoja", "Motivo"].includes(v.type.name)) return texto((v.type as (p: unknown) => unknown)(v.props));
    return Object.values(v.props).map(texto).join(" ");
  }
  if (v && typeof v === "object") return Object.values(v).map(texto).join(" ");
  return "";
}
const tela = async (parametros: Record<string, string> = {}) => texto(await Lojas({ searchParams: Promise.resolve(parametros) }) as ReactElement);
const destinoDe = async (acao: Promise<unknown>) => {
  try { await acao; } catch (e) { return (e as Error).message.replace("redirecionou para ", ""); }
  throw new Error("a ação não redirecionou");
};
const formulario = (campos: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(campos)) f.set(k, v);
  return f;
};

const SANTA = {
  id: LOJA, organizacao_id: ORG, empresa_id: EMPRESA, codigo: "santa-candida", nome: "Santa Cândida (teste)", tipo: "loja_fisica",
  cnpj: "11222333000181", uf: "PR", cidade: "Curitiba", status: "ativa", unidade_emissora_id: null, vigente_desde: "2026-11-01T12:00:00Z",
  telefone: "4133334444", cep: "80010000", logradouro: "Rua Fictícia", numero: "100", complemento: null, bairro: "Centro",
  inscricao_estadual: "1234567890", inscricao_municipal: null,
  horarios: [1, 2, 3, 4, 5].map((dia) => ({ dia, abre: "09:00", fecha: "18:00" })), versoes: 2, proxima_versao: "2026-12-01T11:00:00Z",
};
const FECHADA = {
  ...SANTA, id: OUTRA, codigo: "loja-02", nome: "Loja 02 (teste)", cnpj: "11222333000262", status: "inativa", vigente_desde: null,
  telefone: null, cep: null, logradouro: null, numero: null, bairro: null, inscricao_estadual: null, horarios: [], versoes: 0, proxima_versao: null,
};

beforeEach(() => {
  cenario.permissoes = new Set();
  cenario.chamadas = [];
  cenario.respostas = { lojas_da_rede: { data: [SANTA, FECHADA], error: null } };
  cenario.erros = {};
  cenario.tabelas = { empresas: [{ id: EMPRESA, organizacao_id: ORG, razao_social: "Empresa Teste Ltda", nome_fantasia: "Ora 5G (teste)", cnpj_raiz: "11222333", status: "ativa" }] };
});

describe("/lojas", () => {
  it("sem unidades.gerir (gerente, vendedor): sem permissão e sem consultar as lojas", async () => {
    cenario.permissoes = new Set(["venda.ver_unidade"]);
    const t = await tela();
    expect(t).toContain("Sem permissão");
    expect(cenario.chamadas).toEqual([]);
  });

  it("dono: resumo, dados vigentes formatados, próxima versão e a loja inativa", async () => {
    cenario.permissoes = new Set(["unidades.gerir"]);
    const t = await tela();
    expect(cenario.chamadas.map((c) => c.nome)).toEqual(["lojas_da_rede"]);
    for (const trecho of ["Santa Cândida (teste)", "11.222.333/0001-81", "(41) 3333-4444", "Rua Fictícia, 100 – Centro – 80010-000", "Seg a Sex 09:00–18:00", "Próxima versão", "Loja 02 (teste)", "inativa", "Reativar loja", "Ora 5G (teste)"]) {
      expect(t).toContain(trecho);
    }
    // A loja inativa não conta como cadastro incompleto; uma ativa sem telefone conta.
    expect(t).not.toContain("Falta cadastrar");
    cenario.respostas.lojas_da_rede = { data: [{ ...SANTA, telefone: null }, FECHADA], error: null };
    expect(await tela()).toMatch(/Falta cadastrar:\s+telefone\s+\./);
  });

  it("pendências da inativação: só as chaves do catálogo aparecem, com o que fazer", async () => {
    cenario.permissoes = new Set(["unidades.gerir"]);
    const t = await tela({ erro: "pendencias", falta: "caixa_aberto.saldo.__proto__.<script>", loja: LOJA });
    expect(t).toContain("Santa Cândida (teste) continua ativa");
    expect(t).toContain("caixa aberto");
    expect(t).toContain("Feche o caixa da loja.");
    expect(t).toContain("saldo em estoque");
    expect(t).not.toContain("<script>");
    expect(t).not.toContain("transferência pendente");
  });

  it("histórico: só para um identificador válido, com a versão vigente, a agendada e a substituída", async () => {
    cenario.permissoes = new Set(["unidades.gerir"]);
    await tela({ historico: "abc" });
    expect(cenario.chamadas.map((c) => c.nome)).toEqual(["lojas_da_rede"]);
    cenario.chamadas = [];
    const versao = (id: number, desde: string, telefone: string) => ({ id, vigente_desde: desde, telefone, cep: null, logradouro: null, numero: null, complemento: null, bairro: null, inscricao_estadual: null, inscricao_municipal: null, horarios: [], motivo: `Motivo ${id}`, criado_por_nome: "Dono Teste", criado_em: "2026-10-01T12:00:00Z" });
    cenario.respostas.loja_historico = { data: [versao(3, "2099-12-01T11:00:00Z", "4130000003"), versao(2, SANTA.vigente_desde, "4133334444"), versao(1, "2026-10-01T12:00:00Z", "4130000001")], error: null };
    const t = await tela({ historico: LOJA });
    expect(cenario.chamadas.find((c) => c.nome === "loja_historico")?.argumentos).toEqual({ p_unidade: LOJA });
    expect(t).toMatch(/agendada[\s\S]*vigente[\s\S]*substituída/);
    expect(t).toContain("Motivo 1");
    expect(t).toContain("Dono Teste");
  });
});

describe("ações das lojas", () => {
  it("cadastro: formulário inválido volta com o erro sem chamar o banco; válido manda os dados normalizados", async () => {
    const campos = { empresa: EMPRESA, codigo: "Nova Loja", nome: "Nova", tipo: "loja_fisica", cnpj: "11.222.333/0001-81", uf: "pr", cidade: "", emissora: "", motivo: "Abertura" };
    expect(await destinoDe(criarLoja(formulario(campos)))).toBe("/lojas?erro=codigo&form=nova");
    expect(cenario.chamadas).toEqual([]);
    cenario.respostas.loja_criar = { data: { id: OUTRA, repetida: false }, error: null };
    expect(await destinoDe(criarLoja(formulario({ ...campos, codigo: "nova-loja" })))).toBe(`/lojas?ok=criada&loja=${OUTRA}#loja-${OUTRA}`);
    expect(cenario.chamadas[0]?.argumentos).toEqual({
      p_empresa: EMPRESA, p_codigo: "nova-loja", p_nome: "Nova", p_tipo: "loja_fisica", p_cnpj: "11222333000181", p_uf: "PR", p_cidade: null, p_emissora: null, p_motivo: "Abertura",
    });
  });

  it("cadastro repetido avisa que nada foi duplicado; CNPJ de outra raiz volta como erro do catálogo", async () => {
    const campos = { empresa: EMPRESA, codigo: "nova-loja", nome: "Nova", tipo: "loja_fisica", cnpj: "11222333000181", uf: "PR", cidade: "", emissora: "", motivo: "Abertura" };
    cenario.respostas.loja_criar = { data: { id: OUTRA, repetida: true }, error: null };
    expect(await destinoDe(criarLoja(formulario(campos)))).toContain("ok=repetida");
    cenario.respostas.loja_criar = { data: null, error: { code: "23514", message: "CNPJ da unidade não pertence ao CNPJ raiz da empresa" } };
    expect(await destinoDe(criarLoja(formulario(campos)))).toBe("/lojas?erro=cnpj_raiz&form=nova");
  });

  it("inativar com pendência: o endereço leva só as chaves das pendências", async () => {
    cenario.respostas.loja_definir_situacao = { data: null, error: { code: "OR019", message: "A loja ainda tem caixa aberto, saldo em estoque: resolva antes de inativar" } };
    const destino = await destinoDe(definirSituacao(formulario({ unidade: LOJA, situacao: "inativa", motivo: "Fechamento" })));
    expect(destino).toBe(`/lojas?erro=pendencias&loja=${LOJA}&falta=caixa_aberto.saldo#loja-${LOJA}`);
    cenario.respostas.loja_definir_situacao = { data: true, error: null };
    expect(await destinoDe(definirSituacao(formulario({ unidade: LOJA, situacao: "ativa", motivo: "Reabertura" })))).toContain("ok=reativada");
    expect(await destinoDe(definirSituacao(formulario({ unidade: LOJA, situacao: "apagada", motivo: "x" })))).toBe("/lojas?erro=dados");
  });

  it("configuração: 'agora' vai sem vigência; data futura vai como instante de São Paulo; repetida avisa", async () => {
    const campos = { unidade: LOJA, telefone: "(41) 3333-4444", cep: "", logradouro: "", numero: "", complemento: "", bairro: "", inscricao_estadual: "", inscricao_municipal: "", quando: "agora", motivo: "Telefone novo", aberto_1: "on", abre_1: "09:00", fecha_1: "18:00" };
    cenario.respostas.loja_definir_configuracao = { data: { id: 7, repetida: false }, error: null };
    expect(await destinoDe(definirConfiguracao(formulario(campos)))).toContain("ok=configurada");
    expect(cenario.chamadas[0]?.argumentos).toMatchObject({ p_unidade: LOJA, p_vigente_desde: null, p_motivo: "Telefone novo", p_dados: { telefone: "4133334444", horarios: [{ dia: 1, abre: "09:00", fecha: "18:00" }] } });
    cenario.chamadas = [];
    expect(await destinoDe(definirConfiguracao(formulario({ ...campos, quando: "data", vigencia: "2099-01-02T08:00" })))).toContain("ok=agendada");
    expect(cenario.chamadas[0]?.argumentos.p_vigente_desde).toBe("2099-01-02T11:00:00.000Z");
    cenario.respostas.loja_definir_configuracao = { data: { id: 7, repetida: true }, error: null };
    expect(await destinoDe(definirConfiguracao(formulario(campos)))).toContain("ok=configuracao_igual");
  });

  it("edição sem mudança avisa; sem permissão no banco vira a mensagem do catálogo", async () => {
    const campos = { unidade: LOJA, tipo: "loja_fisica", nome: "Santa Cândida", cnpj: "11222333000181", uf: "PR", cidade: "Curitiba", motivo: "Conferência" };
    cenario.respostas.loja_atualizar = { data: false, error: null };
    expect(await destinoDe(atualizarLoja(formulario(campos)))).toContain("ok=sem_mudanca");
    cenario.respostas.loja_atualizar = { data: null, error: { code: "P0002", message: "Loja não encontrada para você" } };
    expect(await destinoDe(atualizarLoja(formulario(campos)))).toBe(`/lojas?erro=permissao&loja=${LOJA}#loja-${LOJA}`);
  });
});

describe("regiões (ORG-009)", () => {
  const NORTE = "00000000-0000-4000-8000-0000000000e1";
  const LITORAL = "00000000-0000-4000-8000-0000000000e2";
  const comRegioes = () => {
    cenario.permissoes = new Set(["unidades.gerir"]);
    cenario.tabelas.regioes = [{ id: NORTE, nome: "Curitiba Norte (teste)", ativa: true }, { id: LITORAL, nome: "Litoral (teste)", ativa: false }];
    cenario.tabelas.unidades = [{ id: LOJA, regiao_id: NORTE }, { id: OUTRA, regiao_id: null }];
  };

  it("o cartão das regiões lista cada uma com as lojas; cada loja mostra a dela e pode mudar (só para as ativas)", async () => {
    comRegioes();
    const t = (await tela()).replace(/\s+/g, " ");
    for (const trecho of ["Regiões", "Não dão acesso", "Curitiba Norte (teste)", "Litoral (teste) neutro inativa", "sem loja", "Nova região", "Editar região",
      "Região: Curitiba Norte (teste)", "Região: sem região", "Salvar região da loja"]) expect(t, trecho).toContain(trecho);
  });

  it("num banco sem a tabela, nada de região aparece; falha de leitura avisa sem esconder as lojas", async () => {
    cenario.permissoes = new Set(["unidades.gerir"]);
    let t = await tela();
    expect(t).not.toContain("Nova região");
    expect(t).not.toContain("Região:");
    expect(t).toContain("Santa Cândida (teste)");
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    cenario.tabelas.regioes = [];
    cenario.erros.regioes = { code: "57014" };
    t = await tela();
    expect(t).toContain("Não deu para ler as regiões agora");
    expect(t).toContain("Santa Cândida (teste)");
    vi.restoreAllMocks();
  });

  it("salvar a região manda a organização da loja do turno; mudar a região da loja; inválido volta antes; erros do banco viram mensagens", async () => {
    cenario.tabelas.unidades = [{ id: LOJA, organizacao_id: ORG }];
    cenario.respostas.regiao_salvar = { data: { id: NORTE, repetida: false }, error: null };
    expect(await destinoDe(salvarRegiao(formulario({ nome: "  Curitiba   Norte ", motivo: "Organização" })))).toBe("/lojas?ok=regiao_criada#regioes");
    expect(cenario.chamadas.at(-1)).toEqual({ nome: "regiao_salvar", argumentos: { p_organizacao: ORG, p_id: null, p_nome: "Curitiba Norte", p_ativa: null, p_motivo: "Organização" } });
    expect(await destinoDe(salvarRegiao(formulario({ id: NORTE, nome: "Curitiba Norte", tem_ativa: "1", motivo: "Fim da região" })))).toBe("/lojas?ok=regiao_alterada#regioes");
    expect(cenario.chamadas.at(-1)?.argumentos).toMatchObject({ p_id: NORTE, p_ativa: false });
    cenario.respostas.regiao_salvar = { data: null, error: { code: "OR020", message: "A região ainda tem loja ativa: mude a região das lojas antes de inativar" } };
    expect(await destinoDe(salvarRegiao(formulario({ id: NORTE, nome: "Curitiba Norte", tem_ativa: "1", motivo: "Fim" })))).toBe("/lojas?erro=regiao_com_loja#regioes");
    cenario.respostas.regiao_salvar = { data: null, error: { code: "23505", message: "Já existe outra região com este nome" } };
    expect(await destinoDe(salvarRegiao(formulario({ id: LITORAL, nome: "Curitiba Norte", motivo: "Renomear" })))).toBe("/lojas?erro=regiao_repetida#regioes");

    cenario.chamadas = [];
    expect(await destinoDe(salvarRegiao(formulario({ nome: "N", motivo: "Organização" })))).toBe("/lojas?erro=regiao_nome#regioes");
    expect(await destinoDe(salvarRegiao(formulario({ nome: "Norte", motivo: "x" })))).toBe("/lojas?erro=motivo#regioes");
    expect(await destinoDe(salvarRegiao(formulario({ id: "nao-e-uuid", nome: "Norte", motivo: "Organização" })))).toBe("/lojas?erro=dados#regioes");
    expect(await destinoDe(definirRegiaoDaLoja(formulario({ unidade: LOJA, regiao: "talvez", motivo: "Região" })))).toBe(`/lojas?erro=dados&loja=${LOJA}#loja-${LOJA}`);
    expect(await destinoDe(definirRegiaoDaLoja(formulario({ unidade: LOJA, regiao: NORTE, motivo: "" })))).toBe(`/lojas?erro=motivo&loja=${LOJA}#loja-${LOJA}`);
    expect(cenario.chamadas).toEqual([]);

    cenario.respostas.loja_definir_regiao = { data: true, error: null };
    expect(await destinoDe(definirRegiaoDaLoja(formulario({ unidade: LOJA, regiao: NORTE, motivo: "Loja da região" })))).toBe(`/lojas?ok=regiao_da_loja&loja=${LOJA}#loja-${LOJA}`);
    expect(cenario.chamadas.at(-1)).toEqual({ nome: "loja_definir_regiao", argumentos: { p_unidade: LOJA, p_regiao: NORTE, p_motivo: "Loja da região" } });
    cenario.respostas.loja_definir_regiao = { data: false, error: null };
    expect(await destinoDe(definirRegiaoDaLoja(formulario({ unidade: LOJA, regiao: "nenhuma", motivo: "Sem região" })))).toBe(`/lojas?ok=sem_mudanca&loja=${LOJA}#loja-${LOJA}`);
    expect(cenario.chamadas.at(-1)?.argumentos).toMatchObject({ p_regiao: null });
    cenario.respostas.loja_definir_regiao = { data: null, error: { code: "22023", message: "Região inativa: reative antes de pôr loja nela" } };
    expect(await destinoDe(definirRegiaoDaLoja(formulario({ unidade: LOJA, regiao: LITORAL, motivo: "Região" })))).toBe(`/lojas?erro=regiao_inativa&loja=${LOJA}#loja-${LOJA}`);
  });
});
