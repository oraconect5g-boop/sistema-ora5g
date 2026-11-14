import { Check, ClipboardCheck, Gift, ReceiptText, Settings2 } from "lucide-react";
import Link from "next/link";

import { ReguaDoBonus } from "../../componentes/graficos";
import { EstadoDoPainel } from "../../componentes/paineis-de-vendas";
import { Aviso, Avatar, Cartao, Celula, classeBotao, EstadoVazio, Indicador, Tabela } from "../../componentes/ui";
import type { LeituraDoBonus } from "../../lib/bonus/consulta";
import { dataEHora, linhaDoVendedor, type FechamentoDoMes } from "../../lib/bonus/fechamento";
import {
  contaDaMedida, fraseDaConta, porcentagemDaMeta, resumoDasFaixas, verboFaltar, type BonusDoMes, type BonusDoVendedor, type ContaDaMedida, type Faixa,
} from "../../lib/bonus/regras";
import { brl, numero, percentual } from "../../lib/formato";
import { comUnidade, formatarMedida, MEDIDAS, nomeDoMes, ORDEM_DAS_MEDIDAS, type FaseDoMes, type Medida, type PessoaDasMetas } from "../../lib/metas/painel";

// Bônus por meta (lote L9a). Só apresentação: os números chegam lidos e conferidos por lib/bonus (a
// conta do banco é refeita lá; o que não fecha vira falha, nunca bônus). A gestão vê o bônus de cada
// vendedor da loja; o vendedor, só o próprio. Provisório até o fechamento do mês (lote L9b): no mês que
// terminou, o cartão diz se o fechamento foi enviado ou aprovado, e o vendedor vê o valor aprovado.

const PROVISORIO = "Provisório até o fechamento do mês";
/** "R$" e o valor não se separam na quebra de linha (o formatador usa o espaço comum). */
export const semQuebra = (texto: string) => texto.replace(/R\$ /g, "R$\u00a0");

/** O atingido em % da meta, cortado (nunca arredondado para cima): 99,96% não aparece como 100%. */
export function atingidoDaConta(c: ContaDaMedida): number | null {
  if (c.meta === null) return null;
  return Math.floor((c.realizado * 1000) / c.meta) / 10;
}
const textoDoAtingido = (c: ContaDaMedida) => {
  const a = atingidoDaConta(c);
  return a === null ? "sem meta" : `${percentual(a / 100)} da meta`;
};

export function EstadoDoBonus({ leitura, aqui }: { leitura: Exclude<LeituraDoBonus<unknown>, { estado: "ok" }>; aqui: string }) {
  if (leitura.estado === "recusado") return <EstadoDoPainel estado="sem_permissao" motivo="O banco recusou a leitura do bônus desta loja para o seu perfil." />;
  return <EstadoDoPainel estado={leitura.estado} fonte="bonus" tentarDeNovo={aqui} />;
}

