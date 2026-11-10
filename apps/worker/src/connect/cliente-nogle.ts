// Cliente da API NOGLE no worker (ADR-005). Token temporário de POST /auth/token, guardado só em
// memória e pedido de novo uma vez quando a Nogle responde 401 (validade não documentada). As
// credenciais vêm do ambiente do worker e nunca aparecem em log, evento ou resposta.
import { normalizarResposta, type PedidoNogle } from "@ora5g/dominio/nogle";

import type { Transporte } from "./transporte.ts";

export type TipoDeChave = "franquia" | "marca" | "pdv";
export const ehTipoDeChave = (v: unknown): v is TipoDeChave => v === "franquia" || v === "marca" || v === "pdv";
export type Credenciais = { tipo: TipoDeChave; chaveAcesso: string; chaveSecundaria?: string };

export type ResultadoChamada =
  | { tipo: "resposta"; status: number; corpo: unknown }
  | { tipo: "falha"; enviada: boolean; motivo: string }
  | { tipo: "bloqueada"; motivo: string }
  | { tipo: "sem_acesso"; motivo: string };

/** Corpo do login conforme o tipo da chave (franquia, marca/MVNO ou PDV), como na documentação. */
export function corpoDoToken(c: Credenciais): Record<string, string> {
  if (c.tipo === "marca") return { chave_acesso: c.chaveAcesso };
  if (!c.chaveSecundaria) throw new Error(`chave do tipo ${c.tipo} precisa da chave secundária`);
  return c.tipo === "franquia"
    ? { chave_acesso: c.chaveAcesso, chave_acesso_franquia: c.chaveSecundaria }
    : { chave_acesso: c.chaveAcesso, chave_acesso_pdv: c.chaveSecundaria };
}

export class ClienteNogle {
  private token: string | null = null;
  private readonly credenciais: Credenciais;
  private readonly transporte: Transporte;
  private readonly opcoes: { getComCorpo: boolean };

  constructor(credenciais: Credenciais, transporte: Transporte, opcoes: { getComCorpo: boolean }) {
    this.credenciais = credenciais;
    this.transporte = transporte;
    this.opcoes = opcoes;
  }

  private async renovarToken(): Promise<ResultadoChamada | null> {
    const r = await this.transporte({ metodo: "POST", caminho: "/auth/token", corpo: corpoDoToken(this.credenciais) });
    // O login não cria nada na operadora: falha nele nunca deixa operação pela metade.
    if (r.tipo === "falha") return { tipo: "falha", enviada: false, motivo: `login: ${r.motivo}` };
    const normal = normalizarResposta(r.status, r.corpo);
    if (!normal.ok || typeof normal.dados !== "string" || !normal.dados) {
      return { tipo: "sem_acesso", motivo: `login recusado pela Nogle (HTTP ${r.status})` };
    }
    this.token = normal.dados;
    return null;
  }

  async chamar(pedido: PedidoNogle): Promise<ResultadoChamada> {
    const temCorpo = Object.keys(pedido.corpo).length > 0;
    if (pedido.metodo === "GET" && temCorpo && !this.opcoes.getComCorpo) {
      return { tipo: "bloqueada", motivo: "consulta GET com corpo desligada neste worker (NOGLE_GET_COM_CORPO)" };
    }
    for (let tentativa = 0; tentativa < 2; tentativa++) {
      if (!this.token) {
        const falha = await this.renovarToken();
        if (falha) return falha;
      }
      const r = await this.transporte({ metodo: pedido.metodo, caminho: pedido.caminho, corpo: temCorpo ? pedido.corpo : undefined, token: this.token ?? undefined });
      // 401: o token venceu e o pedido não foi processado; pede outro token uma vez e repete.
      if (r.tipo === "resposta" && r.status === 401 && tentativa === 0) {
        this.token = null;
        continue;
      }
      return r;
    }
    return { tipo: "sem_acesso", motivo: "a Nogle recusou o token renovado" };
  }
}
