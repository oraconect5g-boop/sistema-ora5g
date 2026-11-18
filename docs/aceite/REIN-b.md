# Roteiro de aceite: lote REIN-b (o estoque de cada loja pelo relatório da Rein)

- **Quem faz:** o administrador envia o relatório e o proprietário (dono) aplica. Hoje só o dono existe, então este roteiro espera a conta de administrador (chave do servidor, J1). Até lá, a parte 1 é só leitura.
- **Quanto tempo leva:** uns 15 minutos, com o arquivo e as duas contas.
- **O que o lote entrega:** o relatório de produtos da Rein vira o estoque inicial de cada loja, com prévia, aprovação e o livro (ADR-021). Requisitos: ORA-INV-004 e ORA-CAT-002, a carga do estoque por local que a auditoria do Codex de 17/11 pediu.
- **Resposta:** "aceito" ou "não aceito". No "não aceito", diga o que mudar.

## 1. Onde fica

- **Estoque e catálogo → Cadastro de produtos → Importar planilha → "Estoque de cada loja"**, ou direto em `/estoque/carga`.
- Quem não importa nem aprova vê o aviso e não vê nada da carga.

## 2. Como conferir (com o arquivo e as duas contas)

1. **Antes:** importe o catálogo do mesmo arquivo (a importação de planilha), para os códigos existirem.
2. **Como administrador**, em "Estoque de cada loja":
   - escolha o arquivo;
   - diga a data e a hora da posição: 10/11/2026 às 13:20;
   - confira as colunas sugeridas: o código e, de cada loja, o físico e o disponível;
   - toque em "Gerar as prévias".
3. **Cada loja com quantidade vira uma carga.** Abra uma e confira:
   - "Entram no estoque": os acessórios com a quantidade física;
   - "Aparelhos e chips": entram pela Entrada de mercadoria, com o IMEI ou o ICCID de cada um;
   - "A conferir": cada linha diz o motivo (quantidade negativa, disponível maior que o físico, código repetido…);
   - "Fora do catálogo": o código que não está no cadastro;
   - "Ficou de fora a linha 2273 do arquivo": o rodapé de totais.
4. **Como dono**, abra a carga, escreva o motivo e toque em "Aplicar a carga".
   - A quantidade entra no estoque da loja. Confira na tela do estoque, filtrando pela loja.
   - O administrador não consegue aplicar a prévia que ele mesmo gerou.
5. **Repita o envio do mesmo arquivo:** a prévia volta a mesma, e a loja já aplicada é recusada.
6. **Para conferir o desfazer**, numa loja de teste: "Desfazer a carga" devolve o que ainda está livre.

## O que fica de fora (e por quê)

- **O IMEI e o ICCID:** o arquivo não traz o número de cada unidade. Aparelhos e chips entram pela Entrada de mercadoria, um a um.
- **A posição de 10/11 não é o estoque de hoje.** Na virada da Rein para o sistema, a carga se faz com um relatório novo, do dia.

## O que depende de você

- O arquivo `relatorioProdutos131258.xlsx` no servidor, em `~/entrada/rein/`, sem passar pelo chat.
- A chave do servidor (J1), para a conta de administrador de teste.
