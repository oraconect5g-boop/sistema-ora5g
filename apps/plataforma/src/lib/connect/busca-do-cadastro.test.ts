// AUD-f: a busca do cadastro do cliente na Nogle para preencher, sem a tela: as dependências são de mentira (nenhuma chamada de
// verdade), com o cadastro FICTÍCIO no formato que o worker grava (lerCadastroParaPreencher) e o CPF de exemplo com o dígito.
import { describe, expect, it } from "vitest";

import { faltaNaEtapa, resumoDaAtivacao } from "../../app/connect/ativar/etapas";
import {
  criarBuscaDoCadastro, DADOS_DO_ANTERIOR_APAGADOS, DADOS_DO_ANTERIOR_EDITADOS, DESCARTADA_NO_BANCO, DESCARTADA_PELO_DOCUMENTO, SEM_RESPOSTA, type AvisoDaBusca,
  type DependenciasDaBusca,
} from "./busca-do-cadastro";
import {
  CAMPOS_DA_ATIVACAO, CAMPOS_DAS_ACOES, documentoParaBuscar, erroDoCadastro, lerRespostaDoCadastro, planoDePreenchimento, type CampoNaTela,
  type EstadoDoCadastro,
} from "./cadastro-da-nogle";

const CPF = "123.456.789-09";
const CADASTRO = { nome: "Cliente Fictício", nascimento: "1990-10-10", email: "cliente@exemplo.invalid", telefone: "51999999999", cep: "90000000",
  rua: "Rua Exemplo", numero: "123", bairro: "Centro", cidade_na_nogle: "Porto Alegre", uf_na_nogle: "RS" };

/** Uma promessa que o teste resolve quando quer (para pôr as respostas fora de ordem). */
function adiada<T>() {
  let resolver!: (v: T) => void;
  const promessa = new Promise<T>((r) => { resolver = r; });
  return { promessa, resolver };
}

function montar(opcoes: { campos?: Record<string, Partial<CampoNaTela>>; respostas?: EstadoDoCadastro[]; modo?: "preencher" | "avisar" } = {}) {
  const tela: Record<string, CampoNaTela> = {};
  for (const nome of Object.values(CAMPOS_DA_ATIVACAO)) tela[nome] = { valor: "", maximo: -1, mexido: false, ...opcoes.campos?.[nome] };
  const registro = { pedidos: [] as string[], lidas: [] as string[], descartadas: [] as string[], avisos: [] as (AvisoDaBusca | null)[], ocupada: [] as boolean[] };
  const respostas = [...(opcoes.respostas ?? [{ estado: "achado", cadastro: CADASTRO }])];
  let n = 0;
  const deps: DependenciasDaBusca = {
    pedir: async (documento) => { registro.pedidos.push(documento); return { ok: true, consulta: `c${++n}` }; },
    ler: async (consulta) => { registro.lidas.push(consulta); return respostas.shift() ?? { estado: "esperando" }; },
    descartar: async (consulta) => { registro.descartadas.push(consulta); },
    esperar: async () => undefined,
    novaChave: () => `chave-${n}`,
    campoNaTela: (nome) => tela[nome] ?? null,
    preencher: (nome, valor) => { if (tela[nome]) tela[nome].valor = valor; },
    mostrar: (aviso) => { registro.avisos.push(aviso); },
    ocupada: (sim) => { registro.ocupada.push(sim); },
  };
  return { tela, registro, deps, busca: criarBuscaDoCadastro(opcoes.modo ?? "preencher", CAMPOS_DA_ATIVACAO, deps, { intervaloMs: 0, tentativas: 3 }) };
}
const ultimo = (r: { avisos: (AvisoDaBusca | null)[] }) => r.avisos.at(-1);

