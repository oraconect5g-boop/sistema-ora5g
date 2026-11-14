// /assistencia (lote L12a: ORA-OS-001, ORA-OS-002 e ORA-OS-005 em parte) com a sessão e o Supabase SIMULADOS: nenhuma
// credencial, dados fictícios. A lista, a abertura, o detalhe com os passos de cada papel e as ações. As regras do banco
// estão em packages/banco/src/ordem-de-servico.test.ts.
import { isValidElement, type ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const EU = "00000000-0000-4000-8000-0000000000aa";
const LOJA = "00000000-0000-4000-8000-0000000000cc";
const ASSISTENCIA = "00000000-0000-4000-8000-0000000000dd";
const OS = "00000000-0000-4000-8000-00000000e101";
const CLIENTE = "00000000-0000-4000-8000-00000000e102";
const ORG = "00000000-0000-4000-8000-00000000e103";

type Linha = Record<string, unknown>;
const cenario = vi.hoisted(() => ({
  unidade: "", permissoes: new Set<string>(),
  tabelas: {} as Record<string, Record<string, unknown>[]>,
  erros: {} as Record<string, { code: string }>,
  chamadas: [] as { nome: string; argumentos: Record<string, unknown> }[],
  respostas: {} as Record<string, { data: unknown; error: null | { code: string; message?: string } }>,
  arquivo: null as Uint8Array | null,
}));
vi.mock("next/headers", () => ({ cookies: async () => ({ getAll: () => [], set: () => undefined }) }));
vi.mock("next/navigation", () => ({
  redirect: (destino: string) => { throw new Error(`redirecionou para ${destino}`); },
  notFound: () => { throw new Error("não encontrada"); },
}));
vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));
class Consulta {
  linhas: Linha[];
  erro: { code: string } | null;
  constructor(nome: string) { this.linhas = [...(cenario.tabelas[nome] ?? [])]; this.erro = cenario.erros[nome] ?? null; }
  select() { return this; }
  eq(coluna: string, valor: unknown) { this.linhas = this.linhas.filter((l) => l[coluna] === undefined || l[coluna] === valor); return this; }
  neq(coluna: string, valor: unknown) { this.linhas = this.linhas.filter((l) => l[coluna] !== valor); return this; }
  in(coluna: string, valores: unknown[]) { this.linhas = this.linhas.filter((l) => l[coluna] === undefined || valores.includes(l[coluna])); return this; }
  lt(coluna: string, valor: string) { this.linhas = this.linhas.filter((l) => typeof l[coluna] === "string" && (l[coluna] as string) < valor); return this; }
  order() { return this; }
  range() { return this; }
  maybeSingle() { return Promise.resolve(this.erro ? { data: null, error: this.erro } : { data: this.linhas[0] ?? null, error: null }); }
  then(resolver: (r: { data: Linha[] | null; error: { code: string } | null; count: number | null }) => unknown) {
    return Promise.resolve(this.erro ? { data: null, error: this.erro, count: null } : { data: this.linhas, error: null, count: this.linhas.length }).then(resolver);
  }
}
const supabase = {
  from: (nome: string) => new Consulta(nome),
  rpc: async (nome: string, argumentos: Record<string, unknown> = {}) => {
    if (nome === "tem_permissao") return { data: cenario.permissoes.has(String(argumentos.p_permissao)), error: null };
    cenario.chamadas.push({ nome, argumentos });
    return cenario.respostas[nome] ?? { data: null, error: { code: "PGRST202" } };
  },
  storage: {
    from: () => ({
      createSignedUrls: async (caminhos: string[]) => ({ data: caminhos.map((path) => ({ path, signedUrl: `https://assinado.invalid/${path}`, error: null })), error: null }),
      download: async () => (cenario.arquivo ? { data: new Blob([cenario.arquivo.slice().buffer as ArrayBuffer]), error: null } : { data: null, error: { message: "não existe" } }),
    }),
  },
};
vi.mock("../../lib/acesso/sessao", () => ({
  FalhaDoServico: class FalhaDoServico extends Error {},
  obterSessao: async () => ({
    usuario: { id: EU },
    situacao: { usuario_ativo: true, sessao_no_turno: true, unidade_id: cenario.unidade, unidade_nome: "Santa Cândida (teste)", turno_termina_em: "2026-11-14T23:00:00Z" },
    supabase,
  }),
}));
vi.mock("../../lib/supabase/configuracao", () => ({ configuracaoSupabase: () => ({ url: "https://projeto.supabase.co", chavePublica: "sb_publishable_teste" }) }));

