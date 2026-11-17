-- =============================================================================
-- Lote PWA-b (plano do proprietário de 16/11, Onda 1, item 7, segunda parte: "o dono aprova em um toque"): o aviso no
-- celular quando um desconto, uma nota ou uma saída de caixa espera aprovação. Autorização do proprietário de 17/11
-- para as chaves dos avisos (geradas no servidor; os valores nunca passaram pelo chat). Decisão: ADR-014.
--
--   * privado.avisos_inscricoes: os celulares (e navegadores) que pediram avisos, um por endereço de envio, de cada
--     pessoa (até 10). Fora da API: só as funções abaixo leem e gravam;
--   * privado.avisos: a fila. Um aviso por pedido (o desconto, a nota ou a saída de caixa), com quem pediu e a permissão
--     de quem decide; quem recebe é calculado na hora do envio (a pessoa ativa, com a permissão na loja, menos quem
--     pediu). A nota que volta a esperar aprovação depois da correção arma o aviso de novo;
--   * privado.segredos_de_rotina: a impressão digital SHA-256 do segredo com que o programa de envio (o worker) lê a fila.
--     O segredo fica só no servidor; a impressão digital é gravada fora das migrations;
--   * gatilhos em aprovacoes_desconto, notas_pedidos e caixa_saidas põem o aviso na fila na mesma transação do pedido;
--   * public.aviso_inscrever / aviso_cancelar / aviso_minhas_inscricoes / aviso_teste: a pessoa logada liga, desliga,
--     confere os próprios celulares e pede um aviso de teste (no máximo um por minuto). Códigos próprios do teste:
--     OR039 (nenhum celular ligado) e OR040 (espere um minuto);
--   * public.avisos_a_enviar(segredo, limite) e public.avisos_resultado(segredo, resultados): o worker pega um lote da
--     fila (cada aviso reservado por 2 minutos, até 5 tentativas, só do último dia) com os celulares de quem recebe, e
--     devolve o que aconteceu (entregue, falhou, celular que não existe mais). Segredo errado: 42501.
-- O texto do aviso não leva nome de cliente: só a loja, o número da venda ou o valor da saída.
-- Reversão: supabase/reversao/<mesmo nome>.sql.
-- =============================================================================

create table privado.avisos_inscricoes (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references public.perfis_usuario (id),
  endpoint text not null unique check (endpoint ~ '^https://[^[:space:]]+$' and length(endpoint) <= 1000),
  p256dh text not null check (p256dh ~ '^[A-Za-z0-9_-]{86,88}$'),
  auth text not null check (auth ~ '^[A-Za-z0-9_-]{20,24}$'),
  dispositivo text check (dispositivo is null or (length(dispositivo) between 1 and 120 and dispositivo = btrim(dispositivo))),
  criada_em timestamptz not null default now(),
  ultimo_aviso_em timestamptz,
  falhas int not null default 0 check (falhas >= 0)
);
create index avisos_inscricoes_usuario on privado.avisos_inscricoes (usuario_id, criada_em);
alter table privado.avisos_inscricoes enable row level security;
comment on table privado.avisos_inscricoes is
  'PWA-b: os celulares que recebem avisos. Acesso só pelas funções aviso_* e avisos_* (RLS ligado, sem política).';
revoke all on privado.avisos_inscricoes from public, anon, authenticated;

create table privado.avisos (
  id uuid primary key default gen_random_uuid(),
  organizacao_id uuid not null references public.organizacoes (id),
  unidade_id uuid references public.unidades (id),
  tipo text not null check (tipo in ('desconto', 'nota', 'saida_caixa', 'teste')),
  alvo_id uuid not null,
  solicitante_id uuid not null references public.perfis_usuario (id),
  permissao text check (permissao is null or permissao in ('desconto.aprovar', 'nota.aprovar', 'caixa.conferir')),
  titulo text not null check (length(titulo) between 1 and 80),
  corpo text not null check (length(corpo) between 1 and 160),
  endereco text not null check (endereco ~ '^/[a-z0-9/_-]*$'),
  situacao text not null default 'pendente'
    check (situacao in ('pendente', 'enviando', 'enviado', 'sem_destino', 'dispensado', 'falhou')),
  tentativas int not null default 0 check (tentativas between 0 and 5),
  reservado_ate timestamptz,
  criado_em timestamptz not null default now(),
  enviado_em timestamptz,
  unique (tipo, alvo_id),
  constraint aviso_teste_sem_loja check ((tipo = 'teste') = (unidade_id is null) and (tipo = 'teste') = (permissao is null))
);
create index avisos_fila on privado.avisos (situacao, criado_em);
create index avisos_organizacao on privado.avisos (organizacao_id);
create index avisos_unidade on privado.avisos (unidade_id);
create index avisos_solicitante on privado.avisos (solicitante_id);
alter table privado.avisos enable row level security;
comment on table privado.avisos is
  'PWA-b: a fila dos avisos no celular. Acesso só pelos gatilhos dos pedidos e pelas funções avisos_* (RLS ligado, sem política).';