/** As regras que valem no mês, uma linha por medida; sem regra, "sem bônus". */
export function RegrasDoMes({ bonus, mes }: { bonus: BonusDoMes; mes: string }) {
  return (
    <ul className="space-y-2 text-sm">
      {ORDEM_DAS_MEDIDAS.map((m) => {
        const regra = bonus.regras[m];
        return (
          <li key={m} className="flex flex-col gap-0.5 sm:flex-row sm:items-baseline sm:justify-between sm:gap-x-3">
            <span className="font-semibold">{MEDIDAS[m].nome}</span>
            {regra ? (
              <span className="numeros sm:text-right">
                {semQuebra(resumoDasFaixas(regra.faixas))}
                {regra.vigenteDesde !== mes && <span className="ml-1.5 text-xs text-suave">{`(desde ${nomeDoMes(regra.vigenteDesde)})`}</span>}
              </span>
            ) : (
              <span className="text-suave">sem bônus</span>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function SemRegra({ mes, podeDefinir }: { mes: string; podeDefinir: boolean }) {
  return (
    <EstadoVazio
      titulo={`Nenhuma regra de bônus vale em ${nomeDoMes(mes)}`}
      icone={Gift}
      acao={podeDefinir ? <Link href="/metas/bonus" className={classeBotao("primario", "md")}><Settings2 aria-hidden className="size-4" /> Definir as regras</Link> : undefined}
    >
      {podeDefinir
        ? "Defina as faixas (por exemplo, R$ 300 ao bater 100% da meta) e o bônus de cada vendedor aparece aqui."
        : "Quando o dono definir as faixas, o bônus de cada vendedor aparece aqui."}
    </EstadoVazio>
  );
}

// ---------------------------------------------------------------------------------------------
// Gestão: o bônus de cada vendedor da loja
// ---------------------------------------------------------------------------------------------
/** O fechamento no cartão da gestão (mês que terminou): a leitura e o caminho para a tela do fechamento. */
export type FechamentoNoCartao = { leitura: LeituraDoBonus<FechamentoDoMes>; endereco: string; podeConferir: boolean; podeAprovar: boolean };

/** Onde está o fechamento do mês que terminou. Leitura que falhou não aparece aqui: a tela do fechamento explica. */
function SituacaoDoFechamento({ leitura, endereco, podeConferir, podeAprovar }: FechamentoNoCartao) {
  const link = (texto: string) => <Link href={endereco} className="font-semibold text-acao underline-offset-2 hover:underline">{texto}</Link>;
  if (leitura.estado === "falha") {
    return <Aviso tom="aviso" titulo="Não deu para ler o fechamento agora" className="mb-4">Os valores abaixo são os calculados; o aprovado pode ser outro. {link("Abrir o fechamento")}</Aviso>;
  }
  if (leitura.estado !== "ok") return null;
  const f = leitura.dados.fechamento;
  if (f === null) {
    return (
      <Aviso tom="info" titulo="O mês terminou" className="mb-4">
        {podeConferir ? "Confira o bônus de cada vendedor e envie o fechamento ao dono. " : "A gerência ainda não enviou o fechamento. "}
        {link(podeConferir ? "Conferir e enviar" : "Ver o fechamento")}
      </Aviso>
    );
  }
  if (f.situacao === "enviado") {
    return (
      <Aviso tom="aviso" titulo={podeAprovar ? "Fechamento à espera da sua aprovação" : "Fechamento com o dono"} className="mb-4">
        {`Enviado em ${dataEHora(f.enviadoEm)}. `}{link(podeAprovar ? "Decidir e aprovar" : "Ver o fechamento")}
      </Aviso>
    );
  }
  const diferente = f.totalAprovado !== f.totalCalculado;
  return (
    <Aviso tom="sucesso" titulo="Bônus aprovado" className="mb-4">
      {semQuebra(`O dono aprovou ${brl(f.totalAprovado ?? 0)} em ${dataEHora(f.aprovadoEm ?? f.enviadoEm)}${diferente ? ` (calculado: ${brl(f.totalCalculado)})` : ""}. `)}
      {diferente ? "Abaixo, os valores calculados; o que vale para o pagamento está no fechamento. " : ""}{link("Ver o fechamento")}
    </Aviso>
  );
}

export function BonusDaEquipe({ bonus, pessoas, mes, fase, aqui, enderecoDoExtrato, podeDefinir, fechamento = null, enderecoDoFechamento = null }: {
  bonus: LeituraDoBonus<BonusDoMes>;
  pessoas: readonly PessoaDasMetas[];
  mes: string;
  fase: FaseDoMes;
  aqui: string;
  enderecoDoExtrato: (vendedor: string) => string;
  podeDefinir: boolean;
  /** Mês que terminou (L9b): o fechamento da loja. */
  fechamento?: FechamentoNoCartao | null;
  /** Quem confere ou aprova o fechamento (L9b): o caminho para a tela dele. */
  enderecoDoFechamento?: string | null;
}) {
  const aprovado = fechamento?.leitura.estado === "ok" && fechamento.leitura.dados.fechamento?.situacao === "aprovado";
  const cartao = {
    id: "bonus", className: "mt-4", titulo: `Bônus de ${nomeDoMes(mes)}`, icone: Gift,
    subtitulo: `${aprovado ? "Fechado e aprovado pelo dono" : PROVISORIO}. Vale a maior faixa alcançada em cada medida; a meta da loja inteira não paga bônus.`,
    acao: podeDefinir || enderecoDoFechamento ? (
      <div className="flex flex-wrap gap-2">
        {enderecoDoFechamento && <Link href={enderecoDoFechamento} className={classeBotao("secundario", "sm")}><ClipboardCheck aria-hidden className="size-4" /> Fechamento</Link>}
        {podeDefinir && <Link href="/metas/bonus" className={classeBotao("secundario", "sm")}><Settings2 aria-hidden className="size-4" /> Regras do bônus</Link>}
      </div>
    ) : undefined,
  };
  if (bonus.estado !== "ok") return <Cartao {...cartao}><EstadoDoBonus leitura={bonus} aqui={aqui} /></Cartao>;
  const b = bonus.dados;
  const medidas = ORDEM_DAS_MEDIDAS.filter((m) => b.regras[m] !== undefined);
  if (medidas.length === 0) return <Cartao {...cartao}><SemRegra mes={mes} podeDefinir={podeDefinir} /></Cartao>;
  const nomes = new Map(pessoas.map((p) => [p.id, p.nome]));
  const linhas = [...b.vendedores].sort((x, y) => y.total - x.total || (nomes.get(x.vendedorId) ?? "").localeCompare(nomes.get(y.vendedorId) ?? "", "pt-BR"));
  const total = linhas.reduce((s, l) => s + l.total, 0);
  const comBonus = linhas.filter((l) => l.total > 0).length;
  return (
    <Cartao {...cartao} corpo="px-4 pb-2 pt-3 sm:px-5">
      {fechamento && <SituacaoDoFechamento {...fechamento} />}
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
        <div className="grid gap-3 sm:grid-cols-2">
          <Indicador rotulo={fase === "passado" ? "Bônus do mês" : "Bônus até agora"} valor={semQuebra(brl(total))} detalhe={aprovado ? "calculado" : PROVISORIO.toLowerCase()} icone={Gift} />
          <Indicador rotulo="Com bônus" valor={`${numero(comBonus)} de ${numero(linhas.length)}`} detalhe={linhas.length === 1 ? "vendedor" : "vendedores"} />
        </div>
        <div className="rounded-2xl border border-borda bg-white px-4 py-3">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-suave">Faixas que valem no mês</p>
          <RegrasDoMes bonus={b} mes={mes} />
        </div>
      </div>
      {linhas.length === 0 ? (
        <div className="mt-4"><EstadoVazio titulo="Ninguém com meta ou venda no mês" icone={Gift}>O bônus aparece para quem tem meta individual no mês.</EstadoVazio></div>
      ) : (
        <div className="mt-4">
          <ul className="divide-y divide-borda sm:hidden">
            {linhas.map((l) => (
              <li key={l.vendedorId} className="py-3">
                <div className="flex items-center gap-2.5">
                  <Avatar nome={nomes.get(l.vendedorId) ?? "?"} tamanho="size-8 text-xs" />
                  <span className="min-w-0 flex-1 truncate font-semibold">{nomes.get(l.vendedorId) ?? "Pessoa sem nome"}</span>
                  <span className="numeros shrink-0 font-bold">{brl(l.total)}</span>
                </div>
                <ul className="mt-1.5 space-y-0.5 pl-[2.625rem] text-sm">
                  {medidas.map((m) => <li key={m}><span className="text-suave">{`${MEDIDAS[m].curto}:`}</span> {textoCurtoDaMedida(m, l.medidas[m], fase === "passado")}</li>)}
                </ul>
                <Link href={enderecoDoExtrato(l.vendedorId)} className="mt-1 ml-[2.625rem] inline-flex min-h-9 items-center gap-1 text-sm font-semibold text-acao">
                  <ReceiptText aria-hidden className="size-4" /> Ver o extrato
                </Link>
              </li>
            ))}
          </ul>
          <div className="hidden sm:block">
          <Tabela colunas={["Vendedor", ...medidas.map((m) => MEDIDAS[m].curto), "Bônus", ""]} legenda={`Bônus de cada vendedor em ${nomeDoMes(mes)}`} minimo="min-w-[44rem]" alinharDireita={[medidas.length + 1]}>
            {linhas.map((l) => (
              <tr key={l.vendedorId}>
                <Celula>
                  <span className="flex items-center gap-2.5">
                    <Avatar nome={nomes.get(l.vendedorId) ?? "?"} tamanho="size-8 text-xs" />
                    <span className="min-w-0 truncate font-semibold">{nomes.get(l.vendedorId) ?? "Pessoa sem nome"}</span>
                  </span>
                </Celula>
                {medidas.map((m) => <CelulaDaMedida key={m} medida={m} conta={l.medidas[m]} terminou={fase === "passado"} />)}
                <Celula className="numeros text-right font-bold whitespace-nowrap">{brl(l.total)}</Celula>
                <Celula className="text-right">
                  <Link href={enderecoDoExtrato(l.vendedorId)} className="inline-flex items-center gap-1 whitespace-nowrap text-sm font-semibold text-acao hover:underline">
                    <ReceiptText aria-hidden className="size-4" /> Extrato
                  </Link>
                </Celula>
              </tr>
            ))}
          </Tabela>
          </div>
        </div>
      )}
    </Cartao>
  );
}

/** A medida em uma linha, para a lista do celular: "R$ 500,00 (faixa 2) · 124% da meta". */
export function textoCurtoDaMedida(medida: Medida, conta: ContaDaMedida | undefined, terminou: boolean): string {
  if (!conta || conta.meta === null) return "sem meta";
  const faixa = conta.faixa === null ? "nenhuma faixa" : `${brl(conta.bonus)} (faixa ${conta.faixa})`;
  const falta = conta.proxima ? ` · ${verboFaltar(medida, conta.proxima.falta, terminou).toLowerCase()} ${comUnidade(medida, conta.proxima.falta)}` : "";
  return semQuebra(`${faixa} · ${textoDoAtingido(conta)}${falta}`);
}

export function CelulaDaMedida({ medida, conta, terminou }: { medida: Medida; conta: ContaDaMedida | undefined; terminou: boolean }) {
  if (!conta || conta.meta === null) return <Celula className="text-suave">sem meta</Celula>;
  return (
    <Celula className="numeros">
      <span className="block whitespace-nowrap font-semibold">{conta.faixa === null ? "nenhuma faixa" : semQuebra(`${brl(conta.bonus)} · faixa ${conta.faixa}`)}</span>
      <span className="block text-xs text-suave">
        {semQuebra(`${textoDoAtingido(conta)}${conta.proxima ? ` · ${verboFaltar(medida, conta.proxima.falta, terminou).toLowerCase()} ${comUnidade(medida, conta.proxima.falta)}` : ""}`)}
      </span>
    </Celula>
  );
}

// ---------------------------------------------------------------------------------------------
// Vendedor: o próprio bônus
// ---------------------------------------------------------------------------------------------
export function MeuBonus({ bonus, eu, mes, fase, aqui, enderecoDoExtrato, fechamento = null }: {
  bonus: LeituraDoBonus<BonusDoMes>;
  eu: string;
  mes: string;
  fase: FaseDoMes;
  aqui: string;
  enderecoDoExtrato: string;
  /** Mês que terminou (L9b): a própria linha do fechamento, se já foi enviada. */
  fechamento?: LeituraDoBonus<FechamentoDoMes> | null;
}) {
  const fechada = linhaDoVendedor(fechamento?.estado === "ok" ? fechamento.dados : null, eu);
  const aprovado = fechada?.totalAprovado ?? null;
  const cartao = {
    className: "mt-4", titulo: `Meu bônus em ${nomeDoMes(mes)}`, icone: Gift,
    subtitulo: `${aprovado !== null ? "Aprovado pelo dono" : fechada ? "Em aprovação pelo dono" : PROVISORIO}. Só você e a gerência veem o seu bônus.`,
    acao: <Link href={enderecoDoExtrato} className={classeBotao("secundario", "sm")}><ReceiptText aria-hidden className="size-4" /> Extrato</Link>,
  };
  if (bonus.estado !== "ok") return <Cartao {...cartao}><EstadoDoBonus leitura={bonus} aqui={aqui} /></Cartao>;
  const b = bonus.dados;
  const medidas = ORDEM_DAS_MEDIDAS.filter((m) => b.regras[m] !== undefined);
  if (medidas.length === 0) return <Cartao {...cartao}><SemRegra mes={mes} podeDefinir={false} /></Cartao>;
  const minha: BonusDoVendedor = b.vendedores.find((v) => v.vendedorId === eu) ?? {
    vendedorId: eu, total: 0,
    medidas: Object.fromEntries(medidas.map((m) => [m, contaDaMedida(null, 0, b.regras[m]?.faixas ?? [])])),
  };
  return (
    <Cartao {...cartao}>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm text-suave">{aprovado !== null ? "Bônus aprovado" : fase === "passado" ? "Bônus do mês" : "Bônus até agora"}</p>
          <p className="numeros text-3xl font-bold tracking-tight">{brl(aprovado ?? minha.total)}</p>
          {fechada && <p className="text-xs text-suave">{fechada.aprovadoEm ? `Aprovado em ${dataEHora(fechada.aprovadoEm)}` : "O fechamento está com o dono para aprovação"}</p>}
        </div>
        <p className="max-w-md text-sm text-suave">Vale a maior faixa alcançada em cada medida. A venda conta quando é concluída; devolução e cancelamento descontam no mês em que acontecem.</p>
      </div>
      {fechada?.ajusteMotivo && (
        <Aviso tom="info" titulo="O dono aprovou outro valor" className="mt-4">{semQuebra(`${fechada.ajusteMotivo} (calculado: ${brl(fechada.totalCalculado)}).`)}</Aviso>
      )}
      {fechamento?.estado === "falha" && (
        <Aviso tom="aviso" titulo="Não deu para ler o fechamento agora" className="mt-4">O valor acima é o calculado; o aprovado pelo dono pode ser outro. Tente de novo em instantes.</Aviso>
      )}
      <ul className="mt-5 grid gap-5 md:grid-cols-2">
        {medidas.map((m) => (
          <MedidaDoBonus key={m} medida={m} conta={minha.medidas[m] ?? contaDaMedida(null, 0, [])} faixas={b.regras[m]?.faixas ?? []} terminou={fase === "passado"} />
        ))}
      </ul>
    </Cartao>
  );
}

/** Uma medida do bônus: a régua, a frase e as faixas, com a alcançada marcada. */
export function MedidaDoBonus({ medida, conta, faixas, terminou }: { medida: Medida; conta: ContaDaMedida; faixas: readonly Faixa[]; terminou: boolean }) {
  const atingido = atingidoDaConta(conta);
  return (
    <li className="min-w-0 rounded-2xl border border-borda px-4 py-3">
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <span className="font-semibold">{MEDIDAS[medida].nome}</span>
        <span className="numeros shrink-0 font-bold">{brl(conta.bonus)}</span>
      </div>
      {atingido !== null && <ReguaDoBonus atingido={atingido} faixas={faixas} alcancada={conta.faixa} rotulo={MEDIDAS[medida].nome} />}
      <p className="mt-1 text-sm">{semQuebra(fraseDaConta(medida, conta, faixas, terminou))}</p>
      {conta.meta !== null && <p className="text-xs text-suave numeros">{`${formatarMedida(medida, conta.realizado)} de ${comUnidade(medida, conta.meta)} · ${textoDoAtingido(conta)}`}</p>}
      <ol className="mt-2 space-y-1 text-sm">
        {faixas.map((f, i) => {
          const alcancou = conta.faixa !== null && i < conta.faixa;
          return (
            <li key={f.aPartirDe} className={`flex items-center gap-2 ${alcancou ? "" : "text-suave"}`}>
              <span aria-hidden className={`grid size-5 shrink-0 place-items-center rounded-full text-[11px] font-bold ${alcancou ? "bg-serie-1 text-white" : "bg-grade text-suave"}`}>
                {alcancou ? <Check className="size-3" /> : i + 1}
              </span>
              <span className="numeros">{`${porcentagemDaMeta(f.aPartirDe)}: ${brl(f.valor)}`}</span>
              {alcancou && <span className="sr-only">(alcançada)</span>}
            </li>
          );
        })}
      </ol>
    </li>
  );
}

/** O texto curto do ComoConta das metas, agora que o bônus existe (L9a). */
export function ComoOBonusConta() {
  return (
    <Aviso titulo="Como o bônus conta">
      A Ora paga bônus a quem bate a meta do mês (não há comissão por venda). As faixas são do dono e valem para toda a rede: em cada medida
      vale a maior faixa alcançada, e só conta a meta individual de cada vendedor. A venda conta quando é concluída, inclusive a financiada;
      devolução e cancelamento descontam no mês em que acontecem. O valor é provisório até o fechamento do mês.
    </Aviso>
  );
}
