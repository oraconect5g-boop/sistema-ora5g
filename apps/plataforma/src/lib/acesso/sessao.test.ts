// A sessão real das telas (lote VEL-a: ORA-QUAL-010, com as garantias da ORA-ORG-006 e da ORA-ORG-007a; ADR-010).
// O token assinado só diz quem é (auth.getClaims); quem decide se a sessão ainda vale é o banco, em cada pedido
// (a situação que vem em public.molde_da_sessao). Aqui se prova que:
//  - sem token, token vencido ou com assinatura que não confere: a pessoa vai para a entrada, sem ida ao banco;
//  - pessoa bloqueada, sessão encerrada em outro lugar ou turno vencido: o banco avisa e a tela manda sair;
//  - falha de rede ou resposta fora do combinado é falha do serviço (página de erro), nunca "sem acesso";
//  - uma tela faz uma conferência do token e uma ida ao banco, mesmo com layout e página pedindo a sessão.
// A função do banco é testada em packages/banco/src/sessao-molde-e-pdv.test.ts (sessão de 13 horas, sessão vencida,
// sessão apagada, pessoa bloqueada e segundo fator pendente).
import { AuthApiError, AuthInvalidJwtError, AuthRetryableFetchError, AuthSessionMissingError } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";

const cenario = vi.hoisted(() => ({
  semConfiguracao: false,
  /** Cada tela montada é uma "montagem": o cache() do React vale dentro dela e não passa para a seguinte. */
  montagem: 0,
  claims: (): unknown => ({ data: null, error: null }),
  molde: (): unknown => ({ data: null, error: null }),
  idas: [] as string[],
  argumentos: [] as { nome: string; argumentos: unknown }[],
}));

vi.mock("next/navigation", () => ({
  redirect: (destino: string) => {
    throw new Error(`redirecionou para ${destino}`);
  },
}));

// O cache() do React guarda o resultado durante a montagem de uma tela. Fora do servidor de telas (aqui, no vitest)
// ele não guarda nada; este substituto guarda por "montagem" do cenário, para provar que layout e página dividem uma
// leitura e que a tela seguinte lê de novo.
vi.mock("react", async (importar) => ({
  ...(await importar<typeof import("react")>()),
  cache: <T,>(fn: () => T) => {
    const guardado = new Map<number, T>();
    return () => {
      if (!guardado.has(cenario.montagem)) guardado.set(cenario.montagem, fn());
      return guardado.get(cenario.montagem) as T;
    };
  },
}));

vi.mock("../supabase/servidor", () => ({
  clienteSupabaseServidor: async () =>
    cenario.semConfiguracao
      ? null
      : {
          auth: {
            getClaims: async () => {
              cenario.idas.push("getClaims");
              return cenario.claims();
            },
            getUser: async () => {
              throw new Error("a sessão não pergunta ao serviço de login a cada tela: confere o token (getClaims)");
            },
          },
          rpc: async (nome: string, argumentos: unknown) => {
            cenario.idas.push(`rpc:${nome}`);
            cenario.argumentos.push({ nome, argumentos });
            if (nome !== "molde_da_sessao") throw new Error(`a sessão só chama molde_da_sessao; chamou ${nome}`);
            return cenario.molde();
          },
          from: (tabela: string) => {
            throw new Error(`a sessão não lê tabela nenhuma; leu ${tabela}`);
          },
        },
}));

import { PERMISSOES_DO_MENU } from "./menu";
import { FalhaDoServico, obterSessao } from "./sessao";

const ANA = "00000000-0000-4000-8000-0000000000a1";
const LOJA = "00000000-0000-4000-8000-0000000000cc";

type Situacao = { usuario_ativo: boolean; sessao_no_turno: boolean; unidade_id: string | null; unidade_nome: string | null; turno_termina_em: string | null; segundo_fator_pendente: boolean };
const NO_TURNO: Situacao = { usuario_ativo: true, sessao_no_turno: true, unidade_id: LOJA, unidade_nome: "Santa Cândida (teste)", turno_termina_em: "2026-11-16T23:00:00+00:00", segundo_fator_pendente: false };

