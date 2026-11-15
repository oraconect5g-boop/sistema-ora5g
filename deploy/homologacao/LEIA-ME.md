# Homologação no servidor (opção A do ADR-001: cPanel + Apache + processo do usuário `dev`)

A plataforma de homologação roda **só em `127.0.0.1:3100`**. O Apache do cPanel encaminha o acesso para ela: hoje, temporariamente, pelo domínio principal `https://ora5g.com.br` (seção abaixo); depois, por `https://hml-app.ora5g.com.br`. Nada de produção é tocado aqui.

## Como está montado

| Peça | Onde |
|---|---|
| Código publicado | `~/homologacao/plataforma`: link para a versão ativa em `~/homologacao/versoes/<commit>-<configuração>` (cada versão é uma cópia separada, via `git worktree`, com a própria build e a própria cópia do ambiente) |
| Variáveis da homologação | `~/homologacao/plataforma.env` (permissão `600`, fora do Git). A publicação copia o arquivo para dentro da versão; editar o original não muda a versão no ar até publicar de novo |
| Logs | `~/homologacao/logs/` (`plataforma.log`, `garantir.log`, `publicar-*.log`) |
| Reinício automático | **Ligado em 07/11/2026** (autorizado pelo proprietário): `crontab` do `dev` roda `garantir-no-ar.sh` no boot e a cada 5 minutos. Testado: com o serviço parado, o `cron` o subiu de volta sozinho |

## Comandos (no servidor, usuário `dev`)

| Comando | O que faz |
|---|---|
| `~/homologacao/plataforma/deploy/homologacao/publicar.sh` | Atualiza para a `main` do GitHub, instala, gera a build e reinicia. Também é o jeito de aplicar uma mudança no `plataforma.env`, mesmo sem commit novo |
| `~/homologacao/plataforma/deploy/homologacao/garantir-no-ar.sh --reiniciar` | Só reinicia |
| `~/homologacao/plataforma/deploy/homologacao/garantir-no-ar.sh --parar` | Para (o cron sobe de novo em até 5 minutos; para desligar de vez, remova as linhas do `crontab -e`) |
| `curl -s 127.0.0.1:3100/saude` | Confere se está no ar |
| `bash ~/homologacao/plataforma/deploy/homologacao/conferir-publicacao.sh` | Só leitura: mostra o commit no ar, o da `main` no GitHub e a lista do que falta publicar |

**A publicação de homologação é manual e integra o encerramento de cada lote, conforme o pedido do proprietário de 13/11, reiterado em 15/11.** A autorização já dada para esse fluxo habitual não precisa ser solicitada novamente a cada lote. Isso não altera as autorizações específicas de produção, operações críticas ou mudanças de dados fora do escopo autorizado. Merge na `main` não muda o site: em 10/11/2026 a `main` estava 5 commits à frente do site e isso só foi notado na demonstração. Desde então, cada tela mostra no rodapé a versão no ar (`ora5G · v0.1.0 · <commit> · build <data e hora>`), também em `/saude` e no "Mais" do celular. Para conferir de fora do servidor, abra `https://ora5g.com.br/saude` numa aba anônima e compare o commit com o da `main`.

### Conferência obrigatória ao fim do lote

Claude registra o SHA final integrado e o CI correspondente, confere as migrations/configuração necessárias e publica pelo script existente. Depois compara o SHA esperado com o retornado pelo serviço local **e pelo domínio HTTPS**; verifica os recursos estáticos e o percurso da função alterada na aplicação real, com o perfil autorizado. Registra endereço, horário, versão e resultado em evidência associada ao SHA. Falha ou falta de configuração mantém a etapa pendente; funcionamento da demo não substitui esse aceite.

