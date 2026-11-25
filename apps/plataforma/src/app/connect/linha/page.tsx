import { randomUUID } from "node:crypto";

import { ArrowLeft, BookOpen, CreditCard, FileText, Globe, History, Search, Truck, UserCheck, Wallet } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { AtualizarEnquantoEspera } from "../../../componentes/AtualizarEnquantoEspera";
import { MoldeReal } from "../../../componentes/MoldeReal";
import { Aviso, Botao, Cartao, Selo, TituloPagina } from "../../../componentes/ui";
import { permite } from "../../../lib/acesso/molde";
import { FalhaDoServico, obterSessao } from "../../../lib/acesso/sessao";
import { PARAMETRO_DA_CONSULTA } from "@ora5g/dominio/nogle";

import {
  abreEmPaginaPropria, CONSULTAS_DA_LOJA, DIAS_DAS_PORTABILIDADES, DIAS_DAS_PROGRAMADAS, ehErroDaConsulta, ERROS_DA_CONSULTA, esperandoResposta,
  INFORMACOES_DA_NOGLE, linhasDaResposta, NOMES_DAS_CONSULTAS, PEDE_O_QUE, SITUACOES_DA_CONSULTA, TIPOS_DE_SOLICITACAO, tituloDaConsulta,
  type ConsultaDaTela,
} from "../../../lib/connect/consultas";
import { textoDoParametro, type ValorDeParametro } from "../../../lib/parametros";
import { consultar } from "./acoes";

export const metadata: Metadata = { title: "Consultar linha" };
export const dynamic = "force-dynamic";

const campo = "mt-1 min-h-11 w-full rounded-botao border border-borda bg-white px-3 text-sm outline-none focus:border-acao focus:ring-2 focus:ring-acao/20";
const quando = (iso: string) =>
  new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" }).format(new Date(iso)).replace(",", " às");

/** Um botão que pede uma consulta sem número (a tela grava o pedido; o worker consulta). */
function PedirSemNumero({ tipo, rotulo }: { tipo: string; rotulo: string }) {
  return (
    <form action={consultar}>
      <input type="hidden" name="chave" value={randomUUID()} />
      <input type="hidden" name="tipo" value={tipo} />
      <Botao type="submit" variante="secundario">{rotulo}</Botao>
    </form>
  );
}

