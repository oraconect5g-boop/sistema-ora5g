# Soluções para avaliação

Propostas do revisor, apresentadas ao proprietário. Não são patches aprovados nem instrução para aplicar estes trechos diretamente.

## Cancelamento e confirmação tardia da assinatura

O código atual usa “cancelada” antes de encerrar o risco de uma assinatura ter sido criada durante a consulta. A solução deve continuar em TypeScript/PostgreSQL e aproveitar a fila e as chaves atuais.

Um contrato conceitual possível:

```ts
type EstadoDoCancelamento =
  | "solicitado"
  | "acesso_ao_link_encerrado"
  | "aguardando_reconciliacao"
  | "cancelado_confirmado"
  | "divergencia";

// Interfaces propostas; estes métodos NÃO existem no projeto.
interface ReconciliacaoDoCancelamento {
  encerrarAcessoAoLink(id: string): Promise<void>;
  agendarConferenciaPosterior(id: string): Promise<void>;
  conferirAssinaturasECobrancas(id: string): Promise<void>;
}
```

O fluxo precisa persistir a intenção antes da chamada, desativar o acesso ao link, continuar conciliando o identificador próprio com o provedor e remover a assinatura identificada quando for necessário. Cobranças já realizadas exigem tratamento próprio; não tratá-las como estornadas só porque a recorrência foi cancelada. Falhas/timeouts mantêm a reconciliação aberta, com limites e alertas; webhooks autenticados e deduplicados podem complementar a consulta. Uma consulta vazia imediatamente após desativar o link pode ainda ser insuficiente diante de processamento em curso.

Validar no sandbox: cancelamento antes do cadastro, cartão aceito entre consulta/desativação, resposta tardia após expiração, repetição do worker, assinatura já removida e primeira cobrança já paga. Reusar o teste de regressão desta auditoria e ampliar o cenário com o worker/provedor simulado. A solução exata precisa respeitar o contrato Asaas.

## Empresa e lojas

Reaproveitar os cadastros, a validação de raiz e a separação organizacional. Preparar a empresa real com o dado já fornecido, vincular as unidades comerciais corretas e manter as unidades de teste em vínculo coerente. Verificar D-055 para lojas com CNPJ compartilhado/diferente; não presumir que 11 lojas pertencem obrigatoriamente à mesma raiz.

Não usar uma atualização global de raiz como atalho, nem retirar a validação do CNPJ. A decisão D-054 define quando cadastrar/liberar a loja após estoque e acesso.

## Disponibilidade da vitrine

O contrato pode separar quantidade de disponibilidade comercial, mantendo a quantidade disponível como físico menos reservas. Exemplos de motivos: sem saldo; loja ainda sem cadastro comercial; item ainda não liberado para o canal; consulta indisponível.

Um campo adicional de motivo, calculado no servidor, permite textos corretos e evita confundir bloqueio cadastral com estoque zerado. Não expor motivos administrativos sensíveis ao consumidor; usar aviso comercial adequado e um diagnóstico detalhado na área interna.

## Prazo e linguagem

A stack já possui Node/TypeScript e workers. Acelerar com as abstrações existentes, testes de contrato e jornadas de aceite. Uma migração de linguagem não corrige a base desatualizada, o CNPJ, a autorização externa ou a falta de homologação.

O padrão de fila, idempotência e confirmação do provedor deve ser reutilizado entre integrações, com estados específicos para cada negócio. Não generalizar pagamentos e telecom a ponto de confundir “cobrança paga” com “recarga concluída”.