revoke all on privado.avisos from public, anon, authenticated;

create table privado.segredos_de_rotina (
  nome text primary key check (nome ~ '^[a-z_]{3,40}$'),
  impressao bytea not null check (length(impressao) = 32),
  definido_em timestamptz not null default now()
);
alter table privado.segredos_de_rotina enable row level security;
comment on table privado.segredos_de_rotina is
  'PWA-b: a impressão digital SHA-256 dos segredos das rotinas do servidor. Acesso só por privado.segredo_confere (RLS ligado, sem política).';
revoke all on privado.segredos_de_rotina from public, anon, authenticated;

-- O segredo confere pela impressão digital; sem segredo gravado, ninguém passa.
create or replace function privado.segredo_confere(p_nome text, p_segredo text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(length(p_segredo) between 32 and 200, false) and exists (
    select 1 from privado.segredos_de_rotina s
    where s.nome = p_nome and s.impressao = sha256(convert_to(p_segredo, 'UTF8')));
$$;
revoke all on function privado.segredo_confere(text, text) from public, anon, authenticated;

-- Quem recebe o aviso de uma loja: a pessoa ativa, com vínculo vigente que dá a permissão nela (pela rede ou pela loja),
-- com o papel ativo, a organização e a loja ativas.
create or replace function privado.quem_recebe_aviso(p_unidade uuid, p_permissao text)
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select distinct v.usuario_id
  from public.vinculos v
  join public.papeis pa on pa.codigo = v.papel and pa.ativo
  join public.papel_permissoes pp on pp.papel = v.papel and pp.permissao = p_permissao
  join public.unidades u on u.id = p_unidade and u.status = 'ativa' and u.organizacao_id = v.organizacao_id
  join public.organizacoes o on o.id = v.organizacao_id and o.status = 'ativa'
  join public.perfis_usuario pu on pu.id = v.usuario_id and pu.status = 'ativo'
  where v.inicio <= now() and (v.fim is null or v.fim > now())
    and (v.escopo = 'organizacao' or v.unidade_id = p_unidade);
$$;
revoke all on function privado.quem_recebe_aviso(uuid, text) from public, anon, authenticated;

-- Põe (ou arma de novo) o aviso de um pedido na fila.
create or replace function privado.enfileirar_aviso(
  p_organizacao uuid, p_unidade uuid, p_tipo text, p_alvo uuid, p_solicitante uuid, p_permissao text,
  p_titulo text, p_corpo text, p_endereco text
)
returns void
language sql
volatile
security definer
set search_path = ''
as $$
  insert into privado.avisos (organizacao_id, unidade_id, tipo, alvo_id, solicitante_id, permissao, titulo, corpo, endereco)
  values (p_organizacao, p_unidade, p_tipo, p_alvo, p_solicitante, p_permissao, p_titulo, left(p_corpo, 160), p_endereco)
  on conflict (tipo, alvo_id) do update
    set situacao = 'pendente', tentativas = 0, reservado_ate = null, criado_em = now(), enviado_em = null,
        solicitante_id = excluded.solicitante_id, titulo = excluded.titulo, corpo = excluded.corpo;
$$;
revoke all on function privado.enfileirar_aviso(uuid, uuid, text, uuid, uuid, text, text, text, text) from public, anon, authenticated;

create or replace function privado.aviso_do_desconto()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.situacao = 'pendente' then
    perform privado.enfileirar_aviso(new.organizacao_id, new.unidade_id, 'desconto', new.id, new.solicitado_por, 'desconto.aprovar',
      'Desconto para aprovar',
      format('%s: desconto pedido na venda nº %s', (select u.nome from public.unidades u where u.id = new.unidade_id),
             (select v.numero from public.vendas v where v.id = new.venda_id)),
      '/aprovacoes');
  end if;
  return null;
end;
$$;
revoke all on function privado.aviso_do_desconto() from public, anon, authenticated;
create trigger aprovacoes_desconto_aviso after insert on public.aprovacoes_desconto
  for each row execute function privado.aviso_do_desconto();

create or replace function privado.aviso_da_nota()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.situacao = 'aguardando_aprovacao' and (tg_op = 'INSERT' or old.situacao is distinct from new.situacao) then
    perform privado.enfileirar_aviso(new.organizacao_id, new.unidade_id, 'nota', new.id, new.solicitado_por, 'nota.aprovar',
      'Nota para aprovar',
      format('%s: pedido de nota da venda nº %s', (select u.nome from public.unidades u where u.id = new.unidade_id),
             (select v.numero from public.vendas v where v.id = new.venda_id)),
      '/notas');
  end if;
  return null;
end;
$$;
revoke all on function privado.aviso_da_nota() from public, anon, authenticated;
create trigger notas_pedidos_aviso after insert or update of situacao on public.notas_pedidos
  for each row execute function privado.aviso_da_nota();

create or replace function privado.aviso_da_saida()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.situacao = 'pendente' then
    perform privado.enfileirar_aviso(new.organizacao_id, new.unidade_id, 'saida_caixa', new.id, new.pedida_por, 'caixa.conferir',
      'Saída de caixa para autorizar',
      format('%s: saída de R$ %s', (select u.nome from public.unidades u where u.id = new.unidade_id),
             regexp_replace((new.valor_centavos / 100)::text, '(\d)(?=(\d{3})+$)', '\1.', 'g') || ',' || lpad((new.valor_centavos % 100)::text, 2, '0')),
      '/caixa');
  end if;
  return null;
end;
$$;
revoke all on function privado.aviso_da_saida() from public, anon, authenticated;
create trigger caixa_saidas_aviso after insert on public.caixa_saidas
  for each row execute function privado.aviso_da_saida();

-- ---------------------------------------------------------------------------------------------------------------------
-- A pessoa logada: ligar, desligar, conferir e testar os avisos dos próprios celulares
-- ---------------------------------------------------------------------------------------------------------------------
create or replace function public.aviso_inscrever(p_endpoint text, p_p256dh text, p_auth text, p_dispositivo text default null)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  usuario uuid := (select auth.uid());
  v_dispositivo text := nullif(btrim(left(regexp_replace(coalesce(p_dispositivo, ''), '[[:cntrl:]]+', ' ', 'g'), 120)), '');
begin
  if usuario is null or not exists (select 1 from privado.vinculos_vigentes()) then
    raise exception 'Entre no sistema para receber avisos' using errcode = '42501';
  end if;
  if p_endpoint is null or p_endpoint !~ '^https://[^[:space:]]+$' or length(p_endpoint) > 1000
     or coalesce(p_p256dh, '') !~ '^[A-Za-z0-9_-]{86,88}$' or coalesce(p_auth, '') !~ '^[A-Za-z0-9_-]{20,24}$' then
    raise exception 'Inscrição de aviso inválida' using errcode = '22023';
  end if;
  -- O mesmo celular (o mesmo endereço de envio) com outra pessoa logada passa a ser dela.
  -- A mesma pessoa que inscreve de novo o mesmo celular (a tela confere a cada visita) mantém a data em que ligou.
  insert into privado.avisos_inscricoes as atual (usuario_id, endpoint, p256dh, auth, dispositivo)
  values (usuario, p_endpoint, p_p256dh, p_auth, v_dispositivo)
  on conflict (endpoint) do update
    set usuario_id = excluded.usuario_id, p256dh = excluded.p256dh, auth = excluded.auth,
        dispositivo = coalesce(excluded.dispositivo, atual.dispositivo),
        criada_em = case when atual.usuario_id = excluded.usuario_id then atual.criada_em else now() end, falhas = 0;
  -- Até 10 por pessoa: os mais antigos saem.
  delete from privado.avisos_inscricoes i
  where i.usuario_id = usuario and i.id in (
    select x.id from privado.avisos_inscricoes x where x.usuario_id = usuario order by x.criada_em desc, x.id offset 10);
  return jsonb_build_object('inscricoes', (select count(*) from privado.avisos_inscricoes i where i.usuario_id = usuario));
end;
$$;

create or replace function public.aviso_cancelar(p_endpoint text)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  usuario uuid := (select auth.uid());
begin
  if usuario is null or not exists (select 1 from privado.vinculos_vigentes()) then
    raise exception 'Entre no sistema' using errcode = '42501';
  end if;
  delete from privado.avisos_inscricoes i where i.endpoint = p_endpoint and i.usuario_id = usuario;
  if not found then
    raise exception 'Este celular não está nos seus avisos' using errcode = '42501';
  end if;
  return true;
end;
$$;

create or replace function public.aviso_minhas_inscricoes()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  usuario uuid := (select auth.uid());
begin
  if usuario is null or not exists (select 1 from privado.vinculos_vigentes()) then
    raise exception 'Entre no sistema' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'celulares', coalesce((
      select jsonb_agg(jsonb_build_object('dispositivo', i.dispositivo, 'criada_em', i.criada_em, 'ultimo_aviso_em', i.ultimo_aviso_em)
        order by i.criada_em desc)
      from privado.avisos_inscricoes i where i.usuario_id = usuario), '[]'::jsonb),
    -- Os avisos que a pessoa recebe, pelas permissões em alguma loja ativa.
    'recebe', jsonb_build_object(
      'desconto', exists (select 1 from public.unidades u where u.status = 'ativa' and usuario in (select privado.quem_recebe_aviso(u.id, 'desconto.aprovar'))),
      'nota', exists (select 1 from public.unidades u where u.status = 'ativa' and usuario in (select privado.quem_recebe_aviso(u.id, 'nota.aprovar'))),
      'saida_caixa', exists (select 1 from public.unidades u where u.status = 'ativa' and usuario in (select privado.quem_recebe_aviso(u.id, 'caixa.conferir')))));
