# ADR-001 — Infraestrutura: servidor só IPv4, mapa de portas, domínios e ambientes

**Status:** Proposta (aguarda aprovação do proprietário e revisão do Codex)
**Data:** 06/11/2026 · **Autor:** Claude Code
**Requisitos relacionados:** ORA-QUAL-001 a 009, ORA-ONLINE-*, DEC-U18 a DEC-U49, decisão de 06/11 "servidor sem IPv6"

---

## 1. Contexto

- A VPS contratada (HostGator) **não tem IPv6**. Tudo precisa funcionar só com IPv4.
- O proprietário exige **portas bem definidas**, sem conflito.
- O sistema terá **duas faces públicas**: a plataforma interna (vendedores, donos) e a **loja online** num subdomínio, as duas contabilizadas no mesmo banco.
- Banco e login no **Supabase gerenciado** (proposta da Etapa 0). A documentação oficial do Supabase informa que a **conexão direta com o banco é só IPv6** (ou IPv4 com um adicional pago), enquanto o **pooler compartilhado (Supavisor) é IPv4** em todos os planos.

## 2. Decisão

### 2.1 Topologia

```text
                  Internet (somente IPv4)
                           │
                 ┌─────────┴─────────┐
                 │  VPS HostGator    │   IP público IPv4 único
                 │  Firewall: 22,80,443 abertas; resto fechado
                 │                   │
                 │  Caddy (proxy reverso + HTTPS automático)  :80 :443
                 │     │        │         │          │
                 │     ▼        ▼         ▼          ▼
                 │  127.0.0.1  127.0.0.1  127.0.0.1  127.0.0.1
                 │  :3000      :3001      :3100      :3101
                 │  plataforma loja       plataforma loja       ← containers Docker
                 │  (produção) (produção) (homolog.)  (homolog.)
                 │
                 │  worker produção (sem porta pública; saúde em 127.0.0.1:3010)
                 │  worker homolog. (saúde em 127.0.0.1:3110)
                 └─────────┬─────────┘
                           │ saída IPv4
     ┌─────────────────────┼──────────────────────────────────────────┐
     ▼                     ▼                                          ▼
 Supabase (HTTPS 443    Supabase pooler compartilhado          APIs externas (HTTPS 443):
 para API/Auth/Storage) aws-*-<região>.pooler.supabase.com     Nogle, PicPay, PagBank, Meta,
                        :5432 (modo sessão, IPv4)              Mercado Livre, Shopee, TikTok
```

### 2.2 Domínios (somente registros A — nenhum AAAA)

| Endereço | Uso | Ambiente | Aponta para |
|---|---|---|---|
| `app.ora5g.com.br` | Plataforma interna (PDV, gestão, painel dos donos) | Produção | Registro **A** → IPv4 da VPS |
| `loja.ora5g.com.br` | Loja online (vitrine, carrinho, pedidos) | Produção | Registro **A** → IPv4 da VPS |
| `hml-app.ora5g.com.br` | Plataforma em homologação (testes) | Homologação | Registro **A** → IPv4 da VPS |
| `hml-loja.ora5g.com.br` | Loja online em homologação | Homologação | Registro **A** → IPv4 da VPS |
| `ora5g.com.br` e `www` | Site institucional atual; pode passar a redirecionar para a loja quando ela estiver pronta | — | Sem mudança agora |

Regras de DNS:
- **Não criar registros AAAA.** Se o painel DNS criar automaticamente, **apagar**. Um AAAA apontando para lugar nenhum faz celulares com IPv6 tentarem o endereço errado e a página "não abrir".
- TTL de 300 s durante a implantação (troca rápida em caso de erro); 3600 s depois de estável.
- **Preservar os registros de e-mail existentes** (MX, SPF, DKIM, DMARC) ao mexer no DNS. A migração do Hostoo para a HostGator não pode derrubar o e-mail do domínio.
- Registro CAA autorizando apenas a Let's Encrypt (opcional, recomendado).

### 2.3 Mapa de portas

**Portas abertas para a internet (firewall):**