**Limitação do verificador atual (issue #99):** conferir-publicacao.sh pode imprimir “Tudo publicado” com resposta antiga ou erro do serviço, porque não usa a versão HTTP na decisão. Até a correção, comparar explicitamente os três SHAs; não usar a mensagem do script ou HTTP 200 isolado como prova. A verificação de 15/11 encontrou o domínio em 5468d9e, igual à main, mas o CI desse SHA reprovou na #95. [Relatório e evidências](../../docs/analises/PUBLICACAO_DOMINIO_2026-11-15.md).

**Versões antigas não são apagadas sozinhas** (pedido do proprietário em 10/11/2026: nada é apagado do servidor sem perguntar antes). O `publicar.sh` só lista as que passam das 3 mais recentes e mostra o comando para apagar uma depois de autorizado. Cada pasta ocupa cerca de 1,2 GB.

## Mudar a configuração da homologação (REV-016)

1. Edite `~/homologacao/plataforma.env` (continua com permissão `600`; nunca cole os valores em mensagens).
2. Rode o `publicar.sh`.

Cada versão é identificada pelo **commit + impressão digital do arquivo de ambiente** (os 12 primeiros caracteres do `sha256` do arquivo; os valores nunca aparecem). Por isso:

| Situação | O que o `publicar.sh` faz |
|---|---|
| Arquivo mudou, mesmo commit | Monta uma versão nova (`npm ci` + build) e troca. Variáveis `NEXT_PUBLIC_*` e páginas estáticas ficam gravadas na build, então configuração nova sempre ganha build nova |
| Mesmo commit e mesmo arquivo de uma versão guardada | Reaproveita a pasta, sem montar de novo |
| Mesmo commit e mesmo arquivo da versão no ar | Avisa "nada a fazer" e não reinicia |
| A versão nova não sobe | Volta o link para a anterior, que tem o próprio código **e** a própria cópia do ambiente: a combinação anterior volta inteira |

A build e o `next start` rodam com ambiente limpo (`env -i`): uma variável exportada no terminal de quem publica ou reinicia não passa por cima do arquivo.

## Testar a publicação sem tocar na homologação

Os dois scripts aceitam outra pasta e outra porta, **sempre as duas juntas** (uma só é recusada), e o `publicar.sh` aceita outro clone:

```
ORA_HML_BASE=$HOME/teste-publicacao/base ORA_HML_PORTA=3190 ORA_REPO_DIR=$HOME/teste-publicacao/repo \
  bash deploy/homologacao/publicar.sh origin/<branch>
```

A pasta precisa conter `plataforma.env` com valores fictícios. Em teste, o script só usa versões cujo `garantir-no-ar.sh` conhece essas variáveis, para nunca parar nem reiniciar a `3100`.

## Reinício automático (`crontab` do `dev`, já instalado)

Duas linhas: uma sobe a plataforma quando o servidor liga, a outra confere a cada 5 minutos. Para reinstalar num servidor novo:

```
( crontab -l 2>/dev/null; echo '@reboot $HOME/homologacao/plataforma/deploy/homologacao/garantir-no-ar.sh'; echo '*/5 * * * * $HOME/homologacao/plataforma/deploy/homologacao/garantir-no-ar.sh' ) | crontab -
```

Para desligar: `crontab -e` e apagar as duas linhas.

## Ver antes de ter o domínio (túnel SSH, do computador do proprietário)

```
ssh -p 22022 -L 3100:127.0.0.1:3100 dev@69.6.214.94
```

Com essa janela aberta, acesse `http://127.0.0.1:3100/demo` no navegador do computador.

## Caminho rápido para uma apresentação: domínio principal (temporário)

**Aplicado pelo proprietário em 07/11/2026:** desde então `https://ora5g.com.br` mostra a plataforma (temporário, para apresentações). Antes disso, na conferência de 07/11/2026, o endereço mostrava só "Index of /" (a `public_html` da conta `wwora5` estava vazia) e já tinha certificado válido (Let's Encrypt, `*.ora5g.com.br` e `ora5g.com.br`); por isso o domínio principal pôde mostrar a plataforma na hora, sem criar nada no DNS. Passos usados (para refazer ou conferir):

1. WHM → Listar contas → linha do `ora5g.com.br` → ícone **cP** (abre o cPanel da conta `wwora5`).
2. **Gerenciador de Arquivos → `public_html`** → Configurações → marcar "Mostrar arquivos ocultos".
3. **+ Arquivo** → nome `.htaccess` → Editar → colar o conteúdo de `deploy/homologacao/htaccess-dominio-principal.txt` → Salvar.
4. Abrir `https://ora5g.com.br/demo`.

Para desfazer, apague o `.htaccess` da `public_html`. A página fica com aviso de demonstração e pede aos buscadores para não indexar. Quando o `hml-app` estiver pronto, volte o domínio principal ao site institucional.

## Publicar no endereço `hml-app.ora5g.com.br` (proprietário, pelo cPanel, sem root)

O DNS do domínio já está no próprio servidor (`ns1`/`ns2.ora5g.com.br`), então o cPanel cria o registro sozinho.

1. **cPanel → Domínios → Criar um novo domínio:** `hml-app.ora5g.com.br`. Desmarque "compartilhar a raiz do documento" e use a pasta `hml-app`.
2. **cPanel → Gerenciador de Arquivos → pasta `hml-app`:** crie o arquivo `.htaccess` com o conteúdo de `deploy/homologacao/htaccess-hml-app.txt` (ative "mostrar arquivos ocultos").
3. **cPanel → Status de SSL/TLS → Executar AutoSSL** e aguarde o certificado do `hml-app`.
4. Opcional, para a apresentação: **cPanel → Privacidade de diretório** na pasta `hml-app`, para pedir uma senha antes de abrir.
5. Confira: `https://hml-app.ora5g.com.br/saude` deve mostrar "Sistema no ar" e `https://hml-app.ora5g.com.br/demo` a demonstração.

Não é preciso registro AAAA (o servidor é só IPv4). Se o painel criar um, apague.

## Limitações conhecidas

- O processo roda como usuário `dev` com `crontab`, não como serviço `systemd` (exige root). Quando o proprietário puder, o próximo passo é um serviço `systemd` com usuário próprio.
- A homologação usa por enquanto o projeto Supabase de **desenvolvimento** (`ora5g-dev`). O ADR-001 pede um projeto separado para homologação antes de dados reais.

## Worker de identidade (convites e bloqueios no Auth)

Desde 08/11 (ORA-006): a tela da equipe só grava o convite no banco; o worker, que é o único que
recebe a `SUPABASE_SECRET_KEY` (o `.env.local` do aplicativo web sai sem ela e sem a
`DATABASE_URL`, ADR-002 §2.5), cria a pessoa no Auth, manda o e-mail de convite e reflete no
login os bloqueios feitos no banco. Ligar depois de publicar uma versão que tenha `apps/worker`
(crontab do usuário `dev`, uma linha):

```
* * * * * bash $HOME/homologacao/plataforma/deploy/homologacao/worker-identidade.sh
```

Sem a chave, ele só registra "desligado" no log (`~/homologacao/logs/worker-identidade.log`).
O log tem só contagens e códigos de erro, nunca e-mail, nome ou chave.