/** O token conferido: quem é (sub) e o e-mail, como o Auth assina. */
const tokenDe = (sub: unknown, email: unknown = "ana@teste.invalid") => () => ({ data: { claims: { sub, email, role: "authenticated" }, header: { alg: "ES256", kid: "chave-de-teste" }, signature: new Uint8Array() }, error: null });
/** A resposta do banco: a decisão sobre a sessão e o que o menu mostra. */
const bancoResponde = (situacao: Partial<Situacao> = {}, resto: Record<string, unknown> = {}) => () => ({
  data: { situacao: { ...NO_TURNO, ...situacao }, permissoes: ["caixa.abrir", "venda.registrar"], nome: "Ana (fictícia)", vinculos: [{ papel: "vendedor", escopo: "unidade", unidade_id: LOJA }], pendencias: { aprovacoes: 0, notas: 0 }, ...resto },
  error: null,
});
const semSessaoNoBanco = { usuario_ativo: true, sessao_no_turno: false, unidade_id: null, unidade_nome: null, turno_termina_em: null };

/** Para onde a tela manda a pessoa (nulo quando deixa seguir). Erro que não é redirecionamento passa adiante. */
async function destino(opcoes = { exigirLoja: true }) {
  try {
    await obterSessao(opcoes);
  } catch (erro) {
    const achado = /^redirecionou para (.+)$/.exec(erro instanceof Error ? erro.message : "");
    if (achado) return achado[1];
    throw erro;
  }
  return null;
}

beforeEach(() => {
  cenario.semConfiguracao = false;
  cenario.montagem += 1;
  cenario.claims = tokenDe(ANA);
  cenario.molde = bancoResponde();
  cenario.idas = [];
  cenario.argumentos = [];
});

describe("sessão que vale", () => {
  it("devolve quem entrou (do token), a situação e o molde (do banco), com uma conferência do token e uma ida ao banco", async () => {
    const sessao = await obterSessao({ exigirLoja: true });
    expect(sessao.usuario).toEqual({ id: ANA, email: "ana@teste.invalid" });
    expect(sessao.situacao).toEqual(NO_TURNO);
    expect(sessao.molde).toEqual({ permissoes: new Set(["caixa.abrir", "venda.registrar"]), nome: "Ana (fictícia)", vinculos: [{ papel: "vendedor", escopo: "unidade", unidade_id: LOJA }], pendencias: { aprovacoes: 0, notas: 0 } });
    expect(typeof sessao.supabase.rpc).toBe("function");
    expect(cenario.idas).toEqual(["getClaims", "rpc:molde_da_sessao"]);
  });

  it("pede ao banco, de uma vez, todas as permissões do menu e as que as telas perguntam além dele", async () => {
    await obterSessao({ exigirLoja: true });
    expect(cenario.argumentos).toHaveLength(1);
    const { p_permissoes_da_loja: daLoja, p_permissoes_da_rede: daRede } = cenario.argumentos[0]?.argumentos as { p_permissoes_da_loja: string[]; p_permissoes_da_rede: string[] };
    expect(new Set(daRede)).toEqual(new Set(["usuarios.gerir", "unidades.gerir", "catalogo.gerir"]));
    expect(daLoja).toEqual(expect.arrayContaining(["venda.registrar", "caixa.abrir", "desconto.aprovar", "nota.aprovar", "ranking.ver", "venda.ver_propria", "custo.ver"]));
    for (const permissao of PERMISSOES_DO_MENU) expect([...daLoja, ...daRede], permissao).toContain(permissao);
    expect(new Set([...daLoja, ...daRede]).size).toBe(daLoja.length + daRede.length);
    expect(daLoja.length + daRede.length).toBeLessThanOrEqual(80);
  });

  it("e-mail que não veio como texto no token fica sem valor, nunca inventado", async () => {
    cenario.claims = tokenDe(ANA, null);
    expect((await obterSessao({ exigirLoja: true })).usuario).toEqual({ id: ANA, email: undefined });
    cenario.montagem += 1;
    cenario.claims = tokenDe(ANA, { endereco: "ana@teste.invalid" });
    expect((await obterSessao({ exigirLoja: true })).usuario.email).toBeUndefined();
  });

  it("sem loja escolhida: a tela que precisa de loja manda escolher; a que não precisa segue", async () => {
    cenario.molde = bancoResponde({ unidade_id: null, unidade_nome: null });
    expect(await destino({ exigirLoja: true })).toBe("/escolher-loja");
    cenario.montagem += 1;
    const sessao = await obterSessao({ exigirLoja: false });
    expect(sessao.situacao.unidade_id).toBeNull();
    expect(sessao.usuario.id).toBe(ANA);
  });
});

