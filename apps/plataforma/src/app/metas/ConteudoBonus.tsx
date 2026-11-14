import { Check, Gift, ReceiptText, Settings2 } from "lucide-react";
import Link from "next/link";

import { ReguaDoBonus } from "../../componentes/graficos";
import { EstadoDoPainel } from "../../componentes/paineis-de-vendas";
import { Aviso, Avatar, Cartao, Celula, classeBotao, EstadoVazio, Indicador, Tabela } from "../../componentes/ui";
import type { LeituraDoBonus } from "../../lib/bonus/consulta";
import {
  contaDaMedida, fraseDaConta, porcentagemDaMeta, resumoDasFaixas, verboFaltar, type BonusDoMes, type BonusDoVendedor, type ContaDaMedida, type Faixa,
} from "../../lib/bonus/regras";
import { brl, numero, percentual } from "../../lib/formato";
import { comUnidade, formatarMedida, MEDIDAS, nomeDoMes, ORDEM_DAS_MEDIDAS, type FaseDoMes, type Medida, type PessoaDasMetas } from "../../lib/metas/painel";

// Bônus por meta (lote L9a). Só apresentação: os números chegam lidos e conferidos por lib/bonus (a
// conta do banco é refeita lá; o que não fecha vira falha, nunca bônus). A gestão vê o bônus de cada
// vendedor da loja; o vendedor, só o próprio. Tudo provisório até o fechamento do mês (lote L9b).

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

function EstadoDoBonus({ leitura, aqui }: { leitura: Exclude<LeituraDoBonus<unknown>, { estado: "ok" }>; aqui: string }) {
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
export function BonusDaEquipe({ bonus, pessoas, mes, fase, aqui, enderecoDoExtrato, podeDefinir }: {
  bonus: LeituraDoBonus<BonusDoMes>;
  pessoas: readonly PessoaDasMetas[];
  mes: string;
  fase: FaseDoMes;
  aqui: string;
  enderecoDoExtrato: (vendedor: string) => string;
  podeDefinir: boolean;
}) {
  const cartao = {
    id: "bonus", className: "mt-4", titulo: `Bônus de ${nomeDoMes(mes)}`, icone: Gift,
    subtitulo: `${PROVISORIO}. Vale a maior faixa alcançada em cada medida; a meta da loja inteira não paga bônus.`,
    acao: podeDefinir ? <Link href="/metas/bonus" className={classeBotao("secundario", "sm")}><Settings2 aria-hidden className="size-4" /> Regras do bônus</Link> : undefined,
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
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
        <div className="grid grid-cols-2 gap-3">
          <Indicador rotulo={fase === "passado" ? "Bônus do mês" : "Bônus até agora"} valor={brl(total)} detalhe={PROVISORIO.toLowerCase()} icone={Gift} />
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
function textoCurtoDaMedida(medida: Medida, conta: ContaDaMedida | undefined, terminou: boolean): string {
  if (!conta || conta.meta === null) return "sem meta";
  const faixa = conta.faixa === null ? "nenhuma faixa" : `${brl(conta.bonus)} (faixa ${conta.faixa})`;
  const falta = conta.proxima ? ` · ${verboFaltar(medida, conta.proxima.falta, terminou).toLowerCase()} ${comUnidade(medida, conta.proxima.falta)}` : "";
  return semQuebra(`${faixa} · ${textoDoAtingido(conta)}${falta}`);
}

function CelulaDaMedida({ medida, conta, terminou }: { medida: Medida; conta: ContaDaMedida | undefined; terminou: boolean }) {
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
export function MeuBonus({ bonus, eu, mes, fase, aqui, enderecoDoExtrato }: {
  bonus: LeituraDoBonus<BonusDoMes>;
  eu: string;
  mes: string;
  fase: FaseDoMes;
  aqui: string;
  enderecoDoExtrato: string;
}) {
  const cartao = {
    className: "mt-4", titulo: `Meu bônus em ${nomeDoMes(mes)}`, icone: Gift, subtitulo: `${PROVISORIO}. Só você e a gerência veem o seu bônus.`,
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
          <p className="text-sm text-suave">{fase === "passado" ? "Bônus do mês" : "Bônus até agora"}</p>
          <p className="numeros text-3xl font-bold tracking-tight">{brl(minha.total)}</p>
        </div>
        <p className="max-w-md text-sm text-suave">Vale a maior faixa alcançada em cada medida. A venda conta quando é concluída; devolução e cancelamento descontam no mês em que acontecem.</p>
      </div>
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
