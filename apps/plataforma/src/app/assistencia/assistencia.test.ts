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
  // Colunas que o banco "ainda não tem" (migration não aplicada): a leitura que as pede responde 42703.
  semColunas: new Set<string>(),
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
  select(colunas?: string) {
    if (typeof colunas === "string" && colunas.split(",").some((c) => cenario.semColunas.has(c.trim()))) this.erro = { code: "42703" };
    return this;
  }
  eq(coluna: string, valor: unknown) { this.linhas = this.linhas.filter((l) => l[coluna] === undefined || l[coluna] === valor); return this; }
  neq(coluna: string, valor: unknown) { this.linhas = this.linhas.filter((l) => l[coluna] !== valor); return this; }
  in(coluna: string, valores: unknown[]) { this.linhas = this.linhas.filter((l) => l[coluna] === undefined || valores.includes(l[coluna])); return this; }
  lt(coluna: string, valor: string) { this.linhas = this.linhas.filter((l) => typeof l[coluna] === "string" && (l[coluna] as string) < valor); return this; }
  order() { return this; }
  range() { return this; }
  limit() { return this; }
  ilike(coluna: string, padrao: string) {
    const exato = padrao.replace(/\\(.)/g, "$1").toLowerCase();
    this.linhas = this.linhas.filter((l) => String(l[coluna] ?? "").toLowerCase() === exato);
    return this;
  }
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

import {
  abrirOrdem, avisarPeloWhatsApp, cobrarNoPdv, concluirServico, devolverPeca, entregarOrdem, orcarOrdem, passoDaOrdem, registrarFotoDaOs, responderOrcamento, usarPeca,
} from "./acoes";
import Detalhe from "./[id]/page";
import NovaOrdem from "./nova/page";
import Lista from "./page";

const EXECUTAR = new Set(["EstadoDoPainel", "ProximosPassos", "FormularioDoPasso", "FiltroSegmentado", "ListaDados", "CartaoDoOrcamento", "CartaoDaCobranca", "CartaoDasPecas"]);
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
  cenario.semColunas = new Set();
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