import { abrirOrdem, avisarPeloWhatsApp, passoDaOrdem, registrarFotoDaOs } from "./acoes";
import Detalhe from "./[id]/page";
import NovaOrdem from "./nova/page";
import Lista from "./page";

const EXECUTAR = new Set(["EstadoDoPainel", "ProximosPassos", "FormularioDoPasso", "FiltroSegmentado", "ListaDados"]);
function texto(v: unknown): string {
  const pedacos: string[] = [];
  const andar = (x: unknown): void => {
    if (Array.isArray(x)) x.forEach(andar);
    else if (typeof x === "string" || typeof x === "number") pedacos.push(String(x));
    else if (isValidElement<Linha>(x)) {
      const tipo = typeof x.type === "function" ? x.type.name : "";
      if (typeof x.type === "function" && EXECUTAR.has(tipo)) andar((x.type as (p: unknown) => unknown)(x.props));
      else if (typeof x.type === "string") andar(x.props.children);
      else if (tipo === "MoldeReal") andar(x.props.children);
      else andar([x.props.titulo, x.props.subtitulo, x.props.rotulo, x.props.valor, x.props.detalhe, x.props.acao, x.props.children]);
    }
  };
  andar(v);
  return pedacos.join(" ").replace(/\s+/g, " ");
}
const destinoDe = async (acao: Promise<unknown>) => {
  try { await acao; } catch (e) { return (e as Error).message.replace("redirecionou para ", ""); }
  throw new Error("a ação não redirecionou");
};
const formulario = (campos: Record<string, string | string[]>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(campos)) for (const x of Array.isArray(v) ? v : [v]) f.append(k, x);
  return f;
};
const os = (extra: Linha = {}) => ({
  id: OS, numero: 42, organizacao_id: ORG, unidade_id: LOJA, cliente_id: CLIENTE, cliente_nome: "Carla Cliente Teste", contato_mascarado: "(41) •••••-0001",
  aparelho: "Galaxy A15", imei: "352099001761481", numero_serie: null, defeito: "Tela não liga", estado_entrada: "Tampa riscada", acessorios: ["capa", "carregador"],
  acessorios_obs: null, prazo: "2026-11-21", local: "loja", situacao: "aberta", assistencia_id: null, aberta_por: EU, aberta_em: "2026-11-14T13:00:00Z",
  atualizada_em: "2026-11-14T13:00:00Z", encerrada_em: null, motivo_encerramento: null, ...extra,
});
const evento = (tipo: string, extra: Linha = {}) => ({ id: Math.random(), os_id: OS, tipo, local_de: null, local_para: null, observacao: null, em_nome_do_tecnico: false, usuario_id: EU, ocorrido_em: "2026-11-14T13:00:00Z", ...extra });

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  cenario.unidade = LOJA;
  cenario.permissoes = new Set(["os.abrir"]);
  cenario.erros = {};
  cenario.chamadas = [];
  cenario.respostas = { os_assistencias: { data: [{ id: ASSISTENCIA, nome: "Assistência central" }], error: null } };
  cenario.arquivo = null;
  cenario.tabelas = {
    ordens_servico: [os()],
    os_eventos: [evento("aberta", { local_para: "loja" })],
    os_fotos: [{ id: "f1", os_id: OS, caminho: `${ORG}/${LOJA}/${OS}/a.webp`, enviada_em: "2026-11-14T13:05:00Z" }],
    perfis_usuario: [{ id: EU, nome: "Vendedora Teste" }],
  };
});
afterEach(() => { vi.restoreAllMocks(); });

describe("lista da assistência (L12a)", () => {
  it("quem não recebe aparelho nem é técnico não vê; sem a tabela no banco, diz que falta a leitura", async () => {
    cenario.permissoes = new Set();
    expect(texto(await Lista({ searchParams: Promise.resolve({}) }) as ReactElement)).toContain("A assistência é de quem recebe aparelhos na loja e do técnico.");
    cenario.permissoes = new Set(["os.abrir"]);
    cenario.erros = { ordens_servico: { code: "PGRST205" } };
    const t = texto(await Lista({ searchParams: Promise.resolve({}) }) as ReactElement);
    expect(t).toContain("as ordens de serviço da assistência (migration ordem_de_servico)");
    expect(t).toContain("Sem número do banco agora");
  });

  it("as abertas com o local, o prazo e o atraso; as contagens do topo; como abrir uma OS", async () => {
    cenario.tabelas.ordens_servico = [os(), os({ id: "00000000-0000-4000-8000-00000000e109", numero: 43, local: "com_tecnico", prazo: "2026-11-01", cliente_nome: "Outro Cliente" })];
    const t = texto(await Lista({ searchParams: Promise.resolve({}) }) as ReactElement);
    for (const trecho of ["OS nº 42", "Carla Cliente Teste · Galaxy A15 · IMEI final 1481", "Na loja", "OS nº 43", "Com o técnico", "atrasada · prazo 01/11",
      "Abrir uma OS", "Abertas", "Encerradas", "2 ordens de serviço"]) expect(t, trecho).toContain(trecho);
  });
});

