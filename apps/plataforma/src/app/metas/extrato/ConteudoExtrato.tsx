import { CircleSlash, Gift, ReceiptText, ShoppingBag, Signal, Undo2, type LucideIcon } from "lucide-react";

import { EstadoDoPainel } from "../../../componentes/paineis-de-vendas";
import { Aviso, Cartao, EstadoVazio } from "../../../componentes/ui";
import type { LeituraDoBonus } from "../../../lib/bonus/consulta";
import { dataEHora, linhaDoVendedor, type FechamentoDoMes } from "../../../lib/bonus/fechamento";
import { contaDaMedida, type BonusDoMes, type Efeito, type Extrato, type FatoDoExtrato, type ServicoDoConnect, type TipoDoFato } from "../../../lib/bonus/regras";
import { centavosCsv } from "../../../lib/csv";
import { brl, brlComSinal, numero } from "../../../lib/formato";
import { nomeDoMes, ORDEM_DAS_MEDIDAS, type FaseDoMes } from "../../../lib/metas/painel";
import { MedidaDoBonus, semQuebra } from "../ConteudoBonus";

// O extrato do bônus (lote L9a): cada fato do mês que conta para as metas do vendedor na loja, com o
// efeito em cada medida, e o bônus provisório. Só apresentação: os números chegam conferidos por
// lib/bonus (a soma das linhas é o total; o que não fecha vira falha).

const SERVICOS: Record<ServicoDoConnect, string> = { ativacao: "Ativação", recarga: "Recarga", portabilidade: "Portabilidade" };
const ICONES: Record<TipoDoFato, LucideIcon> = { venda: ShoppingBag, cancelamento: CircleSlash, devolucao: Undo2, connect: Signal };
const instante = (iso: string) => {
  const partes = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).formatToParts(new Date(iso));
  const p = (tipo: string) => partes.find((x) => x.type === tipo)?.value ?? "";
  return `${p("day")}/${p("month")} às ${p("hour")}:${p("minute")}`;
};
const instanteCsv = (iso: string) =>
  new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(iso)).replace(",", "");

/** "Venda nº 1.234", "Cancelamento da venda nº 1.230", "Devolução nº 7 da venda nº 1.200", "Ativação do Ora Connect nº 45". */
export function descricaoDoFato(f: FatoDoExtrato): string {
  const venda = `venda nº ${numero(f.venda ?? 0)}`;
  switch (f.tipo) {
    case "venda": return `Venda nº ${numero(f.venda ?? 0)}`;
    case "cancelamento": return `Cancelamento da ${venda}`;
    case "devolucao": return `Devolução nº ${numero(f.devolucao ?? 0)} da ${venda}`;
    case "connect": return `${SERVICOS[f.servico ?? "ativacao"]} do Ora Connect${f.operacao !== null ? ` nº ${numero(f.operacao)}` : ""}`;
  }
}
const sinal = (n: number) => (n > 0 ? "+" : n < 0 ? "−" : "");
/** Os efeitos que não são zero, em palavras: "+1 aparelho", "−R$ 79,00 em acessórios", "+1 Ora Connect". */
export function efeitosDoFato(e: Efeito): string[] {
  const partes: string[] = [];
  if (e.aparelhos !== 0) partes.push(`${sinal(e.aparelhos)}${numero(Math.abs(e.aparelhos))} ${Math.abs(e.aparelhos) === 1 ? "aparelho" : "aparelhos"}`);
  if (e.acessorios !== 0) partes.push(`${sinal(e.acessorios)}${brl(Math.abs(e.acessorios))} em acessórios`);
  if (e.connect !== 0) partes.push(`${sinal(e.connect)}${numero(Math.abs(e.connect))} Ora Connect`);
  return partes;
}

/** A planilha do extrato: uma linha por fato e o total (a mesma lista da tela). */
export function planilhaDoExtrato(e: Extrato): { colunas: string[]; linhas: (string | number)[][] } {
  return {
    colunas: ["Data", "Fato", "Vendido líquido (R$)", "Aparelhos", "Acessórios (R$)", "Ora Connect"],
    linhas: [
      ...e.linhas.map((f) => [instanteCsv(f.quando), descricaoDoFato(f), centavosCsv(f.efeito.vendido_liquido), f.efeito.aparelhos, centavosCsv(f.efeito.acessorios), f.efeito.connect]),
      ["Total do mês", "", centavosCsv(e.totais.vendido_liquido), e.totais.aparelhos, centavosCsv(e.totais.acessorios), e.totais.connect],
    ],
  };
}