describe("orçamento na OS (L12b)", () => {
  const ORC = "00000000-0000-4000-8000-00000000e201";
  const tela = async () => texto(await Detalhe({ params: Promise.resolve({ id: OS }), searchParams: Promise.resolve({}) }) as ReactElement);
  const orcamento = (extra: Linha = {}) => ({
    id: ORC, os_id: OS, numero: 3, diagnostico: "Tela quebrada", pecas: [{ descricao: "Tela", quantidade: 1, valor: 25_000 }], mao_de_obra_centavos: 8_000, pecas_centavos: 25_000,
    total_centavos: 33_000, prazo_dias: 3, situacao: "aguardando_cliente", em_nome_do_tecnico: false, observacao: null, registrado_por: EU, registrado_em: "2026-11-14T15:00:00Z",
    resposta_canal: null, resposta_observacao: null, respondido_por: null, respondido_em: null, ...extra,
  });

  it("com o técnico: ele registra o orçamento; a gerência em nome dele; com o orçamento esperando, a loja registra a resposta e manda pelo WhatsApp", async () => {
    cenario.tabelas.ordens_servico = [os({ local: "com_tecnico", assistencia_id: ASSISTENCIA, servico: "aguardando_orcamento" })];
    cenario.unidade = ASSISTENCIA;
    cenario.permissoes = new Set(["os.orcar"]);
    let t = await tela();
    expect(t).toContain("Aguardando orçamento");
    expect(t).toContain("Nenhum orçamento ainda.");
    expect(t).toContain("Registrar o orçamento");
    expect(t).not.toContain("em nome do técnico");
    cenario.unidade = LOJA;
    cenario.permissoes = new Set(["os.abrir", "os.gerir"]);
    expect(await tela()).toContain("Registrar o orçamento (em nome do técnico)");
    cenario.tabelas.ordens_servico = [os({ local: "com_tecnico", assistencia_id: ASSISTENCIA, servico: "aguardando_cliente" })];
    cenario.tabelas.os_orcamentos = [orcamento()];
    cenario.permissoes = new Set(["os.abrir"]);
    t = await tela();
    for (const trecho of ["Orçamento com o cliente", "Orçamento nº 3 · R$ 330,00", "Esperando o cliente", "Tela quebrada", "Tela: R$ 250,00", "Mão de obra: R$ 80,00",
      "Prazo do conserto: 3 dias depois da aprovação", "Resposta do cliente ao orçamento nº 3", "Registrar a resposta", "Mandar o orçamento"]) {
      expect(t, trecho).toContain(trecho);
    }
    expect(t).not.toContain("Registrar o orçamento"); // o vendedor não orça
  });

  it("aprovado: o técnico conclui; a resposta registrada aparece com o canal; banco sem o orçamento, o cartão some e a OS continua", async () => {
    cenario.tabelas.ordens_servico = [os({ local: "com_tecnico", assistencia_id: ASSISTENCIA, servico: "aprovado" })];
    cenario.tabelas.os_orcamentos = [orcamento({ situacao: "aprovado", resposta_canal: "whatsapp", respondido_por: EU, respondido_em: "2026-11-14T16:00:00Z", resposta_observacao: "Pode fazer" })];
    cenario.unidade = ASSISTENCIA;
    cenario.permissoes = new Set(["os.orcar"]);
    const t = await tela();
    expect(t).toContain("Aprovado pelo cliente pelo whatsapp");
    expect(t).toContain("Pode fazer");
    expect(t).toContain("Conserto concluído");
    cenario.unidade = LOJA;
    cenario.permissoes = new Set(["os.abrir"]);
    cenario.erros = { os_orcamentos: { code: "PGRST205" } };
    const semTabela = await tela();
    expect(semTabela).toContain("OS nº 42");
    expect(semTabela).not.toContain("Orçamento nº");
  });

  it("as ações do orçamento mandam ao banco o que foi lido e voltam com a mensagem certa", async () => {
    const chave = "00000000-0000-4000-8000-00000000f101";
    cenario.respostas.os_orcar = { data: { id: ORC, numero: 3, repetida: false }, error: null };
    expect(await destinoDe(orcarOrdem(formulario({ os: OS, chave, diagnostico: "Tela quebrada", mao_de_obra: "80,00", peca_descricao_1: "Tela", peca_quantidade_1: "1", peca_valor_1: "250,00" }))))
      .toBe(`/assistencia/${OS}?ok=orcamento`);
    expect(cenario.chamadas.at(-1)).toEqual({ nome: "os_orcar", argumentos: { p_os: OS, p_chave: chave, p_dados: {
      diagnostico: "Tela quebrada", mao_de_obra: 8_000, pecas: [{ descricao: "Tela", quantidade: 1, valor: 25_000 }], prazo_dias: null, observacao: null,
    } } });
    expect(await destinoDe(orcarOrdem(formulario({ os: OS, chave, diagnostico: "x" })))).toBe(`/assistencia/${OS}?erro=diagnostico`);
    cenario.respostas.os_orcar = { data: null, error: { code: "22023", message: "O orçamento é feito com o aparelho com o técnico" } };
    expect(await destinoDe(orcarOrdem(formulario({ os: OS, chave, diagnostico: "Tela quebrada", mao_de_obra: "80" })))).toBe(`/assistencia/${OS}?erro=orcamento_local`);

    cenario.respostas.os_responder_orcamento = { data: true, error: null };
    expect(await destinoDe(responderOrcamento(formulario({ os: OS, orcamento: ORC, resposta: "aprovado", canal: "whatsapp", observacao: "" })))).toBe(`/assistencia/${OS}?ok=orcamento_aprovado`);
    expect(cenario.chamadas.at(-1)).toEqual({ nome: "os_responder_orcamento", argumentos: { p_orcamento: ORC, p_resposta: "aprovado", p_canal: "whatsapp", p_observacao: null } });
    expect(await destinoDe(responderOrcamento(formulario({ os: OS, orcamento: ORC, resposta: "talvez", canal: "loja" })))).toBe(`/assistencia/${OS}?erro=resposta`);
    expect(await destinoDe(responderOrcamento(formulario({ os: OS, orcamento: ORC, resposta: "recusado", canal: "email" })))).toBe(`/assistencia/${OS}?erro=canal`);
    cenario.respostas.os_responder_orcamento = { data: false, error: null };
    expect(await destinoDe(responderOrcamento(formulario({ os: OS, orcamento: ORC, resposta: "aprovado", canal: "loja" })))).toBe(`/assistencia/${OS}?ok=sem_mudanca`);

    cenario.respostas.os_concluir_servico = { data: true, error: null };
    expect(await destinoDe(concluirServico(formulario({ os: OS, observacao: "Tela trocada" })))).toBe(`/assistencia/${OS}?ok=concluido`);
    cenario.respostas.os_concluir_servico = { data: null, error: { code: "22023", message: "O conserto só é feito depois da aprovação do cliente registrada" } };
    expect(await destinoDe(concluirServico(formulario({ os: OS })))).toBe(`/assistencia/${OS}?erro=sem_aprovacao`);

    // O aviso do orçamento leva o que espera o cliente.
    cenario.tabelas.os_orcamentos = [orcamento()];
    cenario.respostas.os_contato_whatsapp = { data: "41987650001", error: null };
    const link = await destinoDe(avisarPeloWhatsApp(formulario({ os: OS, aviso: "orcamento" })));
    expect(decodeURIComponent(link.split("text=")[1] ?? "")).toContain("Total: R$ 330,00");
    cenario.tabelas.os_orcamentos = [];
    expect(await destinoDe(avisarPeloWhatsApp(formulario({ os: OS, aviso: "orcamento" })))).toBe(`/assistencia/${OS}?erro=aviso_orcamento`);
  });
});