| Porta | Protocolo | Serviço | Motivo |
|---|---|---|---|
| 22 | TCP | SSH | Administração do servidor. **Somente login por chave**, senha desativada, proteção contra tentativas repetidas (fail2ban). Pode ser movida para outra porta numa etapa futura, documentando a mudança |
| 80 | TCP | Caddy | Emissão/renovação do certificado HTTPS (Let's Encrypt, desafio HTTP) e redirecionamento automático para 443 |
| 443 | TCP | Caddy | Todo o tráfego real (HTTPS) dos quatro endereços acima e os avisos (webhooks) das integrações |

Todas as demais portas de entrada ficam **fechadas**. HTTP/3 (UDP 443) desativado nesta fase para simplificar.

**Portas internas (somente 127.0.0.1, invisíveis da internet):**

| Porta | Serviço | Ambiente |
|---|---|---|
| 3000 | Plataforma (Next.js) | Produção |
| 3001 | Loja online (Next.js) | Produção |
| 3010 | Worker — verificação de saúde | Produção |
| 3100 | Plataforma (Next.js) | Homologação |
| 3101 | Loja online (Next.js) | Homologação |
| 3110 | Worker — verificação de saúde | Homologação |
| 2019 | API administrativa do Caddy (padrão do Caddy, só local) | Servidor |

Faixas **reservadas**: 3000–3099 produção, 3100–3199 homologação. Nenhum outro serviço pode usar essas faixas. Banco de dados **não roda na VPS** (fica no Supabase), então **não há porta 5432 aberta** no servidor.

**Saídas do servidor (para fora):**

| Destino | Porta | Para quê |
|---|---|---|
| APIs HTTPS (Supabase, Nogle, PicPay, PagBank, Meta, Mercado Livre, Shopee, TikTok, emissor fiscal) | 443 | Integrações |
| Pooler do Supabase (`aws-*-<região>.pooler.supabase.com`) | 5432 | Banco de dados em modo sessão (IPv4) |
| Servidor SMTP | 587 | Envio de e-mail (nota, OS, recuperação de senha) |
| Let's Encrypt | 443 | Certificados |

### 2.4 Regras específicas para funcionar só em IPv4

1. **Banco:** aplicação, worker e migrations usam a **string de conexão do pooler compartilhado em modo sessão (porta 5432)**, obtida no painel do Supabase em *Connect → Session pooler*. A conexão direta (`db.<projeto>.supabase.co`) **não será usada**, por ser IPv6. O adicional de IPv4 pago fica como opção futura, só se houver necessidade comprovada.
2. **Containers Docker:** as portas são publicadas **explicitamente em 127.0.0.1** (ex.: `"127.0.0.1:3000:3000"`). Motivo: o Docker cria regras próprias de firewall e uma porta publicada em todas as interfaces fica exposta mesmo com o firewall do sistema fechado. IPv6 do Docker permanece **desligado** (`"ipv6": false`).
3. **Rede interna do Docker:** sub-rede IPv4 fixa `172.28.0.0/24` (produção) e `172.28.1.0/24` (homologação), para não colidir com outras redes.
4. **Node.js:** usar sempre **`127.0.0.1`**, nunca `localhost`, em endereços internos. Definir `NODE_OPTIONS=--dns-result-order=ipv4first`. Motivo: versões recentes do Node podem resolver `localhost` primeiro como IPv6 (`::1`) e falhar ao chamar um serviço que só escuta em IPv4.
5. **Next.js dentro do container:** escuta em `0.0.0.0` na sua porta (o isolamento vem da publicação em 127.0.0.1 do item 2).
6. **Caddy:** encaminha para `127.0.0.1:<porta>` de cada serviço; HTTPS automático por endereço.
7. **Teste de conectividade obrigatório** antes do primeiro deploy (script `scripts/verificar-ipv4.sh`): DNS só com registros A, HTTPS respondendo em IPv4, conexão ao pooler do Supabase, saída para cada API externa e envio de e-mail.

### 2.5 Ambientes

| Ambiente | Onde roda | Banco | Dados |
|---|---|---|---|
| Desenvolvimento | Computador/ambiente dos agentes | Supabase local (CLI) ou projeto Supabase de dev | Fictícios |
| Homologação | VPS (`hml-*`), portas 31xx | Projeto Supabase **separado** | Fictícios + CSV da Rein anonimizado quando houver |
| Produção | VPS (`app`, `loja`), portas 30xx | Projeto Supabase **separado** | Reais |

Credenciais **nunca** são compartilhadas entre ambientes. Se a VPS ficar apertada de memória com os dois ambientes, a homologação sai da VPS (decisão a reavaliar com as especificações do servidor).

### 2.6 Implantação

- Imagem Docker construída pelo GitHub Actions a cada versão aprovada; o servidor só baixa e executa.
- `docker compose` separado por ambiente (`deploy/compose.producao.yml`, `deploy/compose.homologacao.yml`).
- Deploy em produção **somente com aprovação humana** (CLAUDE.md, *human-in-the-loop*).
- Rollback: voltar para a imagem anterior marcada com a versão.

## 3. Alternativas consideradas

| Alternativa | Por que não agora |
|---|---|
| Nginx + Certbot no lugar do Caddy | Funciona, mas exige configurar e renovar certificados manualmente; Caddy faz isso sozinho com menos arquivos para errar |
| Banco PostgreSQL dentro da VPS | Mais trabalho de backup, atualização e segurança; dividiria memória com a aplicação |
| Adicional de IPv4 do Supabase | Custo mensal extra; o pooler em modo sessão resolve sem custo |
| Plataforma e loja no mesmo app Next.js | Mistura a área pública (clientes anônimos) com a interna (dados de clientes e caixa); separar reduz o risco e permite atualizar a loja sem mexer no PDV |
| Painel cPanel/WHM gerenciando o servidor | O Apache do cPanel ocupa as portas 80/443 e conflita com o proxy. Ver pergunta 1 |

## 4. Consequências

- Somente três portas expostas; todo o resto é interno.
- O mapa de portas fica versionado e qualquer novo serviço precisa de uma porta da faixa reservada, registrada neste ADR.
- O modo sessão do pooler tem limite de conexões por plano; a aplicação usará **poucas conexões reutilizadas** (pool pequeno por processo).

## 4A. Revisão de 06/11/2026 — a VPS veio com cPanel/WHM

**Fatos informados pelo proprietário:** VPS HostGator com **cPanel/WHM**, **16 GB de RAM, 500 GB de disco** (processador corrigido para 4 vCPUs após conferência no WHM); e-mail da empresa ficará na HostGator (incluso no plano por 1 ano); o proprietário quer **todo o ecossistema na HostGator**, mantendo o domínio registrado no Registro.br; sistema operacional e IPv4 ainda a consultar.

**Domínio:** domínios `.com.br` são registrados no Registro.br; não é preciso transferir. Basta **delegar o DNS**: no Registro.br, trocar os servidores DNS do domínio pelos indicados pela HostGator e passar a administrar os registros no WHM/cPanel.

**Opções para o sistema conviver com o cPanel:**

| | Opção A — manter cPanel (recomendada pelo objetivo do proprietário) | Opção B — reinstalar sem cPanel |
|---|---|---|
| E-mail, DNS e certificados | Pelo cPanel (e-mail incluso, AutoSSL) | Precisam de outro serviço |
| Entrada HTTPS (80/443) | **Apache do cPanel** encaminha `app`/`loja`/`hml-*` para `127.0.0.1:30xx/31xx` por arquivos de inclusão suportados pelo cPanel (sobrevivem às atualizações) | Caddy, como no item 2.3 |
| Execução do sistema | Serviços Node gerenciados pelo **systemd**, nas mesmas portas internas. Docker só no CI, para evitar conflito com o firewall do cPanel | Docker, como no item 2.6 |
| Portas abertas | Além de 22/80/443, as do cPanel (painéis 2083/2087, webmail 2096, e-mail 25/465/587/993/995, DNS 53 se o DNS ficar na própria VPS). Acesso aos painéis restrito | Somente 22/80/443 |
| Risco | Mais serviços expostos; configuração precisa respeitar o cPanel | Perde a conveniência do pacote HostGator |

As faixas internas 3000–3099 (produção) e 3100–3199 (homologação) **não colidem** com as portas padrão do cPanel e ficam mantidas nas duas opções. Com 16 GB de RAM, produção e homologação cabem na mesma VPS.

**Pendente:** escolha do proprietário entre A e B.

**Dados conferidos no WHM em 06/11/2026 (prints enviados pelo proprietário):**

| Item | Valor |
|---|---|
| IPv4 público (único, compartilhado) | `69.6.214.94` — campo IPv6 vazio no WHM, confirmando servidor só IPv4 |
| Nome do servidor | `dedi-16403309.ora5g.com.br` |
| Sistema operacional | Família Red Hat Enterprise Linux 9 (kernel `el9_7`), **não Ubuntu**; distribuição exata a confirmar (provavelmente AlmaLinux 9 ou CloudLinux 9) |
| Processador | **4 vCPUs** AMD EPYC (corrige a informação anterior de 8 núcleos) |
| Memória | 16 GB + 4 GB de swap; ~1,4 GB em uso |
| Disco | 512 GiB; partição principal com 469 GB livres. `/tmp` tem só 3,9 GB, então builds não rodam no servidor (são feitos no GitHub Actions) |
| Placa de rede | `ens3` |
| Servidores DNS configurados no WHM | `ns1.ora5g.com.br` e `ns2.ora5g.com.br` (DNS rodando na própria VPS) |
| Conta cPanel | `ora5g.com.br`, criada em 04/11/2026, no IP 69.6.214.94 |

Consequências: os scripts do servidor serão escritos para a família Red Hat 9 (`dnf`, `firewalld`/CSF, `systemd`), e não para Ubuntu. Com 4 vCPUs e 16 GB, produção e homologação continuam cabendo na mesma VPS, desde que as builds sejam feitas fora dela.

## 5. Perguntas que bloqueiam a aprovação

1. ~~A VPS veio com cPanel/WHM?~~ **Sim (06/11).** Ver seção 4A: falta escolher entre a opção A e a B.
2. ~~Memória, processador e disco.~~ **16 GB, 4 vCPUs, 512 GiB, família Red Hat 9, IPv4 69.6.214.94 (06/11)** — ver dados conferidos na seção 4A.
3. ~~E-mail.~~ **Fica na HostGator (06/11).** Criar a caixa `nao-responda@ora5g.com.br` depois que o DNS for delegado. Atenção: o e-mail é gratuito só no primeiro ano.
4. ~~Quem administra o DNS do `ora5g.com.br` hoje?~~ **Respondido em 06/11: o domínio está no Registro.br; o proprietário quer delegar o DNS para a HostGator (seção 4A).** Depois da delegação, os registros A (`app`, `loja`, `hml-app`, `hml-loja`) serão criados no editor de zona do WHM/cPanel, sem nenhum AAAA. Antes de qualquer alteração, a zona atual (principalmente MX, SPF, DKIM e DMARC do e-mail) será exportada e anexada a este ADR, para não perder nenhum registro. Registro CAA só se o painel oferecer (é opcional).