describe("as regras da busca do cadastro (AUD-f)", () => {
  it("só busca com CPF ou CNPJ válido", () => {
    expect(documentoParaBuscar(CPF)).toBe("12345678909");
    expect(documentoParaBuscar("11.222.333/0001-81")).toBe("11222333000181");
    for (const d of ["123.456.789-00", "1234", "", null, 12345678909]) expect(documentoParaBuscar(d)).toBeNull();
  });
  it("o erro do banco vira o aviso certo", () => {
    expect([{ code: "OR056" }, { code: "42501" }, { code: "22023" }, { code: "XX000" }, null].map(erroDoCadastro)).toEqual(["limite", "sem_permissao", "documento", "falha", "falha"]);
  });
  it("a resposta do banco: esperando, achado (só os campos conhecidos, só texto), não encontrado, falha e descartada", () => {
    expect(lerRespostaDoCadastro({ situacao: "consultando", mensagem: null, resposta: null })).toEqual({ estado: "esperando" });
    expect(lerRespostaDoCadastro({ situacao: "respondida", mensagem: null, resposta: { nome: "X", cpf: "12345678909", numero: 12, extra: "y", bairro: " " } }))
      .toEqual({ estado: "achado", cadastro: { nome: "X" } });
    expect(lerRespostaDoCadastro({ situacao: "nao_encontrada", mensagem: "Cliente não encontrado" })).toEqual({ estado: "nao_encontrado", mensagem: "Cliente não encontrado" });
    expect(lerRespostaDoCadastro({ situacao: "falhou", mensagem: "A Nogle não respondeu agora" })).toEqual({ estado: "falhou", mensagem: "A Nogle não respondeu agora" });
    expect(lerRespostaDoCadastro(null)).toEqual({ estado: "descartada" });
  });
  it("o plano: só o campo vazio e não mexido, só se couber; o número do endereço muda de nome nas ações", () => {
    const tela: Record<string, CampoNaTela> = {
      nome: { valor: "", maximo: 120, mexido: false }, data_nascimento: { valor: "", maximo: -1, mexido: false }, email: { valor: "outro@exemplo.invalid", maximo: -1, mexido: false },
      telefone: { valor: "", maximo: -1, mexido: true }, cep: { valor: "", maximo: -1, mexido: false }, rua: { valor: "", maximo: 5, mexido: false },
      numero: { valor: "", maximo: 10, mexido: false }, complemento: { valor: "", maximo: 60, mexido: false }, bairro: { valor: "", maximo: 40, mexido: false },
    };
    const plano = planoDePreenchimento(CADASTRO, CAMPOS_DAS_ACOES, (nome) => tela[nome] ?? null);
    expect(plano.preencher.map((p) => [p.nome, p.valor])).toEqual([["nome", "Cliente Fictício"], ["data_nascimento", "1990-10-10"], ["cep", "90000000"], ["numero", "123"], ["bairro", "Centro"]]);
    expect(plano).toMatchObject({ mantidos: ["email", "telefone"], naoCouberam: ["rua"], naoVieram: ["complemento"] });
  });
});

