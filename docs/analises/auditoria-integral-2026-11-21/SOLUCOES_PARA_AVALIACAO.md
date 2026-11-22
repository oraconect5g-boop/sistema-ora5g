# Soluções viáveis para avaliação do proprietário

Exemplos de desenho, não patches aplicados. Não instruem o Claude a copiar automaticamente estes trechos. A implementação precisa preservar contratos, permissões, estados e migrations atuais e passar pelas provas descritas.

## 1. Normalizar o formato defeituoso de número sem reabrir F18-01

O XML normal de um número usa ponto decimal. O arquivo da Rein possui rodapé com vírgula decimal em `t=n`. Um conversor separado pode reconhecer apenas a variante inequívoca com vírgula, sem reinterpretar `0.625` como 625:

```ts
type NumeroLido =
  | { ok: true; valor: number; origem: "xml" | "exportacao-br" }
  | { ok: false; motivo: "numero_invalido" };

function lerNumeroXml(texto: string): NumeroLido {
  const t = texto.trim();
  const xml = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/;
  const brasileiro = /^[+-]?(?:\d+|\d{1,3}(?:\.\d{3})+),\d+$/;
  const origem = xml.test(t) ? "xml" : brasileiro.test(t) ? "exportacao-br" : null;
  if (origem === null) return { ok: false, motivo: "numero_invalido" };
  const valor = Number(origem === "xml" ? t : t.replaceAll(".", "").replace(",", "."));
  return Number.isFinite(valor)
    ? { ok: true, valor, origem }
    : { ok: false, motivo: "numero_invalido" };
}
```

Este helper não decide sozinho que uma linha é total, nem converte preço em centavos. Somar e comparar continua sujeito a tolerância/precisão explícita; quantidade precisa ser inteiro seguro, preço exige regra de casas decimais; identidade do produto impede descarte automático. Registrar a normalização da exportação e manter o conteúdo bruto para auditoria. Alternativa segura: apresentar linha ambígua para exclusão explícita auditada; o teste do original e o requisito de 2.271 produtos devem refletir o contrato escolhido, sem simplesmente alterar a expectativa para 2.272.

## 2. Compartilhar o controle da utilização de um crédito

Proposta mínima: as duas RPCs existentes devem travar a mesma linha antes de decidir seu uso. Pseudocódigo SQL, não migration pronta:

```sql
-- Dentro da transação e depois de verificar organização/permissão:
select * into v_linha
from public.extrato_linhas
where id = p_linha
for update;

-- Para casar repasse: recusar linha conciliada/ignorada ou já alocada.
-- Para conciliar venda: recusar existência de marketplace_repasses.linha_id.
-- Repetição da MESMA operação retorna o resultado anterior.
-- Desfazer libera a alocação auditadamente; nunca apaga o extrato.
```

O `FOR UPDATE` precisa existir nos dois caminhos, com ordem de travas compatível, para não deixar uma janela entre consulta e gravação. Um desenho mais extensível cria uma tabela única de alocações do crédito, com soma alocada limitada ao valor disponível e dono da alocação (venda/repasse/outro). Isso serve para depósitos agrupados futuros, mas é mais trabalho que a correção pontual. Escolher pelo escopo imediato e testar concorrência em PostgreSQL, não só PGlite.

## 3. Publicação verificável sem autorreferência de commit

Gerar após a publicação um registro externo ao commit da aplicação:

```ts
type EntregaVerificada = {
  requisito: string;
  lote: string;
  commit: string;
  ciRunUrl: string;
  migrations: string[];
  ambiente: "homologacao" | "producao";
  dominio: string;
  build: string;
  provaFuncional: string;
  aceite: "pendente" | "aceito" | "rejeitado";
};
```

O SHA vem do artefato publicado; a conferência compara `/saude/versao` e a versão esperada. Só marcar entrega publicada após conferir o domínio; só marcar requisito homologado após seus critérios completos. Assim o próximo commit de documentação não faz parecer que a versão anterior está errada.

## 4. Ganho de velocidade sem reescrever a stack

- Reutilizar componentes reais de gráficos, consultas e filtros por loja em vez de copiar fixtures da demo.
- Criar cenários de teste reproduzíveis em banco isolado para caixa/transferência/financeiro; separar teste de leitura dos que consomem estoque.
- Reutilizar outbox/worker, estados idempotentes e contratos de adaptadores para APIs oficiais; manter resposta desconhecida como pendente de reconsulta.
- Consolidar matriz de requisitos, dependências e publicação a partir de fontes estruturadas, com validações semânticas além da contagem de campos.
- Manter TypeScript/Next.js/Node 22/Supabase/PostgreSQL. Adicionar outra linguagem agora não reduz as dependências contratuais nem os bugs transacionais encontrados.
