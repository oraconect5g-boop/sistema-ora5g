-- =============================================================================
-- Ordem de serviço da assistência técnica: abertura, fotos, custódia e aviso pelo WhatsApp (lote L12a:
-- ORA-OS-001, ORA-OS-002 e ORA-OS-005 em parte; DEC-U44 e DEC-U47, seção 2C da Etapa 0)
--
-- Todo aparelho de cliente que entra na loja para assistência, até limpeza, ganha uma OS numerada no lugar da folha de
-- papel: o cliente da rede (com WhatsApp), o aparelho (descrição e IMEI, ou número de série se não tiver IMEI), o
-- defeito relatado, o estado em que chegou, os acessórios deixados, o prazo combinado (opcional) e as fotos. A
-- custódia fica registrada passo a passo: na loja → a caminho do técnico → com o técnico → a caminho da loja → na
-- loja; a OS se encerra devolvida ao cliente (sem conserto, com motivo) ou cancelada (aberta por engano, antes de sair
-- da loja, pela gerência). O orçamento, a aprovação do cliente e a entrega com cobrança pelo PDV vêm nos lotes
-- seguintes (L12b e L12c).
--   * Permissões: os.abrir (dono, gerente e vendedor; já existia) abre, envia ao técnico, recebe de volta na loja,
--     guarda fotos, devolve ao cliente e pega o contato para o aviso; os.gerir (nova: dono e gerente) cancela e
--     registra o passo do técnico em nome dele, com observação (sem login do técnico: decisão P5 pendente); os.orcar
--     (técnico; já existia) registra o recebimento e a devolução na assistência para onde a OS foi.
--   * public.ordens_servico (RLS: quem abre OS na loja, quem gere e o técnico da assistência para onde ela foi; o nome
--     do cliente e o contato mascarado ficam na OS, porque o cadastro protegido do cliente não é lido pela API),
--     public.os_eventos (só inserção: cada passo, quem, de onde para onde, a observação e se foi em nome do técnico)
--     e public.os_fotos (bucket privado "os", até 8 por OS; nada se apaga).
--   * public.os_abrir(dados, chave): idempotente pela chave; o mesmo IMEI não tem duas OS abertas na rede (OR031); o
--     cadastro do cliente ganha a finalidade "assistência" (que pede o telefone).
--   * public.os_custodia(os, passo, assistencia, observacao): a máquina de estados da custódia; passo já feito não
--     muda nada (devolve falso); passo fora de ordem é recusado. Sem a assistência escolhida, vai para a única ativa da
--     rede (há um técnico central, DEC-U47); com mais de uma, é preciso escolher. public.os_assistencias() lista as
--     ativas para a tela (quem é só da loja não lê as outras unidades).
--   * public.os_anexar_foto(os, caminho, sha256): registra a foto que já está no Storage (o servidor confere o
--     conteúdo antes de enviar; o banco confere o caminho, o tipo e o tamanho guardados).
--   * public.os_contato_whatsapp(os, aviso): o WhatsApp do cliente para o aviso (comprovante; aparelho de volta na
--     loja), registrado na OS e na auditoria sem o número. O envio é pelo botão que abre o WhatsApp com a mensagem
--     pronta (clique para conversar), sem automação não oficial, até a API oficial (ORA-WHATS-001).
--   * public.loja_definir_situacao (a do L2): inativar a loja passa a conferir também a OS aberta.
-- Reversão: supabase/reversao/<mesmo nome>.sql.
-- =============================================================================

do $$
begin
  perform set_config('ora.motivo', 'Ordem de serviço da assistência técnica (ORA-OS-001, ORA-OS-002)', true);
  insert into public.permissoes (codigo, descricao, modulo) values
    ('os.gerir', 'Cancelar ordem de serviço e registrar o passo do técnico em nome dele', 'assistencia');
  insert into public.papel_permissoes (papel, permissao) values ('dono', 'os.gerir'), ('gerente', 'os.gerir');
end;
$$;

