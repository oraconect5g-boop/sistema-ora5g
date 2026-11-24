// O relato dos erros do site (lote QUAL-006a; ADR-015, adendo de 24/11). A cada minuto, antes de mandar os avisos da
// fila, o worker lê a conta dos erros do servidor no próprio site, dentro do servidor (/saude/erros, que pelo domínio dá
// 404), e a leva ao banco com o segredo dos avisos; o banco decide o alerta e o põe na fila, que sai nesta mesma rodada.
// O site que não responde (sem conexão, tempo esgotado ou erro 5xx) também é relatado: depois de 5 minutos assim, o banco
// avisa "O site não responde". No log, só a contagem: nunca a rota nem o texto de um erro.
import { relatoDoSite, type RelatoDoSite } from "@ora5g/dominio/avisos";

export type RelatoParaOBanco = { respondeu: false } | ({ respondeu: true } & RelatoDoSite);
export type BancoDoRelato = { relatar: (relato: RelatoParaOBanco) => Promise<{ alertas: number }> };
/** O que o site respondeu (o status e, no 200, o corpo), ou null quando não respondeu (sem conexão ou tempo esgotado). */
export type RespostaDoSite = { status: number; corpo: unknown } | null;
export type LerOSite = () => Promise<RespostaDoSite>;
export type DesfechoDoRelato =
  | { situacao: "relatado"; erros: number; alertas: number }
  | { situacao: "sem_resposta"; alertas: number }
  /** O site respondeu outra coisa (404 de uma versão sem o endereço, um redirecionamento): nada vai ao banco. */
  | { situacao: "sem_relato"; status: number }
  | { situacao: "fora_do_formato" };

/** O endereço do site dentro do servidor: só http://127.0.0.1:<porta>. */
export const SITE_LOCAL = /^http:\/\/127\.0\.0\.1:\d{2,5}$/;

/** Lê o relato no site. Não segue redirecionamento: o relato vem só do próprio endereço. */
export function leitorDoSite(base: string, tempoMs = 10_000): LerOSite {
  return async () => {
    try {
      const r = await fetch(`${base}/saude/erros`, { signal: AbortSignal.timeout(tempoMs), redirect: "manual", headers: { accept: "application/json" } });
      if (r.status !== 200) {
        await r.body?.cancel();
        return { status: r.status, corpo: null };
      }
      return { status: 200, corpo: await r.json().catch(() => undefined) };
    } catch {
      return null;
    }
  };
}

/** Lê o site e relata ao banco. O relato que veio fora do formato não vai: o banco não aprende conta errada. */
export async function relatarOsErrosDoSite(lerSite: LerOSite, banco: BancoDoRelato): Promise<DesfechoDoRelato> {
  const resposta = await lerSite();
  if (resposta === null || resposta.status >= 500) return { situacao: "sem_resposta", alertas: (await banco.relatar({ respondeu: false })).alertas };
  if (resposta.status !== 200) return { situacao: "sem_relato", status: resposta.status };
  const relato = relatoDoSite(resposta.corpo);
  if (!relato) return { situacao: "fora_do_formato" };
  const { alertas } = await banco.relatar({ respondeu: true, ...relato });
  return { situacao: "relatado", erros: relato.erros, alertas };
}

/** A linha do log, só quando há o que dizer (alerta na fila, site sem resposta, relato que não veio). */
export function linhaDoRelato(d: DesfechoDoRelato): string | null {
  switch (d.situacao) {
    case "relatado":
      return d.alertas > 0 ? `site: ${d.erros} erros do servidor desde que subiu; ${d.alertas} alertas na fila` : null;
    case "sem_resposta":
      return `site sem resposta no relato dos erros${d.alertas > 0 ? `; ${d.alertas} alertas na fila` : ""}`;
    case "sem_relato":
      return `site respondeu ${d.status} no relato dos erros; nada relatado`;
    case "fora_do_formato":
      return "relato dos erros do site fora do formato; nada relatado";
  }
}