end;
$$;

create or replace function public.aviso_teste()
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  usuario uuid := (select auth.uid());
  organizacao uuid;
begin
  if usuario is null or not exists (select 1 from privado.vinculos_vigentes()) then
    raise exception 'Entre no sistema para receber avisos' using errcode = '42501';
  end if;
  if not exists (select 1 from privado.avisos_inscricoes i where i.usuario_id = usuario) then
    raise exception 'Ligue os avisos neste celular antes do teste' using errcode = 'OR039';
  end if;
  if exists (select 1 from privado.avisos a where a.tipo = 'teste' and a.alvo_id = usuario and a.criado_em > now() - interval '1 minute') then
    raise exception 'Espere um minuto para pedir outro aviso de teste' using errcode = 'OR040';
  end if;
  select v.organizacao_id into organizacao from public.vinculos v
  where v.usuario_id = usuario and v.inicio <= now() and (v.fim is null or v.fim > now())
  order by v.inicio limit 1;
  if organizacao is null then
    raise exception 'Sem vínculo com uma loja' using errcode = '42501';
  end if;
  perform privado.enfileirar_aviso(organizacao, null, 'teste', usuario, usuario, null,
    'Aviso de teste', 'Os avisos do Ora 5G estão chegando neste celular.', '/inicio');
  return jsonb_build_object('na_fila', true);