describe("sem sessão que valha: vai para a entrada, sem ida ao banco", () => {
  it("serviço sem configuração: entrada com o aviso de configuração, sem conferir nada", async () => {
    cenario.semConfiguracao = true;
    expect(await destino()).toBe("/entrar?erro=configuracao");
    expect(cenario.idas).toEqual([]);
  });

  it("sem token (ninguém entrou neste navegador)", async () => {
    cenario.claims = () => ({ data: null, error: null });
    expect(await destino()).toBe("/entrar");
    expect(cenario.idas).toEqual(["getClaims"]);
  });

  it.each<[string, () => Error]>([
    ["sessão ausente", () => new AuthSessionMissingError()],
    ["token vencido", () => new AuthInvalidJwtError("JWT has expired")],
    ["assinatura que não confere (token adulterado)", () => new AuthInvalidJwtError("Invalid JWT signature")],
    ["o serviço de login não reconhece a sessão (401)", () => new AuthApiError("invalid JWT", 401, "bad_jwt")],
    ["a sessão foi encerrada no serviço de login (403)", () => new AuthApiError("Session from session_id claim in JWT does not exist", 403, "session_not_found")],
  ])("%s", async (_, erro) => {
    cenario.claims = () => ({ data: null, error: erro() });
    expect(await destino()).toBe("/entrar");
    expect(cenario.idas).toEqual(["getClaims"]);
  });

  it.each<[string, unknown]>([
    ["sem identificador", undefined],
    ["identificador que não é de pessoa", "service_role"],
    ["identificador numérico", 42],
    ["identificador vazio", ""],
  ])("token %s não é sessão de ninguém", async (_, sub) => {
    cenario.claims = tokenDe(sub);
    expect(await destino()).toBe("/entrar");
    expect(cenario.idas).toEqual(["getClaims"]);
  });
});

describe("quem decide é o banco, em cada pedido (ORA-ORG-006 e ORA-ORG-007a)", () => {
  it("pessoa bloqueada: sai, mesmo com token ainda válido", async () => {
    cenario.molde = bancoResponde({ usuario_ativo: false, sessao_no_turno: false, unidade_id: null, unidade_nome: null, turno_termina_em: null }, { permissoes: [], nome: null, vinculos: [] });
    expect(await destino()).toBe("/sair?motivo=bloqueado");
    expect(await destino({ exigirLoja: false })).toBe("/sair?motivo=bloqueado");
  });

  it("sessão encerrada em outro lugar (apagada no banco): sai, mesmo com token ainda válido", async () => {
    cenario.molde = bancoResponde(semSessaoNoBanco, { permissoes: [], vinculos: [] });
    expect(await destino()).toBe("/sair?motivo=turno");
    expect(await destino({ exigirLoja: false })).toBe("/sair?motivo=turno");
    // O token passou na conferência (a assinatura vale até vencer); quem barrou foi o banco.
    expect(cenario.idas).toEqual(["getClaims", "rpc:molde_da_sessao"]);
  });

  it("turno vencido (12 horas): sai, com a loja ainda marcada", async () => {
    cenario.molde = bancoResponde({ sessao_no_turno: false, turno_termina_em: "2026-11-16T09:00:00+00:00" });
    expect(await destino()).toBe("/sair?motivo=turno");
  });

  it("bloqueio pesa mais que turno: a pessoa bloqueada vê o aviso de bloqueio", async () => {
    cenario.molde = bancoResponde({ usuario_ativo: false, sessao_no_turno: true });
    expect(await destino()).toBe("/sair?motivo=bloqueado");
  });

  it("segundo fator ligado e código ainda não digitado nesta sessão: vai digitar o código, com ou sem loja", async () => {
    cenario.molde = bancoResponde({ segundo_fator_pendente: true });
    expect(await destino()).toBe("/entrar/codigo");
    cenario.montagem += 1;
    cenario.molde = bancoResponde({ segundo_fator_pendente: true, unidade_id: null, unidade_nome: null });
    expect(await destino({ exigirLoja: false })).toBe("/entrar/codigo");
  });

  it("a tela seguinte pergunta de novo: quem foi bloqueado entre uma tela e outra não passa da segunda", async () => {
    expect((await obterSessao({ exigirLoja: true })).usuario.id).toBe(ANA);
    cenario.montagem += 1;
    cenario.molde = bancoResponde({ usuario_ativo: false, sessao_no_turno: false });
    expect(await destino()).toBe("/sair?motivo=bloqueado");
    expect(cenario.idas).toEqual(["getClaims", "rpc:molde_da_sessao", "getClaims", "rpc:molde_da_sessao"]);
  });
});

