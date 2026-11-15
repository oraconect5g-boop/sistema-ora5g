// Fotos em lote (lote CAT-010): o SKU do nome do arquivo, o plano do lote e o envio um a um com passos simulados (sem
// navegador, sem Storage e sem banco). O registro de verdade é conferido pelo banco (packages/banco/src/fotos*.test.ts).
import { describe, expect, it, vi } from "vitest";

import {
  enviarLote, MAXIMO_DO_LOTE, planejarLote, resumoDoLote, skuDoArquivo, skusDoLote, type DestinoDaFoto, type ItemDoLote, type PassosDoEnvio,
} from "./lote-de-fotos";

const ORG = "00000000-0000-4000-8000-000000000001";
const PRODUTO = "00000000-0000-4000-9000-000000000021";
const OUTRO = "00000000-0000-4000-9000-000000000022";
const COR = "00000000-0000-4000-9000-000000000031";
const destino = (sku: string, extra: Partial<DestinoDaFoto> = {}): DestinoDaFoto => ({ sku, organizacao: ORG, produto: PRODUTO, variante: null, rotulo: `${sku}: foto do produto`, temFoto: false, ...extra });
const foto = (nome: string, tipo = "image/jpeg") => ({ nome, tipo });

describe("fotos em lote (CAT-010)", () => {
  it("o nome do arquivo é o SKU: sem a extensão de imagem; outros caracteres não valem", () => {
    expect(skuDoArquivo("ACE-0001.jpg")).toBe("ACE-0001");
    expect(skuDoArquivo(" ace-0001.JPEG ")).toBe("ace-0001");
    expect(skuDoArquivo("CAP.001.webp")).toBe("CAP.001");
    expect(skuDoArquivo("APA_0001.png")).toBe("APA_0001");
    for (const nome of ["ACE 0001.jpg", "ACE-0001 (1).jpg", "capa%.jpg", "Ação.jpg", ".jpg", `${"A".repeat(61)}.jpg`]) expect(skuDoArquivo(nome), nome).toBeNull();
  });

  it("os SKUs para procurar: só das fotos, sem repetir (sem diferença de maiúsculas) e só até o limite do lote", () => {
    expect(skusDoLote([foto("ACE-0001.jpg"), foto("ace-0001.png", "image/png"), foto("APA-0001.heic", "image/heic"), foto("x y.jpg"), foto("CHI-0001.webp", "image/webp")]))
      .toEqual(["ACE-0001", "CHI-0001"]);
    const muitas = Array.from({ length: MAXIMO_DO_LOTE + 5 }, (_, i) => foto(`SKU-${i}.jpg`));
    expect(skusDoLote(muitas)).toHaveLength(MAXIMO_DO_LOTE);
  });

  it("o plano: cada foto com o destino ou o motivo de ficar de fora; a segunda para o mesmo lugar fica de fora", () => {
    const destinos = [destino("ACE-0001"), destino("ACE-0002", { variante: COR, rotulo: "Capa azul: foto da cor azul", temFoto: true }), destino("APA-0001", { produto: OUTRO })];
    const plano = planejarLote([
      foto("ace-0001.jpg"), foto("ACE-0002.png", "image/png"), foto("APA-0001.heic", "image/heic"), foto("ACE 9.jpg"), foto("NAO-EXISTE.jpg"),
      foto("ACE-0001.webp", "image/webp"), foto("apa-0001.jpg"),
    ], destinos);
    expect(plano.map((i) => [i.nome, i.situacao.estado === "de_fora" ? i.situacao.motivo : i.situacao.estado, i.destino?.sku ?? null])).toEqual([
      ["ace-0001.jpg", "pronta", "ACE-0001"], ["ACE-0002.png", "pronta", "ACE-0002"], ["APA-0001.heic", "tipo", null], ["ACE 9.jpg", "nome", null],
      ["NAO-EXISTE.jpg", "nao_encontrado", null], ["ACE-0001.webp", "repetida", null], ["apa-0001.jpg", "pronta", "APA-0001"],
    ]);
    const muitas = planejarLote(Array.from({ length: MAXIMO_DO_LOTE + 1 }, () => foto("ACE-0001.jpg")), destinos);
    expect(muitas.at(-1)?.situacao).toEqual({ estado: "de_fora", motivo: "excesso" });
    expect(resumoDoLote(plano)).toEqual({ prontas: 3, deFora: 4, enviando: 0, feitas: 0, comErro: 0 });
  });

  it("o envio: uma a uma, no caminho do destino; a de fora não vai; o erro de cada uma fica nela", async () => {
    const plano = planejarLote([foto("ACE-0001.jpg"), foto("x y.jpg"), foto("ACE-0002.jpg"), foto("APA-0001.jpg")], [
      destino("ACE-0001"), destino("ACE-0002", { variante: COR }), destino("APA-0001", { produto: OUTRO }),
    ]);
    let ids = 0;
    const enviados: string[] = [];
    const passos: PassosDoEnvio = {
      preparar: vi.fn(async (indice: number) => (indice === 3 ? "pequena" as const : { blob: new Blob(["x"]), tipo: "image/webp" as const, largura: 800, altura: 600 })),
      enviar: vi.fn(async (caminho: string) => { enviados.push(caminho); return "ok" as const; }),
      registrar: vi.fn(async () => ({ ok: true as const })),
      novoId: () => `00000000-0000-4000-a000-00000000000${++ids}`,
    };
    const andamento: string[][] = [];
    const fim = await enviarLote(plano, passos, (itens) => andamento.push(itens.map((i) => i.situacao.estado)));
    expect(fim.map((i) => i.situacao)).toEqual([{ estado: "feita" }, { estado: "de_fora", motivo: "nome" }, { estado: "feita" }, { estado: "erro", erro: "pequena" }]);
    expect(enviados).toEqual([
      `${ORG}/${PRODUTO}/produto/00000000-0000-4000-a000-000000000001.webp`, `${ORG}/${PRODUTO}/${COR}/00000000-0000-4000-a000-000000000002.webp`,
    ]);
    expect(vi.mocked(passos.registrar).mock.calls.map(([d]) => d)).toEqual([
      { produto: PRODUTO, variante: null, caminho: enviados[0], largura: 800, altura: 600 }, { produto: PRODUTO, variante: COR, caminho: enviados[1], largura: 800, altura: 600 },
    ]);
    // o andamento mostra cada uma "enviando" antes do resultado
    expect(andamento[0]).toEqual(["enviando", "de_fora", "pronta", "pronta"]);
    expect(andamento.at(-1)).toEqual(["feita", "de_fora", "feita", "erro"]);
  });

  it("de novo, só as que deram erro: a que já foi ao Storage só registra (sem reenviar); a recusa do Storage fica como permissão", async () => {
    const plano = planejarLote([foto("ACE-0001.jpg"), foto("ACE-0002.jpg")], [destino("ACE-0001"), destino("ACE-0002", { variante: COR })]);
    let registrou = 0;
    const passos: PassosDoEnvio = {
      preparar: async () => ({ blob: new Blob(["x"]), tipo: "image/jpeg" as const, largura: 1200, altura: 900 }),
      enviar: vi.fn(async (caminho: string) => (caminho.includes(COR) ? "permissao" as const : "ok" as const)),
      registrar: vi.fn(async () => (++registrou === 1 ? { ok: false as const, erro: "registro" as const } : { ok: true as const })),
      novoId: () => "00000000-0000-4000-a000-000000000009",
    };
    const primeira = await enviarLote(plano, passos, () => undefined);
    expect(primeira.map((i) => i.situacao)).toEqual([{ estado: "erro", erro: "registro" }, { estado: "erro", erro: "permissao" }]);
    expect(primeira[0]?.caminhoEnviado).toBe(`${ORG}/${PRODUTO}/produto/00000000-0000-4000-a000-000000000009.jpg`);
    expect(primeira[1]?.caminhoEnviado).toBeNull();
    const segunda = await enviarLote(primeira, passos, () => undefined);
    expect(segunda[0]?.situacao).toEqual({ estado: "feita" });
    // a primeira foi ao Storage uma vez só; a segunda tentou de novo e continua recusada
    expect(vi.mocked(passos.enviar).mock.calls.filter(([c]) => !c.includes(COR))).toHaveLength(1);
    expect(segunda[1]?.situacao).toEqual({ estado: "erro", erro: "permissao" });
    // feitas não vão de novo
    const terceira = await enviarLote(segunda.filter((i): i is ItemDoLote => i.situacao.estado === "feita"), passos, () => undefined);
    expect(terceira[0]?.situacao).toEqual({ estado: "feita" });
    expect(registrou).toBe(2);
  });

  it("falha inesperada no meio: a foto fica com erro de envio (ou de registro, se já foi ao Storage), e as outras seguem", async () => {
    const plano = planejarLote([foto("ACE-0001.jpg"), foto("ACE-0002.jpg")], [destino("ACE-0001"), destino("ACE-0002", { variante: COR })]);
    const passos: PassosDoEnvio = {
      preparar: async (indice) => { if (indice === 0) throw new Error("decodificação"); return { blob: new Blob(["x"]), tipo: "image/jpeg", largura: 900, altura: 900 }; },
      enviar: async () => "ok",
      registrar: async () => { throw new Error("rede"); },
      novoId: () => "00000000-0000-4000-a000-000000000007",
    };
    const fim = await enviarLote(plano, passos, () => undefined);
    expect(fim.map((i) => i.situacao)).toEqual([{ estado: "erro", erro: "envio" }, { estado: "erro", erro: "registro" }]);
  });
});
