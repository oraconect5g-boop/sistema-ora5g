// A leitura estrita da resposta de public.molde_da_sessao (lote VEL-a: ORA-QUAL-010). A função do banco é testada em
// packages/banco/src/sessao-molde-e-pdv.test.ts; aqui, o que a aplicação aceita dela. Forma fora do combinado é erro
// (a tela mostra falha): nunca vira "sem acesso", menu vazio nem contagem zero.
import { describe, expect, it } from "vitest";

import { RespostaInesperada } from "../financeiro/painel";
import { PERMISSOES_DA_REDE, PERMISSOES_DO_MENU } from "./menu";
import { lerMoldeDaSessao, PERMISSOES_ALEM_DO_MENU, PERMISSOES_DA_LOJA_NO_MOLDE, PERMISSOES_DA_REDE_NO_MOLDE } from "./molde";

const LOJA = "00000000-0000-4000-8000-0000000000cc";

const resposta = () => ({
  situacao: { usuario_ativo: true, sessao_no_turno: true, unidade_id: LOJA, unidade_nome: "Santa Cândida (teste)", turno_termina_em: "2026-11-16T23:00:00+00:00", segundo_fator_pendente: false },
  permissoes: ["caixa.abrir", "venda.registrar"],
  nome: "Ana (fictícia)",
  vinculos: [{ papel: "vendedor", escopo: "unidade", unidade_id: LOJA }],
  pendencias: { aprovacoes: 2, notas: 0 },
});
type Resposta = ReturnType<typeof resposta>;
const com = (mudar: (r: Resposta) => unknown) => {
  const r = resposta();
  mudar(r);
  return r;
};

describe("as permissões pedidas ao banco numa ida só", () => {
  it("são todas as do menu e as poucas que as telas perguntam além dele, cada uma uma vez", () => {
    const pedidas = [...PERMISSOES_DA_LOJA_NO_MOLDE, ...PERMISSOES_DA_REDE_NO_MOLDE];
    expect(new Set(pedidas).size).toBe(pedidas.length);
    expect(new Set(pedidas)).toEqual(new Set([...PERMISSOES_DO_MENU, ...PERMISSOES_ALEM_DO_MENU]));
  });

  it("as da rede (equipe, lojas e catálogo) vão sem loja; as demais, na loja do turno", () => {
    expect(new Set(PERMISSOES_DA_REDE_NO_MOLDE)).toEqual(new Set(PERMISSOES_DA_REDE));
    for (const p of PERMISSOES_DA_REDE_NO_MOLDE) expect(PERMISSOES_DA_LOJA_NO_MOLDE).not.toContain(p);
    expect(PERMISSOES_DA_LOJA_NO_MOLDE).toEqual(expect.arrayContaining(["venda.registrar", "caixa.abrir", "ranking.ver", "venda.ver_propria", "custo.ver"]));
  });

  it("cabem com folga no limite de 80 por chamada que o banco impõe", () => {
    // 45 desde o VEL-b (18/11): as que as telas perguntavam uma a uma vieram para o molde.
    expect(PERMISSOES_DA_LOJA_NO_MOLDE.length + PERMISSOES_DA_REDE_NO_MOLDE.length).toBeLessThanOrEqual(60);
  });
});