describe("cobrança no PDV e entrega (L12c)", () => {
  const ORC = "00000000-0000-4000-8000-00000000e301";
  const VENDA = "00000000-0000-4000-8000-00000000e302";
  const NOVA = "00000000-0000-4000-8000-00000000e303";
  const CHAVE_VENDA = "00000000-0000-4000-8000-00000000f301";
  const CHAVE_ITEM = "00000000-0000-4000-8000-00000000f302";
  const tela = async () => texto(await Detalhe({ params: Promise.resolve({ id: OS }), searchParams: Promise.resolve({}) }) as ReactElement);
  const aprovado = {
    id: ORC, os_id: OS, numero: 3, diagnostico: "Tela quebrada", pecas: [{ descricao: "Tela", quantidade: 1, valor: 25_000 }], mao_de_obra_centavos: 8_000, pecas_centavos: 25_000,
    total_centavos: 33_000, prazo_dias: 3, situacao: "aprovado", em_nome_do_tecnico: false, observacao: null, registrado_por: EU, registrado_em: "2026-11-14T15:00:00Z",
    resposta_canal: "loja", resposta_observacao: null, respondido_por: EU, respondido_em: "2026-11-14T16:00:00Z",
  };
  const pronta = (extra: Linha = {}) => os({ local: "loja", assistencia_id: ASSISTENCIA, servico: "concluido", venda_id: null, cobrada_em: null, ...extra });

  it("pronta na loja: o vendedor cobra no PDV pelo valor aprovado; não devolve sem cobrar; a gerência devolve sem cobrar, com o motivo", async () => {
    cenario.tabelas.ordens_servico = [pronta()];
    cenario.tabelas.os_orcamentos = [aprovado];
    cenario.tabelas.os_eventos = [evento("aberta", { local_para: "loja" }), evento("enviada_ao_tecnico"), evento("servico_concluido"), evento("recebida_na_loja")];
    let t = await tela();
    for (const trecho of ["Cobrança e entrega", "Conserto pronto e o aparelho na loja: R$ 330,00, do orçamento nº 3 aprovado pelo cliente.", "Cobrar no PDV",
      "Conserto pronto: cobre no PDV e registre a entrega"]) {
      expect(t, trecho).toContain(trecho);
    }
    for (const trecho of ["Devolver ao cliente sem conserto", "Enviar ao técnico", "Devolver sem cobrar"]) expect(t, trecho).not.toContain(trecho);
    cenario.permissoes = new Set(["os.abrir", "os.gerir"]);
    t = await tela();
    expect(t).toContain("Devolver sem cobrar (gerência)");
    expect(t).toContain("Motivo da devolução sem cobrar (garantia, cortesia)");
    // Banco sem a cobrança (sem a coluna): o cartão some e a OS continua.
    cenario.semColunas = new Set(["venda_id"]);
    t = await tela();
    expect(t).toContain("OS nº 42");
    expect(t).toContain("Conserto pronto");
    expect(t).not.toContain("Cobrança e entrega");
    // ... e os passos são os de antes: o banco sem a migration ainda aceita a devolução pela loja.
    expect(t).toContain("Devolver ao cliente sem conserto");
    expect(t).not.toContain("Devolver sem cobrar");
  });

  it("cobrada: o próximo passo é a entrega; entregue: o comprovante da entrega; o número da venda vem da venda ou da trilha", async () => {
    cenario.tabelas.ordens_servico = [pronta({ venda_id: VENDA, cobrada_em: "2026-11-14T17:00:00Z" })];
    cenario.tabelas.os_orcamentos = [aprovado];
    cenario.tabelas.vendas = [{ id: VENDA, numero: 77 }];
    let t = await tela();
    expect(t).toContain("Cobrado na venda nº 77");
    expect(t).toContain("Registrar a entrega ao cliente");
    expect(t).toContain("Conserto cobrado: o próximo passo é a entrega ao cliente");
    expect(t).not.toContain("Cobrar no PDV");
    // Quem não lê a venda vê o número pela trilha.
    cenario.tabelas.vendas = [];
    cenario.tabelas.os_eventos = [evento("aberta", { local_para: "loja" }), evento("cobrada", { observacao: "Venda nº 77" })];
    t = await tela();
    expect(t).toContain("Cobrado na venda nº 77");
    expect(t).toContain("Conserto cobrado no PDV");
    cenario.tabelas.ordens_servico = [pronta({ venda_id: VENDA, cobrada_em: "2026-11-14T17:00:00Z", situacao: "entregue", local: "com_cliente",
      encerrada_em: "2026-11-14T17:30:00Z", motivo_encerramento: "Entregue ao cliente, cobrada na venda nº 77" })];
    t = await tela();
    expect(t).toContain("Entregue e cobrada");
    expect(t).toContain("conserto cobrado na venda nº 77");
    expect(t).toContain("Mandar o comprovante da entrega");
    expect(t).not.toContain("Onde está e o próximo passo");
    expect(t).not.toContain("Registrar a entrega ao cliente");
  });

  it("as ações: cobrar usa a venda aberta (ou abre uma) e leva ao PDV; entregar; o comprovante da entrega pelo WhatsApp", async () => {
    // Com a venda aberta de quem cobra, nesta loja.
    cenario.tabelas.vendas = [{ id: VENDA, vendedor_id: EU, unidade_id: LOJA, situacao: "rascunho" }];
    cenario.respostas.os_cobrar = { data: "item-1", error: null };
    expect(await destinoDe(cobrarNoPdv(formulario({ os: OS, chave_venda: CHAVE_VENDA, chave_item: CHAVE_ITEM })))).toBe("/vender?os=no_carrinho");
    expect(cenario.chamadas).toEqual([{ nome: "os_cobrar", argumentos: { p_venda: VENDA, p_os: OS, p_chave: CHAVE_ITEM } }]);
    // Sem venda aberta: abre uma com a chave do formulário.
    cenario.tabelas.vendas = [];
    cenario.chamadas = [];
    cenario.respostas.criar_venda = { data: NOVA, error: null };
    expect(await destinoDe(cobrarNoPdv(formulario({ os: OS, chave_venda: CHAVE_VENDA, chave_item: CHAVE_ITEM })))).toBe("/vender?os=no_carrinho");
    expect(cenario.chamadas).toEqual([
      { nome: "criar_venda", argumentos: { p_chave: CHAVE_VENDA } }, { nome: "os_cobrar", argumentos: { p_venda: NOVA, p_os: OS, p_chave: CHAVE_ITEM } },
    ]);
    cenario.respostas.os_cobrar = { data: null, error: { code: "OR032", message: "Esta ordem de serviço já foi cobrada (venda nº 77)" } };
    expect(await destinoDe(cobrarNoPdv(formulario({ os: OS, chave_venda: CHAVE_VENDA, chave_item: CHAVE_ITEM })))).toBe(`/assistencia/${OS}?erro=ja_cobrada`);
    cenario.respostas.os_cobrar = { data: null, error: { code: "22023", message: "Só o conserto concluído é cobrado" } };
    expect(await destinoDe(cobrarNoPdv(formulario({ os: OS, chave_venda: CHAVE_VENDA, chave_item: CHAVE_ITEM })))).toBe(`/assistencia/${OS}?erro=nao_pronta`);
    expect(await destinoDe(cobrarNoPdv(formulario({ os: OS, chave_venda: "x", chave_item: CHAVE_ITEM })))).toBe(`/assistencia/${OS}?erro=dados`);
    cenario.respostas.criar_venda = { data: null, error: { code: "42501", message: "Sem permissão para vender nesta loja" } };
    expect(await destinoDe(cobrarNoPdv(formulario({ os: OS, chave_venda: CHAVE_VENDA, chave_item: CHAVE_ITEM })))).toBe(`/assistencia/${OS}?erro=sem_permissao`);

    cenario.respostas.os_entregar = { data: true, error: null };
    expect(await destinoDe(entregarOrdem(formulario({ os: OS, observacao: "" })))).toBe(`/assistencia/${OS}?ok=entregue`);
    expect(cenario.chamadas.at(-1)).toEqual({ nome: "os_entregar", argumentos: { p_os: OS, p_observacao: null } });
    cenario.respostas.os_entregar = { data: false, error: null };
    expect(await destinoDe(entregarOrdem(formulario({ os: OS, observacao: "Cliente conferiu" })))).toBe(`/assistencia/${OS}?ok=sem_mudanca`);
    cenario.respostas.os_entregar = { data: null, error: { code: "22023", message: "Cobre o conserto no PDV antes de entregar" } };
    expect(await destinoDe(entregarOrdem(formulario({ os: OS })))).toBe(`/assistencia/${OS}?erro=cobrar_antes`);

    // O comprovante da entrega leva o dia da entrega e a venda da trilha.
    cenario.tabelas.ordens_servico = [pronta({ situacao: "entregue", local: "com_cliente", encerrada_em: "2026-11-14T17:30:00Z" })];
    cenario.tabelas.os_eventos = [evento("cobrada", { observacao: "Venda nº 77" })];
    cenario.respostas.os_contato_whatsapp = { data: "41987650001", error: null };
    const link = await destinoDe(avisarPeloWhatsApp(formulario({ os: OS, aviso: "entrega" })));
    const mensagem = decodeURIComponent(link.split("text=")[1] ?? "");
    expect(mensagem).toContain("da ordem de serviço nº 42, foi entregue em 14/11/2026 na loja Santa Cândida (teste).");
    expect(mensagem).toContain("Conserto pago na venda nº 77.");
    expect(cenario.chamadas.at(-1)).toEqual({ nome: "os_contato_whatsapp", argumentos: { p_os: OS, p_aviso: "entrega" } });
  });
});