// As consultas da Nogle que só leem (lotes CONNECT-g, h e i; ORA-CONNECT-007 e ORA-CONNECT-009; a decisão D-056, "só consultas").
// Quem opera a Ora Connect na loja consulta a linha (pelo número), o chip (pelo ICCID), o cliente (pelo CPF/CNPJ), o titular da
// linha, o CNPJ, o CEP, o rastreio da compra e as informações da Nogle; a gerência, também o custo da logística e o CPF; quem
// gere a rede, a carteira, as recargas programadas, as portabilidades e as listas de linhas e de clientes. A tela grava o
// pedido no banco (que confere quem pode); o worker do servidor consulta a Nogle em poucos segundos e grava a resposta, que só
// quem pediu vê e que é apagada depois de 24 horas.
export default async function ConsultarLinha({ searchParams }: { searchParams: Promise<{ erro?: ValorDeParametro }> }) {
  const parametros = await searchParams;
  const sessao = await obterSessao({ exigirLoja: true });
  const voltar = <Link href="/connect" className="inline-flex min-h-11 items-center gap-1 text-sm font-semibold text-acao"><ArrowLeft className="size-4" aria-hidden />Ora Connect</Link>;
  const opera = permite(sessao, "connect.operar");
  const gere = permite(sessao, "connect.gerir");
  // A carteira e os relatórios da rede são de quem gere a Ora Connect na rede (o banco confere de novo).
  const gereARede = gere && sessao.molde.vinculos.some((v) => v.escopo === "organizacao");
  if (!opera && !gere) {
    return <MoldeReal sessao={sessao}>{voltar}<Aviso tom="aviso" className="mt-4">Consultar linha é de quem opera a Ora Connect.</Aviso></MoldeReal>;
  }
  const [lidas, planos] = await Promise.all([
    sessao.supabase.from("connect_consultas")
      .select("id, tipo, parametro, parametro_mascarado, situacao, resposta, mensagem, pedida_em, respondida_em, resposta_apagada_em")
      .order("pedida_em", { ascending: false }).limit(15),
    // O nome de cada plano da lista oficial (o plano pago do chip vem só com o código).
    sessao.supabase.from("connect_referencias").select("codigo, nome").eq("tipo", "plano").limit(200),
  ]);
  if (lidas.error) throw new FalhaDoServico("connect_consultas");
  if (planos.error) throw new FalhaDoServico("connect_referencias");
  const consultas = lidas.data as unknown as ConsultaDaTela[];
  const nomeDoPlano = (codigo: string) => planos.data.find((p) => p.codigo === codigo)?.nome;
  const erro = textoDoParametro(parametros.erro);

  return (
    <MoldeReal sessao={sessao}>
      {voltar}
      <TituloPagina titulo="Consultar linha" subtitulo="Na Nogle, pelo número com DDD, pelo ICCID do chip ou pelo CPF/CNPJ do cliente; a resposta chega em poucos segundos" />
      {erro && <Aviso tom="perigo" className="mt-4">{ehErroDaConsulta(erro) ? ERROS_DA_CONSULTA[erro] : ERROS_DA_CONSULTA.falha}</Aviso>}
      {consultas.some(esperandoResposta) && <AtualizarEnquantoEspera aviso="Consultando a Nogle…" />}

      {opera && (
        <Cartao className="mt-4" titulo="O que consultar" icone={Search}>
          <form action={consultar} className="grid gap-3 sm:grid-cols-2">
            <input type="hidden" name="chave" value={randomUUID()} />
            <label className="text-sm font-medium">Número com DDD, ICCID do chip, CPF/CNPJ, CEP ou nº do pedido
              <input name="parametro" inputMode="numeric" autoComplete="off" required maxLength={30} className={campo} />
            </label>
            <label className="text-sm font-medium">Consulta
              <select name="tipo" defaultValue="linha_completa" className={campo}>
                {CONSULTAS_DA_LOJA.map((tipo) => (
                  <option key={tipo} value={tipo}>{`${NOMES_DAS_CONSULTAS[tipo]} (${PEDE_O_QUE[PARAMETRO_DA_CONSULTA[tipo] ?? "linha"]})`}</option>
                ))}
              </select>
            </label>
            <div className="sm:col-span-2"><Botao type="submit">Consultar</Botao></div>
          </form>
          <p className="mt-3 text-xs text-suave">
            Só consulta: nada muda na linha nem no chip. A resposta pode ter o nome do titular: só você vê, e ela é apagada em 24 horas.
          </p>
        </Cartao>
      )}

      {opera && (
        <Cartao className="mt-4" titulo="O titular da linha" icone={UserCheck}
          subtitulo="Antes da portabilidade ou de um atendimento: o CPF/CNPJ que o cliente diz é o do titular da linha?">
          <form action={consultar} className="grid gap-3 sm:grid-cols-2">
            <input type="hidden" name="chave" value={randomUUID()} />
            <input type="hidden" name="tipo" value="titularidade_da_linha" />
            <label className="text-sm font-medium">Linha com DDD
              <input name="parametro" inputMode="numeric" autoComplete="off" required maxLength={20} className={campo} />
            </label>
            <label className="text-sm font-medium">CPF ou CNPJ do titular
              <input name="documento" inputMode="numeric" autoComplete="off" required maxLength={20} className={campo} />
            </label>
            <div className="sm:col-span-2"><Botao type="submit" variante="secundario">Conferir o titular</Botao></div>
          </form>
        </Cartao>
      )}

      {opera && (
        <Cartao className="mt-4" titulo="Pagamento de uma solicitação" icone={CreditCard}
          subtitulo="O link, o boleto ou o Pix de uma ativação, recarga ou compra, para reenviar ao cliente (o número da solicitação na Nogle)">
          <form action={consultar} className="grid gap-3 sm:grid-cols-2">
            <input type="hidden" name="chave" value={randomUUID()} />
            <input type="hidden" name="tipo" value="pagamento_da_solicitacao" />
            <label className="text-sm font-medium">Solicitação
              <select name="solicitacao" defaultValue="2" className={campo}>
                {Object.entries(TIPOS_DE_SOLICITACAO).map(([digito, s]) => <option key={digito} value={digito}>{`${s.nome.charAt(0).toUpperCase()}${s.nome.slice(1)}`}</option>)}
              </select>
            </label>
            <label className="text-sm font-medium">Número da solicitação
              <input name="parametro" inputMode="numeric" autoComplete="off" required maxLength={14} className={campo} />
            </label>
            <div className="sm:col-span-2"><Botao type="submit" variante="secundario">Ver o pagamento</Botao></div>
          </form>
        </Cartao>
      )}

      {opera && (
        <Cartao className="mt-4" titulo="Informações da Nogle" icone={BookOpen} subtitulo="As dúvidas frequentes, os planos de campanha e os estados">
          <div className="flex flex-wrap gap-2">
            {INFORMACOES_DA_NOGLE.map((tipo) => <PedirSemNumero key={tipo} tipo={tipo} rotulo={NOMES_DAS_CONSULTAS[tipo]} />)}
          </div>
        </Cartao>
      )}

      {gere && (
        <Cartao className="mt-4" titulo="Da gerência" icone={Truck} subtitulo="O custo da Nogle e o CPF do cliente (a Nogle devolve o nome e o nascimento)">
          <PedirSemNumero tipo="logistica" rotulo={NOMES_DAS_CONSULTAS.logistica} />
          <form action={consultar} className="mt-3 grid gap-3 sm:grid-cols-2">
            <input type="hidden" name="chave" value={randomUUID()} />
            <input type="hidden" name="tipo" value="validar_cpf" />
            <label className="text-sm font-medium">CPF do cliente
              <input name="parametro" inputMode="numeric" autoComplete="off" required maxLength={20} className={campo} />
            </label>
            <div className="flex items-end"><Botao type="submit" variante="secundario">Conferir o CPF</Botao></div>
          </form>
          <p className="mt-3 text-xs text-suave">Use só para o cadastro do cliente que está na loja: a consulta fica registrada com o seu nome.</p>
        </Cartao>
      )}

      {gereARede && (
        <Cartao className="mt-4" titulo="Carteira da Ora na Nogle" icone={Wallet}
          subtitulo="O saldo pré-pago que paga, na Nogle, as ativações e as recargas feitas nas lojas (SALDO)">
          <PedirSemNumero tipo="carteira_saldo" rotulo="Consultar o saldo" />
          <form action={consultar} className="mt-3 grid gap-3 sm:grid-cols-2">
            <input type="hidden" name="chave" value={randomUUID()} />
            <input type="hidden" name="tipo" value="carteira_programadas" />
            <label className="text-sm font-medium">Recargas programadas pela carteira
              <select name="parametro" defaultValue="30" className={campo}>
                {DIAS_DAS_PROGRAMADAS.map((dias) => <option key={dias} value={dias}>{`Nos próximos ${dias} dias`}</option>)}
              </select>
            </label>
            <div className="flex items-end"><Botao type="submit" variante="secundario">Ver as programadas</Botao></div>
          </form>
          <form action={consultar} className="mt-3 grid gap-3 sm:grid-cols-3">
            <input type="hidden" name="chave" value={randomUUID()} />
            <label className="text-sm font-medium">Extrato da carteira
              <select name="tipo" defaultValue="carteira_extrato_saidas" className={campo}>
                <option value="carteira_extrato_saidas">Saídas (ativações, recargas e compras)</option>
                <option value="carteira_extrato_entradas">Entradas (o crédito posto)</option>
              </select>
            </label>
            <label className="text-sm font-medium">Período
              <select name="parametro" defaultValue="30" className={campo}>
                {DIAS_DAS_PORTABILIDADES.map((dias) => <option key={dias} value={dias}>{dias === 366 ? "No último ano" : `Nos últimos ${dias} dias`}</option>)}
              </select>
            </label>
            <div className="flex items-end"><Botao type="submit" variante="secundario">Ver o extrato</Botao></div>
          </form>
        </Cartao>
      )}

      {gereARede && (
        <Cartao className="mt-4" titulo="Relatórios da rede na Nogle" icone={Globe}
          subtitulo="As portabilidades e as listas de linhas e de clientes da Ora na Nogle (o documento aparece mascarado)">
          <form action={consultar} className="grid gap-3 sm:grid-cols-2">
            <input type="hidden" name="chave" value={randomUUID()} />
            <input type="hidden" name="tipo" value="relatorio_portabilidades" />
            <label className="text-sm font-medium">Portabilidades
              <select name="parametro" defaultValue="30" className={campo}>
                {DIAS_DAS_PORTABILIDADES.map((dias) => <option key={dias} value={dias}>{dias === 366 ? "No último ano" : `Nos últimos ${dias} dias`}</option>)}
              </select>
            </label>
            <div className="flex items-end"><Botao type="submit" variante="secundario">Ver as portabilidades</Botao></div>
          </form>
          {(["lista_de_linhas", "lista_de_clientes"] as const).map((tipo) => (
            <form key={tipo} action={consultar} className="mt-3 grid gap-3 sm:grid-cols-2">
              <input type="hidden" name="chave" value={randomUUID()} />
              <input type="hidden" name="tipo" value={tipo} />
              <label className="text-sm font-medium">{`${NOMES_DAS_CONSULTAS[tipo]}: a página`}
                <input name="parametro" type="number" min={1} max={9999} defaultValue={1} required className={campo} />
              </label>
              <div className="flex items-end"><Botao type="submit" variante="secundario">{tipo === "lista_de_linhas" ? "Ver as linhas" : "Ver os clientes"}</Botao></div>
            </form>
          ))}
        </Cartao>
      )}

      <Cartao className="mt-4" titulo="Minhas consultas" subtitulo="As 15 mais recentes, de quem está usando esta tela" icone={History}>
        {consultas.length === 0 ? (
          <p className="text-sm text-suave">Nenhuma consulta ainda.</p>
        ) : (
          <ul className="divide-y divide-borda text-sm" aria-label="Minhas consultas">
            {consultas.map((c) => {
              const s = SITUACOES_DA_CONSULTA[c.situacao] ?? { rotulo: c.situacao, tom: "neutro" as const };
              const linhas = linhasDaResposta(c, nomeDoPlano);
              const respondida = c.situacao === "respondida" && c.resposta !== null;
              const categorias = c.tipo === "faq_categorias" && respondida && Array.isArray(c.resposta?.categorias)
                ? (c.resposta.categorias as { id: number; nome: string }[]) : [];
              return (
                <li key={c.id} className="py-3">
                  <p className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold">{tituloDaConsulta(c)}</span>
                    <Selo tom={s.tom}>{s.rotulo}</Selo>
                    <span className="text-xs text-suave">{quando(c.pedida_em)}</span>
                  </p>
                  {c.mensagem && c.situacao !== "respondida" && <p className="mt-1 text-xs">{c.mensagem}</p>}
                  {linhas.length > 0 && (
                    <ul className="mt-1 space-y-0.5 text-sm" aria-label="Resposta">
                      {linhas.map((l, i) => <li key={i} className="numeros">{l}</li>)}
                    </ul>
                  )}
                  {opera && categorias.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-2" aria-label="Categorias das dúvidas">
                      {categorias.map((categoria) => (
                        <form key={categoria.id} action={consultar}>
                          <input type="hidden" name="chave" value={randomUUID()} />
                          <input type="hidden" name="tipo" value="faq_perguntas" />
                          <input type="hidden" name="parametro" value={categoria.id} />
                          <Botao type="submit" variante="secundario">{categoria.nome}</Botao>
                        </form>
                      ))}
                    </div>
                  )}
                  {respondida && abreEmPaginaPropria(c.tipo) && (
                    <Link href={`/connect/linha/${c.id}`} className="mt-1 inline-flex min-h-11 items-center gap-1 text-sm font-semibold text-acao">
                      <FileText className="size-4" aria-hidden />Abrir o relatório
                    </Link>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Cartao>
    </MoldeReal>
  );
}
