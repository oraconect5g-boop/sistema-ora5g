import { imeiValido, lerReais } from "@ora5g/dominio";

import { SemPermissao } from "../../../componentes/SemPermissao";
import { Aviso, Cartao, Celula, Indicador, Selo, Tabela, TituloPagina } from "../../../componentes/ui";
import { LINHAS_CSV_REIN } from "../../../demo/dados";
import { acessoDaPagina } from "../../../demo/sessao";

// Prévia do importador (ORA-009): as linhas são conferidas pelas regras de negócio reais.
function conferirLinhas() {
  const vistos = new Map<string, number>();
  return LINHAS_CSV_REIN.map((l) => {
    const problemas: string[] = [];
    try { lerReais(l.preco); } catch { problemas.push("Preço inválido"); }
    if (l.custo.trim() === "") problemas.push("Sem custo: o limite de desconto por margem não funciona");
    if (l.imei) {
      if (!imeiValido(l.imei)) problemas.push("IMEI com dígito verificador inválido");
      const anterior = vistos.get(l.imei);
      if (anterior) problemas.push(`IMEI repetido (linha ${anterior})`);
      else vistos.set(l.imei, l.linha);
    }
    return { ...l, problemas };
  });
}

export default async function Importacao() {
  const { perfil, permitido } = await acessoDaPagina("importacao");
  if (!permitido) return <SemPermissao perfil={perfil} pagina="Importar CSV da Rein" />;
  const linhas = conferirLinhas();
  const comErro = linhas.filter((l) => l.problemas.length > 0).length;
  return (
    <>
      <TituloPagina titulo="Importar estoque da Rein (prévia)" subtitulo="Só por arquivo, nunca pela API da Rein. Nada é gravado até o dono aprovar." />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Indicador rotulo="Linhas lidas" valor={String(linhas.length)} />
        <Indicador rotulo="Prontas" valor={String(linhas.length - comErro)} tom="bom" />
        <Indicador rotulo="Com problema" valor={String(comErro)} tom="atencao" />
        <Indicador rotulo="Aprovação" valor="Dono" detalhe="Administrador executa" />
      </div>
      <Cartao titulo="Prévia do arquivo (exemplo)" subtitulo="Formato real a confirmar quando o CSV da Santa Cândida chegar" className="mt-4">
        <Tabela colunas={["Linha", "SKU", "Produto", "Preço", "Custo", "Qtd.", "Conferência"]} legenda="Prévia da importação">
          {linhas.map((l) => (
            <tr key={l.linha}>
              <Celula>{l.linha}</Celula><Celula>{l.sku}</Celula><Celula>{l.nome}</Celula><Celula>R$ {l.preco}</Celula>
              <Celula>{l.custo ? `R$ ${l.custo}` : "—"}</Celula><Celula>{l.quantidade}</Celula>
              <Celula>{l.problemas.length === 0 ? <Selo tom="sucesso">Pronta</Selo> : l.problemas.map((p) => <span key={p} className="mb-1 block"><Selo tom="perigo">{p}</Selo></span>)}</Celula>
            </tr>
          ))}
        </Tabela>
      </Cartao>
      <div className="mt-4"><Aviso tom="aviso">Depois da importação, os IMEIs precisam ser conferidos fisicamente na loja antes de a Ora assumir o estoque.</Aviso></div>
    </>
  );
}
