# Homologação no servidor (opção A do ADR-001: cPanel + Apache + processo do usuário `dev`)

A plataforma de homologação roda **só em `127.0.0.1:3100`**. O Apache do cPanel recebe o acesso em `https://hml-app.ora5g.com.br` e encaminha para ela. Nada de produção é tocado aqui.

## Como está montado

| Peça | Onde |
|---|---|
| Código publicado | `~/homologacao/plataforma` (cópia separada da `main`, via `git worktree`) |
| Variáveis da homologação | `~/homologacao/plataforma.env` (permissão `600`, fora do Git) |
| Logs | `~/homologacao/logs/` (`plataforma.log`, `garantir.log`, `publicar-*.log`) |
| Reinício automático | **Ainda não ligado.** Precisa da autorização do proprietário para instalar o `crontab` do `dev` (comando abaixo). Sem ele, a homologação não volta sozinha depois de reiniciar o servidor ou de uma falha |

## Comandos (no servidor, usuário `dev`)

| Comando | O que faz |
|---|---|
| `~/homologacao/plataforma/deploy/homologacao/publicar.sh` | Atualiza para a `main` do GitHub, instala, gera a build e reinicia |
| `~/homologacao/plataforma/deploy/homologacao/garantir-no-ar.sh --reiniciar` | Só reinicia |
| `~/homologacao/plataforma/deploy/homologacao/garantir-no-ar.sh --parar` | Para (o cron sobe de novo em até 5 minutos; para desligar de vez, remova as linhas do `crontab -e`) |
| `curl -s 127.0.0.1:3100/saude` | Confere se está no ar |

## Ligar o reinício automático (uma vez, no servidor, usuário `dev`)

Instala duas linhas no `crontab` do `dev`: uma sobe a plataforma quando o servidor liga, a outra confere a cada 5 minutos.

```
( crontab -l 2>/dev/null; echo '@reboot $HOME/homologacao/plataforma/deploy/homologacao/garantir-no-ar.sh'; echo '*/5 * * * * $HOME/homologacao/plataforma/deploy/homologacao/garantir-no-ar.sh' ) | crontab -
```

Para desligar: `crontab -e` e apagar as duas linhas.

## Ver antes de ter o domínio (túnel SSH, do computador do proprietário)

```
ssh -p 22022 -L 3100:127.0.0.1:3100 dev@69.6.214.94
```

Com essa janela aberta, acesse `http://127.0.0.1:3100/demo` no navegador do computador.

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
