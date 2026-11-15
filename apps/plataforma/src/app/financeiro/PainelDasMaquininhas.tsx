import { CreditCard } from "lucide-react";

import { BarrasHorizontais, TabelaDoGrafico } from "../../componentes/graficos";
import { EstadoDoPainel, plural } from "../../componentes/paineis-de-vendas";
import { Cartao, EstadoVazio } from "../../componentes/ui";
import type { PagamentosDoTerminal } from "../../lib/financeiro/terminais";
import { brl, numero } from "../../lib/formato";
import type { Leitura } from "../../lib/leitura-do-banco";

const PROVEDORES = { picpay: "PicPay", pagbank: "PagBank" } as const;

// REPORT-005b: cada maquininha com os pagamentos do período (a data do registro, como o resto do financeiro), quanto já
// foi conciliado com o extrato e o líquido que caiu na conta (a diferença é a observada no extrato, não a taxa do
// contrato); os estornados à parte. Os números vêm somados do banco, com o RLS de quem pede.
export function PainelDasMaquininhas({ leitura, nomeDaLoja, daRede, aqui }: {
  leitura: Leitura<PagamentosDoTerminal[]>; nomeDaLoja: (id: string) => string; daRede: boolean; aqui: string;
}) {
  const cartao = {
    titulo: "Pagamentos por maquininha", icone: CreditCard,
    subtitulo: "Cartão e Pix nas maquininhas, pela data do registro. Conciliado é o que já foi conferido com o extrato",
  };
  if (leitura.estado !== "ok") return <Cartao {...cartao}><EstadoDoPainel estado={leitura.estado} tentarDeNovo={aqui} /></Cartao>;
  const lista = leitura.dados;
  if (lista.length === 0) {
    return (
      <Cartao {...cartao}>
        <EstadoVazio titulo="Nenhum pagamento em maquininha no período" icone={CreditCard}>A leitura está funcionando; nenhum cartão ou Pix de maquininha foi registrado.</EstadoVazio>
      </Cartao>
    );
  }
  const nome = (t: PagamentosDoTerminal) => (daRede ? `${t.apelido} · ${nomeDaLoja(t.unidade)}` : t.apelido);
  const comValor = lista.filter((t) => t.valor > 0);
  return (
    <Cartao {...cartao}>
      {comValor.length > 0 && (
        <BarrasHorizontais nomeSerie="Recebido" formatar={brl} dados={comValor.map((t) => ({ rotulo: nome(t), valor: t.valor, detalhe: <span className="hidden sm:inline">{plural(t.quantidade, "pagamento", "pagamentos")}</span> }))} />
      )}
      <TabelaDoGrafico
        titulo="Ver as maquininhas em tabela"
        colunas={["Maquininha", ...(daRede ? ["Loja"] : []), "Provedor e número", "Pagamentos", "Recebido", "Conciliado", "A conciliar", "Líquido na conta", "Estornados"]}
        linhas={lista.map((t) => [
          `${t.apelido}${t.ativo ? "" : " (desativada)"}`, ...(daRede ? [nomeDaLoja(t.unidade)] : []), `${PROVEDORES[t.provedor]} ${t.identificador}`, numero(t.quantidade),
          brl(t.valor), brl(t.conciliado), brl(t.valor - t.conciliado), brl(t.liquido), t.estornados > 0 ? `${numero(t.estornados)} (${brl(t.estornado)})` : "—",
        ])}
      />
    </Cartao>
  );
}
