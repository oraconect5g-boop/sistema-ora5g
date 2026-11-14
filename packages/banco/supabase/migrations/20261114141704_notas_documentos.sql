-- =============================================================================
-- Documentos da nota emitida: o PDF (DANFE) e o XML guardados em privado, com o protocolo de autorização
-- (lote L10a: ORA-FISC-005; base do envio da nota pelo WhatsApp, #76)
--
-- Sem emissor contratado (ADR-006), a nota é emitida no portal de sempre e registrada aqui pela chave de acesso.
-- Faltava guardar o que comprova a emissão e o que vai para o cliente:
--   * bucket PRIVADO "notas" (PDF e XML, até 5 MB), no caminho <organização>/<loja>/<pedido>/<id>.<pdf|xml>;
--     envia quem aprova a nota na loja (nota.aprovar); lê quem pode ler o pedido da nota (o mesmo RLS dele:
--     quem pediu, quem vê a venda e quem aprova), sempre por link assinado e temporário;
--   * public.notas_documentos: cada arquivo com o tipo, o tamanho, o SHA-256 (conferido pelo servidor ao
--     receber) e quem enviou; trocar o arquivo guarda o anterior como substituído (nada se apaga);
--   * notas_pedidos.protocolo: o número do protocolo de autorização (15 dígitos), registrado uma vez;
--   * public.notas_anexar_documento: registra o arquivo que já está no Storage, só em nota emitida, conferindo o
--     caminho, o tipo do arquivo no Storage e o protocolo. A conferência do conteúdo (o XML traz a chave de acesso
--     desta nota; o PDF começa como PDF) é do servidor, antes de enviar ao Storage.
-- Retenção: os arquivos ficam enquanto a nota existir (o prazo legal de guarda é do contador; sem regra de
-- descarte aqui). Reversão: supabase/reversao/<mesmo nome>.sql.
-- =============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('notas', 'notas', false, 5242880, array['application/pdf', 'application/xml', 'text/xml'])
on conflict (id) do update
  set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

create policy notas_documentos_ler on storage.objects for select to authenticated
  using (bucket_id = 'notas'
         and (storage.foldername(name))[3] in (select p.id::text from public.notas_pedidos p));
create policy notas_documentos_enviar on storage.objects for insert to authenticated
  with check (bucket_id = 'notas'
              and array_length(storage.foldername(name), 1) = 3
              and (storage.foldername(name))[2] in (select u::text from privado.unidades_com_permissao('nota.aprovar') as u));

alter table public.notas_pedidos add column protocolo text check (protocolo is null or protocolo ~ '^[0-9]{15}$');

create table public.notas_documentos (
  id uuid primary key default gen_random_uuid(),
  organizacao_id uuid not null,
  unidade_id uuid not null,
  pedido_id uuid not null references public.notas_pedidos (id),
  tipo text not null check (tipo in ('pdf', 'xml')),
  caminho text not null unique,
  bytes int not null check (bytes > 0),
  sha256 text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  enviado_por uuid not null references public.perfis_usuario (id),
  enviado_em timestamptz not null default now(),
  substituido_em timestamptz,
  foreign key (unidade_id, organizacao_id) references public.unidades (id, organizacao_id)
);
comment on table public.notas_documentos is
  'Arquivos da nota emitida (PDF e XML) no bucket privado "notas"; o vigente de cada tipo tem substituido_em nulo (L10a, ORA-FISC-005).';
create unique index notas_documentos_vigente on public.notas_documentos (pedido_id, tipo) where substituido_em is null;
create index notas_documentos_pedido on public.notas_documentos (pedido_id);
create index notas_documentos_enviado_por on public.notas_documentos (enviado_por);
create index notas_documentos_unidade on public.notas_documentos (unidade_id, organizacao_id);

-- Só a marca de substituição muda, uma vez; o resto do registro é fixo. Nada se apaga.
create or replace function privado.nota_documento_so_substituir()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.substituido_em is not null or new.substituido_em is null
     or (to_jsonb(old) - 'substituido_em') is distinct from (to_jsonb(new) - 'substituido_em') then
    raise exception 'O documento da nota não muda: envie outro arquivo, que substitui este' using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger notas_documentos_so_substituir before update on public.notas_documentos
  for each row execute function privado.nota_documento_so_substituir();
create trigger notas_documentos_sem_apagar before delete on public.notas_documentos
  for each row execute function privado.so_insercao();
create trigger notas_documentos_sem_truncate before truncate on public.notas_documentos
  for each statement execute function privado.so_insercao();
create trigger notas_documentos_auditar after insert or update on public.notas_documentos
  for each row execute function privado.auditar_mudanca();

alter table public.notas_documentos enable row level security;
revoke all on public.notas_documentos from anon, authenticated;
grant select on public.notas_documentos to authenticated;
create policy notas_documentos_ler on public.notas_documentos for select to authenticated
  using (pedido_id in (select p.id from public.notas_pedidos p));

create or replace function public.notas_anexar_documento(p_pedido uuid, p_tipo text, p_caminho text, p_sha256 text, p_protocolo text)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  pedido public.notas_pedidos := privado.nota_para_aprovar(p_pedido);
  v_protocolo text := nullif(regexp_replace(coalesce(p_protocolo, ''), '[^0-9]', '', 'g'), '');
  meta jsonb;
  existente uuid;
  novo uuid;
begin
  if pedido.situacao <> 'emitida' then
    raise exception 'Anexe o documento depois de registrar a emissão pela chave de acesso' using errcode = '22023';
  end if;
  if p_tipo is null or p_tipo not in ('pdf', 'xml') then
    raise exception 'Tipo de documento inválido: PDF ou XML' using errcode = '22023';
  end if;
  if p_caminho is null or p_caminho !~ ('^' || pedido.organizacao_id || '/' || pedido.unidade_id || '/' || pedido.id || '/[0-9a-f-]{36}\.' || p_tipo || '$') then
    raise exception 'Caminho do documento fora do padrão desta nota' using errcode = '22023';
  end if;
  if p_sha256 is null or p_sha256 !~ '^[0-9a-f]{64}$' then
    raise exception 'Resumo SHA-256 do documento inválido' using errcode = '22023';
  end if;
  if v_protocolo is not null and v_protocolo !~ '^[0-9]{15}$' then
    raise exception 'Protocolo de autorização inválido: 15 dígitos' using errcode = '22023';
  end if;
  if v_protocolo is not null and pedido.protocolo is not null and pedido.protocolo <> v_protocolo then
    raise exception 'Esta nota já tem outro protocolo registrado' using errcode = '22023';
  end if;
  select id into existente from public.notas_documentos d where d.caminho = p_caminho;
  if found then
    return existente;
  end if;
  select o.metadata into meta from storage.objects o where o.bucket_id = 'notas' and o.name = p_caminho;
  if meta is null then
    raise exception 'O arquivo não chegou ao Storage' using errcode = 'P0002';
  end if;
  if (p_tipo = 'pdf' and meta ->> 'mimetype' <> 'application/pdf')
     or (p_tipo = 'xml' and meta ->> 'mimetype' not in ('application/xml', 'text/xml')) then
    raise exception 'O arquivo no Storage não é do tipo informado' using errcode = '22023';
  end if;
  perform set_config('ora.motivo', format('Documento da nota (%s) da venda: pedido nº %s', upper(p_tipo), pedido.numero), true);
  update public.notas_documentos d set substituido_em = now() where d.pedido_id = pedido.id and d.tipo = p_tipo and d.substituido_em is null;
  insert into public.notas_documentos (organizacao_id, unidade_id, pedido_id, tipo, caminho, bytes, sha256, enviado_por)
  values (pedido.organizacao_id, pedido.unidade_id, pedido.id, p_tipo, p_caminho, (meta ->> 'size')::int, p_sha256, (select auth.uid()))
  returning id into novo;
  if v_protocolo is not null and pedido.protocolo is null then
    update public.notas_pedidos p set protocolo = v_protocolo, atualizado_em = now() where p.id = pedido.id;
  end if;
  return novo;
end;
$$;
revoke all on function public.notas_anexar_documento(uuid, text, text, text, text) from public, anon;
grant execute on function public.notas_anexar_documento(uuid, text, text, text, text) to authenticated;
revoke all on function privado.nota_documento_so_substituir() from public, anon, authenticated;
