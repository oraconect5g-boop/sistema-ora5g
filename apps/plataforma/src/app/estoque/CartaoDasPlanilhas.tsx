import { FileSpreadsheet } from "lucide-react";

import { Cartao } from "../../componentes/ui";
import { LinksDaPlanilha } from "./LinksDaPlanilha";

// As planilhas do recorte do painel do estoque (lote FIN-009b), com todas as linhas (lib/estoque/planilha). `loja` é o
// recorte escolhido ("rede" ou um local) de quem consulta mais de um local; nulo, a rota usa a loja do turno.
export function CartaoDasPlanilhas({ loja }: { loja: string | null }) {
  return (
    <Cartao titulo="Planilhas do estoque" subtitulo="Todas as linhas deste recorte. No Excel, o IMEI e o ICCID saem inteiros; o CSV é para outros sistemas." icone={FileSpreadsheet} className="mt-4">
      <ul className="divide-y divide-borda text-sm">
        <li className="flex flex-wrap items-center justify-between gap-2 py-2">
          <span className="min-w-0"><span className="font-medium">Saldo por produto</span><span className="block text-xs text-suave">Físico, reservado, disponível e mínimo de cada produto em cada local</span></span>
          <LinksDaPlanilha parte="saldo" loja={loja} rotulo="Saldo" />
        </li>
        <li className="flex flex-wrap items-center justify-between gap-2 py-2">
          <span className="min-w-0"><span className="font-medium">Aparelhos e chips</span><span className="block text-xs text-suave">IMEI, ICCID, situação, condição e a última conferência de cada item</span></span>
          <LinksDaPlanilha parte="itens" loja={loja} rotulo="Aparelhos e chips" />
        </li>
      </ul>
    </Cartao>
  );
}
