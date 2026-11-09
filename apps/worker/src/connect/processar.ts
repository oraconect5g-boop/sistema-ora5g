// Rotina do worker da Ora Connect (ADR-005): envia as operações registradas pelas lojas, grava a
// resposta, consulta a evidência das pendentes e atualiza as listas oficiais. Regras:
// - nada saiu (sem conexão, sem login, consulta bloqueada) → a operação volta para a fila;
// - saiu e não voltou resposta clara → resultado desconhecido: NUNCA reenvia; consulta e a gerência decide;
// - log só com contagens: nada de CPF, nome, linha, token ou chave.
import {
  interpretarConsulta, interpretarEnvio, lerReferencias, montarConsulta, montarPedido,
  type Evidencia, type ItemDeReferencia, type OperacaoParaConsultar, type OperacaoParaEnviar, type PedidoNogle,
  type ResultadoEnvio, type TipoDeReferencia, type TipoOperacao,
} from "@ora5g/dominio/nogle";

import type { ResultadoChamada } from "./cliente-nogle.ts";

export interface BancoConnect {
  reivindicarEnvios(tipos: TipoOperacao[], limite: number): Promise<OperacaoParaEnviar[]>;
  registrarEnvio(operacao: string, resultado: ResultadoEnvio): Promise<string>;
  operacoesAConsultar(tipos: TipoOperacao[], limite: number): Promise<OperacaoParaConsultar[]>;
  registrarConsulta(operacao: string, evidencia: Evidencia): Promise<string>;
  atualizarReferencias(tipo: TipoDeReferencia, itens: ItemDeReferencia[]): Promise<number>;
}

export interface Nogle {
  chamar(pedido: PedidoNogle): Promise<ResultadoChamada>;
}

export const mensagemSegura = (erro: unknown) =>
  erro && typeof erro === "object" && "code" in erro && typeof erro.code === "string" ? `erro ${erro.code}` : "erro inesperado";

function resultadoDaChamada(tipo: TipoOperacao, r: ResultadoChamada): ResultadoEnvio {
  if (r.tipo === "resposta") return interpretarEnvio(tipo, r.status, r.corpo);
  if (r.tipo === "falha" && r.enviada) return { resultado: "desconhecida", mensagem: r.motivo };
  return { resultado: "nao_enviada", mensagem: r.motivo };
}

export async function enviarPendentes(banco: BancoConnect, nogle: Nogle, tipos: TipoOperacao[], limite = 5) {
  const resumo = { aceitas: 0, recusadas: 0, desconhecidas: 0, devolvidas: 0 };
  let parar: string | null = null;
  for (const op of await banco.reivindicarEnvios(tipos, limite)) {
    let resultado: ResultadoEnvio;
    if (parar) {
      // Sem conexão ou sem acesso: as demais voltam para a fila sem chamar a Contel.
      resultado = { resultado: "nao_enviada", mensagem: parar };
    } else {
      let pedido: PedidoNogle | null = null;
      try {
        pedido = montarPedido(op);
      } catch {
        pedido = null;
      }
      resultado = pedido
        ? resultadoDaChamada(op.tipo, await nogle.chamar(pedido))
        : { resultado: "recusada", mensagem: "Pedido incompleto (nada foi enviado): registre a operação de novo." };
      if (resultado.resultado === "nao_enviada") parar = resultado.mensagem;
    }
    await banco.registrarEnvio(op.operacao_id, resultado);
    if (resultado.resultado === "aceita") resumo.aceitas++;
    else if (resultado.resultado === "recusada") resumo.recusadas++;
    else if (resultado.resultado === "desconhecida") resumo.desconhecidas++;
    else resumo.devolvidas++;
  }
  return resumo;
}

export async function consultarPendentes(banco: BancoConnect, nogle: Nogle, tipos: TipoOperacao[], limite = 10) {
  const resumo = { consultadas: 0, confirmadas: 0, bloqueadas: 0, falhas: 0 };
  for (const op of await banco.operacoesAConsultar(tipos, limite)) {
    const pedido = montarConsulta(op);
    let evidencia: Evidencia;
    if (!pedido) {
      evidencia = { evidencia: "sem_evidencia", mensagem: "Sem dado para consultar (ex.: eSIM sem ICCID na resposta)." };
    } else {
      const r = await nogle.chamar(pedido);
      evidencia = r.tipo === "resposta" ? interpretarConsulta(op, r.status, r.corpo)
        : r.tipo === "bloqueada" ? { evidencia: "consulta_bloqueada", mensagem: r.motivo }
        : { evidencia: "falha_consulta", mensagem: r.motivo };
    }
    const situacao = await banco.registrarConsulta(op.operacao_id, evidencia);
    resumo.consultadas++;
    if (situacao === "confirmada") resumo.confirmadas++;
    if (evidencia.evidencia === "consulta_bloqueada") resumo.bloqueadas++;
    if (evidencia.evidencia === "falha_consulta") resumo.falhas++;
  }
  return resumo;
}

const LISTAS: [TipoDeReferencia, string][] = [
  ["plano", "/planos"], ["ddd", "/ddds"], ["operadora", "/portabilidade/operadorasDisponiveis"],
];

export async function sincronizarReferencias(banco: BancoConnect, nogle: Nogle, ufs: string[]) {
  const resumo = { listas: 0, itens: 0, falhas: 0 };
  const pedidos: [TipoDeReferencia, string][] = [
    ...LISTAS,
    ...ufs.filter((uf) => /^[A-Z]{2}$/.test(uf)).map((uf): [TipoDeReferencia, string] => ["cidade", `/cidades/${uf}`]),
  ];
  for (const [tipo, caminho] of pedidos) {
    const r = await nogle.chamar({ metodo: "GET", caminho, corpo: {} });
    const itens = r.tipo === "resposta" && r.status === 200 ? lerReferencias(tipo, r.corpo) : [];
    if (itens.length === 0) {
      // Lista vazia ou fora do formato não apaga a que já existe.
      resumo.falhas++;
      continue;
    }
    resumo.itens += await banco.atualizarReferencias(tipo, itens);
    resumo.listas++;
  }
  return resumo;
}