describe("abertura da OS (L12a)", () => {
  it("sem cliente, explica o caminho pela ficha; cliente sem WhatsApp, pede completar o cadastro; com ele, o formulário", async () => {
    expect(texto(await NovaOrdem({ searchParams: Promise.resolve({}) }) as ReactElement)).toContain("Primeiro, o cliente");
    cenario.respostas.cliente_ficha = { data: { id: CLIENTE, nome: "Carla Cliente Teste", numero: 7, situacao: "ativo", telefone: null }, error: null };
    expect(texto(await NovaOrdem({ searchParams: Promise.resolve({ cliente: CLIENTE }) }) as ReactElement)).toContain("O cliente não tem WhatsApp no cadastro");
    cenario.respostas.cliente_ficha = { data: { id: CLIENTE, nome: "Carla Cliente Teste", numero: 7, situacao: "ativo", telefone: "(41) •••••-0001" }, error: null };
    const t = texto(await NovaOrdem({ searchParams: Promise.resolve({ cliente: CLIENTE }) }) as ReactElement);
    for (const trecho of ["Cliente: Carla Cliente Teste (nº 7) · WhatsApp (41) •••••-0001", "Defeito relatado pelo cliente", "Estado em que chegou", "Acessórios deixados", "Carregador", "Película", "Prazo combinado"]) {
      expect(t, trecho).toContain(trecho);
    }
  });

  it("a ação manda ao banco o que foi lido e vai para a OS; o erro do banco volta com a mensagem certa", async () => {
    const campos = { cliente: CLIENTE, chave: "00000000-0000-4000-8000-00000000f001", aparelho: "Galaxy A15", imei: "352099001761481", defeito: "Tela não liga", estado: "Tampa riscada", acessorios: ["capa"] };
    cenario.respostas.os_abrir = { data: { id: OS, numero: 42, repetida: false }, error: null };
    expect(await destinoDe(abrirOrdem(formulario(campos)))).toBe(`/assistencia/${OS}?ok=aberta`);
    expect(cenario.chamadas.at(-1)).toEqual({ nome: "os_abrir", argumentos: { p_chave: campos.chave, p_dados: {
      cliente: CLIENTE, aparelho: "Galaxy A15", imei: "352099001761481", serie: null, defeito: "Tela não liga", estado: "Tampa riscada", acessorios: ["capa"], acessorios_obs: null, prazo: null,
    } } });
    cenario.respostas.os_abrir = { data: null, error: { code: "OR031", message: "Este aparelho já tem a OS nº 41 aberta" } };
    expect(await destinoDe(abrirOrdem(formulario(campos)))).toBe(`/assistencia/nova?cliente=${CLIENTE}&erro=duplicada`);
    expect(await destinoDe(abrirOrdem(formulario({ ...campos, imei: "123" })))).toBe(`/assistencia/nova?cliente=${CLIENTE}&erro=imei`);
  });
});