describe("peças da assistência na OS (L12d)", () => {
  const TELA = "00000000-0000-4000-8000-00000000e401";
  const PECA = "00000000-0000-4000-8000-00000000e402";
  const CHAVE = "00000000-0000-4000-8000-00000000f401";
  const tela = async () => texto(await Detalhe({ params: Promise.resolve({ id: OS }), searchParams: Promise.resolve({}) }) as ReactElement);
  const peca = (extra: Linha = {}) => ({
    id: PECA, os_id: OS, variante_id: TELA, quantidade: 1, em_nome_do_tecnico: false, observacao: null, registrado_por: EU, registrado_em: "2026-11-14T15:30:00Z",
    devolvida_em: null, devolvida_por: null, motivo_devolucao: null, ...extra,
  });
  const comOTecnico = () => {
    cenario.tabelas.ordens_servico = [os({ local: "com_tecnico", assistencia_id: ASSISTENCIA, servico: "aprovado" })];
    cenario.tabelas.os_pecas = [peca()];
    cenario.tabelas.variantes = [{ id: TELA, sku: "PEC-TELA-A15", nome: "Tela A15 original" }];
  };

  it("o técnico registra e devolve a peça; a gerência em nome dele; a loja só vê; banco sem as peças, o cartão some", async () => {
    comOTecnico();
    cenario.unidade = ASSISTENCIA;
    cenario.permissoes = new Set(["os.orcar"]);
    let t = await tela();
    for (const trecho of ["Peças do estoque", "1 × Tela A15 original", "PEC-TELA-A15", "Registrar peça usada", "Registrar a peça", "Devolver ao estoque (não foi usada)"]) {
      expect(t, trecho).toContain(trecho);
    }
    expect(t).not.toContain("em nome do técnico");
    cenario.unidade = LOJA;
    cenario.permissoes = new Set(["os.abrir", "os.gerir"]);
    t = await tela();
    expect(t).toContain("Registrar a peça (em nome do técnico)");
    expect(t).toContain("Como o técnico passou");
    cenario.permissoes = new Set(["os.abrir"]);
    t = await tela();
    expect(t).toContain("1 × Tela A15 original");
    expect(t).not.toContain("Registrar peça usada");
    expect(t).not.toContain("Devolver ao estoque");
    // Devolvida: aparece marcada, sem o botão.
    cenario.tabelas.os_pecas = [peca({ devolvida_em: "2026-11-14T16:00:00Z", devolvida_por: EU, motivo_devolucao: "Não precisou" })];
    cenario.permissoes = new Set(["os.abrir", "os.gerir"]);
    t = await tela();
    expect(t).toContain("devolvida ao estoque");
    expect(t).toContain("Não precisou");
    expect(t).not.toContain("Devolver ao estoque (não foi usada)");
    cenario.erros = { os_pecas: { code: "PGRST205" } };
    t = await tela();
    expect(t).toContain("OS nº 42");
    expect(t).not.toContain("Peças do estoque");
  });

  it("as ações: a peça pelo SKU (sem diferença de maiúsculas), a quantidade e os erros do banco; a devolução com o motivo", async () => {
    cenario.tabelas.variantes = [{ id: TELA, sku: "PEC-TELA-A15" }];
    cenario.respostas.os_usar_peca = { data: { id: PECA, repetida: false }, error: null };
    expect(await destinoDe(usarPeca(formulario({ os: OS, chave: CHAVE, sku: " pec-tela-a15 ", quantidade: "2", observacao: "" })))).toBe(`/assistencia/${OS}?ok=peca_usada`);
    expect(cenario.chamadas.at(-1)).toEqual({ nome: "os_usar_peca", argumentos: { p_os: OS, p_variante: TELA, p_quantidade: 2, p_observacao: null, p_chave: CHAVE } });
    cenario.chamadas = [];
    expect(await destinoDe(usarPeca(formulario({ os: OS, chave: CHAVE, sku: "OUTRA" })))).toBe(`/assistencia/${OS}?erro=peca_nao_encontrada`);
    expect(await destinoDe(usarPeca(formulario({ os: OS, chave: CHAVE, sku: "PEC-TELA-A15", quantidade: "21" })))).toBe(`/assistencia/${OS}?erro=peca_quantidade`);
    expect(await destinoDe(usarPeca(formulario({ os: OS, chave: "x", sku: "PEC-TELA-A15" })))).toBe(`/assistencia/${OS}?erro=dados`);
    expect(cenario.chamadas).toEqual([]);
    cenario.respostas.os_usar_peca = { data: null, error: { code: "OR001", message: "Sem saldo desta peça no estoque da assistência" } };
    expect(await destinoDe(usarPeca(formulario({ os: OS, chave: CHAVE, sku: "PEC-TELA-A15" })))).toBe(`/assistencia/${OS}?erro=peca_sem_saldo`);
    cenario.respostas.os_usar_peca = { data: null, error: { code: "42501", message: "A peça é registrada pelo técnico (ou pela gerência da loja, em nome dele)" } };
    expect(await destinoDe(usarPeca(formulario({ os: OS, chave: CHAVE, sku: "PEC-TELA-A15" })))).toBe(`/assistencia/${OS}?erro=sem_permissao`);

    cenario.respostas.os_devolver_peca = { data: true, error: null };
    expect(await destinoDe(devolverPeca(formulario({ os: OS, peca: PECA, motivo: "Não precisou trocar" })))).toBe(`/assistencia/${OS}?ok=peca_devolvida`);
    expect(cenario.chamadas.at(-1)).toEqual({ nome: "os_devolver_peca", argumentos: { p_peca: PECA, p_motivo: "Não precisou trocar" } });
    cenario.respostas.os_devolver_peca = { data: false, error: null };
    expect(await destinoDe(devolverPeca(formulario({ os: OS, peca: PECA, motivo: "Não precisou trocar" })))).toBe(`/assistencia/${OS}?ok=sem_mudanca`);
    expect(await destinoDe(devolverPeca(formulario({ os: OS, peca: PECA, motivo: "x" })))).toBe(`/assistencia/${OS}?erro=motivo`);
    cenario.respostas.os_devolver_peca = { data: null, error: { code: "22023", message: "A ordem de serviço já foi encerrada: a peça volta pelo inventário" } };
    expect(await destinoDe(devolverPeca(formulario({ os: OS, peca: PECA, motivo: "Sobrou" })))).toBe(`/assistencia/${OS}?erro=encerrada`);
  });
});
