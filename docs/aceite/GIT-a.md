# Roteiro de aceite: lote GIT-a (a arrumação do GitHub: issues, atualizações e o que fica exposto)

- **Quem faz:** o proprietário, lendo este roteiro. Não há passo no celular.
- **Quanto tempo leva:** uns cinco minutos.
- **O que o lote entrega:** o item 7 da onda 0 do plano de 16/11. Os requisitos ligados são o ORA-QUAL-001, o ORA-QUAL-004 e o ORA-QUAL-014, e nenhum deles muda de estado.
- **Resposta:** "aceito" ou "não aceito".

## O que mudou

1. **Cada issue aberta tem a situação escrita.** Havia 62 issues abertas no GitHub, e cada uma ganhou uma linha na tabela [`docs/alinhamento/ISSUES_E_PRS_2026-11-17.md`](../alinhamento/ISSUES_E_PRS_2026-11-17.md):
   - **48 já estavam corrigidas.** Cada linha dá o commit da correção e o teste que prova que o defeito não volta.
   - **Fechá-las no GitHub espera a permissão.** O conector do GitHub precisa poder comentar nas issues: cada uma fecha com um comentário que cita o commit e o teste.
   - **1 foi corrigida neste lote:** o #44, um aviso de segurança antigo numa ferramenta de desenvolvimento.
   - **13 ficam abertas,** cada uma com o que falta. Por exemplo: o seu aceite (#101 e #102), as contas de teste (#11, #63 e #84), a Meta (#76) e a Nogle (#54).
2. **As atualizações do Dependabot:**
   - **8 atualizações pequenas entraram** (a #103), depois do teste completo.
   - **1 foi recusada** (a #92), porque não combina com a versão do Node que o servidor usa.
   - **2 versões maiores ficam para depois** (a #93 e a #94), sem pressa.
3. **Nenhum aviso de segurança nas dependências.** A verificação das dependências, inclusive as de desenvolvimento, dá 0 avisos (eram 7).
4. **Nenhuma senha ou chave no histórico.** A procura no histórico inteiro do repositório (470 commits) não achou nenhuma.
5. **O que o repositório público mostra está numa lista à parte.** São o endereço do servidor, a porta de acesso, a conta do cPanel e a referência do banco de teste. A lista foi entregue a você **fora** do repositório, para não juntar tudo num lugar público.

## O que você decide

1. **Tornar o repositório privado.** A recomendação é sim. O que muda está na lista que você recebeu.
2. **Fechar as 10 PRs de documentação** (#33, #66, #67, #68, #77, #81, #85, #86, #97 e #100). Tudo o que valia delas já foi aproveitado, e a tabela diz o quê.
3. **Liberar a escrita em issues para o conector do GitHub**, para eu fechar as 48 corrigidas.

## O que você confere

1. Leia "O que mudou", acima.
2. Responda **"aceito"** ou **"não aceito"**, mais as três decisões.