describe("a OS: passos de cada papel, fotos, aviso e trilha (L12a)", () => {
  const tela = async () => texto(await Detalhe({ params: Promise.resolve({ id: OS }), searchParams: Promise.resolve({}) }) as ReactElement);

  it("na loja, quem recebe aparelho envia ao técnico, devolve sem conserto e manda o comprovante; vê as fotos e a trilha", async () => {
    const t = await tela();
    for (const trecho of ["OS nº 42", "Na loja", "Carla Cliente Teste · WhatsApp (41) •••••-0001", "352099001761481", "Capa, Carregador", "21/11/2026",
      "Enviar ao técnico", "Devolver ao cliente sem conserto", "Motivo da devolução sem conserto", "Mandar o comprovante", "1 de até 8", "OS aberta na loja", "Vendedora Teste"]) {
      expect(t, trecho).toContain(trecho);
    }
    expect(t).not.toContain("Cancelar (aberta por engano)"); // só a gerência
    expect(t).not.toContain("Avisar que o aparelho chegou"); // ainda não foi e voltou
    cenario.permissoes = new Set(["os.abrir", "os.gerir"]);
    expect(await tela()).toContain("Cancelar (aberta por engano)");
  });

  it("com o técnico: o técnico registra o dele; a gerência registra em nome dele, dizendo como ele confirmou; o vendedor espera", async () => {
    cenario.tabelas.ordens_servico = [os({ local: "a_caminho_do_tecnico", assistencia_id: ASSISTENCIA })];
    expect(await tela()).toContain("Nenhum passo seu agora: aguarde o técnico.");
    cenario.permissoes = new Set(["os.abrir", "os.gerir"]);
    const gerencia = await tela();
    expect(gerencia).toContain("O técnico recebeu (em nome dele)");
    expect(gerencia).toContain("Como o técnico confirmou");
    cenario.unidade = ASSISTENCIA;
    cenario.permissoes = new Set(["os.orcar"]);
    const tecnico = await tela();
    expect(tecnico).toContain("Recebi o aparelho");
    expect(tecnico).not.toContain("Mandar o comprovante");
  });

  it("de volta na loja, o aviso de chegada aparece; encerrada, mostra o motivo e nenhum passo", async () => {
    cenario.tabelas.os_eventos = [evento("aberta"), evento("enviada_ao_tecnico"), evento("recebida_na_loja")];
    expect(await tela()).toContain("Avisar que o aparelho chegou");
    cenario.tabelas.ordens_servico = [os({ situacao: "devolvida", local: "com_cliente", encerrada_em: "2026-11-15T10:00:00Z", motivo_encerramento: "Cliente desistiu" })];
    const t = await tela();
    expect(t).toContain("Devolvida ao cliente em");
    expect(t).toContain("Cliente desistiu");
    expect(t).not.toContain("Enviar ao técnico");
  });

  it("as ações dos passos, do aviso e da foto", async () => {
    cenario.respostas.os_custodia = { data: true, error: null };
    expect(await destinoDe(passoDaOrdem(formulario({ os: OS, passo: "enviar_ao_tecnico", observacao: "" })))).toBe(`/assistencia/${OS}?ok=enviar_ao_tecnico`);
    expect(cenario.chamadas.at(-1)).toEqual({ nome: "os_custodia", argumentos: { p_os: OS, p_passo: "enviar_ao_tecnico", p_assistencia: null, p_observacao: null } });
    expect(await destinoDe(passoDaOrdem(formulario({ os: OS, passo: "devolver_ao_cliente", observacao: "ok" })))).toBe(`/assistencia/${OS}?erro=motivo`);
    expect(await destinoDe(passoDaOrdem(formulario({ os: OS, passo: "voar" })))).toBe(`/assistencia/${OS}?erro=dados`);
    cenario.respostas.os_custodia = { data: false, error: null };
    expect(await destinoDe(passoDaOrdem(formulario({ os: OS, passo: "loja_recebeu" })))).toBe(`/assistencia/${OS}?ok=sem_mudanca`);
    cenario.respostas.os_custodia = { data: null, error: { code: "22023", message: "Em nome do técnico, diga como ele confirmou" } };
    expect(await destinoDe(passoDaOrdem(formulario({ os: OS, passo: "tecnico_recebeu" })))).toBe(`/assistencia/${OS}?erro=em_nome`);

    cenario.respostas.os_contato_whatsapp = { data: "41987650001", error: null };
    const link = await destinoDe(avisarPeloWhatsApp(formulario({ os: OS, aviso: "comprovante" })));
    expect(link.startsWith("https://wa.me/5541987650001?text=")).toBe(true);
    expect(decodeURIComponent(link.split("text=")[1] ?? "")).toContain("Ordem de serviço nº 42: Galaxy A15 (IMEI final 1481)");
    cenario.respostas.os_contato_whatsapp = { data: null, error: { code: "P0002" } };
    expect(await destinoDe(avisarPeloWhatsApp(formulario({ os: OS, aviso: "comprovante" })))).toBe(`/assistencia/${OS}?erro=nao_encontrada`);

    expect(await registrarFotoDaOs({ os: OS, caminho: `${ORG}/${LOJA}/${OS}/b.jpg` })).toEqual({ ok: false, erro: "foto" }); // nada no Storage
    cenario.arquivo = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0, 0, 0, 0, 0, 0, 0, 0]);
    expect(await registrarFotoDaOs({ os: OS, caminho: `${ORG}/${LOJA}/${OS}/b.jpg` })).toEqual({ ok: false, erro: "foto" }); // PDF não é foto
    cenario.arquivo = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4, 5, 6, 7, 8]);
    cenario.respostas.os_anexar_foto = { data: "f2", error: null };
    expect(await registrarFotoDaOs({ os: OS, caminho: `${ORG}/${LOJA}/${OS}/b.jpg` })).toEqual({ ok: true });
    const anexar = cenario.chamadas.at(-1);
    expect(anexar?.nome).toBe("os_anexar_foto");
    expect(anexar?.argumentos.p_sha256).toMatch(/^[0-9a-f]{64}$/);
  });
});