-- -----------------------------------------------------------------------------
-- 1. Tabelas
-- -----------------------------------------------------------------------------
create table public.ordens_servico (
  id uuid primary key default gen_random_uuid(),
  numero bigint generated always as identity unique,
  organizacao_id uuid not null,
  unidade_id uuid not null,
  cliente_id uuid not null references public.clientes (id),
  cliente_nome text not null check (length(cliente_nome) between 2 and 120),
  contato_mascarado text not null,
  aparelho text not null check (length(aparelho) between 2 and 120),
  imei text check (imei is null or imei ~ '^[0-9]{15}$'),
  numero_serie text check (numero_serie is null or numero_serie ~ '^[A-Z0-9./-]{3,40}$'),
  defeito text not null check (length(defeito) between 3 and 500),
  estado_entrada text not null check (length(estado_entrada) between 3 and 500),
  acessorios text[] not null default '{}'
    check (acessorios <@ array['carregador', 'cabo', 'fone', 'capa', 'pelicula', 'chip', 'cartao_memoria', 'caixa']),
  acessorios_obs text check (acessorios_obs is null or length(acessorios_obs) between 2 and 200),
  prazo date,
  local text not null default 'loja' check (local in ('loja', 'a_caminho_do_tecnico', 'com_tecnico', 'a_caminho_da_loja', 'com_cliente')),
  situacao text not null default 'aberta' check (situacao in ('aberta', 'devolvida', 'cancelada')),
  assistencia_id uuid references public.unidades (id),
  chave text not null check (length(trim(chave)) between 8 and 80),
  conteudo text not null,
  aberta_por uuid not null references public.perfis_usuario (id),
  aberta_em timestamptz not null default now(),
  atualizada_em timestamptz not null default now(),
  encerrada_em timestamptz,
  motivo_encerramento text check (motivo_encerramento is null or length(motivo_encerramento) between 3 and 200),
  foreign key (unidade_id, organizacao_id) references public.unidades (id, organizacao_id),
  unique (organizacao_id, chave),
  constraint os_identificada check (imei is not null or numero_serie is not null),
  constraint os_encerramento check (
    (situacao = 'aberta') = (encerrada_em is null) and (situacao = 'aberta') = (motivo_encerramento is null)
    and (situacao = 'aberta') = (local <> 'com_cliente')),
  constraint os_com_tecnico_tem_assistencia check (local not in ('a_caminho_do_tecnico', 'com_tecnico', 'a_caminho_da_loja') or assistencia_id is not null)
);
comment on table public.ordens_servico is
  'Ordem de serviço da assistência (L12a, ORA-OS-001/002): aparelho de cliente sob a custódia da rede, do recebimento à devolução.';
create unique index ordens_servico_imei_aberta on public.ordens_servico (organizacao_id, imei) where situacao = 'aberta' and imei is not null;
create index ordens_servico_unidade on public.ordens_servico (unidade_id, organizacao_id, situacao);
create index ordens_servico_cliente on public.ordens_servico (cliente_id);
create index ordens_servico_assistencia on public.ordens_servico (assistencia_id) where assistencia_id is not null;
create index ordens_servico_aberta_por on public.ordens_servico (aberta_por);
create trigger ordens_servico_auditar after insert or update on public.ordens_servico
  for each row execute function privado.auditar_mudanca();
create trigger ordens_servico_loja_ativa before insert on public.ordens_servico
  for each row execute function privado.loja_ativa_para_movimento('unidade_id');

create table public.os_eventos (
  id bigint generated always as identity primary key,
  organizacao_id uuid not null,
  os_id uuid not null references public.ordens_servico (id),
  tipo text not null check (tipo in ('aberta', 'enviada_ao_tecnico', 'recebida_pelo_tecnico', 'devolvida_pelo_tecnico', 'recebida_na_loja',
                                    'devolvida_ao_cliente', 'cancelada', 'foto', 'aviso_whatsapp')),
  local_de text,
  local_para text,
  observacao text check (observacao is null or length(observacao) between 2 and 300),
  em_nome_do_tecnico boolean not null default false,
  usuario_id uuid not null references public.perfis_usuario (id),
  unidade_id uuid not null references public.unidades (id),
  ocorrido_em timestamptz not null default now()
);
create index os_eventos_os on public.os_eventos (os_id, id);
create index os_eventos_usuario on public.os_eventos (usuario_id);
create index os_eventos_unidade on public.os_eventos (unidade_id);
create trigger os_eventos_sem_alteracao before update or delete on public.os_eventos
  for each row execute function privado.so_insercao();
create trigger os_eventos_sem_truncate before truncate on public.os_eventos
  for each statement execute function privado.so_insercao();

create table public.os_fotos (
  id uuid primary key default gen_random_uuid(),
  organizacao_id uuid not null,
  os_id uuid not null references public.ordens_servico (id),
  caminho text not null unique,
  tipo text not null check (tipo in ('image/jpeg', 'image/png', 'image/webp')),
  bytes int not null check (bytes > 0),
  sha256 text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  enviada_por uuid not null references public.perfis_usuario (id),
  enviada_em timestamptz not null default now()
);
create index os_fotos_os on public.os_fotos (os_id);
create index os_fotos_enviada_por on public.os_fotos (enviada_por);
create trigger os_fotos_sem_alteracao before update or delete on public.os_fotos
  for each row execute function privado.so_insercao();
