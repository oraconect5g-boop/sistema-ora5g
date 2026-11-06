# 05 — Perfis, permissões e aprovações

**Matriz inicial para homologar.** Os perfis podem coexistir e ter escopos loja/region/rede. Toda regra se aplica no **servidor e RLS**; menus ocultos sozinhos não bastam.

| Ação | Vendedor | Gerente loja | Gestor regional | Diretoria | Financeiro | Fiscal | Atendimento/Marketing |
|---|---|---|---|---|---|---|---|
| Abrir sessão de vendas da própria loja | Sim | Sim/supervisão | Não por padrão | Supervisão | Não | Não | Não |
| Consultar cliente da própria carteira/loja | Sim | Sim | Conforme escopo | Conforme necessidade | Parcial | Parcial | Atendimento autorizado |
| Cadastrar venda e pagamento | Sim | Sim | Não por padrão | Não por padrão | Ajuste autorizado | Não | Não |
| Aprovar desconto acima de alçada | Não | Sim até limite | Limite regional | Alçada superior | Não | Não | Não |
| Solicitar nota fiscal | Sim | Sim | Consulta | Consulta | Não por padrão | Sim | Não |
| Revisar solicitação fiscal internamente | Não | Conforme política | Escalada | Escalada | Não | Sim | Não |
| Emitir/transmitir documento fiscal (backend/provedor) | Fluxo autorizado | Acompanhamento | Acompanhamento | Auditoria | Consulta | Operação fiscal | Não |
| Ver resultado e meta pessoal | Próprio | Loja | Região | Rede | Comissão autorizada | Não | Não |
| Ver margem detalhada e lucro | Restringir | Conforme política | Sim autorizado | Sim | Sim | Necessário | Agregados |
| Fechar e conferir caixa | Próprio/solicita | Confere/aprova | Audita | Audita | Concilia | Não | Não |
| Transferir estoque | Solicita | Aprova/recebe | Pode autorizar | Audita | Não | Não | Não |
| Alterar preço, regra de comissão | Não | Exceção controlada | Conforme alçada | Aprovação | Consulta | Consulta | Marketing propõe |
| Administrar usuários e papéis | Não | Membros próprios limitados | Regional limitado | Admin autorizado | Não | Não | Não |
| Integrar canais/APIs, credenciais | Não | Não | Não | Admin técnico autorizado | Conciliação | Fiscal técnico | Marketing próprio |
| Ver dados de outras lojas | Não por padrão | Não | Apenas sua região | Conforme função | Apenas escopo financeiro | Apenas escopo fiscal | Apenas carteira autorizada |

## Aprovações
- Cada aprovação tem `requester`, `approver`, `store`, `type`, `reason`, `policy_version`, `before/after`, `created/decided_at`, `audit_id`.
- Um usuário não pode aprovar sua própria solicitação crítica quando a política exigir segregação de funções.
- **Descontos:** alçada configurável por loja, vendedor, categoria, valor/percentual, promoção e orçamento (diário/mensal se confirmado). Acima de alçada → fila e notificação gerente mobile.
- **Notas:** o desejo do usuário é aprovação de gerente, mas a obrigação fiscal e os prazos legais têm prioridade. Contador deve definir quando a revisão interna pode ocorrer sem descumprimento e quando emissão deve ser automática/obrigatória.
- **Estoque e caixa:** ajuste, perda, divergência e cancelamento devem ter aprovação conforme risco e quantia.
- **Meta/comissão:** alterações e pagamentos exigem aprovação e versionamento.
- **IA:** nunca assume perfil privilegiado ou executa operação financeira/fiscal só por texto recebido em WhatsApp ou prompt.

## Testes mínimos
- Vendedor da Loja A tenta acessar venda/cliente/IMEI/metas da Loja B: **403/ausência do resultado**.
- Gerente A tenta aprovar desconto B: negado.
- Usuário troca `store_id` na requisição: servidor ignora ou recusa com auditoria.
- Conta revogada ou role alterado: tokens antigos não podem continuar autorizando ações incompatíveis.
- Acesso diretoria global: rastreável e condicionado ao escopo.
- Executivo com acesso multiempresa: não pode ver recurso de empresa fora do vínculo.