describe("o andamento da busca do cadastro (AUD-f)", () => {
  it("preenche só o que veio, no campo vazio e não mexido; diz o que manteve, o que não veio e a cidade só como referência; descarta a resposta usada", async () => {
    const { tela, registro, busca } = montar({
      campos: { email: { valor: "digitado@exemplo.invalid" }, telefone: { mexido: true } },
      respostas: [{ estado: "esperando" }, { estado: "achado", cadastro: { ...CADASTRO, complemento: undefined } }],
    });
    await busca.buscar(CPF);
    expect(registro.pedidos).toEqual(["12345678909"]);
    expect(tela).toMatchObject({ nome: { valor: "Cliente Fictício" }, email: { valor: "digitado@exemplo.invalid" }, telefone: { valor: "" }, numero_endereco: { valor: "123" } });
    expect(ultimo(registro)).toEqual({ tom: "sucesso", linhas: [
      "Preenchido com o cadastro da Nogle: nome, nascimento, CEP, rua, número e bairro. Confira com o cliente e corrija se precisar.",
      "Mantido o que já estava no formulário: e-mail e telefone.",
      "A Nogle não mandou: complemento.",
      "Cidade no cadastro da Nogle: Porto Alegre (RS). Escolha a cidade na lista.",
    ] });
    expect(registro.descartadas).toEqual(["c1"]);
    expect(registro.ocupada).toEqual([true, false]);
  });

  it("não busca sem documento válido", async () => {
    const { registro, busca } = montar();
    await busca.buscar("123");
    expect(registro.pedidos).toEqual([]);
    expect(ultimo(registro)).toEqual({ tom: "perigo", linhas: ["Digite um CPF ou CNPJ válido para buscar na Nogle."] });
  });

  it("não encontrado, falha, descartada no banco e tempo esgotado: nada é preenchido e a busca é descartada", async () => {
    for (const [resposta, aviso] of [
      [{ estado: "nao_encontrado", mensagem: "Cliente não encontrado" }, { tom: "info", linhas: ["A Nogle não tem cadastro com este documento: preencha os dados do cliente."] }],
      [{ estado: "falhou", mensagem: "A Nogle não respondeu agora: tente de novo em instantes." }, { tom: "perigo", linhas: ["A Nogle não respondeu agora: tente de novo em instantes."] }],
      [{ estado: "descartada" }, { tom: "aviso", linhas: [DESCARTADA_NO_BANCO] }],
    ] as const) {
      const { tela, registro, busca } = montar({ respostas: [resposta] });
      await busca.buscar(CPF);
      expect(Object.values(tela).every((c) => c.valor === ""), resposta.estado).toBe(true);
      expect(ultimo(registro), resposta.estado).toEqual(aviso);
      expect(registro.descartadas, resposta.estado).toEqual(["c1"]);
    }
    const { registro, busca } = montar({ respostas: [{ estado: "esperando" }, { estado: "esperando" }, { estado: "esperando" }] });
    await busca.buscar(CPF);
    expect(registro.lidas).toEqual(["c1", "c1", "c1"]);
    expect(ultimo(registro)).toEqual({ tom: "aviso", linhas: [SEM_RESPOSTA] });
    expect(registro.descartadas).toEqual(["c1"]);
  });

  it("o cadastro novo só avisa (não preenche): já existe ou pode cadastrar", async () => {
    let m = montar({ modo: "avisar" });
    await m.busca.buscar(CPF);
    expect(Object.values(m.tela).every((c) => c.valor === "")).toBe(true);
    expect(ultimo(m.registro)?.linhas[0]).toMatch(/^Este documento já tem cadastro na Nogle/);
    m = montar({ modo: "avisar", respostas: [{ estado: "nao_encontrado", mensagem: "Cliente não encontrado" }] });
    await m.busca.buscar(CPF);
    expect(ultimo(m.registro)).toEqual({ tom: "sucesso", linhas: ["Não há cadastro na Nogle com este documento: pode cadastrar."] });
  });

  it("o documento muda no meio: a busca é descartada e a resposta que chega depois é ignorada", async () => {
    const { tela, registro, deps } = montar();
    const leitura = adiada<EstadoDoCadastro>();
    const busca = criarBuscaDoCadastro("preencher", CAMPOS_DA_ATIVACAO, { ...deps, ler: () => leitura.promessa }, { intervaloMs: 0, tentativas: 3 });
    const andamento = busca.buscar(CPF);
    await new Promise((r) => setTimeout(r, 0));
    busca.mudouODocumento("123.456.789-0"); // a pessoa apagou um dígito
    expect(registro.descartadas).toEqual(["c1"]);
    expect(ultimo(registro)).toEqual({ tom: "aviso", linhas: [DESCARTADA_PELO_DOCUMENTO] });
    leitura.resolver({ estado: "achado", cadastro: CADASTRO });
    await andamento;
    expect(tela.nome?.valor).toBe("");
    expect(registro.descartadas).toEqual(["c1"]);
    // O mesmo documento, escrito de outro jeito, não descarta.
    const outra = montar();
    const leitura2 = adiada<EstadoDoCadastro>();
    const busca2 = criarBuscaDoCadastro("preencher", CAMPOS_DA_ATIVACAO, { ...outra.deps, ler: () => leitura2.promessa }, { intervaloMs: 0, tentativas: 3 });
    const andamento2 = busca2.buscar(CPF);
    await new Promise((r) => setTimeout(r, 0));
    busca2.mudouODocumento("12345678909");
    leitura2.resolver({ estado: "achado", cadastro: CADASTRO });
    await andamento2;
    expect(outra.tela.nome?.valor).toBe("Cliente Fictício");
  });

  it("fora de ordem: a busca nova vale; a resposta da antiga é ignorada e a consulta antiga é descartada, também a que ainda era pedida", async () => {
    const { tela, registro, deps } = montar();
    const pedidos = [adiada<{ ok: true; consulta: string }>(), adiada<{ ok: true; consulta: string }>()];
    let i = 0;
    const busca = criarBuscaDoCadastro("preencher", CAMPOS_DA_ATIVACAO, {
      ...deps,
      pedir: (documento) => { registro.pedidos.push(documento); return pedidos[i++]?.promessa ?? Promise.reject(new Error("a mais")); },
      ler: async (consulta) => ({ estado: "achado", cadastro: { ...CADASTRO, nome: consulta === "antiga" ? "Da busca antiga" : "Da busca nova" } }),
    }, { intervaloMs: 0, tentativas: 3 });
    const primeira = busca.buscar(CPF);
    const segunda = busca.buscar("11.222.333/0001-81");
    pedidos[1]?.resolver({ ok: true, consulta: "nova" });
    await segunda;
    pedidos[0]?.resolver({ ok: true, consulta: "antiga" });
    await primeira;
    expect(tela.nome?.valor).toBe("Da busca nova");
    expect(registro.descartadas.sort()).toEqual(["antiga", "nova"]);
  });

  it("a pessoa sai da tela: a busca em andamento é descartada e nada mais acontece", async () => {
    const { tela, registro, deps } = montar();
    const leitura = adiada<EstadoDoCadastro>();
    const busca = criarBuscaDoCadastro("preencher", CAMPOS_DA_ATIVACAO, { ...deps, ler: () => leitura.promessa }, { intervaloMs: 0, tentativas: 3 });
    const andamento = busca.buscar(CPF);
    await new Promise((r) => setTimeout(r, 0));
    busca.sair();
    leitura.resolver({ estado: "achado", cadastro: CADASTRO });
    await andamento;
    expect(registro.descartadas).toEqual(["c1"]);
    expect(tela.nome?.valor).toBe("");
  });

  it("o pedido recusado pelo banco (o limite, a permissão) diz o motivo e não consulta", async () => {
    const { registro, deps } = montar();
    const busca = criarBuscaDoCadastro("preencher", CAMPOS_DA_ATIVACAO, { ...deps, pedir: async () => ({ ok: false, erro: "limite" }) }, { intervaloMs: 0, tentativas: 3 });
    await busca.buscar(CPF);
    expect(registro.lidas).toEqual([]);
    expect(ultimo(registro)).toEqual({ tom: "perigo", linhas: ["Muitas buscas de cadastro na última hora: espere um pouco ou preencha à mão."] });
  });
});