create trigger os_fotos_sem_truncate before truncate on public.os_fotos
  for each statement execute function privado.so_insercao();

alter table public.ordens_servico enable row level security;
alter table public.os_eventos enable row level security;
alter table public.os_fotos enable row level security;
revoke all on public.ordens_servico, public.os_eventos, public.os_fotos from anon, authenticated;
revoke all on sequence public.ordens_servico_numero_seq, public.os_eventos_id_seq from anon, authenticated;
grant select on public.ordens_servico, public.os_eventos, public.os_fotos to authenticated;
-- Quem abre OS na loja (a loja do turno, para quem é da loja), quem gere e o técnico da assistência para onde ela foi.
create policy ordens_servico_ler on public.ordens_servico for select to authenticated
  using (unidade_id in (select privado.unidades_com_permissao('os.abrir'))
         or unidade_id in (select privado.unidades_com_permissao('os.gerir'))
         or assistencia_id in (select privado.unidades_com_permissao('os.orcar')));
create policy os_eventos_ler on public.os_eventos for select to authenticated
  using (os_id in (select o.id from public.ordens_servico o));
create policy os_fotos_ler on public.os_fotos for select to authenticated
  using (os_id in (select o.id from public.ordens_servico o));

-- Fotos no bucket privado "os": <organização>/<loja>/<os>/<id>.<jpg|png|webp>. Envia quem abre OS na loja da pasta;
-- lê quem lê a OS (o mesmo RLS), sempre por link assinado e temporário.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('os', 'os', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;
create policy os_fotos_ler on storage.objects for select to authenticated
  using (bucket_id = 'os' and (storage.foldername(name))[3] in (select o.id::text from public.ordens_servico o));
create policy os_fotos_enviar on storage.objects for insert to authenticated
  with check (bucket_id = 'os'
              and array_length(storage.foldername(name), 1) = 3
              and (storage.foldername(name))[2] in (select u::text from privado.unidades_com_permissao('os.abrir') as u));

-- -----------------------------------------------------------------------------
-- 2. Funções
-- -----------------------------------------------------------------------------
create or replace function privado.os_evento(p_os public.ordens_servico, p_tipo text, p_de text, p_para text, p_observacao text,
                                             p_em_nome_do_tecnico boolean, p_unidade uuid)
returns void
language sql
volatile
security definer
set search_path = ''
as $$
  insert into public.os_eventos (organizacao_id, os_id, tipo, local_de, local_para, observacao, em_nome_do_tecnico, usuario_id, unidade_id)
  values (p_os.organizacao_id, p_os.id, p_tipo, p_de, p_para, p_observacao, coalesce(p_em_nome_do_tecnico, false), (select auth.uid()), p_unidade);
$$;
revoke all on function privado.os_evento(public.ordens_servico, text, text, text, text, boolean, uuid) from public, anon, authenticated;

-- Abrir a OS (tela da loja). O cliente vem do cadastro da rede (busca ou cadastro rápido com WhatsApp).
create or replace function public.os_abrir(p_dados jsonb, p_chave text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_unidade uuid := (select public.unidade_atual());
  v_organizacao uuid;
  v_conteudo text := md5(coalesce(p_dados, '{}'::jsonb)::text);
  v_existente public.ordens_servico;
  v_cliente uuid;
  v_nome text;
  v_telefone text;
  v_aparelho text := nullif(regexp_replace(trim(coalesce(p_dados ->> 'aparelho', '')), '\s+', ' ', 'g'), '');
  v_imei text := nullif(regexp_replace(coalesce(p_dados ->> 'imei', ''), '[^0-9]', '', 'g'), '');
  v_serie text := nullif(upper(regexp_replace(coalesce(p_dados ->> 'serie', ''), '\s+', '', 'g')), '');
  v_defeito text := nullif(regexp_replace(trim(coalesce(p_dados ->> 'defeito', '')), '\s+', ' ', 'g'), '');
  v_estado text := nullif(regexp_replace(trim(coalesce(p_dados ->> 'estado', '')), '\s+', ' ', 'g'), '');
  v_acessorios text[];
  v_obs text := nullif(regexp_replace(trim(coalesce(p_dados ->> 'acessorios_obs', '')), '\s+', ' ', 'g'), '');
  v_prazo date;
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  v_outra bigint;
  nova public.ordens_servico;
begin
  if v_unidade is null or not (select public.tem_permissao('os.abrir', v_unidade)) then
    raise exception 'Sem permissão para abrir ordem de serviço na loja do turno' using errcode = '42501';
  end if;
  if p_dados is null or jsonb_typeof(p_dados) <> 'object' then
    raise exception 'Dados da ordem de serviço inválidos' using errcode = '22023';
  end if;
  if p_chave is null or length(trim(p_chave)) not between 8 and 80 then
    raise exception 'Chave do formulário obrigatória' using errcode = '22023';
  end if;
  select u.organizacao_id into v_organizacao from public.unidades u where u.id = v_unidade;
  perform pg_advisory_xact_lock(privado.trava_da_chave('ordens_servico', v_organizacao, trim(p_chave)));
  select * into v_existente from public.ordens_servico o where o.organizacao_id = v_organizacao and o.chave = trim(p_chave);
  if found then
    if v_existente.conteudo <> v_conteudo then
      raise exception 'Chave de idempotência já usada em outra ordem de serviço' using errcode = 'OR004';
    end if;
    return jsonb_build_object('id', v_existente.id, 'numero', v_existente.numero, 'repetida', true);
  end if;

  if coalesce(p_dados ->> 'cliente', '') !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' then
    raise exception 'Escolha o cliente da ordem de serviço' using errcode = '22023';
  end if;
  select c.id, c.nome, d.telefone into v_cliente, v_nome, v_telefone
  from public.clientes c join privado.cliente_dados d on d.cliente_id = c.id
  where c.id = (p_dados ->> 'cliente')::uuid and c.organizacao_id = v_organizacao and c.situacao = 'ativo'
  for no key update of c;
  if v_cliente is null then
    raise exception 'Cliente não encontrado' using errcode = 'P0002';
  end if;
  if v_telefone is null then
    raise exception 'O cliente não tem WhatsApp no cadastro: complete o cadastro para ele receber o comprovante e os avisos' using errcode = '22023';
  end if;
  if v_aparelho is null or length(v_aparelho) not between 2 and 120 then
    raise exception 'Informe o aparelho (marca e modelo)' using errcode = '22023';
  end if;
  if v_imei is not null and not privado.imei_valido(v_imei) then
    raise exception 'IMEI inválido: confira os 15 números (*#06# no aparelho ou na caixa)' using errcode = '22023';
  end if;
  if v_serie is not null and v_serie !~ '^[A-Z0-9./-]{3,40}$' then
    raise exception 'Número de série inválido (de 3 a 40 letras e números)' using errcode = '22023';
  end if;
  if v_imei is null and v_serie is null then
    raise exception 'Informe o IMEI do aparelho (ou o número de série, se ele não tiver IMEI)' using errcode = '22023';
  end if;
  if v_defeito is null or length(v_defeito) not between 3 and 500 then
    raise exception 'Descreva o defeito relatado pelo cliente (de 3 a 500 letras)' using errcode = '22023';
  end if;
  if v_estado is null or length(v_estado) not between 3 and 500 then
    raise exception 'Descreva o estado em que o aparelho chegou: tela, tampa, riscos (de 3 a 500 letras)' using errcode = '22023';
  end if;
  if p_dados ? 'acessorios' and jsonb_typeof(p_dados -> 'acessorios') <> 'array' then
    raise exception 'Acessórios inválidos' using errcode = '22023';
  end if;
  v_acessorios := coalesce(array(select distinct x from jsonb_array_elements_text(coalesce(p_dados -> 'acessorios', '[]'::jsonb)) x order by x), '{}');
  if not (v_acessorios <@ array['carregador', 'cabo', 'fone', 'capa', 'pelicula', 'chip', 'cartao_memoria', 'caixa']) then
    raise exception 'Acessório desconhecido' using errcode = '22023';
  end if;
  if v_obs is not null and length(v_obs) not between 2 and 200 then
    raise exception 'Observação dos acessórios: de 2 a 200 letras' using errcode = '22023';
  end if;
  if nullif(p_dados ->> 'prazo', '') is not null then
    begin
      v_prazo := (p_dados ->> 'prazo')::date;
    exception when others then
      raise exception 'Prazo combinado inválido' using errcode = '22023';
    end;
    if (p_dados ->> 'prazo') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' or v_prazo < v_hoje or v_prazo > v_hoje + 90 then
      raise exception 'O prazo combinado vai de hoje a 90 dias' using errcode = '22023';
    end if;
  end if;
  -- O mesmo aparelho não tem duas OS abertas na rede (a trava e o índice único seguram a corrida).
  if v_imei is not null then
    perform pg_advisory_xact_lock(privado.trava_da_chave('ordens_servico:imei', v_organizacao, v_imei));
    select o.numero into v_outra from public.ordens_servico o where o.organizacao_id = v_organizacao and o.imei = v_imei and o.situacao = 'aberta';
    if found then
      raise exception 'Este aparelho já tem a OS nº % aberta: continue por ela', v_outra using errcode = 'OR031';
    end if;
  end if;
  -- O cliente passa a ter a finalidade "assistência" (o telefone fica para os avisos da OS).
  update public.clientes c set finalidades = array(select distinct x from unnest(c.finalidades || array['assistencia']) x order by x),
    atualizado_por = (select auth.uid()), atualizado_em = now()
  where c.id = v_cliente and not ('assistencia' = any (c.finalidades));
  if found then
    insert into public.auditoria (usuario_id, unidade_id, organizacao_id, acao, alvo_tipo, alvo_id, depois, motivo, origem)
    values ((select auth.uid()), v_unidade, v_organizacao, 'cliente.alterado', 'cliente', v_cliente::text,
            jsonb_build_object('campos', jsonb_build_array('finalidades')), 'Ordem de serviço aberta para o cliente', 'aplicacao');
  end if;
  perform set_config('ora.motivo', 'Ordem de serviço aberta', true);
  begin
    insert into public.ordens_servico (organizacao_id, unidade_id, cliente_id, cliente_nome, contato_mascarado, aparelho, imei, numero_serie,
                                       defeito, estado_entrada, acessorios, acessorios_obs, prazo, chave, conteudo, aberta_por)
    values (v_organizacao, v_unidade, v_cliente, v_nome, privado.mascara_telefone(v_telefone), v_aparelho, v_imei, v_serie,
            v_defeito, v_estado, v_acessorios, v_obs, v_prazo, trim(p_chave), v_conteudo, (select auth.uid()))
    returning * into nova;
  exception when unique_violation then
    raise exception 'Este aparelho já tem uma OS aberta: continue por ela' using errcode = 'OR031';
  end;
  perform privado.os_evento(nova, 'aberta', null, 'loja', null, false, v_unidade);
  return jsonb_build_object('id', nova.id, 'numero', nova.numero, 'repetida', false);
end;
$$;

-- A custódia, passo a passo. Passo já feito devolve falso (clique repetido); fora de ordem é recusado.
create or replace function public.os_custodia(p_os uuid, p_passo text, p_assistencia uuid, p_observacao text)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_unidade uuid := (select public.unidade_atual());
  os public.ordens_servico;
  v_obs text := nullif(regexp_replace(trim(coalesce(p_observacao, '')), '\s+', ' ', 'g'), '');
  v_pela_loja boolean;
  v_gere boolean;
  v_tecnico boolean;
  v_de text;
  v_para text;
  v_tipo text;
  v_assistencia uuid := p_assistencia;
  v_quantas int;
begin
  if p_passo is null or p_passo not in ('enviar_ao_tecnico', 'tecnico_recebeu', 'tecnico_devolveu', 'loja_recebeu', 'devolver_ao_cliente', 'cancelar') then
    raise exception 'Passo da ordem de serviço desconhecido' using errcode = '22023';
  end if;
  select * into os from public.ordens_servico o where o.id = p_os for update;
  -- coalesce: sem loja do turno ou sem assistência na OS, a comparação dá nulo, e nulo aqui é "não".
  v_pela_loja := coalesce(os.id is not null and os.unidade_id = v_unidade and (select public.tem_permissao('os.abrir', v_unidade)), false);
  v_gere := coalesce(os.id is not null and os.unidade_id = v_unidade and (select public.tem_permissao('os.gerir', v_unidade)), false);
  v_tecnico := coalesce(os.id is not null and os.assistencia_id = v_unidade and (select public.tem_permissao('os.orcar', v_unidade)), false);
  if not (v_pela_loja or v_gere or v_tecnico) then
    raise exception 'Ordem de serviço não encontrada' using errcode = 'P0002';
  end if;
  if v_obs is not null and length(v_obs) not between 2 and 300 then
    raise exception 'Observação: de 2 a 300 letras' using errcode = '22023';
  end if;
  v_de := os.local;
  v_para := case p_passo
    when 'enviar_ao_tecnico' then 'a_caminho_do_tecnico'
    when 'tecnico_recebeu' then 'com_tecnico'
    when 'tecnico_devolveu' then 'a_caminho_da_loja'
    when 'loja_recebeu' then 'loja'
    else 'com_cliente' end;
  v_tipo := case p_passo
    when 'enviar_ao_tecnico' then 'enviada_ao_tecnico'
    when 'tecnico_recebeu' then 'recebida_pelo_tecnico'
    when 'tecnico_devolveu' then 'devolvida_pelo_tecnico'
    when 'loja_recebeu' then 'recebida_na_loja'
    when 'devolver_ao_cliente' then 'devolvida_ao_cliente'
    else 'cancelada' end;

  -- Quem faz cada passo.
  if p_passo in ('enviar_ao_tecnico', 'loja_recebeu', 'devolver_ao_cliente') and not v_pela_loja then
    raise exception 'Este passo é da loja da ordem de serviço' using errcode = '42501';
  end if;
  if p_passo in ('tecnico_recebeu', 'tecnico_devolveu') and not v_tecnico and not v_gere then
    raise exception 'Só o técnico ou a gerência da loja registra este passo' using errcode = '42501';
  end if;
  if p_passo = 'cancelar' and not v_gere then
    raise exception 'Cancelar a ordem de serviço é da gerência da loja' using errcode = '42501';
  end if;

  -- Já feito (clique repetido ou outra pessoa fez antes): nada muda.
  if os.situacao <> 'aberta' then
    if (p_passo = 'devolver_ao_cliente' and os.situacao = 'devolvida') or (p_passo = 'cancelar' and os.situacao = 'cancelada') then
      return false;
    end if;
    raise exception 'A ordem de serviço já foi encerrada' using errcode = '22023';
  end if;
  if os.local = v_para then
    return false;
  end if;

  -- De onde cada passo sai.
  if (p_passo in ('enviar_ao_tecnico', 'devolver_ao_cliente', 'cancelar') and os.local <> 'loja')
     or (p_passo = 'tecnico_recebeu' and os.local <> 'a_caminho_do_tecnico')
     or (p_passo = 'tecnico_devolveu' and os.local <> 'com_tecnico')
     or (p_passo = 'loja_recebeu' and os.local <> 'a_caminho_da_loja') then
    raise exception 'A ordem de serviço não está no ponto deste passo (está %)', replace(os.local, '_', ' ') using errcode = '22023';
  end if;
  if p_passo = 'enviar_ao_tecnico' then
    if v_assistencia is null then
      select (array_agg(u.id order by u.id))[1], count(*) into v_assistencia, v_quantas from public.unidades u
      where u.organizacao_id = os.organizacao_id and u.tipo = 'assistencia' and u.status = 'ativa';
      if v_quantas = 0 then
        raise exception 'A rede ainda não tem a assistência cadastrada: cadastre em Lojas da rede, com o tipo assistência' using errcode = '22023';
      elsif v_quantas > 1 then
        raise exception 'Escolha a assistência (o técnico) para onde o aparelho vai' using errcode = '22023';
      end if;
    elsif not exists (
         select 1 from public.unidades u
         where u.id = v_assistencia and u.organizacao_id = os.organizacao_id and u.tipo = 'assistencia' and u.status = 'ativa') then
      raise exception 'Escolha a assistência (o técnico) para onde o aparelho vai' using errcode = '22023';
    end if;
  end if;
  if p_passo in ('tecnico_recebeu', 'tecnico_devolveu') and not v_tecnico and v_obs is null then
    raise exception 'Em nome do técnico, diga como ele confirmou (mensagem, ligação, entrega em mãos)' using errcode = '22023';
  end if;
  if p_passo in ('devolver_ao_cliente', 'cancelar') then
    v_obs := privado.exigir_motivo(v_obs);
  end if;
  if p_passo = 'cancelar' and exists (select 1 from public.os_eventos e where e.os_id = os.id and e.tipo = 'enviada_ao_tecnico') then
    raise exception 'A ordem de serviço já foi ao técnico: devolva o aparelho ao cliente em vez de cancelar' using errcode = '22023';
  end if;

  perform set_config('ora.motivo', coalesce(v_obs, 'Ordem de serviço: ' || replace(v_tipo, '_', ' ')), true);
  update public.ordens_servico o set
    local = v_para,
    assistencia_id = case when p_passo = 'enviar_ao_tecnico' then v_assistencia else o.assistencia_id end,
    situacao = case p_passo when 'devolver_ao_cliente' then 'devolvida' when 'cancelar' then 'cancelada' else o.situacao end,
    encerrada_em = case when p_passo in ('devolver_ao_cliente', 'cancelar') then now() else o.encerrada_em end,
    motivo_encerramento = case when p_passo in ('devolver_ao_cliente', 'cancelar') then v_obs else o.motivo_encerramento end,
    atualizada_em = now()
  where o.id = os.id;
  perform privado.os_evento(os, v_tipo, v_de, v_para, v_obs, p_passo in ('tecnico_recebeu', 'tecnico_devolveu') and not v_tecnico, v_unidade);
  return true;
end;
$$;

-- A foto que o servidor já guardou no Storage (até 8 por OS, enquanto ela está aberta).
create or replace function public.os_anexar_foto(p_os uuid, p_caminho text, p_sha256 text)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_unidade uuid := (select public.unidade_atual());
  os public.ordens_servico;
  meta jsonb;
  existente uuid;
  nova uuid;
begin
  select * into os from public.ordens_servico o where o.id = p_os for update;
  if os.id is null or os.unidade_id is distinct from v_unidade or not (select public.tem_permissao('os.abrir', v_unidade)) then
    raise exception 'Ordem de serviço não encontrada' using errcode = 'P0002';
  end if;
  if p_caminho is null or p_caminho !~ ('^' || os.organizacao_id || '/' || os.unidade_id || '/' || os.id || '/[0-9a-f-]{36}\.(jpg|png|webp)$') then
    raise exception 'Caminho da foto fora do padrão desta ordem de serviço' using errcode = '22023';
  end if;
  if p_sha256 is null or p_sha256 !~ '^[0-9a-f]{64}$' then
    raise exception 'Resumo SHA-256 da foto inválido' using errcode = '22023';
  end if;
  select f.id into existente from public.os_fotos f where f.caminho = p_caminho;
  if found then
    return existente;
  end if;
  if os.situacao <> 'aberta' then
    raise exception 'A ordem de serviço já foi encerrada' using errcode = '22023';
  end if;
  if (select count(*) from public.os_fotos f where f.os_id = os.id) >= 8 then
    raise exception 'Esta ordem de serviço já tem 8 fotos' using errcode = '22023';
  end if;
  select o.metadata into meta from storage.objects o where o.bucket_id = 'os' and o.name = p_caminho;
  if meta is null then
    raise exception 'A foto não chegou ao Storage' using errcode = 'P0002';
  end if;
  if coalesce(meta ->> 'mimetype', '') not in ('image/jpeg', 'image/png', 'image/webp')
     or coalesce(meta ->> 'size', '') !~ '^[0-9]{1,8}$' or (meta ->> 'size')::int not between 1 and 5242880 then
    raise exception 'O arquivo guardado não é uma foto válida' using errcode = '22023';
  end if;
  insert into public.os_fotos (organizacao_id, os_id, caminho, tipo, bytes, sha256, enviada_por)
  values (os.organizacao_id, os.id, p_caminho, meta ->> 'mimetype', (meta ->> 'size')::int, p_sha256, (select auth.uid()))
  returning id into nova;
  perform privado.os_evento(os, 'foto', null, null, null, false, v_unidade);
  return nova;
end;
$$;

-- O WhatsApp do cliente para o aviso (o botão abre a conversa com a mensagem pronta). Fica na OS e na auditoria, sem o
-- número. "comprovante": enquanto a OS está aberta; "na_loja": o aparelho voltou do técnico e está na loja.
create or replace function public.os_contato_whatsapp(p_os uuid, p_aviso text)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_unidade uuid := (select public.unidade_atual());
  os public.ordens_servico;
  v_telefone text;
begin
  if p_aviso is null or p_aviso not in ('comprovante', 'na_loja') then
    raise exception 'Aviso desconhecido' using errcode = '22023';
  end if;
  select * into os from public.ordens_servico o where o.id = p_os;
  if os.id is null or os.unidade_id is distinct from v_unidade or not (select public.tem_permissao('os.abrir', v_unidade)) then
    raise exception 'Ordem de serviço não encontrada' using errcode = 'P0002';
  end if;
  if os.situacao <> 'aberta' then
    raise exception 'A ordem de serviço já foi encerrada' using errcode = '22023';
  end if;
  if p_aviso = 'na_loja' and (os.local <> 'loja' or not exists (select 1 from public.os_eventos e where e.os_id = os.id and e.tipo = 'recebida_na_loja')) then
    raise exception 'O aviso de chegada é depois que o aparelho volta do técnico para a loja' using errcode = '22023';
  end if;
  select d.telefone into v_telefone from privado.cliente_dados d where d.cliente_id = os.cliente_id;
  if v_telefone is null then
    raise exception 'O cliente não tem WhatsApp no cadastro: complete o cadastro' using errcode = '22023';
  end if;
  perform privado.os_evento(os, 'aviso_whatsapp', null, null, case p_aviso when 'comprovante' then 'Comprovante' else 'Aparelho de volta na loja' end, false, v_unidade);
  insert into public.auditoria (usuario_id, unidade_id, organizacao_id, acao, alvo_tipo, alvo_id, depois, origem)
  values ((select auth.uid()), v_unidade, os.organizacao_id, 'os.contato_whatsapp', 'ordem_servico', os.id::text,
          jsonb_build_object('aviso', p_aviso), 'aplicacao');
  return v_telefone;
end;
$$;

-- As assistências ativas da rede, para a tela escolher para onde o aparelho vai (quem é só da loja não lê as outras unidades).
create or replace function public.os_assistencias()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_unidade uuid := (select public.unidade_atual());
begin
  if v_unidade is null or not ((select public.tem_permissao('os.abrir', v_unidade)) or (select public.tem_permissao('os.gerir', v_unidade))) then
    raise exception 'Sem permissão para a assistência na loja do turno' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('id', u.id, 'nome', u.nome) order by u.nome, u.id)
    from public.unidades u join public.unidades l on l.id = v_unidade
    where u.organizacao_id = l.organizacao_id and u.tipo = 'assistencia' and u.status = 'ativa'), '[]'::jsonb);
