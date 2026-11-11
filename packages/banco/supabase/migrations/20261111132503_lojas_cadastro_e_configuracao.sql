-- =============================================================================
-- Lojas: cadastro, situação e configuração com vigência (ORA-ORG-001, ORA-ORG-008; lote L2)
--
-- Até aqui as lojas só entravam por migration ou semente. Agora quem tem unidades.gerir (dono e
-- administrador, ADR-002) cria e edita lojas e define a configuração de cada uma, sempre com motivo
-- e auditoria. Nada se apaga:
--   * unidades: criar, editar nome/CNPJ/UF/cidade e ativar/inativar (o gatilho de auditoria que já
--     existe grava antes, depois e motivo). Código e tipo não mudam depois de criados: vendas,
--     estoque e exportações dependem deles (uma loja nova resolve o caso raro);
--   * unidade_configuracoes: telefone, endereço da rua, inscrições estadual e municipal e horários
--     por dia da semana, em versões só de inclusão com "vigente desde" (agora ou no futuro, nunca no
--     passado). A versão vigente é a mais recente que já começou;
--   * inativar exige a loja sem caixa aberto, saldo, reserva ativa, transferência pendente ou venda
--     em aberto (OR019). Loja inativa sai da escolha de loja e da leitura comum (unidades_visiveis);
--     a gestão continua vendo e pode reativar pela leitura própria (lojas_da_rede).
-- Dados reais (CNPJ, endereço) chegam pela linha B2 da lista de pendências; nada é inventado aqui.
-- Códigos: OR019 loja com movimento em aberto não pode ser inativada.
-- Reversão: supabase/reversao/<mesmo nome>.sql.
-- =============================================================================

