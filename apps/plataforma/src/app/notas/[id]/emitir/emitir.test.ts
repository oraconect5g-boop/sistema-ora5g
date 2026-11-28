// "Dados para emitir" (lote K1b, #76) com a sessão e o Supabase SIMULADOS: nenhuma credencial, dados fictícios.
// O que a tela mostra em cada resposta do banco; a regra (quem vê, a auditoria, depois da emissão) está em
// packages/banco/src/pdv-l6.test.ts. Desde 27/11/2026 (a NF-e 55 no fluxo interno, NFE55-a, e a revisão do mesmo dia), a
// mesma tela mostra quem emite e a venda pela leitura normalizada do comprovante (lib/vendas/comprovante.ts), e o texto para
// copiar leva só o que dá para afirmar: nunca um pagamento, e nem os itens e os valores quando há devolução, estorno,
// serviço, acréscimo ou itens que não fecham. O caminho inteiro no banco está em nfe-modelo-55-ponta-a-ponta.test.ts.
import { isValidElement, type ReactElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { lerDadosParaEmitir } from "../../../../lib/notas/dados-para-emitir";
import { cnpjDoEmitente, lerFatosParaEmitir, textoParaCopiar } from "../../../../lib/notas/fatos-para-emitir";
import { erroDasNotas } from "../../../../lib/notas/regras";

const PEDIDO = "00000000-0000-4000-9000-0000000000e1";
const VENDA = "00000000-0000-4000-9000-0000000000e2";
const LOJA = "00000000-0000-4000-9000-0000000000e3";
const CAPA = "00000000-0000-4000-9000-0000000000e4";
const CELULAR = "00000000-0000-4000-9000-0000000000e5";
type Resposta = { data: unknown; error: null | { code: string; message?: string } };
const cenario = vi.hoisted(() => ({
  resposta: { data: null as unknown, error: null as null | { code: string; message?: string } },
  chamadas: [] as unknown[],
  // As tabelas que a tela lê, cada uma com a resposta para os filtros pedidos; tabela fora daqui responde "sem permissão".
  tabelas: {} as Record<string, (filtros: Record<string, unknown>) => { data: unknown; error: null | { code: string } }>,
}));
vi.mock("next/headers", () => ({ cookies: async () => ({ getAll: () => [], set: () => undefined }) }));
vi.mock("next/navigation", () => ({ redirect: (d: string) => { throw new Error(`redirecionou para ${d}`); }, notFound: () => { throw new Error("não encontrado"); } }));
vi.mock("../../../../lib/acesso/sessao", () => ({
  FalhaDoServico: class extends Error {},
  obterSessao: async () => ({
    usuario: { id: "u" },
    situacao: { usuario_ativo: true, sessao_no_turno: true, unidade_id: "loja", unidade_nome: "Santa Cândida (teste)", turno_termina_em: "2026-11-14T23:00:00Z" },
    supabase: {
      rpc: async (nome: string, argumentos: unknown) => { cenario.chamadas.push({ nome, argumentos }); return cenario.resposta; },
      from: (tabela: string) => {
        const filtros: Record<string, unknown> = {};
        const responder = async () => (cenario.tabelas[tabela] ?? (() => ({ data: null, error: { code: "42501" } })))(filtros);
        const consulta = {
          select: () => consulta, order: () => consulta, limit: () => consulta, lte: () => consulta,
          eq: (coluna: string, valor: unknown) => { filtros[coluna] = valor; return consulta; },
          in: (coluna: string, valor: unknown) => { filtros[coluna] = valor; return consulta; },
          maybeSingle: responder,
          then: (ok: (r: unknown) => unknown, falha?: (e: unknown) => unknown) => responder().then(ok, falha),
        };
        return consulta;
      },
    },
  }),
}));

import DadosParaEmitirANota from "./page";

function texto(v: unknown): string {
  if (Array.isArray(v)) return v.map(texto).join(" ");
  if (typeof v === "string" || typeof v === "number") return String(v);
  if (isValidElement<Record<string, unknown>>(v)) return Object.values(v.props).map(texto).join(" ");
  if (v && typeof v === "object") return Object.values(v).map(texto).join(" ");
  return "";
}
/** O texto do quadro "Tudo para copiar" (o defaultValue do textarea), à parte da tela. */
function copiado(v: unknown): string {
  if (Array.isArray(v)) return v.map(copiado).find(Boolean) ?? "";
  if (!isValidElement<Record<string, unknown>>(v)) return "";
  if (v.type === "textarea") return String(v.props.defaultValue ?? "");
  return Object.values(v.props).map(copiado).find(Boolean) ?? "";
}
const abrir = async (id = PEDIDO) => {
  const arvore = await DadosParaEmitirANota({ params: Promise.resolve({ id }) }) as ReactElement;
  return { t: texto(arvore).replace(/\s+/g, " "), copia: copiado(arvore) };
};
const tela = async (id = PEDIDO) => (await abrir(id)).t;
const ENDERECO = { cep: "80000000", logradouro: "Rua das Flores", numero: "10", bairro: "Centro", cidade: "Curitiba", uf: "PR" };
const COM_CLIENTE = { pedido: PEDIDO, numero: 12, nome: "Carla Nota", documento: "52998224725", endereco: ENDERECO, cliente: "c", dados_de: "2026-11-14T13:00:00Z" };
const ok = (data: unknown): Resposta => ({ data, error: null });

// A venda fictícia de cada caso: os totais gravados (a regra do concluir_venda), os itens e os pagamentos, como o banco lê.
type Linha = Record<string, unknown>;
const vendaGravada = (extra: Linha = {}): Linha => ({
  numero: 31, situacao: "concluida", concluida_em: "2026-11-27T13:05:00Z", subtotal_centavos: 15800, desconto_centavos: "500", total_centavos: 15300,
  troco_centavos: 0, a_receber_centavos: 0, devolvido_centavos: 0, ...extra,
});
const item = (extra: Linha = {}): Linha => ({ variante_id: CAPA, tipo: "acessorio", quantidade: 1, preco_unitario_centavos: 7900, desconto_centavos: 0, ...extra });
const pago = (extra: Linha): Linha => ({
  ordem: 1, meio: "dinheiro", valor_centavos: 0, entrada_centavos: 0, comprovante: null, situacao: "confirmado", parcelas: null, entrada_do_financiamento: false,
  bandeira_cartao: null, modalidade_cartao: null, acrescimo_cliente_centavos: null, ...extra,
});
const ITENS = [item(), item({ preco_unitario_centavos: "7900", desconto_centavos: 500 })];
// O misto: dinheiro, Pix com o comprovante e o crédito em 3x na maquininha.
const MISTO = [
  pago({ ordem: 1, meio: "dinheiro", valor_centavos: 3300 }),
  pago({ ordem: 2, meio: "pix_direto", valor_centavos: 2000, comprovante: "E2E-PIX-1" }),
  pago({ ordem: 3, meio: "cartao_picpay", valor_centavos: 10000, parcelas: 3, bandeira_cartao: "visa", modalidade_cartao: "credito", comprovante: "NSU-1" }),
];
const LOJA_DE_TESTE = { nome: "Santa Cândida (teste)", cnpj: "11222333000181", cidade: "Curitiba", uf: "PR", unidade_emissora_id: null };
const CONFIGURACAO = { cep: "82000000", logradouro: "Rua do Teste", numero: "100", complemento: null, bairro: "Santa Cândida", inscricao_estadual: "1234567890", inscricao_municipal: null };
function vendaDeTeste(o: { venda?: Linha; itens?: Linha[]; pagamentos?: Linha[]; devolucoes?: Linha[]; estornos?: Linha[] } = {}) {
  cenario.tabelas = {
    notas_pedidos: () => ok({ venda_id: VENDA, unidade_id: LOJA }),
    vendas: (f) => ok(f.id === VENDA ? vendaGravada(o.venda) : null),
    venda_itens: (f) => ok(f.venda_id === VENDA ? o.itens ?? ITENS : []),
    venda_pagamentos: (f) => ok(f.venda_id === VENDA ? o.pagamentos ?? MISTO : []),
    venda_devolucoes: (f) => ok(f.venda_id === VENDA ? o.devolucoes ?? [] : []),
    estornos_externos: (f) => ok(f.venda_id === VENDA ? o.estornos ?? [] : []),
    variantes: () => ok([{ id: CAPA, sku: "0042", nome: "Capa (teste)" }, { id: CELULAR, sku: "0777", nome: "Celular (teste)" }]),
    unidades: (f) => ok(f.id === LOJA ? LOJA_DE_TESTE : null),
    unidade_configuracoes: (f) => ok(f.unidade_id === LOJA ? CONFIGURACAO : null),
  };
}
/** Nenhum meio nem valor de pagamento no texto para copiar. */
const semPagamentos = (copia: string, ...valores: string[]) => {
  for (const proibido of ["Dinheiro", "Pix", "Cartão", "PayJoy", "Entrada do financiamento", "Troco", "NSU", "comprovante E2E", ...valores]) expect(copia).not.toContain(proibido);
};

beforeEach(() => { cenario.chamadas = []; cenario.resposta = { data: COM_CLIENTE, error: null }; cenario.tabelas = {}; });

describe("/notas/[id]/emitir (K1b)", () => {
  it("mostra nome, CPF formatado e endereço guardados no pedido, com a data do cadastro", async () => {
    const t = await tela();
    expect(cenario.chamadas).toEqual([{ nome: "notas_dados_para_emitir", argumentos: { p_pedido: PEDIDO } }]);
    for (const trecho of ["Dados para emitir · pedido nº 12", "Carla Nota", "529.982.247-25", "Rua das Flores, 10 · Centro · Curitiba/PR · CEP 80000-000", "14/11/2026"]) expect(t).toContain(trecho);
  });

  it("sem destinatário, pedido de outra loja, nota já emitida, banco sem a função e resposta estranha", async () => {
    cenario.resposta = { data: { pedido: PEDIDO, numero: 13, nome: null, documento: null, endereco: null, cliente: null, dados_de: null }, error: null };
    expect(await tela()).toContain("Nota sem cliente identificado");
    cenario.resposta = { data: null, error: { code: "P0002" } };
    await expect(tela()).rejects.toThrow("não encontrado");
    await expect(tela("abc")).rejects.toThrow("não encontrado");
    cenario.resposta = { data: null, error: { code: "22023", message: "Os dados do destinatário só aparecem enquanto a nota espera a emissão" } };
    expect(await tela()).toContain("Esta nota já foi emitida");
    cenario.resposta = { data: null, error: { code: "PGRST202" } };
    expect(await tela()).toContain("Indisponível neste ambiente");
    cenario.resposta = { data: { numero: 14, documento: "123", endereco: null }, error: null };
    expect(await tela()).toContain("Não foi possível concluir agora");
  });
});

describe("/notas/[id]/emitir: quem emite e a venda pela leitura do comprovante (NFE55-a, revisão de 27/11/2026)", () => {
  it("misto: a tela mostra a loja, os itens, os totais e cada pagamento como no comprovante; o texto leva itens e totais, nenhum pagamento", async () => {
    vendaDeTeste();
    const { t, copia } = await abrir();
    for (const trecho of [
      "Quem emite", "11.222.333/0001-81", "1234567890", "Rua do Teste, 100 · Santa Cândida · Curitiba/PR · CEP 82000-000",
      "Venda nº 31", "0042 · 1 × R$ 79,00 − desconto R$ 5,00", "R$ 158,00", "R$ 153,00",
      "Dinheiro: R$ 33,00", "Pix direto: R$ 20,00 · comprovante E2E-PIX-1", "Cartão na maquininha PicPay: R$ 100,00 em 3x · crédito · Visa · comprovante NSU-1",
      "Os pagamentos não vão no texto para copiar", "Abrir o comprovante da venda",
    ]) expect(t).toContain(trecho);
    expect(t).not.toContain("O texto para copiar não leva os itens");
    for (const trecho of [
      "Pedido de nota nº 12 · venda nº 31", "Emitente: Santa Cândida (teste) · CNPJ 11.222.333/0001-81 · IE 1234567890", "Destinatário: Carla Nota · CPF 529.982.247-25 · Rua das Flores",
      "1. 0042 · Capa (teste) · 1 × R$ 79,00 = R$ 79,00", "2. 0042 · Capa (teste) · 1 × R$ 79,00 − desconto R$ 5,00 = R$ 74,00", "Subtotal R$ 158,00 · Descontos R$ 5,00 · Total R$ 153,00",
      "Pagamentos: confira no comprovante da venda nº 31 (o troco, a entrada do financiamento e os estornos estão lá)",
    ]) expect(copia).toContain(trecho);
    semPagamentos(copia, "R$ 33,00", "R$ 20,00", "R$ 100,00");
    expect(copia).not.toMatch(/ICMS|alíquota|\bNCM \d/);
  });

  it("dinheiro com troco: a tela mostra o dinheiro entregue e o troco nos totais; o texto não leva nem um nem outro", async () => {
    vendaDeTeste({
      venda: { numero: 32, subtotal_centavos: 7900, desconto_centavos: 0, total_centavos: 7900, troco_centavos: 2100 },
      itens: [item()], pagamentos: [pago({ meio: "dinheiro", valor_centavos: 10000 })],
    });
    const { t, copia } = await abrir();
    for (const trecho of ["Dinheiro: R$ 100,00", "Troco", "R$ 21,00"]) expect(t).toContain(trecho);
    expect(copia).toContain("Subtotal R$ 79,00 · Descontos R$ 0,00 · Total R$ 79,00");
    semPagamentos(copia, "R$ 100,00", "R$ 21,00");
  });

  it("entrada do financiamento, embutida na PayJoy ou lançada à parte: a tela como o comprovante (a entrada e o a receber); o texto sem pagamento", async () => {
    const venda = { numero: 33, subtotal_centavos: 129900, desconto_centavos: 0, total_centavos: 129900, a_receber_centavos: 89900 };
    const celular = [item({ variante_id: CELULAR, tipo: "aparelho", preco_unitario_centavos: 129900 })];
    vendaDeTeste({ venda, itens: celular, pagamentos: [pago({ meio: "payjoy", valor_centavos: 129900, entrada_centavos: 40000, parcelas: 12, comprovante: "CONTRATO-FICTICIO-1" })] });
    let { t, copia } = await abrir();
    for (const trecho of ["Recebimento via PayJoy: R$ 1.299,00 em 12x (entrada R$ 400,00) · comprovante CONTRATO-FICTICIO-1", "A receber da financeira", "R$ 899,00"]) expect(t).toContain(trecho);
    expect(copia).toContain("1. 0777 · Celular (teste) · 1 × R$ 1.299,00 = R$ 1.299,00");
    semPagamentos(copia, "R$ 400,00", "R$ 899,00", "CONTRATO");
    vendaDeTeste({
      venda, itens: celular,
      pagamentos: [pago({ ordem: 1, meio: "dinheiro", valor_centavos: 40000, entrada_do_financiamento: true }), pago({ ordem: 2, meio: "payjoy", valor_centavos: 89900, parcelas: 12 })],
    });
    ({ t, copia } = await abrir());
    for (const trecho of ["Entrada do financiamento (Dinheiro): R$ 400,00", "Recebimento via PayJoy: R$ 899,00 em 12x"]) expect(t).toContain(trecho);
    expect(copia).toContain("Total R$ 1.299,00");
    semPagamentos(copia, "R$ 400,00", "R$ 899,00");
  });

  it("estorno e devolução: a tela marca o estorno e o devolvido; o texto não leva itens nem valores e manda conferir no comprovante", async () => {
    vendaDeTeste({
      venda: { numero: 34, subtotal_centavos: 7900, desconto_centavos: 0, total_centavos: 7900, devolvido_centavos: 7900 },
      itens: [item()], pagamentos: [pago({ meio: "cartao_picpay", valor_centavos: 7900, comprovante: "NSU-2", situacao: "estorno_pendente" })],
      devolucoes: [{ id: "d1" }], estornos: [{ id: "e1" }],
    });
    const { t, copia } = await abrir();
    for (const trecho of ["Cartão na maquininha PicPay: R$ 79,00 · comprovante NSU-2 · estorno a confirmar", "Devolvido", "− R$ 79,00",
      "O texto para copiar não leva os itens e os valores: a venda teve devolução; a venda tem pagamento estornado ou estorno a confirmar"]) expect(t).toContain(trecho);
    expect(copia).toContain("Itens e valores: não copiados, porque a venda teve devolução; a venda tem pagamento estornado ou estorno a confirmar. Confira no comprovante da venda nº 34 e com o contador antes de emitir.");
    for (const proibido of ["Itens:", "1. 0042", "Subtotal", "R$ 79,00"]) expect(copia).not.toContain(proibido);
    semPagamentos(copia);
    // Só o pagamento estornado (sem devolução), também.
    vendaDeTeste({ venda: { numero: 35, subtotal_centavos: 7900, desconto_centavos: 0, total_centavos: 7900 }, itens: [item()], pagamentos: [pago({ meio: "dinheiro", valor_centavos: 7900, situacao: "estornado" })] });
    const so = await abrir();
    expect(so.t).toContain("Dinheiro: R$ 79,00 · estornado");
    expect(so.copia).toContain("porque a venda tem pagamento estornado ou estorno a confirmar.");
    expect(so.copia).not.toContain("Itens:");
  });

  it("serviço, acréscimo da maquininha e itens que não fecham com os totais também tiram os itens e os valores do texto", async () => {
    vendaDeTeste({ venda: { subtotal_centavos: 7900, desconto_centavos: 0, total_centavos: 7900 }, itens: [item({ tipo: "servico" })], pagamentos: [pago({ valor_centavos: 7900 })] });
    expect((await abrir()).copia).toContain("porque a venda tem serviço, ativação, portabilidade ou recarga (o documento desses itens, como a NFS-e ou a NFCom, é do contador).");
    vendaDeTeste({
      venda: { subtotal_centavos: 7900, desconto_centavos: 0, total_centavos: 7900 }, itens: [item()],
      pagamentos: [pago({ meio: "cartao_picpay", valor_centavos: 7900, parcelas: 15, acrescimo_cliente_centavos: 1500, comprovante: "NSU-3" })],
    });
    const acrescimo = await abrir();
    expect(acrescimo.t).toContain("acréscimo na maquininha: R$ 15,00");
    expect(acrescimo.copia).toContain("porque um cartão teve acréscimo de parcelamento na maquininha");
    expect(acrescimo.copia).not.toContain("R$ 15,00");
    vendaDeTeste({ venda: { total_centavos: 15000 } });
    expect((await abrir()).copia).toContain("porque os itens não fecham com os totais gravados na venda.");
  });

  it("não copia itens nem totais para venda não concluída, devolução ou estorno isolado, nem venda mista de mercadoria e serviço", async () => {
    const casos: [Parameters<typeof vendaDeTeste>[0], string][] = [
      [{ venda: { situacao: "aberta" } }, "a venda não está concluída"],
      [{ devolucoes: [{ id: "d1" }] }, "a venda teve devolução"],
      [{ estornos: [{ id: "e1" }] }, "a venda tem pagamento estornado ou estorno a confirmar"],
      [{ itens: [item(), item({ tipo: "servico", desconto_centavos: 500 })] }, "a venda tem serviço"],
    ];
    for (const [cenario, motivo] of casos) {
      vendaDeTeste(cenario);
      const { copia } = await abrir();
      expect(copia).toContain(`Itens e valores: não copiados, porque ${motivo}`);
      for (const trecho of ["Itens:", "1. 0042", "Subtotal", "Total R$ 153,00"]) expect(copia).not.toContain(trecho);
      semPagamentos(copia, "R$ 33,00", "R$ 20,00", "R$ 100,00");
    }
  });

  it("os fatos só aparecem depois de o banco liberar a nota; sem eles, nem saber se houve devolução, o destinatário fica e um aviso diz onde conferir", async () => {
    vendaDeTeste();
    cenario.resposta = { data: null, error: { code: "22023", message: "Os dados do destinatário só aparecem enquanto a nota espera a emissão" } };
    const emitida = await abrir();
    expect(emitida.t).toContain("Esta nota já foi emitida");
    expect(emitida.t).not.toContain("Quem emite");
    expect(emitida.copia).toBe("");
    cenario.resposta = { data: COM_CLIENTE, error: null };
    for (const tabela of ["venda_itens", "venda_devolucoes", "estornos_externos"]) {
      vendaDeTeste();
      cenario.tabelas[tabela] = () => ({ data: null, error: { code: "42501" } });
      const sem = await abrir();
      expect(sem.t).toContain("Carla Nota");
      expect(sem.t).toContain("Não deu para ler agora a venda e a loja deste pedido");
      expect(sem.copia).toBe("");
    }
    vendaDeTeste();
    cenario.tabelas.variantes = () => ok([]);
    expect(await tela()).toContain("Não deu para ler agora a venda e a loja deste pedido");
    vendaDeTeste({ pagamentos: [pago({ valor_centavos: "R$ 53" })] });
    expect(await tela()).toContain("Não deu para ler agora a venda e a loja deste pedido");
  });
});

describe("leitura e mensagens (K1b)", () => {
  it("documento só com 11 ou 14 dígitos; endereço completo; mensagens novas do banco", () => {
    expect(lerDadosParaEmitir({ numero: 1, nome: "A", documento: "11222333000181", endereco: { ...ENDERECO, complemento: "ap 2" }, dados_de: null }))
      .toMatchObject({ documento: "11222333000181", endereco: { complemento: "ap 2" } });
    expect(() => lerDadosParaEmitir({ numero: 1, documento: "52998224725", endereco: { ...ENDERECO, uf: "pr" } })).toThrow();
    expect(() => lerDadosParaEmitir({ numero: 1, documento: "52998224725", endereco: { ...ENDERECO, cep: "" } })).toThrow();
    expect(erroDasNotas({ code: "22023", message: "O cliente não tem o endereço completo no cadastro: complete o cadastro (CEP, rua, número, bairro, cidade e UF) para a nota no nome dele" })).toBe("cliente_sem_endereco");
    expect(erroDasNotas({ code: "22023", message: "O cliente não tem CPF/CNPJ no cadastro: corrija o cadastro ou informe o documento aqui" })).toBe("cliente_sem_documento");
  });
});

describe("leitura dos fatos da venda (NF-e 55)", () => {
  const partes = {
    venda: vendaGravada(), itens: ITENS, variantes: [{ id: CAPA, sku: "0042", nome: "Capa (teste)" }], pagamentos: MISTO, devolucoes: [], estornos: [],
    loja: LOJA_DE_TESTE, emissora: null, configuracao: CONFIGURACAO,
  };

  it("o CNPJ que emite segue a regra do banco: o da loja ou, sem ele, o da emissora; sem nenhum, diz o que falta", () => {
    expect(lerFatosParaEmitir(partes).emitente).toMatchObject({ nome: "Santa Cândida (teste)", cnpj: "11222333000181", porOutraLoja: false });
    const semCnpj = { ...LOJA_DE_TESTE, cnpj: null, unidade_emissora_id: "outra" };
    const pelaEmissora = lerFatosParaEmitir({ ...partes, loja: semCnpj, emissora: { nome: "Matriz (teste)", cnpj: "11444777000161", cidade: "Curitiba", uf: "PR", unidade_emissora_id: null } }).emitente;
    expect(pelaEmissora).toMatchObject({ nome: "Matriz (teste)", cnpj: "11444777000161", porOutraLoja: true });
    const emissoraOculta = lerFatosParaEmitir({ ...partes, loja: semCnpj, emissora: null, configuracao: null }).emitente;
    expect(emissoraOculta).toMatchObject({ cnpj: null, porOutraLoja: true, inscricaoEstadual: null, endereco: null });
    expect(cnpjDoEmitente(emissoraOculta)).toContain("o da loja emissora");
    expect(cnpjDoEmitente(lerFatosParaEmitir({ ...partes, loja: { ...LOJA_DE_TESTE, cnpj: null } }).emitente)).toContain("não cadastrado");
  });

  it("forma inesperada é falha, nunca dado na tela; a venda não concluída também não leva detalhe; sem cliente, o texto diz que vai sem destinatário", () => {
    expect(() => lerFatosParaEmitir({ ...partes, variantes: [] })).toThrow();
    expect(() => lerFatosParaEmitir({ ...partes, itens: [{ ...item(), quantidade: 1.5 }] })).toThrow();
    expect(() => lerFatosParaEmitir({ ...partes, itens: [{ ...item(), tipo: null }] })).toThrow();
    expect(() => lerFatosParaEmitir({ ...partes, pagamentos: [pago({ valor_centavos: "R$ 53" })] })).toThrow();
    expect(() => lerFatosParaEmitir({ ...partes, pagamentos: [pago({ valor_centavos: 100, entrada_do_financiamento: "sim" })] })).toThrow();
    expect(() => lerFatosParaEmitir({ ...partes, devolucoes: null })).toThrow();
    expect(() => lerFatosParaEmitir({ ...partes, loja: null })).toThrow();
    expect(() => lerFatosParaEmitir({ ...partes, configuracao: "Rua" })).toThrow();
    expect(lerFatosParaEmitir({ ...partes, venda: vendaGravada({ situacao: "cancelada" }) }).semDetalhe).toEqual(["nao_concluida"]);
    expect(lerFatosParaEmitir(partes).semDetalhe).toEqual([]);
    const semCliente = textoParaCopiar(lerFatosParaEmitir(partes), 13, { nome: null, documento: null, endereco: null });
    expect(semCliente).toContain("Destinatário: sem cliente identificado");
    expect(semCliente.split("\n").at(-1)).toBe("NCM, CFOP e tributos: não estão no cadastro; o contador e o emissor definem.");
  });
});
