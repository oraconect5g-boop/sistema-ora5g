import { formatarBRL } from "@ora5g/dominio";

import { SemPermissao } from "../../../componentes/SemPermissao";
import { Aviso, Cartao, Celula, Progresso, Tabela, TituloPagina } from "../../../componentes/ui";
import { VENDEDORES } from "../../../demo/dados";
import { acessoDaPagina } from "../../../demo/sessao";

export default async function Metas() {
  const { perfil, permitido } = await acessoDaPagina("metas");
  if (!permitido) return <SemPermissao perfil={perfil} pagina="Metas" />;
  // Vendedor vê só os próprios números até a decisão P3 (ranking com nomes ou só posição).
  const lista = perfil === "vendedor" ? VENDEDORES.slice(0, 1) : VENDEDORES;
  const ordenados = [...lista].sort((a, b) => b.vendido / b.meta - a.vendido / a.meta);
  return (
    <>
      <TituloPagina titulo="Metas e desempenho" subtitulo="Turno por loja, produção por categoria e meta do dia" />
      <Cartao titulo={perfil === "vendedor" ? "Minha produção" : "Equipe · Santa Cândida"} subtitulo="Chips, ativações, portabilidades, recargas e assistências contam">
        <Tabela colunas={["Vendedor", "Meta", "Aparelhos", "Acessórios", "Chips", "Ativações", "Portab.", "Recargas", "OS", "Dias / lojas no mês"]} legenda="Produção por vendedor">
          {ordenados.map((v) => {
            const pct = (v.vendido / v.meta) * 100;
            return (
              <tr key={v.nome}>
                <Celula><strong>{v.nome}</strong><span className="block text-xs text-suave">{formatarBRL(v.vendido)} de {formatarBRL(v.meta)}</span></Celula>
                <Celula className="min-w-28"><span className="text-xs font-semibold">{Math.round(pct)}%</span><Progresso valor={pct} rotulo={`Meta de ${v.nome}`} /></Celula>
                <Celula>{v.aparelhos}</Celula><Celula>{v.acessorios}</Celula><Celula>{v.chips}</Celula><Celula>{v.ativacoes}</Celula>
                <Celula>{v.portabilidades}</Celula><Celula>{v.recargas}</Celula><Celula>{v.assistencias}</Celula>
                <Celula className="text-suave">{v.diasNoMes} dias · {v.lojasNoMes.join(", ")}</Celula>
              </tr>
            );
          })}
        </Tabela>
      </Cartao>
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Aviso titulo="Incentivos em estudo">Extrato em tempo real, metas diárias, bônus por margem saudável e conquistas. As regras de comissão serão configuráveis pelos donos, com histórico.</Aviso>
        <Aviso tom="aviso" titulo="Decisão pendente">Os vendedores verão o ranking com o nome dos colegas ou só a própria posição? Nesta demonstração, o vendedor vê só os próprios números.</Aviso>
      </div>
    </>
  );
}
