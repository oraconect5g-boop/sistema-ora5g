import { EsqueletoDeTela } from "../../componentes/EsqueletoDeTela";

// Aparece no instante do toque, enquanto o servidor monta a tela. Sem dado algum.
export default function CarregandoEntregas() {
  return <EsqueletoDeTela rotulo="Carregando as entregas do projeto" largura="max-w-5xl" />;
}
