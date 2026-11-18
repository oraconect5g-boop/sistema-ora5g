// As entregas do projeto (lote ENTREGAS-a; aceite A18 do adendo do Codex de 16/11/2026): o que cada lote entregou, se
// está no ar, se o aceite foi pedido e o que o proprietário respondeu, e o placar dos 179 requisitos. Os dados saem do
// checkpoint (docs/alinhamento/execucao-integral-status.json) por scripts/gerar-rastreabilidade.mjs, e o CI confere que
// estão em dia: nada aqui é escrito à mão. Homologado só com o "aceito" do proprietário.
import dados from "./dados.json";

export type Lote = {
  lote: string; roteiro: string; requisitos: string[]; entrega: string; commit: string | null;
  publicado_em: string | null; pedido_em: string | null; resposta: string | null; respondido_em: string | null;
};
export type DadosDasEntregas = { atualizado_em: string; total: number; homologados: number; contagem: Record<string, number>; lotes: Lote[] };

export const ENTREGAS: DadosDasEntregas = dados;

/** Os estados dos requisitos na ordem do placar, com o nome que a tela mostra. */
export const ESTADOS_DOS_REQUISITOS: readonly { chave: string; rotulo: string }[] = [
  { chave: "testado", rotulo: "Testados em desenvolvimento" },
  { chave: "parcial", rotulo: "Feitos em parte" },
  { chave: "nao_iniciado", rotulo: "Não iniciados" },
  { chave: "bloqueado", rotulo: "Dependem de terceiros" },
  { chave: "respeitado", rotulo: "Restrições respeitadas" },
];

export type SituacaoDoLote = {
  chave: "aceito" | "nao_aceito" | "esperando" | "no_ar" | "nesta_versao";
  rotulo: string;
  tom: "sucesso" | "perigo" | "aviso" | "info" | "neutro";
};

/** "2026-11-17" → "17/11/2026"; outro formato fica como veio. */
export function dataDoDia(iso: string | null): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso ?? "");
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso ?? "";
}

/**
 * A situação do lote para o proprietário: a resposta dele manda; sem ela, se o aceite foi pedido; sem pedido, se está no
 * ar. Os dados desta tela são gerados do checkpoint DENTRO do commit desta versão: o lote que aparece aqui entrou nela,
 * com o próprio merge. Sem a publicação registrada (ela entra no checkpoint no lote seguinte, depois de conferida no
 * domínio), o lote está NESTA versão (`commitDaVersao`, a que a tela mostra no rodapé), e nunca "ainda não está no ar"
 * (achado F18-04 da reanálise do Codex de 18/11: o domínio já servia o lote que a tela dizia em preparo).
 */
export function situacaoDoLote(l: Lote, commitDaVersao = ""): SituacaoDoLote {
  if (l.resposta === "aceito") return { chave: "aceito", rotulo: `Aceito em ${dataDoDia(l.respondido_em)}`, tom: "sucesso" };
  if (l.resposta === "não aceito") return { chave: "nao_aceito", rotulo: "Não aceito: o lote volta", tom: "perigo" };
  if (l.pedido_em) return { chave: "esperando", rotulo: "Esperando o seu aceite", tom: "aviso" };
  if (l.publicado_em) return { chave: "no_ar", rotulo: "No ar; o aceite ainda vai ser pedido", tom: "info" };
  const commit = /^[0-9a-f]{7,40}$/.test(commitDaVersao) ? ` (${commitDaVersao.slice(0, 7)})` : "";
  return { chave: "nesta_versao", rotulo: `Nesta versão${commit}; o registro da publicação entra no próximo lote`, tom: "info" };
}

/** O roteiro de aceite no repositório (o mesmo arquivo que o Claude Code manda ao pedir o aceite). */
export const linkDoRoteiro = (roteiro: string) => `https://github.com/oraconect5g-boop/sistema-ora5g/blob/main/${roteiro}`;
