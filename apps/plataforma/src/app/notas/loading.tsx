import { EsqueletoDeTela } from "../../componentes/EsqueletoDeTela";

// Aparece no instante do toque, enquanto o servidor monta a tela (lote VEL-a). Sem dado algum.
export default function CarregandoNotas() {
  return <EsqueletoDeTela rotulo="Carregando as notas fiscais" />;
}
