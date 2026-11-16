# Soluções com código — somente para avaliação do proprietário

Estas propostas mostram caminhos viáveis para acelerar o trabalho sem trocar a stack. **Não foram aplicadas ao aplicativo, banco ou servidor e não são instruções para o Claude copiá-las.** O prompt de execução exclui sua adoção automática.

## Três auxiliares pequenos em TypeScript

1. **Identidade do cache:** reduz o risco de reaproveitar notificações entre usuários/sessões. Não guardar JWT na chave. Ainda seria necessário limpar o armazenamento no logout, reagir à mudança de permissão e garantir que a autorização continue no servidor. Alternativa ainda menor: eliminar o cache persistente.
2. **Comparação de publicação:** falha se SHA ou ambiente divergirem. Exige que a resposta de saúde publique SHA completo, informação que a implementação atual pode precisar acrescentar. O auxiliar não busca HTTP nem autentica uma origem: o coletor teria de validar HTTPS, status, JSON, timeout, domínio e instância.
3. **Lotes determinísticos:** divide 2.271 registros em 1.000 + 1.000 + 271 sem perder ordem. Não corrige sozinho o parser que rejeita K955 e não cria idempotência ou transação. A importação deveria vincular cada lote ao hash do arquivo, versão do mapeamento e ordinal, conferir o total e impedir aplicação parcial silenciosa. Prévia global e aprovação devem preceder a gravação.

```typescript
export function identidadeDoCache(escopo: {
  organizacao: string; usuario: string; sessao: string; loja: string;
}): string {
  const valores = [escopo.organizacao, escopo.usuario, escopo.sessao, escopo.loja];
  if (valores.some(v => !v.trim())) throw new Error("Escopo incompleto");
  return JSON.stringify(["ora:pendencias:v2", ...valores]);
}

export function conferirVersao(esperado: string, observado: {
  commit: string; ambiente: string;
}, ambienteEsperado: string): void {
  const shaCompleto = /^[0-9a-f]{40}$/;
  if (!shaCompleto.test(esperado) || !shaCompleto.test(observado.commit))
    throw new Error("Versão ausente ou incompleta");
  if (observado.commit !== esperado || observado.ambiente !== ambienteEsperado)
    throw new Error("Publicação divergente");
}

export function* lotesDeterministicos<T>(
  linhas: readonly T[], tamanho: number,
): Generator<{ indice: number; inicio: number; linhas: readonly T[] }> {
  if (!Number.isSafeInteger(tamanho) || tamanho <= 0)
    throw new Error("Tamanho inválido");
  for (let inicio = 0, indice = 0; inicio < linhas.length; inicio += tamanho, indice++)
    yield { indice, inicio, linhas: linhas.slice(inicio, inicio + tamanho) };
}
```

Validação local: **3 testes passaram** com Node 22.23.4. Foram cobertas colisões por delimitador, troca de cada dimensão da identidade, versão/ambiente incorretos, SHA incompleto, conservação de 2.271 linhas, arquivo vazio e tamanhos inválidos. São testes dos auxiliares, não da integração com a aplicação.

## Importação: reaproveitamento com maior impacto

O caminho de menor retrabalho é ampliar o importador existente, mantendo prévia, aprovação, idempotência e reversão. O parser deve reconhecer o formato do arquivo real antes de validar os campos mapeados. Observação fora do mapeamento não pode interromper todo o arquivo por uma regra de tamanho destinada ao nome do produto; também não deve ser truncada sem aviso.

A etapa de catálogo e a etapa de saldo inicial têm contratos distintos. Os 12 locais precisam de vínculo inequívoco com unidades reais. Quantidade local, disponível, reservado e trânsito não são sinônimos. Não tentar reconstruir saldo físico somando indiscriminadamente essas colunas.

Lotes menores podem melhorar latência, mas não dispensam a investigação do teste de 2.000 registros que falhou. Primeiro medir quais consultas dominam o tempo; depois avaliar validação e escrita em conjunto, sem remover auditoria.

## Integrações: contrato comum, implementações próprias

Uma interface de consulta de operação ajuda Nogle, financeiras e outros provedores a reutilizar tratamento de incerteza, mantendo cada contrato externo separado:

```typescript
type ConsultaExterna =
  | { estado: "confirmada"; referencia: string; confirmadaEm: string }
  | { estado: "pendente"; referencia: string }
  | { estado: "recusada"; referencia: string; codigo: string }
  | { estado: "desconhecida"; motivo: "timeout" | "indisponivel" };

interface ConsultaDoParceiro {
  consultar(referencia: string, signal: AbortSignal): Promise<ConsultaExterna>;
}
```

É apenas um contrato ilustrativo, não um SDK nem endpoint real. Precisaria validar respostas no runtime, preservar códigos oficiais e mapear cada operação. “Desconhecida” não é “recusada”: após timeout, reconsultar evita uma segunda cobrança/ativação. “Confirmada” também não significa automaticamente “liquidada” — o financeiro mantém seus estados e provas próprios.

É viável reaproveitar os workers e contratos atuais. Seria contraproducente construir outro PDV, outro livro de estoque ou outro motor financeiro para cada parceiro.

## Banco, fotos e destinatário: decisões antes de código

- **Foto:** propor estado de reserva/confirmação/exclusão e uma outbox de limpeza, com transações curtas e retentativa. O protocolo deve impedir que o cadastro confirme um objeto já tomado para exclusão. O DELETE externo não participa da transação PostgreSQL; precisa de compensação/reconciliação. Isso é uma opção de arquitetura, ainda sem migration aprovada.
- **Nota:** reaproveitar o snapshot em notas_destinatarios; corrigir escritores antigos e validar a identidade no enfileiramento/expedição. Não resolver o problema simplesmente copiando o telefone atual da venda.
- **Transferência:** reaproveitar estoque_reservas/movimentos e autorização existentes. Para vários produtos, ordenar locks por loja/variante e definir se o lote é atômico ou admite etapas parciais explícitas. Não atualizar saldos diretamente no React.
- **Gráficos:** reaproveitar componentes e RPCs agregadas existentes; investir em carga representativa, filtros e jornadas autenticadas. Não criar segunda implementação dos mesmos indicadores.

Essas opções reduzem repetição e atacam as causas observadas. A escolha final deve considerar o código existente e a evidência dos testes; não há promessa de eliminar todo retrabalho futuro.