end;
$$;

-- ---------------------------------------------------------------------------------------------------------------------
-- O programa de envio (o worker), com o segredo dos avisos
-- ---------------------------------------------------------------------------------------------------------------------
create or replace function public.avisos_a_enviar(p_segredo text, p_limite int default 20)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  a privado.avisos;
  ainda_espera boolean;
  inscricoes jsonb;
  lote jsonb := '[]'::jsonb;
begin
  if not privado.segredo_confere('avisos_no_celular', p_segredo) then
    raise exception 'Segredo dos avisos não confere' using errcode = '42501';
  end if;
  for a in
    with escolhidos as (
      select x.id from privado.avisos x
      where (x.situacao = 'pendente' or (x.situacao = 'enviando' and x.reservado_ate < now()))
        and x.tentativas < 5 and x.criado_em > now() - interval '1 day'
      order by x.criado_em, x.id
      limit least(greatest(coalesce(p_limite, 20), 1), 100)
      for update skip locked
    )
    update privado.avisos x set situacao = 'enviando', reservado_ate = now() + interval '2 minutes', tentativas = x.tentativas + 1
    from escolhidos e where x.id = e.id
    returning x.*
  loop
    -- O pedido já decidido não vira aviso.
    ainda_espera := case a.tipo
      when 'desconto' then exists (select 1 from public.aprovacoes_desconto d where d.id = a.alvo_id and d.situacao = 'pendente')
      when 'nota' then exists (select 1 from public.notas_pedidos n where n.id = a.alvo_id and n.situacao = 'aguardando_aprovacao')
      when 'saida_caixa' then exists (select 1 from public.caixa_saidas s where s.id = a.alvo_id and s.situacao = 'pendente')
      else true end;
    if not ainda_espera then
      update privado.avisos x set situacao = 'dispensado', reservado_ate = null where x.id = a.id;
      continue;
    end if;
    select coalesce(jsonb_agg(jsonb_build_object('id', i.id, 'endpoint', i.endpoint, 'p256dh', i.p256dh, 'auth', i.auth) order by i.criada_em), '[]'::jsonb)
    into inscricoes
    from privado.avisos_inscricoes i
    where (a.tipo = 'teste' and i.usuario_id = a.solicitante_id)
       or (a.tipo <> 'teste' and i.usuario_id <> a.solicitante_id
           and i.usuario_id in (select privado.quem_recebe_aviso(a.unidade_id, a.permissao)));
    if jsonb_array_length(inscricoes) = 0 then
      update privado.avisos x set situacao = 'sem_destino', reservado_ate = null where x.id = a.id;
      continue;
    end if;
    lote := lote || jsonb_build_object('id', a.id, 'tipo', a.tipo, 'titulo', a.titulo, 'corpo', a.corpo, 'endereco', a.endereco,
      'inscricoes', inscricoes);
  end loop;
  return lote;
