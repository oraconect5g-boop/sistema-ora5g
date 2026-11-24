# Evidências e reprodução

A regressão F24-01 está como `.txt` para não introduzir um teste propositalmente vermelho na CI de uma PR documental. Para reproduzir numa cópia isolada de `003421d`, copie o conteúdo para `packages/banco/src/auditoria-20261124-transferencia-pendente.test.ts` e execute o teste com o script npm do workspace. Ele usa PGlite e fixtures; não aponta para o Supabase real.

Comandos executados:

```sh
npm test --workspace=@ora5g/plataforma
npm test --workspace=@ora5g/banco -- auditoria-20261124-transferencia-pendente.test.ts transferencia-divergencia.test.ts deposito-da-maquininha.test.ts pagamento-pelo-site.test.ts
```

Resultado: plataforma 1.984 aprovados, 2 ignorados. Banco selecionado: 25 aprovados, 1 falha esperada da nova reprodução. O CI original está verde; a prova nova expõe um caso ainda não coberto por ele.

`menus.json` e `medidas.json` vêm de renderização local com dados fictícios no corte `947a391`; não são métricas reais de usuários ou de performance. Há animações/fontes e hidratação que a renderização estática não reproduz. `publico-atual.json` é a navegação pública posterior com a versão `003421d` no domínio. Não houve jornada privada autenticada do revisor nesta rodada.

As consultas do Supabase usaram contagens e indicadores; sem CNPJ, dados de cliente, chave, senha ou conteúdo de extrato. A indicação `tem_cnpj` é booleana. Foto cadastrada e marcada como não ilustrativa não prova fidelidade da imagem.
