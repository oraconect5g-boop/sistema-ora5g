-- Reversão de 20261114145608_clientes_nome_e_whatsapp (só em banco sem dados reais).
-- Volta o texto de cliente_salvar do L5a (20261111191909_clientes_compartilhados): documento ou telefone,
-- e-mail no financiamento e só o documento na nota.
create or replace function public.cliente_salvar(p_cliente uuid, p_dados jsonb, p_motivo text, p_chave text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_unidade uuid;
  v_organizacao uuid;
  v_atual public.clientes;
  v_antes privado.cliente_dados;
  v_motivo text;
  v_conteudo text := md5(coalesce(p_dados, '{}'::jsonb)::text);
  v_remover text[];
  v_tipo text;
  v_nome text;
  v_documento text;
  v_telefone text;
  v_email text;
  v_nascimento date;
  v_endereco jsonb;
  v_finalidades text[];
  v_documento_resumo text;
  v_telefone_resumo text;
  v_campos text[] := '{}';
  v_id uuid;
  v_numero bigint;
  v_texto text;
begin
  select c.unidade_id, c.organizacao_id into v_unidade, v_organizacao from privado.cliente_contexto('cliente.cadastrar') c;
  if p_dados is null or jsonb_typeof(p_dados) <> 'object' then
    raise exception 'Dados do cliente inválidos' using errcode = '22023';
  end if;
  v_remover := coalesce(array(select jsonb_array_elements_text(case when jsonb_typeof(p_dados -> 'remover') = 'array' then p_dados -> 'remover' end)), '{}');

  if p_cliente is null then
    if p_chave is null or length(trim(p_chave)) not between 8 and 80 then
      raise exception 'Chave do formulário obrigatória' using errcode = '22023';
    end if;
    perform pg_advisory_xact_lock(privado.trava_da_chave('clientes', v_organizacao, trim(p_chave)));
    select * into v_atual from public.clientes c where c.organizacao_id = v_organizacao and c.chave_criacao = trim(p_chave);
    if found then
      if v_atual.conteudo_criacao <> v_conteudo then
        raise exception 'Chave de idempotência já usada em outro cadastro' using errcode = 'OR004';
      end if;
      return jsonb_build_object('id', v_atual.id, 'numero', v_atual.numero, 'repetida', true, 'alterado', false);
    end if;
    v_atual := null;
  else
    select * into v_atual from public.clientes c where c.id = p_cliente and c.organizacao_id = v_organizacao for no key update;
    if not found then
      raise exception 'Cliente não encontrado' using errcode = 'P0002';
    end if;
    v_motivo := privado.exigir_motivo(p_motivo);
    select * into v_antes from privado.cliente_dados d where d.cliente_id = v_atual.id;
  end if;

  -- Valores: o enviado (não vazio), o removido ou o atual.
  v_tipo := coalesce(nullif(trim(coalesce(p_dados ->> 'tipo', '')), ''), v_atual.tipo);
  if v_tipo is null or v_tipo not in ('pessoa_fisica', 'pessoa_juridica') then
    raise exception 'Informe se é pessoa física ou empresa' using errcode = '22023';
  end if;
  v_nome := coalesce(nullif(regexp_replace(trim(coalesce(p_dados ->> 'nome', '')), '\s+', ' ', 'g'), ''), v_atual.nome);
  if v_nome is null or length(v_nome) not between 2 and 120 then
    raise exception 'Informe o nome (de 2 a 120 letras)' using errcode = '22023';
  end if;
  v_documento := case when 'documento' = any (v_remover) then null
    else coalesce(nullif(regexp_replace(coalesce(p_dados ->> 'documento', ''), '[^0-9]', '', 'g'), ''), v_antes.documento) end;
  if v_documento is not null and not (
       (v_tipo = 'pessoa_fisica' and length(v_documento) = 11 and privado.cpf_valido(v_documento))
       or (v_tipo = 'pessoa_juridica' and length(v_documento) = 14 and privado.cnpj_valido(v_documento))) then
    raise exception 'CPF (pessoa física) ou CNPJ (empresa) inválido' using errcode = '22023';
  end if;
  v_texto := nullif(trim(coalesce(p_dados ->> 'telefone', '')), '');
  if v_texto is not null then
    v_telefone := privado.telefone_normalizado(v_texto);
    if v_telefone is null then
      raise exception 'Telefone inválido: use o DDD e o número completo' using errcode = '22023';
    end if;
  elsif not ('telefone' = any (v_remover)) then
    v_telefone := v_antes.telefone;
  end if;
  v_texto := nullif(lower(trim(coalesce(p_dados ->> 'email', ''))), '');
  if v_texto is not null then
    if v_texto !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' or length(v_texto) > 200 then
      raise exception 'E-mail inválido' using errcode = '22023';
    end if;
    v_email := v_texto;
  elsif not ('email' = any (v_remover)) then
    v_email := v_antes.email;
  end if;
  v_texto := nullif(trim(coalesce(p_dados ->> 'nascimento', '')), '');
  if v_texto is not null then
    begin
      v_nascimento := v_texto::date;
    exception when others then
      raise exception 'Data de nascimento inválida' using errcode = '22023';
    end;
    if v_texto !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' or v_nascimento < date '1900-01-01' or v_nascimento > current_date then
      raise exception 'Data de nascimento inválida' using errcode = '22023';
    end if;
  elsif not ('nascimento' = any (v_remover)) then
    v_nascimento := v_antes.nascimento;
  end if;
  if jsonb_typeof(p_dados -> 'endereco') = 'object' then
    v_endereco := jsonb_strip_nulls(jsonb_build_object(
      'cep', nullif(regexp_replace(coalesce(p_dados -> 'endereco' ->> 'cep', ''), '[^0-9]', '', 'g'), ''),
      'logradouro', nullif(regexp_replace(trim(coalesce(p_dados -> 'endereco' ->> 'logradouro', '')), '\s+', ' ', 'g'), ''),
      'numero', nullif(trim(coalesce(p_dados -> 'endereco' ->> 'numero', '')), ''),
      'complemento', nullif(regexp_replace(trim(coalesce(p_dados -> 'endereco' ->> 'complemento', '')), '\s+', ' ', 'g'), ''),
      'bairro', nullif(regexp_replace(trim(coalesce(p_dados -> 'endereco' ->> 'bairro', '')), '\s+', ' ', 'g'), ''),
      'cidade', nullif(regexp_replace(trim(coalesce(p_dados -> 'endereco' ->> 'cidade', '')), '\s+', ' ', 'g'), ''),
      'uf', nullif(upper(trim(coalesce(p_dados -> 'endereco' ->> 'uf', ''))), '')));
    if v_endereco = '{}'::jsonb then
      v_endereco := null;
    elsif coalesce(v_endereco ->> 'cep', '') !~ '^[0-9]{8}$'
       or length(coalesce(v_endereco ->> 'logradouro', '')) not between 3 and 120
       or length(coalesce(v_endereco ->> 'numero', '')) not between 1 and 10
       or length(coalesce(v_endereco ->> 'complemento', '')) > 60
       or length(coalesce(v_endereco ->> 'bairro', '')) not between 2 and 60
       or length(coalesce(v_endereco ->> 'cidade', '')) not between 2 and 60
       or coalesce(v_endereco ->> 'uf', '') not in ('AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA', 'PB',
                                                   'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO') then
      raise exception 'Endereço incompleto: CEP, rua, número, bairro, cidade e UF' using errcode = '22023';
    end if;
  elsif 'endereco' = any (v_remover) then
    v_endereco := null;
  else
    v_endereco := v_antes.endereco;
  end if;
  if jsonb_typeof(p_dados -> 'finalidades') = 'array' then
    v_finalidades := array(select distinct x from jsonb_array_elements_text(p_dados -> 'finalidades') x order by x);
  else
    v_finalidades := coalesce(v_atual.finalidades, '{}');
  end if;
  if not (v_finalidades <@ array['nota_fiscal', 'ora_connect', 'financiamento', 'assistencia', 'entrega']) then
    raise exception 'Finalidade desconhecida' using errcode = '22023';
  end if;

  if p_cliente is null and coalesce(nullif(p_dados ->> 'origem', ''), 'loja') not in ('loja', 'online', 'whatsapp', 'telefone', 'connect', 'importacao') then
    raise exception 'Origem do cadastro inválida' using errcode = '22023';
  end if;

  -- Dados mínimos por finalidade (ORA-CRM-001) e minimização.
  if v_documento is null and v_telefone is null then
    raise exception 'Informe o CPF/CNPJ ou o telefone: é por eles que o cliente é encontrado' using errcode = '22023';
  end if;
  if 'nota_fiscal' = any (v_finalidades) and v_documento is null then
    raise exception 'Nota fiscal no nome do cliente pede o CPF ou o CNPJ' using errcode = '22023';
  end if;
  if 'ora_connect' = any (v_finalidades) and (v_documento is null or v_telefone is null or (v_tipo = 'pessoa_fisica' and v_nascimento is null)) then
    raise exception 'Ora Connect pede o documento, o telefone e, para pessoa física, a data de nascimento' using errcode = '22023';
  end if;
  if 'financiamento' = any (v_finalidades) and (v_tipo <> 'pessoa_fisica' or v_documento is null or v_telefone is null or v_email is null or v_nascimento is null) then
    raise exception 'Financiamento é de pessoa física e pede CPF, telefone, e-mail e data de nascimento' using errcode = '22023';
  end if;
  if 'assistencia' = any (v_finalidades) and v_telefone is null then
    raise exception 'Assistência pede o telefone para avisar o cliente' using errcode = '22023';
  end if;
  if 'entrega' = any (v_finalidades) and v_endereco is null then
    raise exception 'Entrega pede o endereço completo' using errcode = '22023';
  end if;
  if v_nascimento is not null and not (v_finalidades && array['ora_connect', 'financiamento']) then
    raise exception 'Data de nascimento só fica guardada para Ora Connect ou financiamento (dados mínimos)' using errcode = '22023';
  end if;
  if v_endereco is not null and not (v_finalidades && array['entrega', 'ora_connect', 'financiamento', 'nota_fiscal']) then
    raise exception 'Endereço só fica guardado para entrega, Ora Connect, financiamento ou nota fiscal (dados mínimos)' using errcode = '22023';
  end if;

  -- Mesmo CPF/CNPJ não entra duas vezes; telefone de outra pessoa pede confirmação (família).
  if v_documento is not null then
    v_documento_resumo := privado.cliente_resumo(v_organizacao, 'documento', v_documento);
    perform pg_advisory_xact_lock(privado.trava_da_chave('clientes:documento', v_organizacao, v_documento_resumo));
    if exists (select 1 from public.clientes c where c.organizacao_id = v_organizacao and c.documento_resumo = v_documento_resumo
               and c.id is distinct from v_atual.id) then
      raise exception 'Já existe cliente com este CPF/CNPJ: busque pelo documento' using errcode = 'OR026';
    end if;
  end if;
  if v_telefone is not null then
    v_telefone_resumo := privado.cliente_resumo(v_organizacao, 'telefone', v_telefone);
    if v_telefone is distinct from v_antes.telefone
       and exists (select 1 from public.clientes c where c.organizacao_id = v_organizacao and c.telefone_resumo = v_telefone_resumo
                   and c.id is distinct from v_atual.id and c.situacao = 'ativo')
       and coalesce(p_dados ->> 'telefone_compartilhado', '') <> 'true' then
      raise exception 'Este telefone já está no cadastro de outro cliente: confirme que é outra pessoa (telefone da família, por exemplo)' using errcode = 'OR027';
    end if;
  end if;

  -- O que mudou (só o nome dos campos vai para a auditoria).
  if v_atual.id is not null then
    if v_tipo is distinct from v_atual.tipo then v_campos := array_append(v_campos, 'tipo'); end if;
    if v_nome is distinct from v_atual.nome then v_campos := array_append(v_campos, 'nome'); end if;
    if v_documento is distinct from v_antes.documento then v_campos := array_append(v_campos, 'documento'); end if;
    if v_telefone is distinct from v_antes.telefone then v_campos := array_append(v_campos, 'telefone'); end if;
    if v_email is distinct from v_antes.email then v_campos := array_append(v_campos, 'email'); end if;
    if v_nascimento is distinct from v_antes.nascimento then v_campos := array_append(v_campos, 'nascimento'); end if;
    if v_endereco is distinct from v_antes.endereco then v_campos := array_append(v_campos, 'endereco'); end if;
    if v_finalidades is distinct from v_atual.finalidades then v_campos := array_append(v_campos, 'finalidades'); end if;
    if cardinality(v_campos) = 0 then
      return jsonb_build_object('id', v_atual.id, 'numero', v_atual.numero, 'repetida', false, 'alterado', false);
    end if;
    update public.clientes c set tipo = v_tipo, nome = v_nome, finalidades = v_finalidades,
      documento_resumo = v_documento_resumo, documento_mascara = privado.mascara_documento(v_documento),
      telefone_resumo = v_telefone_resumo, telefone_mascara = privado.mascara_telefone(v_telefone), email_mascara = privado.mascara_email(v_email),
      nascimento_informado = v_nascimento is not null, endereco_informado = v_endereco is not null,
      atualizado_por = (select auth.uid()), atualizado_em = now()
    where c.id = v_atual.id;
    update privado.cliente_dados d set documento = v_documento, telefone = v_telefone, email = v_email, nascimento = v_nascimento, endereco = v_endereco
    where d.cliente_id = v_atual.id;
    v_id := v_atual.id;
    v_numero := v_atual.numero;
  else
    insert into public.clientes (organizacao_id, tipo, nome, finalidades, documento_resumo, documento_mascara, telefone_resumo, telefone_mascara,
                                 email_mascara, nascimento_informado, endereco_informado, origem, unidade_origem_id, chave_criacao, conteudo_criacao, criado_por)
    values (v_organizacao, v_tipo, v_nome, v_finalidades, v_documento_resumo, privado.mascara_documento(v_documento), v_telefone_resumo,
            privado.mascara_telefone(v_telefone), privado.mascara_email(v_email), v_nascimento is not null, v_endereco is not null,
            coalesce(nullif(p_dados ->> 'origem', ''), 'loja'), v_unidade, trim(p_chave), v_conteudo, (select auth.uid()))
    returning id, numero into v_id, v_numero;
    insert into privado.cliente_dados (cliente_id, documento, telefone, email, nascimento, endereco)
    values (v_id, v_documento, v_telefone, v_email, v_nascimento, v_endereco);
    v_campos := array['tipo', 'nome'] || case when v_documento is not null then array['documento'] else '{}' end
      || case when v_telefone is not null then array['telefone'] else '{}' end || case when v_email is not null then array['email'] else '{}' end
      || case when v_nascimento is not null then array['nascimento'] else '{}' end || case when v_endereco is not null then array['endereco'] else '{}' end
      || case when cardinality(v_finalidades) > 0 then array['finalidades'] else '{}' end;
  end if;

  insert into public.auditoria (usuario_id, unidade_id, organizacao_id, acao, alvo_tipo, alvo_id, depois, motivo, origem)
  values ((select auth.uid()), v_unidade, v_organizacao, case when v_atual.id is null then 'cliente.criado' else 'cliente.alterado' end, 'cliente', v_id::text,
          jsonb_build_object('campos', to_jsonb(v_campos), 'finalidades', to_jsonb(v_finalidades)), v_motivo, 'aplicacao');
  return jsonb_build_object('id', v_id, 'numero', v_numero, 'repetida', false, 'alterado', true);
end;
$$;
