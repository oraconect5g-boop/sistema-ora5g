# Node e aceleração — propostas para avaliação do proprietário

**Recomendação: manter a stack.** Node é runtime de JavaScript; o projeto já usa TypeScript, Next.js/React e PostgreSQL. `package.json` pede Node `>=22.12.0 <23`; a revisão utilizou 22.23.4. Os workers existentes já atendem integrações fora da requisição web. Não falta “adicionar Node”. Faltam dados operacionais, jornadas, adapters/serviços e contratos/habilitações. Nenhuma medida demonstrou que a linguagem seja o impedimento principal.

| Alternativa | Benefício possível | Custo/limite neste projeto |
|---|---|---|
| TypeScript/Node e workers atuais | Regras, tipos, testes e bibliotecas compartilhados | Menor retrabalho; medir tarefas pesadas e limitar concorrência |
| Python em novo backend | Ecossistema ETL/análise em necessidade específica comprovada | Outro deploy, contratos/Auth/testes/observabilidade; não acelera checkout automaticamente |
| Go em serviço específico | Concorrência/consumo previsíveis em gargalo medido | Interop e implantação adicionais; gargalo dessa natureza não demonstrado |
| Bun ou Deno | Características próprias de runtime/ferramentas | Validar Next, dependências nativas, banco de testes e servidor; não elimina trabalho de negócio |
| Plataforma pronta de comércio | Vitrine/checkout isolados potencialmente mais rápidos | Outro catálogo/estoque/pagamento e integração; exige decisão de produto/custo, não adoção silenciosa |

## Onde há ganho viável

1. Reutilizar gráficos/RPCs e preencher dados/testar perfis, em vez de redesenhar painéis já implementados.
2. Estender importador para arquivo integral e saldo por local; lotes determinísticos com prévia global. Lotes não corrigem sozinhos parser, conciliação ou idempotência.
3. Reutilizar worker/fila/reconsulta para canais, preservando cada contrato. Evitar PDV/estoque/financeiro paralelo por parceiro.
4. Separar grupos independentes no CI e usar cache de dependências, mantendo todos os testes obrigatórios. Reversões que recriam bancos cumulativamente são candidatas a otimização de fixtures/snapshots isolados. O CI final já passou com 30 minutos; preservar os 8 s funcionais da importação.
5. Automatizar evidência de release por SHA e tela de entregas. O verificador atual já foi corrigido; evitar segundo mecanismo divergente.

## Código ilustrativo: chave de evento externo

**Somente para avaliação; não aplicado e não é ordem para o Claude adotar.** A função cria identidade determinística com escopos separados. Não autentica webhook nem substitui constraint/transação.

```typescript
import { createHash } from "node:crypto";

type IdentidadeExterna = {
  organizacao: string;
  canal: string;
  conta: string;
  evento: string;
};

export function chaveDeEvento(e: IdentidadeExterna): string {
  const partes = [e.organizacao, e.canal, e.conta, e.evento];
  if (partes.some(p => typeof p !== "string" || p.length === 0)) {
    throw new Error("Identidade externa incompleta");
  }
  // Não alterar caracteres dos IDs oficiais sem contrato.
  return createHash("sha256")
    .update(JSON.stringify(["ora:evento:v1", ...partes]))
    .digest("hex");
}
```

Após autenticar/validar conforme o parceiro, uma inbox poderia persistir envelope mínimo com unicidade organização/canal/conta/evento. Mesmo ID com conteúdo incompatível exige conflito auditável. Eventos distintos podem representar uma operação: também são necessárias chaves de negócio na venda/pagamento. Persistir evento não garante “exatamente uma vez” entre sistemas; timeout exige reconsulta/reconciliação e idempotência que o parceiro suporte. Não incluir dados pessoais na chave.

## Código ilustrativo: evidência de etapa

```typescript
type EvidenciaDaEtapa = {
  ids: readonly string[];
  commit: string;
  ci: { url: string; resultado: "aprovado" | "reprovado" | "pendente" };
  banco: { migrations: readonly string[]; conferidoEm: string | null };
  publicado: { url: string; shaObservado: string; em: string } | null;
  jornadas: readonly {
    nome: string;
    resultado: "passou" | "falhou" | "nao_executada";
  }[];
  homologadoEm: string | null;
};
```

Ilustra como evitar um único status ambíguo “feito”. Adaptar ao checkpoint existente dependeria de coleta confiável/permissão; não criar segundo cadastro manual. Não armazenar segredos ou payloads pessoais na página pública.

Os exemplos anteriores de cache/SHA e o protocolo de fotos já têm correções próprias implementadas pelo Claude; não pedir duplicação só porque propostas continuam no histórico. Nenhum trecho deste documento foi implantado ou homologado como integração. A aceleração recomendada vem de concluir fluxos existentes e verificar cada publicação, não de uma reescrita.