// AUD-f (antes de liberar o PR #113): depois da busca concluída, o documento que muda não deixa no formulário (nem na revisão)
// o que veio da busca anterior. Só duas identidades SINTÉTICAS (CPFs de exemplo, com o dígito verificador; nenhuma de cliente),
// sem provedor: as respostas são de mentira.
describe("o documento muda depois da busca concluída (AUD-f)", () => {
  const A = { cpf: "123.456.789-09", cadastro: { nome: "Cliente Fictício A", nascimento: "1991-01-01", email: "a@exemplo.invalid", telefone: "41999990001",
    cep: "80000001", rua: "Rua Fictícia A", numero: "11", bairro: "Bairro A" } };
  const B = { cpf: "529.982.247-25", cadastro: { nome: "Cliente Fictício B", nascimento: "1992-02-02", email: "b@exemplo.invalid", telefone: "41999990002",
    cep: "80000002", rua: "Rua Fictícia B", numero: "22", bairro: "Bairro B" } };
  const LISTAS = { planos: [], cidades: [{ codigo: "4106902", nome: "Cidade Fictícia", uf: "PR" }], pagos: [] };
  /** O formulário do assistente como o navegador mandaria: os campos da tela, o documento digitado e a cidade escolhida. */
  const formulario = (tela: Record<string, CampoNaTela>, documento: string) => {
    const d = new FormData();
    for (const [nome, c] of Object.entries(tela)) d.set(nome, c.valor);
    d.set("documento", documento);
    d.set("id_cidade", "4106902");
    d.set("esim", "on");
    return d;
  };
  const deA = (t: string) => Object.values(A.cadastro).some((v) => t.includes(v));

  it("as identidades de teste valem (o dígito verificador)", () => {
    expect([A.cpf, B.cpf].map(documentoParaBuscar)).toEqual(["12345678909", "52998224725"]);
  });

  it("de A para B: sai o que veio de A e ninguém mexeu, o editado fica, a revisão não leva A; a nova busca de B preenche o que ficou vazio", async () => {
    const { tela, registro, busca } = montar({ respostas: [{ estado: "achado", cadastro: A.cadastro }, { estado: "achado", cadastro: B.cadastro }] });
    await busca.buscar(A.cpf);
    expect(tela.nome?.valor).toBe("Cliente Fictício A");
    // A pessoa corrige o CEP à mão (o componente marca o campo como mexido).
    tela.cep = { valor: "80000999", maximo: -1, mexido: true };
    busca.mudouODocumento(B.cpf);
    expect(Object.fromEntries(Object.entries(tela).map(([k, c]) => [k, c.valor]))).toEqual({
      nome: "", data_nascimento: "", email: "", telefone: "", cep: "80000999", rua: "", numero_endereco: "", complemento: "", bairro: "",
    });
    expect(ultimo(registro)).toEqual({ tom: "aviso", linhas: [DADOS_DO_ANTERIOR_APAGADOS("nome, nascimento, e-mail, telefone, rua, número e bairro")] });
    // A revisão: sem o nome de A, o passo do cliente não passa; o resumo não traz nada de A.
    expect(faltaNaEtapa(1, formulario(tela, B.cpf))).toBe("Informe o nome completo do cliente, como no documento.");
    expect(deA(JSON.stringify(resumoDaAtivacao(formulario(tela, B.cpf), LISTAS)))).toBe(false);
    // A nova busca, de B: preenche o que ficou vazio; o CEP editado fica.
    await busca.buscar(B.cpf);
    expect(tela).toMatchObject({ nome: { valor: "Cliente Fictício B" }, rua: { valor: "Rua Fictícia B" }, cep: { valor: "80000999" } });
    expect(faltaNaEtapa(1, formulario(tela, B.cpf))).toBeNull();
    const resumo = resumoDaAtivacao(formulario(tela, B.cpf), LISTAS);
    expect(resumo).toContainEqual(["Titular", "Cliente Fictício B · •••.•••.247-25"]);
    expect(deA(JSON.stringify(resumo))).toBe(false);
    expect(registro.pedidos).toEqual(["12345678909", "52998224725"]);
  });

  it("a formatação do mesmo documento não apaga nada; mudar um dígito apaga", async () => {
    const { tela, registro, busca } = montar({ respostas: [{ estado: "achado", cadastro: A.cadastro }] });
    await busca.buscar(A.cpf);
    const avisos = registro.avisos.length;
    busca.mudouODocumento("12345678909");
    busca.mudouODocumento(" 123.456.789-09 ");
    expect(tela.nome?.valor).toBe("Cliente Fictício A");
    expect(registro.avisos).toHaveLength(avisos);
    busca.mudouODocumento("123.456.789-0"); // apagou o último dígito
    expect(tela.nome?.valor).toBe("");
    expect(Object.values(tela).every((c) => c.valor === "")).toBe(true);
  });

  it("o que a pessoa digitou enquanto a busca de A corria fica, na busca e na troca do documento; com tudo editado, só o aviso", async () => {
    const { tela, registro, deps } = montar();
    const leitura = adiada<EstadoDoCadastro>();
    const busca = criarBuscaDoCadastro("preencher", CAMPOS_DA_ATIVACAO, { ...deps, ler: () => leitura.promessa }, { intervaloMs: 0, tentativas: 3 });
    const andamento = busca.buscar(A.cpf);
    await new Promise((r) => setTimeout(r, 0));
    tela.nome = { valor: "Nome Digitado", maximo: -1, mexido: true };
    leitura.resolver({ estado: "achado", cadastro: { nome: A.cadastro.nome, rua: A.cadastro.rua } });
    await andamento;
    expect(tela).toMatchObject({ nome: { valor: "Nome Digitado" }, rua: { valor: "Rua Fictícia A" } });
    // A rua que veio de A é editada também: ao trocar o documento, nada de A sobra e nada do que foi digitado sai.
    tela.rua = { valor: "Rua Editada", maximo: -1, mexido: true };
    busca.mudouODocumento(B.cpf);
    expect(tela).toMatchObject({ nome: { valor: "Nome Digitado" }, rua: { valor: "Rua Editada" } });
    expect(ultimo(registro)).toEqual({ tom: "aviso", linhas: [DADOS_DO_ANTERIOR_EDITADOS] });
  });

  it("a busca de B em trânsito ainda é descartada quando o documento volta para A, e a resposta atrasada não preenche nada", async () => {
    const { tela, registro, deps } = montar({ respostas: [{ estado: "achado", cadastro: A.cadastro }] });
    const leituraDeB = adiada<EstadoDoCadastro>();
    let leituras = 0;
    const busca = criarBuscaDoCadastro("preencher", CAMPOS_DA_ATIVACAO, {
      ...deps, ler: (consulta, documento) => (++leituras === 1 ? deps.ler(consulta, documento) : leituraDeB.promessa),
    }, { intervaloMs: 0, tentativas: 3 });
    await busca.buscar(A.cpf);
    busca.mudouODocumento(B.cpf);
    expect(tela.nome?.valor).toBe("");
    const andamento = busca.buscar(B.cpf);
    await new Promise((r) => setTimeout(r, 0));
    busca.mudouODocumento(A.cpf);
    expect(ultimo(registro)).toEqual({ tom: "aviso", linhas: [DESCARTADA_PELO_DOCUMENTO] });
    leituraDeB.resolver({ estado: "achado", cadastro: B.cadastro });
    await andamento;
    expect(Object.values(tela).every((c) => c.valor === "")).toBe(true);
    expect(registro.descartadas).toEqual(["c1", "c2"]);
  });
});
