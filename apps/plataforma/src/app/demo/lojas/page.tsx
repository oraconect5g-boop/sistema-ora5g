import { formatarBRL } from "@ora5g/dominio";

import { SemPermissao } from "../../../componentes/SemPermissao";
import { Aviso, Cartao, Celula, Selo, Tabela, TituloPagina } from "../../../componentes/ui";
import { LOJAS, UNIDADES_ESPECIAIS } from "../../../demo/dados";
import { acessoDaPagina } from "../../../demo/sessao";

export default async function Lojas() {
  const { perfil, permitido } = await acessoDaPagina("lojas");
  if (!permitido) return <SemPermissao perfil={perfil} pagina="Lojas e usuários" />;
  return (
    <>
      <TituloPagina titulo="Lojas e usuários" subtitulo="Empresa com CNPJ raiz e uma filial por loja" />
      <Cartao titulo="Unidades" subtitulo="Nomes das lojas 02 a 14 aguardam a lista oficial">
        <Tabela colunas={["Unidade", "Tipo", "Vendas hoje", "Situação"]} legenda="Unidades da rede">
          {LOJAS.map((l) => (
            <tr key={l.codigo}>
              <Celula>{l.nome}{l.piloto && <span className="ml-2"><Selo tom="info">Piloto</Selo></span>}</Celula>
              <Celula>Loja física</Celula>
              <Celula>{formatarBRL(l.vendasHoje)}</Celula>
              <Celula><Selo tom={l.situacao === "Acima da meta" ? "sucesso" : l.situacao === "Em progresso" ? "info" : "aviso"}>{l.situacao}</Selo></Celula>
            </tr>
          ))}
          {UNIDADES_ESPECIAIS.map((u) => (
            <tr key={u.nome}><Celula>{u.nome}</Celula><Celula>{u.tipo}</Celula><Celula className="text-suave">—</Celula><Celula className="text-suave">{u.observacao}</Celula></tr>
          ))}
        </Tabela>
      </Cartao>
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Cartao titulo="Vínculos (exemplo)" subtitulo="Um vendedor pode trabalhar em várias lojas">
          <ul className="space-y-2 text-sm">
            <li>Ana · vendedora · Santa Cândida</li>
            <li>Lucas · vendedor · Santa Cândida e Loja 03</li>
            <li>Rafael · vendedor · Santa Cândida e Loja 07</li>
          </ul>
        </Cartao>
        <Aviso titulo="Já pronto no banco">Empresas, unidades com CNPJ validado, papéis, vínculos com vigência, escolha da loja na sessão e auditoria imutável estão no banco de desenvolvimento, com 33 testes de permissão.</Aviso>
      </div>
    </>
  );
}
