// Envio da nota ao cliente pelo WhatsApp oficial (lote K1c; #76, decisão do proprietário de 12/11/2026). A rotina pega
// a fila do banco, gera o link temporário do PDF guardado (bucket privado "notas"), chama o canal e registra a
// resposta. Regras:
// - o canal é uma interface: o adaptador da Meta (WhatsApp Business Platform) só entra com o contrato verificado
//   (número habilitado, token, modelo de utilidade aprovado para mandar o documento). Sem canal, nada sai da fila;
// - nada saiu (sem link do documento, sem conexão) → volta para a fila;
// - aceite claro → "aceito" com o id da mensagem; recusa → "falhou"; saiu e não voltou resposta clara → "desconhecido":
//   NUNCA reenvia sozinho (a loja confere antes);
// - log só com contagens: nada de telefone, nome, link ou token.

export type EnvioParaFazer = {
  envioId: string; telefone: string; documentoCaminho: string; notaNumero: number | null; notaSerie: number | null; chaveAcesso: string | null; clienteNome: string;
};
export type ResultadoDoEnvio =
  | { situacao: "aceito"; provedor_id: string }
  | { situacao: "falhou"; erro: string }
  | { situacao: "desconhecido"; erro: string }
  | { situacao: "na_fila"; erro: string };

export interface BancoWhatsApp {
  reivindicar(limite: number): Promise<EnvioParaFazer[]>;
  registrarResultado(envio: string, resultado: ResultadoDoEnvio): Promise<string>;
  /** Link assinado e temporário do documento no bucket privado; null se não deu para criar. */
  linkTemporario(caminho: string, segundos: number): Promise<string | null>;
}

export type PedidoAoCanal = { telefone: string; linkDoDocumento: string; nomeDoArquivo: string; primeiroNome: string; numeroDaNota: string };
export type RespostaDoCanal =
  | { tipo: "aceito"; idDaMensagem: string }
  | { tipo: "recusado"; motivo: string }
  | { tipo: "sem_resposta"; motivo: string; saiu: boolean };

export interface CanalWhatsApp {
  enviarDocumento(pedido: PedidoAoCanal): Promise<RespostaDoCanal>;
}

/** Validade do link do documento: o bastante para a Meta baixar o arquivo, curto para não circular. */
export const VALIDADE_DO_LINK = 600;

export function pedidoAoCanal(envio: EnvioParaFazer, link: string): PedidoAoCanal {
  const numero = envio.notaNumero === null ? "" : String(envio.notaNumero);
  return {
    telefone: `55${envio.telefone}`,
    linkDoDocumento: link,
    nomeDoArquivo: numero ? `nota-${numero}.pdf` : "nota.pdf",
    primeiroNome: envio.clienteNome.trim().split(/\s+/)[0] ?? "",
    numeroDaNota: numero,
  };
}

export function resultadoDaResposta(r: RespostaDoCanal): ResultadoDoEnvio {
  if (r.tipo === "aceito") return { situacao: "aceito", provedor_id: r.idDaMensagem };
  if (r.tipo === "recusado") return { situacao: "falhou", erro: r.motivo.slice(0, 300) };
  return r.saiu ? { situacao: "desconhecido", erro: r.motivo.slice(0, 300) } : { situacao: "na_fila", erro: r.motivo.slice(0, 300) };
}

export async function enviarPendentes(banco: BancoWhatsApp, canal: CanalWhatsApp | null, limite = 5) {
  const resumo = { aceitos: 0, falhas: 0, desconhecidos: 0, devolvidos: 0, bloqueado: canal === null };
  if (!canal) return resumo; // integração não habilitada: a fila fica como está, nada é dado como enviado
  for (const envio of await banco.reivindicar(limite)) {
    const link = await banco.linkTemporario(envio.documentoCaminho, VALIDADE_DO_LINK).catch(() => null);
    let resultado: ResultadoDoEnvio;
    if (!link) {
      resultado = { situacao: "na_fila", erro: "Não deu para gerar o link do documento" };
    } else {
      try {
        resultado = resultadoDaResposta(await canal.enviarDocumento(pedidoAoCanal(envio, link)));
      } catch {
        // Exceção depois de chamar o canal: pode ter saído. Desconhecido, nunca reenvio cego.
        resultado = { situacao: "desconhecido", erro: "Falha inesperada ao chamar o WhatsApp" };
      }
    }
    await banco.registrarResultado(envio.envioId, resultado);
    if (resultado.situacao === "aceito") resumo.aceitos++;
    else if (resultado.situacao === "falhou") resumo.falhas++;
    else if (resultado.situacao === "desconhecido") resumo.desconhecidos++;
    else resumo.devolvidos++;
  }
  return resumo;
}
