// O envio dos avisos no celular (lote PWA-b; ADR-014): pega um lote da fila do banco (public.avisos_a_enviar, com o segredo
// dos avisos), manda cada aviso a cada celular de quem decide e devolve o que aconteceu (public.avisos_resultado). O
// celular que o serviço de envio diz que não existe mais sai da lista; a falha volta para a fila (até 5 tentativas, no
// banco). O texto do aviso não leva nome de cliente; o log só leva contagens.
import type { DesfechoDoEnvio, Inscricao } from "./web-push.ts";

export type AvisoParaEnviar = {
  id: string; tipo: string; titulo: string; corpo: string; endereco: string;
  inscricoes: (Inscricao & { id: string })[];
};
export type ResultadoDoAviso = { aviso: string; entregues: string[]; expiradas: string[]; falhas: number };
export type BancoDosAvisos = {
  aEnviar(limite: number): Promise<AvisoParaEnviar[]>;
  registrar(resultados: ResultadoDoAviso[]): Promise<void>;
};
/** O que o celular recebe (o service worker mostra o título e o texto e, no toque, abre o endereço). */
export type MensagemDoAviso = { titulo: string; corpo: string; endereco: string };
export type Enviar = (inscricao: Inscricao, mensagem: MensagemDoAviso) => Promise<DesfechoDoEnvio>;
export type ResumoDoEnvio = { avisos: number; entregues: number; expiradas: number; falhas: number };

export async function enviarAvisosPendentes(banco: BancoDosAvisos, enviar: Enviar, limite = 20): Promise<ResumoDoEnvio> {
  const lote = await banco.aEnviar(limite);
  const resultados: ResultadoDoAviso[] = [];
  for (const aviso of lote) {
    const resultado: ResultadoDoAviso = { aviso: aviso.id, entregues: [], expiradas: [], falhas: 0 };
    const mensagem: MensagemDoAviso = { titulo: aviso.titulo, corpo: aviso.corpo, endereco: aviso.endereco };
    for (const { id, ...inscricao } of aviso.inscricoes) {
      let desfecho: DesfechoDoEnvio;
      try {
        desfecho = await enviar(inscricao, mensagem);
      } catch {
        desfecho = "falha";
      }
      if (desfecho === "entregue") resultado.entregues.push(id);
      else if (desfecho === "expirada") resultado.expiradas.push(id);
      else resultado.falhas += 1;
    }
    resultados.push(resultado);
  }
  if (resultados.length > 0) await banco.registrar(resultados);
  return {
    avisos: resultados.length,
    entregues: resultados.reduce((t, r) => t + r.entregues.length, 0),
    expiradas: resultados.reduce((t, r) => t + r.expiradas.length, 0),
    falhas: resultados.reduce((t, r) => t + r.falhas, 0),
  };
}