describe("falha do serviço é página de erro, nunca \"sem acesso\" (REV-014)", () => {
  it.each<[string, () => Error]>([
    ["rede fora do ar ao conferir o token", () => new AuthRetryableFetchError("fetch failed", 0)],
    ["serviço de login com erro (500)", () => new AuthApiError("Internal Server Error", 500, "unexpected_failure")],
    ["serviço de login ocupado (429)", () => new AuthApiError("Too many requests", 429, "over_request_rate_limit")],
  ])("%s", async (_, erro) => {
    cenario.claims = () => ({ data: null, error: erro() });
    await expect(obterSessao({ exigirLoja: true })).rejects.toBeInstanceOf(FalhaDoServico);
    expect(cenario.idas).toEqual(["getClaims"]);
  });

  it("o banco não respondeu à leitura do molde", async () => {
    cenario.molde = () => ({ data: null, error: { message: "canceling statement due to statement timeout", code: "57014" } });
    await expect(obterSessao({ exigirLoja: true })).rejects.toBeInstanceOf(FalhaDoServico);
    await expect(obterSessao({ exigirLoja: false })).rejects.toThrow("molde_da_sessao");
  });

  it.each<[string, unknown]>([
    ["nada", null],
    ["a linha da função antiga", [{ ...NO_TURNO }]],
    ["sem a situação", { permissoes: [], nome: null, vinculos: [], pendencias: { aprovacoes: 0, notas: 0 } }],
    ["situação sem dizer se a pessoa está ativa", { situacao: { ...NO_TURNO, usuario_ativo: null }, permissoes: [], nome: null, vinculos: [], pendencias: { aprovacoes: 0, notas: 0 } }],
    ["sem as permissões", { situacao: NO_TURNO, nome: null, vinculos: [], pendencias: { aprovacoes: 0, notas: 0 } }],
    ["contagem que não é número", { situacao: NO_TURNO, permissoes: [], nome: null, vinculos: [], pendencias: { aprovacoes: "2", notas: 0 } }],
  ])("resposta do banco fora do combinado (%s): não vira menu vazio nem saída", async (_, dado) => {
    cenario.molde = () => ({ data: dado, error: null });
    await expect(obterSessao({ exigirLoja: true })).rejects.toBeInstanceOf(FalhaDoServico);
  });
});

describe("uma leitura por tela", () => {
  it("layout e página da mesma tela dividem a mesma leitura, mesmo pedindo coisas diferentes", async () => {
    const [doLayout, daPagina] = await Promise.all([obterSessao({ exigirLoja: false }), obterSessao({ exigirLoja: true })]);
    const deNovo = await obterSessao({ exigirLoja: true });
    expect(cenario.idas).toEqual(["getClaims", "rpc:molde_da_sessao"]);
    expect(daPagina.molde).toBe(doLayout.molde);
    expect(deNovo.supabase).toBe(doLayout.supabase);
  });

  it("a decisão é tomada em cada chamada, com a mesma leitura: sem loja, o layout segue e a página manda escolher", async () => {
    cenario.molde = bancoResponde({ unidade_id: null, unidade_nome: null });
    expect((await obterSessao({ exigirLoja: false })).usuario.id).toBe(ANA);
    expect(await destino({ exigirLoja: true })).toBe("/escolher-loja");
    expect(cenario.idas).toEqual(["getClaims", "rpc:molde_da_sessao"]);
  });

  it("falha do serviço numa tela não fica guardada para a seguinte", async () => {
    cenario.molde = () => ({ data: null, error: { message: "fora do ar" } });
    await expect(obterSessao({ exigirLoja: true })).rejects.toBeInstanceOf(FalhaDoServico);
    cenario.montagem += 1;
    cenario.molde = bancoResponde();
    expect((await obterSessao({ exigirLoja: true })).usuario.id).toBe(ANA);
  });
});