describe("lerMoldeDaSessao", () => {
  it("resposta combinada: a situação, as permissões como conjunto, o nome, os vínculos e as contagens", () => {
    const { situacao, molde } = lerMoldeDaSessao(resposta());
    expect(situacao).toEqual({ usuario_ativo: true, sessao_no_turno: true, unidade_id: LOJA, unidade_nome: "Santa Cândida (teste)", turno_termina_em: "2026-11-16T23:00:00+00:00", segundo_fator_pendente: false });
    expect(molde.permissoes).toEqual(new Set(["caixa.abrir", "venda.registrar"]));
    expect(molde.nome).toBe("Ana (fictícia)");
    expect(molde.vinculos).toEqual([{ papel: "vendedor", escopo: "unidade", unidade_id: LOJA }]);
    expect(molde.pendencias).toEqual({ aprovacoes: 2, notas: 0 });
  });

  it("sessão que o banco não deixa seguir (bloqueada, encerrada ou fora do turno): tudo vazio é resposta válida", () => {
    const { situacao, molde } = lerMoldeDaSessao({
      situacao: { usuario_ativo: false, sessao_no_turno: false, unidade_id: null, unidade_nome: null, turno_termina_em: null, segundo_fator_pendente: false },
      permissoes: [], nome: null, vinculos: [], pendencias: { aprovacoes: 0, notas: 0 },
    });
    expect(situacao).toMatchObject({ usuario_ativo: false, sessao_no_turno: false, unidade_id: null, turno_termina_em: null });
    expect(molde).toEqual({ permissoes: new Set(), nome: null, vinculos: [], pendencias: { aprovacoes: 0, notas: 0 } });
  });

  it("vínculo da rede (dono, administrador) vem sem loja", () => {
    const { molde } = lerMoldeDaSessao(com((r) => { r.vinculos = [{ papel: "dono", escopo: "organizacao", unidade_id: null as unknown as string }]; }));
    expect(molde.vinculos).toEqual([{ papel: "dono", escopo: "organizacao", unidade_id: null }]);
  });

  it.each<[string, unknown]>([
    ["nada", null],
    ["texto", "ok"],
    ["lista", []],
    ["linha de tabela (a função antiga)", [{ usuario_ativo: true }]],
  ])("resposta que não é o objeto combinado (%s) é erro", (_, dado) => {
    expect(() => lerMoldeDaSessao(dado)).toThrow(RespostaInesperada);
  });

  it.each<[string, (r: Resposta) => unknown]>([
    ["sem a situação", (r) => delete (r as Partial<Resposta>).situacao],
    ["situação que não é objeto", (r) => { (r as { situacao: unknown }).situacao = "ativa"; }],
    ["usuario_ativo que não é sim ou não", (r) => { (r.situacao as { usuario_ativo: unknown }).usuario_ativo = "true"; }],
    ["usuario_ativo ausente", (r) => delete (r.situacao as Partial<Resposta["situacao"]>).usuario_ativo],
    ["sessao_no_turno nula", (r) => { (r.situacao as { sessao_no_turno: unknown }).sessao_no_turno = null; }],
    ["segundo_fator_pendente ausente", (r) => delete (r.situacao as Partial<Resposta["situacao"]>).segundo_fator_pendente],
    ["loja que não é identificador", (r) => { r.situacao.unidade_id = "santa-candida"; }],
    ["loja numérica", (r) => { (r.situacao as { unidade_id: unknown }).unidade_id = 7; }],
    ["fim do turno que não é data", (r) => { r.situacao.turno_termina_em = "amanhã"; }],
    ["nome da loja numérico", (r) => { (r.situacao as { unidade_nome: unknown }).unidade_nome = 12; }],
    ["sem as permissões", (r) => delete (r as Partial<Resposta>).permissoes],
    ["permissões que não são lista", (r) => { (r as { permissoes: unknown }).permissoes = { "venda.registrar": true }; }],
    ["permissão que não é texto", (r) => { (r as { permissoes: unknown[] }).permissoes = ["venda.registrar", 3]; }],
    ["permissão vazia", (r) => { r.permissoes = ["venda.registrar", ""]; }],
    ["nome que não é texto", (r) => { (r as { nome: unknown }).nome = { primeiro: "Ana" }; }],
    ["sem os vínculos", (r) => delete (r as Partial<Resposta>).vinculos],
    ["vínculo sem papel", (r) => { (r.vinculos[0] as { papel: unknown }).papel = ""; }],
    ["vínculo sem escopo", (r) => { (r.vinculos[0] as { escopo: unknown }).escopo = null; }],
    ["vínculo com loja que não é identificador", (r) => { (r.vinculos[0] as { unidade_id: unknown }).unidade_id = "loja-1"; }],
    ["vínculo que não é objeto", (r) => { (r as { vinculos: unknown[] }).vinculos = ["vendedor"]; }],
    ["sem as contagens", (r) => delete (r as Partial<Resposta>).pendencias],
    ["contagem negativa", (r) => { r.pendencias.aprovacoes = -1; }],
    ["contagem quebrada", (r) => { r.pendencias.notas = 1.5; }],
    ["contagem em texto", (r) => { (r.pendencias as { notas: unknown }).notas = "3"; }],
    ["contagem ausente", (r) => delete (r.pendencias as Partial<Resposta["pendencias"]>).aprovacoes],
    ["contagem fora do que cabe num número inteiro", (r) => { r.pendencias.aprovacoes = 2 ** 60; }],
  ])("%s: erro, nunca menu vazio nem zero inventado", (_, mudar) => {
    expect(() => lerMoldeDaSessao(com(mudar))).toThrow(RespostaInesperada);
  });
});