end;
$$;

revoke all on function public.os_abrir(jsonb, text), public.os_custodia(uuid, text, uuid, text), public.os_anexar_foto(uuid, text, text),
  public.os_contato_whatsapp(uuid, text), public.os_assistencias() from public, anon;
grant execute on function public.os_abrir(jsonb, text), public.os_custodia(uuid, text, uuid, text), public.os_anexar_foto(uuid, text, text),
  public.os_contato_whatsapp(uuid, text), public.os_assistencias() to authenticated;

-- -----------------------------------------------------------------------------
-- 3. Inativar a loja confere também a OS aberta (texto do L2, 20261111132503_lojas_cadastro_e_configuracao, com o
--    trecho marcado "L12a").
-- -----------------------------------------------------------------------------
create or replace function public.loja_definir_situacao(p_unidade uuid, p_situacao text, p_motivo text)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_loja public.unidades;
  v_motivo text := privado.exigir_motivo(p_motivo);
  v_pendencias text[] := '{}';
begin
  if p_situacao is null or p_situacao not in ('ativa', 'inativa') then
    raise exception 'Situação inválida' using errcode = '22023';
  end if;
  select * into v_loja from public.unidades u where u.id = p_unidade for update;
  if not found or not privado.gere_lojas_da_organizacao(v_loja.organizacao_id) then
    raise exception 'Loja não encontrada para você' using errcode = 'P0002';
  end if;
  if v_loja.status = p_situacao then
    return false;
  end if;
  if p_situacao = 'inativa' then
    if exists (select 1 from public.caixas c where c.unidade_id = v_loja.id and c.situacao = 'aberto') then
      v_pendencias := v_pendencias || 'caixa aberto'::text;
    end if;
    if exists (select 1 from public.caixas c where c.unidade_id = v_loja.id and c.situacao = 'fechado') then
      v_pendencias := v_pendencias || 'caixa fechado sem conferência'::text;
    end if;
    if exists (select 1 from public.estoque_saldos s where s.unidade_id = v_loja.id and s.quantidade > 0) then
      v_pendencias := v_pendencias || 'saldo em estoque'::text;
    end if;
    if exists (select 1 from public.itens_serializados i
               where i.unidade_id = v_loja.id and i.situacao in ('disponivel', 'reservado', 'em_transito', 'em_assistencia')) then
      v_pendencias := v_pendencias || 'aparelho ou chip na loja'::text;
    end if;
    if exists (select 1 from public.estoque_reservas r where r.unidade_id = v_loja.id and r.situacao = 'ativa') then
      v_pendencias := v_pendencias || 'reserva ativa'::text;
    end if;
    if exists (select 1 from public.transferencias t
               where (t.origem_id = v_loja.id or t.destino_id = v_loja.id) and t.situacao in ('solicitada', 'separada', 'enviada')) then
      v_pendencias := v_pendencias || 'transferência pendente'::text;
    end if;
    if exists (select 1 from public.vendas v where v.unidade_id = v_loja.id and v.situacao in ('rascunho', 'aguardando_aprovacao')) then
      v_pendencias := v_pendencias || 'venda em aberto'::text;
    end if;
    if exists (select 1 from public.notas_pedidos n
               where n.unidade_id = v_loja.id and n.situacao in ('aguardando_aprovacao', 'correcao_solicitada', 'aprovada')) then
      v_pendencias := v_pendencias || 'nota fiscal pendente'::text;
    end if;
    -- L12a: aparelho de cliente em OS aberta, na loja ou na assistência.
    if exists (select 1 from public.ordens_servico o
               where (o.unidade_id = v_loja.id or o.assistencia_id = v_loja.id) and o.situacao = 'aberta') then
      v_pendencias := v_pendencias || 'ordem de serviço aberta'::text;
    end if;
    if cardinality(v_pendencias) > 0 then
      raise exception 'A loja ainda tem %: resolva antes de inativar', array_to_string(v_pendencias, ', ') using errcode = 'OR019';
    end if;
  end if;
  perform set_config('ora.motivo', v_motivo, true);
  update public.unidades u set status = p_situacao where u.id = v_loja.id;
  return true;
end;
$$;

