// Rotina do worker da Ora Connect (ADR-005): envia as operações registradas pelas lojas, grava a
// resposta, consulta a evidência das pendentes, atualiza as listas oficiais e concilia a produção com os
// relatórios oficiais (CONNECT-c; ORA-CONNECT-009). Regras:
// - nada saiu (sem conexão, sem login, consulta bloqueada) → a operação volta para a fila;
// - saiu e não voltou resposta clara → resultado desconhecido: NUNCA reenvia; consulta e a gerência decide;
// - log só com contagens: nada de CPF, nome, linha, token ou chave.
import {
  PEDIDO_DO_ESTOQUE_DA_MVNO, PEDIDO_DOS_PDVS, RELATORIOS_DA_CONCILIACAO, conferirTransferencia, ehTipoDeConsulta, interpretarConsulta,
  interpretarConsultaPagamento, lerRespostaDaConsulta, pedidoDaConsulta, type RespostaDaConsulta,
  interpretarEnvio, lerChips, lerPdvs, lerReferencias, lerRelatorio, lerRespostaDaTransferencia, montarConsulta, montarPedido, montarPedidoDoRelatorio,
  pedidoDaTransferencia, pedidoDoEstoqueDoPdv, type ChipDaNogle, type Evidencia, type TransferenciaParaEnviar,
  type ItemDeReferencia, type LinhaDoRelatorio, type OperacaoParaConsultar, type OperacaoParaEnviar, type PdvDaNogle, type PedidoNogle,
  type RelatorioDaConciliacao, type ResultadoEnvio, type TipoDeChip, type TipoDeReferencia, type TipoOperacao,
} from "@ora5g/dominio/nogle";

import type { ResultadoChamada } from "./cliente-nogle.ts";

export interface BancoConnect {
  reivindicarEnvios(tipos: TipoOperacao[], limite: number): Promise<OperacaoParaEnviar[]>;
  registrarEnvio(operacao: string, resultado: ResultadoEnvio): Promise<string>;
  operacoesAConsultar(tipos: TipoOperacao[], limite: number): Promise<OperacaoParaConsultar[]>;
  registrarConsulta(operacao: string, evidencia: Evidencia): Promise<string>;
  atualizarReferencias(tipo: TipoDeReferencia, itens: ItemDeReferencia[]): Promise<number>;
  registrarConciliacao(relatorio: RelatorioDaConciliacao, de: string, ate: string, linhas: LinhaDoRelatorio[]): Promise<{ numero: number; totais: Record<string, number> }>;
  gravarEstoque(leitura: LeituraDoEstoque): Promise<EstoqueGravado>;
  transferenciasAEnviar(limite: number): Promise<TransferenciaParaEnviar[]>;
  registrarTransferencia(transferencia: string, resultado: ResultadoDaTransferencia): Promise<string>;
  planosNoCaixa(): Promise<PlanosNoCaixa>;
  chipsNoEstoque(): Promise<ChipsNoEstoque>;
  consultasAFazer(limite: number): Promise<ConsultaParaFazer[]>;
  registrarRespostaDaConsulta(consulta: string, resposta: RespostaDaConsulta): Promise<string>;
  limparConsultas(): Promise<{ vencidas: number; apagadas: number }>;
}

/** Uma consulta que só lê, pedida na tela (CONNECT-g; connect_worker_consultas_a_fazer). */
export type ConsultaParaFazer = { consulta_id: string; tipo: string; parametro: string | null };

/** O que o worker grava depois de cada envio de transferência (connect_worker_registrar_transferencia). */
export type ResultadoDaTransferencia = {
  envio: "nao_enviada" | "recusada" | "desconhecida" | "aceita";
  mensagem: string;
  confirmacao?: "confirmada" | "parcial" | "nao_confirmada";
  antes?: { fisicos: number; esims: number };
  depois?: { fisicos: number; esims: number };
  novos?: string[];
  transferidos?: number | null;
  nao_transferidos?: number | null;
};

/** O que o worker entrega ao banco a cada leitura do estoque de chips (CONNECT-d; connect_worker_gravar_estoque). */
export type LeituraDoEstoque = {
  pdvs: PdvDaNogle[];
  /** Null: a MVNO não foi lida e o estoque dela fica como estava. */
  mvno: { iccid: string; tipo: TipoDeChip }[] | null;
  /** Só os PDVs que responderam; o que falhou fica como estava. */
  estoques: { pdv: number; chips: ChipDaNogle[] }[];
  falhas: number;
};
export type EstoqueGravado = { numero: number; pdvs: number; pdvs_lidos: number; chips: number; falhas: number };
/** Os planos da Nogle como serviços do caixa, pelo valor de face (CONNECT-f; connect_worker_planos_no_caixa). */
export type PlanosNoCaixa = { criadas: number; precos: number; desativadas: number };
/** Os chips físicos do PDV de cada loja ligada no estoque dela, pelo ICCID (CONNECT-f; connect_worker_chips_no_estoque). */
export type ChipsNoEstoque = { entraram: number; fora_da_forma: number; divergentes: number };

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
      // Sem conexão ou sem acesso: as demais voltam para a fila sem chamar a Nogle.
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

