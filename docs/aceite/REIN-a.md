# Roteiro de aceite: lote REIN-a (o importador pronto para a planilha inteira da Rein)

- **Quem faz:** o proprietário, lendo este roteiro. Não há passo no celular.
- **Quanto tempo leva:** uns dois minutos.
- **O que o lote entrega:** a parte do item 3 da onda 1 do plano de 16/11 que não depende do arquivo: o importador lê a planilha de produtos da Rein inteira. Os requisitos ligados são o ORA-CAT-002 e a issue #89, e o estado não muda.
- **Resposta:** "aceito" ou "não aceito".
- **No ar:** desde 17/11, às 14:40, no commit `03123d0`. O rodapé pode mostrar um commit mais novo, de um lote seguinte.

## O que mudou

Em 16/11, a leitura da planilha `relatorioProdutos131258.xlsx` parava por três motivos. Agora:

1. **A observação comprida não derruba mais a leitura.**
   - **O que parava:** uma célula de observação com 3.220 letras (a K955). O leitor aceitava no máximo 500.
   - **Agora:** o leitor aceita até 10.000 letras por célula. O limite de 500 vale só para os campos que entram no cadastro (código, nome, marca e os outros); a observação não entra.
   - **Se um campo que entra passar de 500 letras:** só aquela linha fica com erro, e a prévia mostra qual.
2. **A planilha com mais de 2.000 linhas entra em partes.**
   - **O que parava:** a sua planilha tem 2.271 produtos, e o banco recebe até 2.000 linhas por vez.
   - **Agora:** a planilha vira uma prévia para cada parte de até 2.000 linhas, por exemplo "parte 1 de 2" e "parte 2 de 2".
   - **Cada parte se confere e se aplica separada.** Nada some: as linhas mantêm o número que têm na planilha.
3. **A linha de total no fim fica de fora, à vista.**
   - **O problema:** a última linha da planilha é um total, não um produto. Ela entraria como erro e travaria a importação inteira.
   - **Agora:** ela fica de fora, e a prévia diz "Ficou de fora a linha N da planilha: linha de total no fim da planilha".
   - **Corrigido no AUD-a (18/11):** a auditoria do Codex de 17/11 (achado F01) mostrou que o rodapé do seu arquivo não tem a palavra "Total": só números. Agora o rodapé de totais sem rótulo também fica de fora, e a prévia diz o motivo e em quantas colunas o número é a soma das linhas de cima. Roteiro: [AUD-a.md](AUD-a.md).

## O que ainda falta (depende de você)

- **O arquivo no servidor.** Ele precisa estar em `~/entrada/rein/` para eu conferir a importação de verdade, coluna por coluna.
- **A carga do estoque por loja.** As colunas de estoque de cada local viram a entrada inicial de cada uma das 11 lojas e do DEFEITOS, com a data de corte. A ferramenta existe desde o REIN-b (18/11): "Estoque de cada loja", na importação de planilha, sem supor o formato (você confirma as colunas de cada loja). Falta o arquivo no servidor para a carga de verdade. Roteiro: [REIN-b.md](REIN-b.md).
- **Quem importa.** Só o papel de administrador envia a planilha, e o dono aprova. Hoje não há administrador cadastrado: a conta de teste depende da chave do servidor (`SUPABASE_SECRET_KEY`).

## O que você confere

1. Leia "O que mudou", acima.
2. Responda **"aceito"** ou **"não aceito"**.
