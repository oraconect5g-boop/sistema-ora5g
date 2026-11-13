import { Users } from "lucide-react";

import { BarrasHorizontais, TabelaDoGrafico } from "../../componentes/graficos";
import { EstadoDoPainel, NOTA, NUMERO_PRINCIPAL, plural } from "../../componentes/paineis-de-vendas";
import { Cartao, EstadoVazio } from "../../componentes/ui";
import { papeisDaTela, type EquipePorPapel } from "../../lib/equipe/painel";
import { numero } from "../../lib/formato";
import type { Leitura } from "../../lib/leitura-do-banco";

// Pessoas por papel (lote G5: linha 7 da matriz, U1). Só apresentação: a contagem chega somada no banco
// (public.equipe_por_papel), com o estado da leitura; falha nunca vira zero. Barras separadas, não uma
// barra dividida em partes: quem tem dois papéis conta nos dois, e as partes não somam o total.
export function PessoasPorPapel({ equipe, aqui }: { equipe: Leitura<EquipePorPapel>; aqui: string }) {
  const cartao = {
    titulo: "Pessoas por papel", icone: Users,
    subtitulo: "Acessos que valem agora nesta rede. Quem tem duas funções conta nas duas; o total conta cada pessoa uma vez.",
  };
  if (equipe.estado !== "ok") return <Cartao {...cartao}><EstadoDoPainel estado={equipe.estado} fonte="equipe" tentarDeNovo={aqui} /></Cartao>;
  const e = equipe.dados;
  if (e.pessoas === 0) {
    return <Cartao {...cartao}><EstadoVazio titulo="Ninguém com acesso nesta rede" icone={Users}>A leitura está funcionando; convide a primeira pessoa abaixo.</EstadoVazio></Cartao>;
  }
  const papeis = papeisDaTela(e);
  const comBloqueio = (p: { bloqueadas: number }) => (p.bloqueadas > 0 ? plural(p.bloqueadas, "bloqueada", "bloqueadas") : undefined);
  return (
    <Cartao {...cartao}>
      <p className={NUMERO_PRINCIPAL}>{numero(e.pessoas)}</p>
      <p className={`mb-4 ${NOTA}`}>{e.pessoas === 1 ? "pessoa com acesso" : "pessoas com acesso"}{e.bloqueadas > 0 ? ` · ${plural(e.bloqueadas, "bloqueada", "bloqueadas")} (o acesso segue registrado, mas não entra)` : ""}</p>
      <BarrasHorizontais
        nomeSerie="Pessoas" formatar={numero} maximo={e.pessoas}
        dados={papeis.map((p) => ({ rotulo: p.nome, valor: p.pessoas, detalhe: comBloqueio(p) }))}
      />
      <TabelaDoGrafico colunas={["Papel", "Pessoas", "Bloqueadas"]} linhas={papeis.map((p) => [p.nome, numero(p.pessoas), numero(p.bloqueadas)])} />
    </Cartao>
  );
}