export function ResumoDoBonus({ bonus, vendedor, mes, fase, aqui, fechamento = null }: {
  bonus: LeituraDoBonus<BonusDoMes>; vendedor: string; mes: string; fase: FaseDoMes; aqui: string;
  /** Mês que terminou (L9b): o fechamento da loja (a gestão) ou a própria linha (o vendedor). */
  fechamento?: LeituraDoBonus<FechamentoDoMes> | null;
}) {
  const fechada = linhaDoVendedor(fechamento?.estado === "ok" ? fechamento.dados : null, vendedor);
  const aprovado = fechada?.totalAprovado ?? null;
  const situacao = aprovado !== null && fechada?.aprovadoEm ? `Aprovado pelo dono em ${dataEHora(fechada.aprovadoEm)}` : fechada ? "Em aprovação pelo dono" : "Provisório até o fechamento do mês";
  const cartao = { titulo: `Bônus de ${nomeDoMes(mes)}`, icone: Gift, subtitulo: `${situacao}. Vale a maior faixa alcançada em cada medida.` };
  if (bonus.estado !== "ok") {
    return (
      <Cartao {...cartao}>
        {bonus.estado === "recusado"
          ? <EstadoDoPainel estado="sem_permissao" motivo="O banco recusou a leitura do bônus desta loja para o seu perfil." />
          : <EstadoDoPainel estado={bonus.estado} fonte="bonus" tentarDeNovo={aqui} />}
      </Cartao>
    );
  }
  const b = bonus.dados;
  const medidas = ORDEM_DAS_MEDIDAS.filter((m) => b.regras[m] !== undefined);
  if (medidas.length === 0) {
    return <Cartao {...cartao}><EstadoVazio titulo={`Nenhuma regra de bônus vale em ${nomeDoMes(mes)}`} icone={Gift}>Os fatos do mês estão abaixo; o bônus aparece quando o dono definir as faixas.</EstadoVazio></Cartao>;
  }
  const linha = b.vendedores.find((v) => v.vendedorId === vendedor);
  return (
    <Cartao {...cartao} acao={<span className="numeros text-xl font-bold">{brl(aprovado ?? linha?.total ?? 0)}</span>}>
      {fechada?.ajusteMotivo && (
        <Aviso tom="info" titulo="O dono aprovou outro valor" className="mb-4">{semQuebra(`${fechada.ajusteMotivo} (calculado: ${brl(fechada.totalCalculado)}).`)}</Aviso>
      )}
      {fechamento?.estado === "falha" && (
        <Aviso tom="aviso" titulo="Não deu para ler o fechamento agora" className="mb-4">O valor acima é o calculado; o aprovado pelo dono pode ser outro. Tente de novo em instantes.</Aviso>
      )}
      <ul className="grid gap-4 md:grid-cols-2">
        {medidas.map((m) => (
          <MedidaDoBonus key={m} medida={m} conta={linha?.medidas[m] ?? contaDaMedida(null, 0, [])} faixas={b.regras[m]?.faixas ?? []} terminou={fase === "passado"} />
        ))}
      </ul>
    </Cartao>
  );
}

export function FatosDoMes({ extrato, mes, aqui }: { extrato: LeituraDoBonus<Extrato>; mes: string; aqui: string }) {
  const cartao = { titulo: "Fatos do mês", icone: ReceiptText, subtitulo: "Do mais recente para o mais antigo, no horário de São Paulo. Cada fato no mês em que aconteceu." };
  if (extrato.estado !== "ok") {
    return (
      <Cartao {...cartao}>
        {extrato.estado === "recusado"
          ? <EstadoDoPainel estado="sem_permissao" motivo="O banco recusou este extrato: o vendedor vê só o próprio, e a gerência, o da equipe da loja dela." />
          : <EstadoDoPainel estado={extrato.estado} fonte="bonus" tentarDeNovo={aqui} />}
      </Cartao>
    );
  }
  const e = extrato.dados;
  return (
    <Cartao {...cartao} corpo="px-4 pb-4 pt-3 sm:px-5">
      {e.linhas.length === 0 ? (
        <EstadoVazio titulo={`Nenhum fato em ${nomeDoMes(mes)}`} icone={ReceiptText}>Vendas concluídas, cancelamentos, devoluções e operações do Ora Connect confirmadas aparecem aqui.</EstadoVazio>
      ) : (
        <>
          {e.quantidade > e.linhas.length && (
            <p className="mb-3 text-sm text-suave">{`Mostrando os ${numero(e.linhas.length)} fatos mais recentes de ${numero(e.quantidade)}; os totais somam todos.`}</p>
          )}
          <ol className="divide-y divide-borda">
            {e.linhas.map((f, i) => {
              const Icone = ICONES[f.tipo];
              const efeitos = efeitosDoFato(f.efeito);
              const negativo = f.tipo === "cancelamento" || f.tipo === "devolucao";
              return (
                <li key={i} className="flex items-start gap-3 py-3">
                  <span aria-hidden className={`mt-0.5 grid size-9 shrink-0 place-items-center rounded-full ${negativo ? "bg-perigo-clara text-perigo" : "bg-acao/10 text-acao"}`}>
                    <Icone className="size-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold">{descricaoDoFato(f)}</p>
                    <p className="text-xs text-suave numeros">{instante(f.quando)}</p>
                    {efeitos.length > 0 && <p className="mt-0.5 text-sm text-suave numeros">{semQuebra(efeitos.join(" · "))}</p>}
                  </div>
                  {f.efeito.vendido_liquido !== 0 && (
                    <span className={`numeros shrink-0 text-right font-semibold ${negativo ? "text-perigo" : ""}`}>{`${f.efeito.vendido_liquido > 0 ? "+" : ""}${brlComSinal(f.efeito.vendido_liquido)}`}</span>
                  )}
                </li>
              );
            })}
          </ol>
          <div className="mt-2 rounded-xl bg-slate-50 px-4 py-3 text-sm">
            <p className="font-semibold">Total do mês</p>
            <p className="numeros">
              {semQuebra(`Vendido líquido ${brlComSinal(e.totais.vendido_liquido)} · ${numero(e.totais.aparelhos)} ${Math.abs(e.totais.aparelhos) === 1 ? "aparelho" : "aparelhos"} · ${brlComSinal(e.totais.acessorios)} em acessórios · ${numero(e.totais.connect)} Ora Connect`)}
            </p>
            <p className="mt-1 text-xs text-suave">É o realizado das metas no mês: os mesmos números da tela de Metas.</p>
          </div>
        </>
      )}
    </Cartao>
  );
}