end;
$$;

-- p_resultados: [{"aviso": id, "entregues": [inscrição], "expiradas": [inscrição], "falhas": n}]
create or replace function public.avisos_resultado(p_segredo text, p_resultados jsonb)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  r jsonb;
  v_aviso uuid;
  entregues uuid[];
  expiradas uuid[];
  falhas int;
  registrados int := 0;
begin
  if not privado.segredo_confere('avisos_no_celular', p_segredo) then
    raise exception 'Segredo dos avisos não confere' using errcode = '42501';
  end if;
  if p_resultados is null or jsonb_typeof(p_resultados) <> 'array' or jsonb_array_length(p_resultados) > 100 then
    raise exception 'Resultados inválidos' using errcode = '22023';
  end if;
  for r in select * from jsonb_array_elements(p_resultados) loop
    begin
      v_aviso := (r ->> 'aviso')::uuid;
      entregues := coalesce((select array_agg(x::uuid) from jsonb_array_elements_text(coalesce(r -> 'entregues', '[]'::jsonb)) x), '{}');
      expiradas := coalesce((select array_agg(x::uuid) from jsonb_array_elements_text(coalesce(r -> 'expiradas', '[]'::jsonb)) x), '{}');
      falhas := greatest(coalesce((r ->> 'falhas')::int, 0), 0);
    exception when invalid_text_representation or numeric_value_out_of_range or invalid_parameter_value then
      raise exception 'Resultados inválidos' using errcode = '22023';
    end;
    update privado.avisos_inscricoes i set ultimo_aviso_em = now(), falhas = 0 where i.id = any(entregues);
    delete from privado.avisos_inscricoes i where i.id = any(expiradas);
    update privado.avisos a
    set situacao = case
          when cardinality(entregues) > 0 then 'enviado'
          when falhas > 0 and a.tentativas < 5 then 'pendente'
          when falhas > 0 then 'falhou'
          else 'sem_destino' end,
        enviado_em = case when cardinality(entregues) > 0 then now() else a.enviado_em end,
        reservado_ate = null
    where a.id = v_aviso and a.situacao = 'enviando';
    if found then
      registrados := registrados + 1;
    end if;
  end loop;
  return jsonb_build_object('registrados', registrados);
end;
$$;

revoke all on function public.aviso_inscrever(text, text, text, text), public.aviso_cancelar(text), public.aviso_minhas_inscricoes(),
  public.aviso_teste(), public.avisos_a_enviar(text, int), public.avisos_resultado(text, jsonb) from public, anon;
grant execute on function public.aviso_inscrever(text, text, text, text), public.aviso_cancelar(text), public.aviso_minhas_inscricoes(),
  public.aviso_teste() to authenticated;
-- O worker chama com a chave pública (sem sessão de pessoa); o que protege é o segredo dos avisos.
grant execute on function public.avisos_a_enviar(text, int), public.avisos_resultado(text, jsonb) to anon, authenticated;