-- Horários: [{"dia": 0..6 (domingo = 0), "abre": "HH:MM", "fecha": "HH:MM"}], um por dia, abre < fecha.
create or replace function privado.horarios_validos(p_horarios jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select jsonb_typeof(p_horarios) = 'array'
    and jsonb_array_length(p_horarios) <= 7
    and not exists (
      select 1 from jsonb_array_elements(p_horarios) e
      where jsonb_typeof(e) <> 'object'
         or coalesce(e ->> 'dia', '') !~ '^[0-6]$'
         or coalesce(e ->> 'abre', '') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
         or coalesce(e ->> 'fecha', '') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
         or (e ->> 'abre') >= (e ->> 'fecha'))
    and (select count(distinct e ->> 'dia') from jsonb_array_elements(p_horarios) e) = jsonb_array_length(p_horarios);
$$;

create table public.unidade_configuracoes (
  id bigint generated always as identity primary key,
  organizacao_id uuid not null,
  unidade_id uuid not null,
  vigente_desde timestamptz not null,
  telefone text check (telefone is null or telefone ~ '^[0-9]{10,11}$'),
  cep text check (cep is null or cep ~ '^[0-9]{8}$'),
  logradouro text check (logradouro is null or length(trim(logradouro)) between 2 and 120),
  numero text check (numero is null or length(trim(numero)) between 1 and 15),
  complemento text check (complemento is null or length(complemento) <= 60),
  bairro text check (bairro is null or length(trim(bairro)) between 2 and 80),
  inscricao_estadual text check (inscricao_estadual is null or inscricao_estadual ~ '^([0-9]{2,14}|ISENTO)$'),
  inscricao_municipal text check (inscricao_municipal is null or inscricao_municipal ~ '^[0-9A-Za-z./-]{1,20}$'),
  horarios jsonb not null default '[]'::jsonb check (privado.horarios_validos(horarios)),
  motivo text not null check (length(trim(motivo)) >= 3),
  criado_por uuid not null references public.perfis_usuario (id),
  criado_em timestamptz not null default now(),
  foreign key (unidade_id, organizacao_id) references public.unidades (id, organizacao_id),
  unique (unidade_id, vigente_desde)
);
create index unidade_configuracoes_organizacao on public.unidade_configuracoes (organizacao_id);
create index unidade_configuracoes_criado_por on public.unidade_configuracoes (criado_por);
create trigger unidade_configuracoes_sem_alteracao before update or delete on public.unidade_configuracoes
  for each row execute function privado.so_insercao();
create trigger unidade_configuracoes_sem_truncate before truncate on public.unidade_configuracoes
  for each statement execute function privado.so_insercao();
create trigger unidade_configuracoes_auditar after insert on public.unidade_configuracoes
  for each row execute function privado.auditar_mudanca();

alter table public.unidade_configuracoes enable row level security;
revoke all on public.unidade_configuracoes from anon, authenticated;
revoke all on sequence public.unidade_configuracoes_id_seq from anon, authenticated;
grant select on public.unidade_configuracoes to authenticated;
create policy unidade_configuracoes_ler on public.unidade_configuracoes for select to authenticated
  using (unidade_id in (select privado.unidades_visiveis()));

-- Quem gere as lojas desta organização (unidades.gerir em vínculo de organização vigente).
create or replace function privado.gere_lojas_da_organizacao(p_organizacao uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from privado.vinculos_vigentes() v
    join public.papel_permissoes pp on pp.papel = v.papel and pp.permissao = 'unidades.gerir'
    where v.escopo = 'organizacao' and v.organizacao_id = p_organizacao);
$$;

-- Configuração vigente de uma loja (a versão mais recente que já começou).
create or replace function privado.configuracao_vigente(p_unidade uuid)
returns public.unidade_configuracoes
language sql
stable
security definer
set search_path = ''
as $$
  select c.* from public.unidade_configuracoes c
  where c.unidade_id = p_unidade and c.vigente_desde <= now()
  order by c.vigente_desde desc, c.id desc
  limit 1;
$$;

-- Leitura da gestão: todas as lojas das organizações que a pessoa gere, inclusive as inativas.
create or replace function public.lojas_da_rede()
returns table (
  id uuid, organizacao_id uuid, empresa_id uuid, codigo text, nome text, tipo text, cnpj text, uf text, cidade text,
  status text, unidade_emissora_id uuid, criado_em timestamptz, configuracao_id bigint, vigente_desde timestamptz,
  telefone text, cep text, logradouro text, numero text, complemento text, bairro text, inscricao_estadual text,
  inscricao_municipal text, horarios jsonb, versoes integer, proxima_versao timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select u.id, u.organizacao_id, u.empresa_id, u.codigo, u.nome, u.tipo, u.cnpj, u.uf, u.cidade, u.status,
    u.unidade_emissora_id, u.criado_em, c.id, c.vigente_desde, c.telefone, c.cep, c.logradouro, c.numero, c.complemento,
    c.bairro, c.inscricao_estadual, c.inscricao_municipal, c.horarios,
    (select count(*)::int from public.unidade_configuracoes x where x.unidade_id = u.id),
    (select min(x.vigente_desde) from public.unidade_configuracoes x where x.unidade_id = u.id and x.vigente_desde > now())
  from public.unidades u
  left join lateral privado.configuracao_vigente(u.id) c on true
  where privado.gere_lojas_da_organizacao(u.organizacao_id)
  order by u.status, u.tipo <> 'loja_fisica', u.nome;
$$;

-- Histórico das versões de configuração de uma loja (mais recente primeiro).
create or replace function public.loja_historico(p_unidade uuid)
returns table (
  id bigint, vigente_desde timestamptz, telefone text, cep text, logradouro text, numero text, complemento text,
  bairro text, inscricao_estadual text, inscricao_municipal text, horarios jsonb, motivo text, criado_por uuid,
  criado_por_nome text, criado_em timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select c.id, c.vigente_desde, c.telefone, c.cep, c.logradouro, c.numero, c.complemento, c.bairro, c.inscricao_estadual,
    c.inscricao_municipal, c.horarios, c.motivo, c.criado_por, p.nome, c.criado_em
  from public.unidade_configuracoes c
  join public.unidades u on u.id = c.unidade_id
  left join public.perfis_usuario p on p.id = c.criado_por
  where c.unidade_id = p_unidade and privado.gere_lojas_da_organizacao(u.organizacao_id)
  order by c.vigente_desde desc, c.id desc;
$$;

-- Criar loja. Repetir com os mesmos dados devolve a mesma loja (sem duplicar).
-- As variáveis levam o prefixo v_ para não colidir com as colunas de unidades.
create or replace function public.loja_criar(
  p_empresa uuid, p_codigo text, p_nome text, p_tipo text, p_cnpj text, p_uf text, p_cidade text, p_emissora uuid, p_motivo text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_organizacao uuid;
  v_motivo text := privado.exigir_motivo(p_motivo);
  v_codigo text := lower(trim(coalesce(p_codigo, '')));
  v_nome text := trim(coalesce(p_nome, ''));
  v_cnpj text := nullif(regexp_replace(coalesce(p_cnpj, ''), '[^0-9]', '', 'g'), '');
  v_uf text := nullif(upper(trim(coalesce(p_uf, ''))), '');
  v_cidade text := nullif(trim(coalesce(p_cidade, '')), '');
  v_existente public.unidades;
  v_nova uuid;
begin
  select e.organizacao_id into v_organizacao from public.empresas e where e.id = p_empresa;
  if v_organizacao is null or not privado.gere_lojas_da_organizacao(v_organizacao) then
    raise exception 'Sem permissão para cadastrar lojas nesta empresa' using errcode = '42501';
  end if;
  if v_codigo !~ '^[a-z0-9][a-z0-9-]{1,39}$' then
    raise exception 'Código inválido: use letras minúsculas, números e hífen (2 a 40)' using errcode = '22023';
  end if;
  if length(v_nome) = 0 or length(v_nome) > 80 then
    raise exception 'Informe o nome da loja (até 80 letras)' using errcode = '22023';
  end if;
  if p_tipo is null or p_tipo not in ('loja_fisica', 'online', 'assistencia', 'deposito', 'excecao') then
    raise exception 'Tipo de loja inválido' using errcode = '22023';
  end if;
  if p_tipo = 'loja_fisica' and v_cnpj is null then
    raise exception 'Loja física precisa do CNPJ da filial' using errcode = '22023';
  end if;
  if p_tipo = 'online' and v_cnpj is null and p_emissora is null then
    raise exception 'Loja online precisa de CNPJ próprio ou de uma loja que emita as notas por ela' using errcode = '22023';
  end if;
  if v_cnpj is not null and not privado.cnpj_valido(v_cnpj) then
    raise exception 'CNPJ inválido' using errcode = '22023';
  end if;
  if v_uf is not null and v_uf !~ '^[A-Z]{2}$' then
    raise exception 'UF inválida' using errcode = '22023';
  end if;
  if length(coalesce(v_cidade, '')) > 80 then
    raise exception 'Cidade muito longa (até 80 letras)' using errcode = '22023';
  end if;

  -- Duas criações iguais ao mesmo tempo: a segunda espera a primeira e devolve a mesma loja.
  perform pg_advisory_xact_lock(privado.trava_da_chave('unidades', v_organizacao, v_codigo));
  select * into v_existente from public.unidades u where u.organizacao_id = v_organizacao and u.codigo = v_codigo;
  if found then
    if v_existente.nome = v_nome and v_existente.tipo = p_tipo and v_existente.cnpj is not distinct from v_cnpj
       and v_existente.empresa_id = p_empresa then
      return jsonb_build_object('id', v_existente.id, 'repetida', true);
    end if;
    raise exception 'Já existe uma loja com o código %', v_codigo using errcode = '23505';
  end if;
  if v_cnpj is not null and exists (select 1 from public.unidades u where u.cnpj = v_cnpj) then
    raise exception 'Este CNPJ já está em outra loja' using errcode = '23505';
  end if;

  perform set_config('ora.motivo', v_motivo, true);
  insert into public.unidades (organizacao_id, empresa_id, codigo, nome, tipo, cnpj, uf, cidade, unidade_emissora_id)
  values (v_organizacao, p_empresa, v_codigo, v_nome, p_tipo, v_cnpj, v_uf, v_cidade, p_emissora)
  returning id into v_nova;
  return jsonb_build_object('id', v_nova, 'repetida', false);
end;
$$;

-- Editar nome, CNPJ, UF e cidade. Sem mudança devolve falso (repetição idempotente).
create or replace function public.loja_atualizar(p_unidade uuid, p_nome text, p_cnpj text, p_uf text, p_cidade text, p_motivo text)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_loja public.unidades;
  v_motivo text := privado.exigir_motivo(p_motivo);
  v_nome text := trim(coalesce(p_nome, ''));
  v_cnpj text := nullif(regexp_replace(coalesce(p_cnpj, ''), '[^0-9]', '', 'g'), '');
  v_uf text := nullif(upper(trim(coalesce(p_uf, ''))), '');
  v_cidade text := nullif(trim(coalesce(p_cidade, '')), '');
begin
  select * into v_loja from public.unidades u where u.id = p_unidade for no key update;
  if not found or not privado.gere_lojas_da_organizacao(v_loja.organizacao_id) then
    raise exception 'Loja não encontrada para você' using errcode = 'P0002';
  end if;
  if length(v_nome) = 0 or length(v_nome) > 80 then
    raise exception 'Informe o nome da loja (até 80 letras)' using errcode = '22023';
  end if;
  if v_loja.tipo = 'loja_fisica' and v_cnpj is null then
    raise exception 'Loja física precisa do CNPJ da filial' using errcode = '22023';
  end if;
  if v_loja.tipo = 'online' and v_cnpj is null and v_loja.unidade_emissora_id is null then
    raise exception 'Loja online precisa de CNPJ próprio ou de uma loja que emita as notas por ela' using errcode = '22023';
  end if;
  if v_cnpj is not null and not privado.cnpj_valido(v_cnpj) then
    raise exception 'CNPJ inválido' using errcode = '22023';
  end if;
  if v_uf is not null and v_uf !~ '^[A-Z]{2}$' then
    raise exception 'UF inválida' using errcode = '22023';
  end if;
  if length(coalesce(v_cidade, '')) > 80 then
    raise exception 'Cidade muito longa (até 80 letras)' using errcode = '22023';
  end if;
  if v_cnpj is not null and exists (select 1 from public.unidades u where u.cnpj = v_cnpj and u.id <> v_loja.id) then
    raise exception 'Este CNPJ já está em outra loja' using errcode = '23505';
  end if;
  if v_loja.nome = v_nome and v_loja.cnpj is not distinct from v_cnpj and v_loja.uf is not distinct from v_uf
     and v_loja.cidade is not distinct from v_cidade then
    return false;
  end if;
  perform set_config('ora.motivo', v_motivo, true);
  update public.unidades u set nome = v_nome, cnpj = v_cnpj, uf = v_uf, cidade = v_cidade where u.id = v_loja.id;
  return true;
end;
$$;

-- Ativar ou inativar. Inativar exige a loja sem movimento em aberto (OR019). O "for update" na loja
-- conflita com o "for key share" que toda inclusão de caixa, venda, reserva, movimento, transferência
-- ou aparelho faz na loja (chave estrangeira e o gatilho abaixo): quem inclui ao mesmo tempo espera e,
-- depois, vê a loja inativa e para; quem incluiu antes aparece nas conferências.
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
    if cardinality(v_pendencias) > 0 then
      raise exception 'A loja ainda tem %: resolva antes de inativar', array_to_string(v_pendencias, ', ') using errcode = 'OR019';
    end if;
  end if;
  perform set_config('ora.motivo', v_motivo, true);
  update public.unidades u set status = p_situacao where u.id = v_loja.id;
  return true;
end;
$$;

-- Loja inativa não recebe movimento novo, por nenhum caminho (nem por função que confira só a
-- permissão de organização). Os argumentos do gatilho são as colunas de loja da tabela.
create or replace function privado.loja_ativa_para_movimento()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_coluna text;
  v_loja uuid;
  v_situacao text;
begin
  foreach v_coluna in array tg_argv loop
    v_loja := (to_jsonb(new) ->> v_coluna)::uuid;
    if v_loja is not null then
      select u.status into v_situacao from public.unidades u where u.id = v_loja for key share;
      if v_situacao = 'inativa' then
        raise exception 'Loja inativa: reative a loja antes de registrar movimento nela' using errcode = 'OR019';
      end if;
    end if;
  end loop;
  return new;
end;
$$;

create trigger caixas_loja_ativa before insert on public.caixas
  for each row execute function privado.loja_ativa_para_movimento('unidade_id');
create trigger vendas_loja_ativa before insert on public.vendas
  for each row execute function privado.loja_ativa_para_movimento('unidade_id');
create trigger estoque_reservas_loja_ativa before insert on public.estoque_reservas
  for each row execute function privado.loja_ativa_para_movimento('unidade_id');
create trigger estoque_movimentos_loja_ativa before insert on public.estoque_movimentos
  for each row execute function privado.loja_ativa_para_movimento('unidade_id');
create trigger itens_serializados_loja_ativa before insert on public.itens_serializados
  for each row execute function privado.loja_ativa_para_movimento('unidade_id');
create trigger transferencias_loja_ativa before insert on public.transferencias
  for each row execute function privado.loja_ativa_para_movimento('origem_id', 'destino_id');

-- Nova versão da configuração, valendo a partir de agora ou de uma data futura (nunca retroativa).
-- Mesma vigência com os mesmos dados devolve a versão gravada; com outros dados é recusada (23505).
-- "Agora" com os mesmos dados da versão vigente não cria versão nova (duplo clique, salvar sem mudar).
create or replace function public.loja_definir_configuracao(p_unidade uuid, p_dados jsonb, p_vigente_desde timestamptz, p_motivo text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_loja public.unidades;
  v_motivo text := privado.exigir_motivo(p_motivo);
  v_desde timestamptz := coalesce(p_vigente_desde, now());
  v_dados jsonb := coalesce(p_dados, '{}'::jsonb);
  v_novo public.unidade_configuracoes;
  v_existente public.unidade_configuracoes;
  v_id bigint;
  v_campo text;
begin
  -- Uma mudança de configuração por loja de cada vez (não bloqueia vendas nem estoque da loja).
  select * into v_loja from public.unidades u where u.id = p_unidade for no key update;
  if not found or not privado.gere_lojas_da_organizacao(v_loja.organizacao_id) then
    raise exception 'Loja não encontrada para você' using errcode = 'P0002';
  end if;
  if jsonb_typeof(v_dados) <> 'object' then
    raise exception 'Dados da configuração inválidos' using errcode = '22023';
  end if;
  for v_campo in select k from jsonb_object_keys(v_dados) k loop
    if v_campo not in ('telefone', 'cep', 'logradouro', 'numero', 'complemento', 'bairro', 'inscricao_estadual',
                       'inscricao_municipal', 'horarios') then
      raise exception 'Campo desconhecido na configuração: %', v_campo using errcode = '22023';
    end if;
  end loop;
  if v_desde < now() - interval '5 minutes' then
    raise exception 'A vigência não pode começar no passado: o histórico não é reescrito' using errcode = '22023';
  end if;
  if v_dados ? 'horarios' and not privado.horarios_validos(v_dados -> 'horarios') then
    raise exception 'Horários inválidos: um por dia, no formato HH:MM, abrindo antes de fechar' using errcode = '22023';
  end if;

  v_novo.telefone := nullif(regexp_replace(coalesce(v_dados ->> 'telefone', ''), '[^0-9]', '', 'g'), '');
  v_novo.cep := nullif(regexp_replace(coalesce(v_dados ->> 'cep', ''), '[^0-9]', '', 'g'), '');
  v_novo.logradouro := nullif(trim(coalesce(v_dados ->> 'logradouro', '')), '');
  v_novo.numero := nullif(trim(coalesce(v_dados ->> 'numero', '')), '');
  v_novo.complemento := nullif(trim(coalesce(v_dados ->> 'complemento', '')), '');
  v_novo.bairro := nullif(trim(coalesce(v_dados ->> 'bairro', '')), '');
  v_novo.inscricao_estadual := nullif(upper(regexp_replace(coalesce(v_dados ->> 'inscricao_estadual', ''), '[^0-9A-Za-z]', '', 'g')), '');
  v_novo.inscricao_municipal := nullif(trim(coalesce(v_dados ->> 'inscricao_municipal', '')), '');
  -- Horários guardados sempre do mesmo jeito (só dia, abre e fecha, em ordem de dia) para comparar.
  v_novo.horarios := (
    select coalesce(jsonb_agg(jsonb_build_object('dia', (e ->> 'dia')::int, 'abre', e ->> 'abre', 'fecha', e ->> 'fecha')
                              order by (e ->> 'dia')::int), '[]'::jsonb)
    from jsonb_array_elements(coalesce(v_dados -> 'horarios', '[]'::jsonb)) e);

  if v_novo.telefone is not null and v_novo.telefone !~ '^[0-9]{10,11}$' then
    raise exception 'Telefone inválido: DDD e número (10 ou 11 dígitos)' using errcode = '22023';
  end if;
  if v_novo.cep is not null and v_novo.cep !~ '^[0-9]{8}$' then
    raise exception 'CEP inválido (8 dígitos)' using errcode = '22023';
  end if;
  if v_novo.inscricao_estadual is not null and v_novo.inscricao_estadual !~ '^([0-9]{2,14}|ISENTO)$' then
    raise exception 'Inscrição estadual inválida (só números, ou ISENTO)' using errcode = '22023';
  end if;
  if v_novo.inscricao_municipal is not null and v_novo.inscricao_municipal !~ '^[0-9A-Za-z./-]{1,20}$' then
    raise exception 'Inscrição municipal inválida' using errcode = '22023';
  end if;
  if length(coalesce(v_novo.logradouro, '')) = 1 or length(coalesce(v_novo.logradouro, '')) > 120
     or length(coalesce(v_novo.bairro, '')) = 1 or length(coalesce(v_novo.bairro, '')) > 80
     or length(coalesce(v_novo.numero, '')) > 15 or length(coalesce(v_novo.complemento, '')) > 60 then
    raise exception 'Endereço inválido: confira rua (até 120), número (até 15), complemento (até 60) e bairro (até 80)'
      using errcode = '22023';
  end if;

  select * into v_existente from public.unidade_configuracoes c where c.unidade_id = v_loja.id and c.vigente_desde = v_desde;
  if not found and v_desde <= now() then
    select * into v_existente from public.unidade_configuracoes c
    where c.unidade_id = v_loja.id and c.vigente_desde <= now()
    order by c.vigente_desde desc, c.id desc
    limit 1;
  end if;
  if v_existente.id is not null then
    if (v_existente.telefone, v_existente.cep, v_existente.logradouro, v_existente.numero, v_existente.complemento,
        v_existente.bairro, v_existente.inscricao_estadual, v_existente.inscricao_municipal, v_existente.horarios)
       is not distinct from
       (v_novo.telefone, v_novo.cep, v_novo.logradouro, v_novo.numero, v_novo.complemento,
        v_novo.bairro, v_novo.inscricao_estadual, v_novo.inscricao_municipal, v_novo.horarios) then
      return jsonb_build_object('id', v_existente.id, 'repetida', true);
    end if;
    if v_existente.vigente_desde = v_desde then
      raise exception 'Já existe outra versão com este início de vigência: escolha outro horário' using errcode = '23505';
    end if;
  end if;

  perform set_config('ora.motivo', v_motivo, true);
  insert into public.unidade_configuracoes (
    organizacao_id, unidade_id, vigente_desde, telefone, cep, logradouro, numero, complemento, bairro,
    inscricao_estadual, inscricao_municipal, horarios, motivo, criado_por)
  values (
    v_loja.organizacao_id, v_loja.id, v_desde, v_novo.telefone, v_novo.cep, v_novo.logradouro, v_novo.numero,
    v_novo.complemento, v_novo.bairro, v_novo.inscricao_estadual, v_novo.inscricao_municipal, v_novo.horarios,
    v_motivo, (select auth.uid()))
  returning id into v_id;
  return jsonb_build_object('id', v_id, 'repetida', false);
end;
$$;

revoke all on function privado.horarios_validos(jsonb), privado.gere_lojas_da_organizacao(uuid), privado.configuracao_vigente(uuid),
  privado.loja_ativa_para_movimento() from public, anon, authenticated;
revoke all on function public.lojas_da_rede(), public.loja_historico(uuid),
  public.loja_criar(uuid, text, text, text, text, text, text, uuid, text), public.loja_atualizar(uuid, text, text, text, text, text),
  public.loja_definir_situacao(uuid, text, text), public.loja_definir_configuracao(uuid, jsonb, timestamptz, text) from public, anon;
grant execute on function public.lojas_da_rede(), public.loja_historico(uuid),
  public.loja_criar(uuid, text, text, text, text, text, text, uuid, text), public.loja_atualizar(uuid, text, text, text, text, text),
  public.loja_definir_situacao(uuid, text, text), public.loja_definir_configuracao(uuid, jsonb, timestamptz, text) to authenticated;
