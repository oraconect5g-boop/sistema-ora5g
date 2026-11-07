# Conectar o Claude Code (Windows) ao servidor por SSH

**Data:** 06/11/2026 · **Autor:** Claude Code · **Base:** ADR-001, seção 2.7
**Fonte oficial:** documentação do Claude Code (instalação no Windows e sessões SSH do app desktop): https://code.claude.com/docs/en/setup e https://code.claude.com/docs/en/desktop

**Resultado:** o app Claude no seu Windows abre uma sessão do Claude Code **dentro do servidor**, com o usuário `dev`, na pasta do projeto. O Claude programa lá, usa o `.env` de homologação e envia o código para o GitHub.

> **Regra de ouro:** a **chave privada** SSH nunca sai do seu computador. Não cole em chat, e-mail, WhatsApp nem GitHub. Só a chave **pública** (`.pub`) vai para o servidor.

---

## Parte A — No seu Windows

### A1. Instalar o app Claude (inclui o Claude Code)
1. Baixe o app desktop para **Windows x64**: link oficial na página https://code.claude.com/docs/en/overview (aba *Desktop app*).
2. Instale, abra e entre com sua conta. O Claude Code fica na aba **Code**. Ele exige plano pago (Pro, Max, Ultra, Team ou Enterprise).

### A2. Instalar o Git for Windows (recomendado)
Baixe em https://git-scm.com/downloads/win e avance com as opções padrão.

### A3. Criar sua chave SSH
Abra o **PowerShell** (menu Iniciar → digite "PowerShell") e rode:

```powershell
ssh-keygen -t ed25519 -C "claude-code-ora5g"
```

- Quando perguntar onde salvar, aperte **Enter** (fica em `C:\Users\<seu usuário>\.ssh\id_ed25519`).
- Crie uma **senha** para a chave e guarde-a com você.

Para não digitar a senha a cada conexão, ative o agente de chaves. Abra o PowerShell **como Administrador** e rode:

```powershell
Get-Service ssh-agent | Set-Service -StartupType Automatic
Start-Service ssh-agent
```

Depois, num PowerShell normal:

```powershell
ssh-add $env:USERPROFILE\.ssh\id_ed25519
```

### A4. Criar o atalho de conexão
No PowerShell:

```powershell
notepad $env:USERPROFILE\.ssh\config
```

Cole o texto abaixo, salve e feche. Se o Bloco de Notas salvar como `config.txt`, renomeie para `config`, sem extensão.

```text
Host ora5g-dev
    HostName 69.6.214.94
    User dev
    Port 22022
    IdentityFile ~/.ssh/id_ed25519
```

### A5. Copiar sua chave pública
```powershell
Get-Content $env:USERPROFILE\.ssh\id_ed25519.pub
```

Copie a linha inteira, que começa com `ssh-ed25519`. Ela **não é secreta** e é usada na Parte B.

---

## Parte B — No servidor (você, como root)

Use o **Terminal do WHM** (no WHM, busque `Terminal`) ou o seu acesso root por SSH.

### B1. Criar o usuário `dev`
```bash
useradd -m -s /bin/bash dev
```

### B2. Autorizar sua chave pública
Troque `COLE_AQUI_SUA_CHAVE_PUBLICA` pela linha copiada em A5, mantendo as aspas:

```bash
mkdir -p /home/dev/.ssh
echo 'COLE_AQUI_SUA_CHAVE_PUBLICA' >> /home/dev/.ssh/authorized_keys
chmod 700 /home/dev/.ssh
chmod 600 /home/dev/.ssh/authorized_keys
chown -R dev:dev /home/dev/.ssh
```

### B3. Conferir os requisitos do Claude Code remoto
```bash
grep -i '^Subsystem' /etc/ssh/sshd_config      # deve mostrar uma linha com "sftp"
findmnt -T /home/dev -o OPTIONS                # NÃO pode conter "noexec"
ldd --version | head -1                        # glibc 2.17 ou mais nova
df -h /home                                    # precisa de ~1 GB livre para o Claude Code
```