// consultaPagamento: só com NOGLE_CONSULTA_PAGAMENTO=habilitada (rota a liberar pela Nogle para a conta).
export async function consultarPendentes(banco: BancoConnect, nogle: Nogle, tipos: TipoOperacao[], limite = 10, opcoes: { consultaPagamento?: boolean } = {}) {
  const resumo = { consultadas: 0, confirmadas: 0, bloqueadas: 0, falhas: 0 };
  for (const op of await banco.operacoesAConsultar(tipos, limite)) {
    const pedido = montarConsulta(op, opcoes);
    let evidencia: Evidencia;
    if (!pedido) {
      evidencia = { evidencia: "sem_evidencia", mensagem: "Sem dado para consultar (ex.: eSIM sem ICCID na resposta)." };
    } else {
      const r = await nogle.chamar(pedido);
      evidencia = r.tipo === "resposta"
        ? (pedido.caminho === "/consultaPagamento" ? interpretarConsultaPagamento(op, r.status, r.corpo) : interpretarConsulta(op, r.status, r.corpo))
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
  const resumo: { listas: number; itens: number; falhas: number; caixa: PlanosNoCaixa | null } = { listas: 0, itens: 0, falhas: 0, caixa: null };
  let planos = false;
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
    if (tipo === "plano") planos = true;
  }
  // CONNECT-f: com a lista dos planos em dia, o caixa vende cada plano (a recarga e a ativação) pelo valor de face.
  if (planos) resumo.caixa = await banco.planosNoCaixa();
  return resumo;
}

/** O máximo de páginas de um relatório numa conciliação (o tamanho da página não é documentado). */
export const PAGINAS_DA_CONCILIACAO = 50;

/**
 * A conciliação (CONNECT-c; ORA-CONNECT-009): lê o relatório oficial de ativações e o de recargas do período, página por
 * página (a primeira página vazia encerra), e entrega as linhas ao banco, que liga cada uma à operação local confirmada.
 * Nada é gravado do relatório que falhou numa página, que não se entende ou que passou do máximo de páginas: a
 * conciliação pela metade esconderia diferença. O resumo só tem contagens e o motivo, sem linha, ICCID ou cliente.
 */
export async function conciliarRelatorios(banco: BancoConnect, nogle: Nogle, de: string, ate: string,
  opcoes: { relatorios?: readonly RelatorioDaConciliacao[]; paginas?: number } = {}) {
  const maximo = opcoes.paginas ?? PAGINAS_DA_CONCILIACAO;
  const resumo = { conciliadas: 0, linhas: 0, falhas: 0, detalhes: [] as { relatorio: RelatorioDaConciliacao; numero?: number; totais?: Record<string, number>; falha?: string }[] };
  for (const relatorio of opcoes.relatorios ?? RELATORIOS_DA_CONCILIACAO) {
    const linhas: LinhaDoRelatorio[] = [];
    let falha: string | null = null;
    let fim = false;
    for (let pagina = 1; pagina <= maximo && !fim && !falha; pagina++) {
      const pedido = montarPedidoDoRelatorio(relatorio, de, ate, pagina);
      if (!pedido) {
        falha = "período inválido";
        break;
      }
      const r = await nogle.chamar(pedido);
      if (r.tipo !== "resposta") falha = r.tipo === "falha" ? "sem resposta da Nogle" : r.motivo;
      else if (r.status !== 200) falha = `a Nogle respondeu HTTP ${r.status}`;
      else {
        const lido = lerRelatorio(r.corpo, linhas.length + 1);
        if (lido.problema) falha = lido.problema;
        else if (lido.linhas.length === 0) fim = true;
        else linhas.push(...lido.linhas);
      }
    }
    if (!falha && !fim) falha = `o relatório passou de ${maximo} páginas`;
    if (falha) {
      resumo.falhas++;
      resumo.detalhes.push({ relatorio, falha: `${falha}: nada gravado` });
      continue;
    }
    const registro = await banco.registrarConciliacao(relatorio, de, ate, linhas);
    resumo.conciliadas++;
    resumo.linhas += linhas.length;
    resumo.detalhes.push({ relatorio, numero: registro.numero, totais: registro.totais });
  }
  return resumo;
}


const motivoDaLeitura = (r: ResultadoChamada, oQue: string) =>
  r.tipo === "resposta"
    ? r.status === 200 ? `${oQue} veio fora da forma` : `${oQue}: a Nogle respondeu HTTP ${r.status}`
    : r.tipo === "falha" ? `${oQue}: sem resposta da Nogle` : `${oQue}: ${r.motivo}`;

/**
 * A leitura do estoque de chips (CONNECT-d; ORA-INV-011), SÓ LEITURA: a lista dos PDVs, o estoque geral da MVNO e o de
 * cada PDV (GET com o id no corpo). Sem a lista dos PDVs nada é gravado; a MVNO ou o PDV que falhou conta como falha e
 * fica como estava no banco. Nenhuma rota que muda algo na Nogle é chamada. Depois de gravar, os chips físicos do PDV de
 * cada loja ligada entram no estoque dela pelo ICCID, uma vez só (CONNECT-f). O resumo só tem contagens (nada de ICCID,
 * nome ou token).
 */
export async function lerEstoqueDeChips(banco: BancoConnect, nogle: Nogle):
  Promise<{ gravada: true; leitura: EstoqueGravado; ignorados: number; noEstoque: ChipsNoEstoque } | { gravada: false; motivo: string }> {
  const lista = await nogle.chamar(PEDIDO_DOS_PDVS);
  const pdvs = lista.tipo === "resposta" && lista.status === 200 ? lerPdvs(lista.corpo) : null;
  if (!pdvs || pdvs.length === 0) return { gravada: false, motivo: motivoDaLeitura(lista, "a lista dos PDVs") };
  let falhas = 0;
  let ignorados = 0;
  const geral = await nogle.chamar(PEDIDO_DO_ESTOQUE_DA_MVNO);
  const mvno = geral.tipo === "resposta" && geral.status === 200 ? lerChips(geral.corpo) : null;
  if (mvno) ignorados += mvno.ignorados;
  else falhas++;
  const estoques: LeituraDoEstoque["estoques"] = [];
  for (const pdv of pdvs) {
    const r = await nogle.chamar(pedidoDoEstoqueDoPdv(pdv.id));
    const lido = r.tipo === "resposta" && r.status === 200 ? lerChips(r.corpo) : null;
    if (!lido) {
      falhas++;
      continue;
    }
    ignorados += lido.ignorados;
    estoques.push({ pdv: pdv.id, chips: lido.chips });
  }
  const leitura = await banco.gravarEstoque({ pdvs, mvno: mvno ? mvno.chips.map(({ iccid, tipo }) => ({ iccid, tipo })) : null, estoques, falhas });
  return { gravada: true, leitura, ignorados, noEstoque: await banco.chipsNoEstoque() };
}

const contar = (chips: readonly ChipDaNogle[]) => ({
  fisicos: chips.filter((c) => c.tipo === "fisico").length, esims: chips.filter((c) => c.tipo === "esim").length,
});

/**
 * A transferência de chips (CONNECT-e): cada pedido do dono sai UMA vez. Antes, o estoque do PDV de destino (sem essa
 * leitura nada é enviado e o pedido volta para a fila); depois do envio aceito, o estoque de novo, e a conferência diz se
 * os chips chegaram. Sem conexão antes de enviar: volta para a fila. Enviado sem resposta clara: resultado desconhecido,
 * nunca reenviado. Devolve as contagens e se algum pedido saiu (para atualizar o estoque lido).
 */
export async function enviarTransferencias(banco: BancoConnect, nogle: Nogle, limite = 5) {
  const resumo = { confirmadas: 0, parciais: 0, recusadas: 0, desconhecidas: 0, devolvidas: 0, enviadas: 0 };
  let parar: string | null = null;
  for (const t of await banco.transferenciasAEnviar(limite)) {
    const devolver = async (mensagem: string) => {
      await banco.registrarTransferencia(t.transferencia_id, { envio: "nao_enviada", mensagem });
      resumo.devolvidas++;
    };
    const pedido = pedidoDaTransferencia(t);
    if (parar) { await devolver(parar); continue; }
    if (!pedido) {
      await banco.registrarTransferencia(t.transferencia_id, { envio: "recusada", mensagem: "Pedido fora da forma: nada foi enviado. Peça de novo." });
      resumo.recusadas++;
      continue;
    }
    const a = await nogle.chamar(pedidoDoEstoqueDoPdv(t.pdv_id));
    const antes = a.tipo === "resposta" && a.status === 200 ? lerChips(a.corpo) : null;
    if (!antes) {
      // Sem a leitura de antes não há como conferir: nada é enviado. Sem conexão ou sem acesso, os demais também voltam.
      if (a.tipo !== "resposta") parar = `Sem conexão com a Nogle (${a.motivo}): nada foi enviado; o pedido volta para a fila.`;
      await devolver(`Sem a leitura do estoque do PDV antes do envio (${a.tipo === "resposta" ? `HTTP ${a.status}` : a.motivo}): nada foi enviado; o pedido volta para a fila.`);
      continue;
    }
    const r = await nogle.chamar(pedido);
    if (r.tipo !== "resposta" && !(r.tipo === "falha" && r.enviada)) {
      // Nada saiu (sem conexão, sem login, consulta bloqueada): volta para a fila, e os demais também.
      parar = `Nada foi enviado (${r.motivo}); o pedido volta para a fila.`;
      await devolver(parar);
      continue;
    }
    resumo.enviadas++;
    const lida = r.tipo === "resposta"
      ? lerRespostaDaTransferencia(r.status, r.corpo)
      : { envio: "desconhecida" as const, mensagem: `${r.motivo}: a Nogle pode ter recebido; confira no painel da Nogle (o pedido não é reenviado).`, transferidos: null, nao_transferidos: null };
    if (lida.envio !== "aceita") {
      await banco.registrarTransferencia(t.transferencia_id, { envio: lida.envio, mensagem: lida.mensagem, antes: contar(antes.chips) });
      if (lida.envio === "recusada") resumo.recusadas++;
      else resumo.desconhecidas++;
      continue;
    }
    const d = await nogle.chamar(pedidoDoEstoqueDoPdv(t.pdv_id));
    const depois = d.tipo === "resposta" && d.status === 200 ? lerChips(d.corpo) : null;
    const conferencia = depois ? conferirTransferencia(t, antes.chips, depois.chips) : { confirmacao: "nao_confirmada" as const, novos: [] };
    const situacao = await banco.registrarTransferencia(t.transferencia_id, {
      envio: "aceita", mensagem: lida.mensagem, confirmacao: conferencia.confirmacao, antes: contar(antes.chips),
      ...(depois ? { depois: contar(depois.chips) } : {}), novos: conferencia.novos,
      transferidos: lida.transferidos, nao_transferidos: lida.nao_transferidos,
    });
    if (situacao === "confirmada") resumo.confirmadas++;
    else if (situacao === "parcial") resumo.parciais++;
    else resumo.desconhecidas++;
  }
  return resumo;
}

const esperarDeVerdade = (ms: number) => new Promise<void>((pronto) => { setTimeout(pronto, ms); });
const motivoDaConsulta = (r: Exclude<ResultadoChamada, { tipo: "resposta" }>) =>
  r.tipo === "falha" ? "Sem conexão com a Nogle agora: tente de novo em instantes."
    : r.tipo === "bloqueada" ? "A consulta com corpo está desligada neste servidor (NOGLE_GET_COM_CORPO)."
      : "O login na Nogle foi recusado: avise o administrador.";

/**
 * As consultas que só leem (CONNECT-g; a D-056): durante até `duracaoMs`, pega a fila (até `limite` por vez), consulta a
 * Nogle e grava a resposta já limpa (só os campos que a tela mostra); sem nada na fila, espera `esperaMs` e olha de novo.
 * Nada aqui muda algo na Nogle. Sem conexão, a consulta falha com o aviso (a pessoa pede de novo): a consulta não se repete
 * sozinha. O resumo só tem contagens.
 */
export async function responderConsultas(banco: BancoConnect, nogle: Nogle, opcoes: {
  duracaoMs?: number; esperaMs?: number; limite?: number; agora?: () => Date; relogio?: () => number; esperar?: (ms: number) => Promise<void>;
} = {}) {
  const relogio = opcoes.relogio ?? (() => Date.now());
  const esperar = opcoes.esperar ?? esperarDeVerdade;
  const agora = opcoes.agora ?? (() => new Date());
  const fim = relogio() + (opcoes.duracaoMs ?? 50_000);
  const resumo = { respondidas: 0, nao_encontradas: 0, falhas: 0 };
  while (relogio() < fim) {
    const fila = await banco.consultasAFazer(opcoes.limite ?? 5);
    if (fila.length === 0) {
      await esperar(opcoes.esperaMs ?? 2_000);
      continue;
    }
    for (const c of fila) {
      const pedido = ehTipoDeConsulta(c.tipo) ? pedidoDaConsulta(c.tipo, c.parametro, agora()) : null;
      let resposta: RespostaDaConsulta;
      if (!pedido || !ehTipoDeConsulta(c.tipo)) {
        resposta = { situacao: "falhou", mensagem: "Consulta fora da forma." };
      } else {
        const r = await nogle.chamar(pedido);
        resposta = r.tipo === "resposta" ? lerRespostaDaConsulta(c.tipo, r.status, r.corpo) : { situacao: "falhou", mensagem: motivoDaConsulta(r) };
      }
      await banco.registrarRespostaDaConsulta(c.consulta_id, resposta);
      if (resposta.situacao === "respondida") resumo.respondidas++;
      else if (resposta.situacao === "nao_encontrada") resumo.nao_encontradas++;
      else resumo.falhas++;
    }
  }
  return resumo;
}