Se algum resultado for diferente do esperado, me mande a saída. Ela não tem segredos.

### B4. Anotar a "impressão digital" do servidor
```bash
ssh-keygen -lf /etc/ssh/ssh_host_ed25519_key.pub
```

Guarde o resultado (começa com `SHA256:`). Ele serve para confirmar, na primeira conexão, que você está falando com o seu servidor.

---

## Parte C — Testar a conexão (no seu Windows)

No PowerShell:

```powershell
ssh ora5g-dev
```

- Na primeira vez, aparece uma pergunta com um `SHA256:...`. **Compare com o código anotado em B4.** Se for igual, digite `yes`. Se for diferente, **não conecte** e me avise.
- Se aparecer `dev@dedi-16403309`, deu certo. Digite `exit` para sair.

Se a conexão for recusada depois de algumas tentativas, o bloqueio automático do cPanel (cPHulk) pode ter bloqueado o seu IP. Libere em WHM → *cPHulk Brute Force Protection*.

---

## Parte D — Ligar o Claude Code ao servidor (app Claude)

1. No app, abra a aba **Code**.
2. Embaixo da caixa de mensagem, abra o **seletor de ambiente** e escolha **New environment**.
3. Na aba **SSH**, abra a lista **Host** e escolha **Add SSH connection…**:
   - **Name:** `Ora5G servidor (dev)`
   - **SSH host:** `ora5g-dev` (o atalho criado em A4)
   - **SSH port:** deixe vazio (usa o do atalho)
   - **SSH key:** deixe vazio (usa o atalho e o agente)
   - **Worktree folder:** `~/worktrees`
4. Clique em **Add SSH connection**.
5. Escolha a pasta `/home/dev/sistema-ora5g` e clique em **Create environment**. Se a pasta ainda não existir, escolha `/home/dev` por enquanto: o clone do repositório é feito na Parte E.

Na primeira conexão, o app **instala o Claude Code no servidor**, em `~/.claude/remote/` do usuário `dev`.

---

## Parte E — Dar ao servidor acesso ao GitHub (só este repositório)

Feita uma vez, na primeira sessão. O Claude pode conduzir os comandos com você:

1. No servidor, como `dev`, criar uma chave **só para o GitHub**: `ssh-keygen -t ed25519 -C "ora5g-servidor-dev" -f ~/.ssh/github_ora5g`
2. No GitHub: repositório `sistema-ora5g` → **Settings → Deploy keys → Add deploy key**. Cole a chave **pública** (`github_ora5g.pub`) e marque **Allow write access**. Essa chave só acessa este repositório, nenhum outro da sua conta.
3. Clonar o projeto em `/home/dev/sistema-ora5g`.

---

## Parte F — O arquivo de chaves de homologação

Mais adiante (semana 4 do plano), **você** cria o arquivo `/home/dev/sistema-ora5g/.env.homologacao` direto no servidor, a partir do `.env.example`, e preenche os valores lá. O Claude lê esse arquivo para trabalhar, mas **nunca** mostra os valores. Permissão: `chmod 600`.

---

## Checklist

| # | Passo | Feito? |
|---|---|---|
| A1 | App Claude instalado e conectado | ☐ |
| A2 | Git for Windows instalado | ☐ |
| A3 | Chave SSH criada (com senha) e agente ativo | ☐ |
| A4 | Atalho `ora5g-dev` criado | ☐ |
| B1–B2 | Usuário `dev` criado com sua chave pública | ☐ |
| B3 | Requisitos conferidos | ☐ |
| B4 | Impressão digital anotada | ☐ |
| C | `ssh ora5g-dev` funcionando | ☐ |
| D | Ambiente SSH criado no app | ☐ |
| E | Deploy key no GitHub e repositório clonado | ☐ |
