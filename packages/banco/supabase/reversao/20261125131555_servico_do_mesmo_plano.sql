-- Reversão de 20261125131555_servico_do_mesmo_plano (lote CONNECT-f): volta a definição anterior de
-- public.connect_registrar (20261109201940_mensagens_nogle), que aceita qualquer serviço pago do mesmo tipo.

create or replace function public.connect_registrar(p_tipo text, p_pedido jsonb, p_chave text)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  usuario uuid := (select auth.uid());
  unidade uuid := (select public.unidade_atual());
  organizacao uuid;
  conteudo text;
  existente public.connect_operacoes;
  metodo text := upper(nullif(trim(p_pedido ->> 'metodo'), ''));
  texto_item text := nullif(trim(p_pedido ->> 'venda_item'), '');
  item public.venda_itens;
  venda public.vendas;
  plano public.connect_referencias;
  numero_iccid text := nullif(regexp_replace(coalesce(p_pedido ->> 'iccid', ''), '[^0-9]', '', 'g'), '');
  eh_esim boolean := coalesce(p_pedido ->> 'esim', 'false') = 'true';
  numero_ddd int;
  numero_linha text := nullif(regexp_replace(coalesce(p_pedido ->> 'linha', ''), '[^0-9]', '', 'g'), '');
  doadora text := nullif(regexp_replace(coalesce(p_pedido ->> 'linha_doadora', ''), '[^0-9]', '', 'g'), '');
  operadora int;
  cliente jsonb := p_pedido -> 'cliente';
  endereco jsonb;
  cpf text;
  cnpj text;
  nascimento date;
  email text;
  telefone text;
  dados jsonb;
  mascara text;
  chip public.itens_serializados;
  venda_do_chip uuid;
  recebido bigint;
  nova public.connect_operacoes;
begin
  if unidade is null or not (select public.tem_permissao('connect.operar', unidade)) then
    raise exception 'Sem permissão para operar a Ora Connect nesta loja' using errcode = '42501';
  end if;
  if p_tipo is null or p_tipo not in ('ativacao', 'recarga', 'portabilidade') then
    raise exception 'Tipo de operação inválido' using errcode = '22023';
  end if;
  if p_chave is null or length(trim(p_chave)) = 0 then
    raise exception 'Chave de idempotência obrigatória' using errcode = '22023';
  end if;
  if p_pedido is null or jsonb_typeof(p_pedido) <> 'object' then
    raise exception 'Pedido inválido' using errcode = '22023';
  end if;
  select u.organizacao_id into organizacao from public.unidades u where u.id = unidade;
  -- Conteúdo para a chave (REV-055, #58): os campos da operação e um resumo COM SEGREDO do titular
  -- (nome, documento, nascimento, contatos e endereço normalizados). A mesma chave com outro titular
  -- é OR004, também depois do descarte do pedido; o dado pessoal não fica no resumo.
  conteudo := md5(p_tipo || ':' || (p_pedido - 'cliente')::text
                  || coalesce(':' || privado.connect_resumo_titular(organizacao, p_pedido -> 'cliente'), ''));
  perform pg_advisory_xact_lock(privado.trava_da_chave('connect', organizacao, p_chave));
  select * into existente from public.connect_operacoes o where o.organizacao_id = organizacao and o.chave = p_chave;
  if found then
    if existente.vendedor_id <> usuario or existente.unidade_id <> unidade or existente.conteudo <> conteudo then
      raise exception 'Chave de idempotência já usada em outra operação' using errcode = 'OR004';
    end if;
    return existente.id;
  end if;
  if not exists (select 1 from public.connect_habilitacoes h where h.organizacao_id = organizacao and h.tipo = p_tipo and h.habilitada) then
    raise exception 'Operação ainda não liberada: falta a homologação com a Nogle' using errcode = 'OR012';
  end if;

  -- Forma de pagamento: LINK (cliente paga à Nogle) ou SALDO (carteira da Ora; só com o serviço pago na loja).
  if p_tipo = 'portabilidade' then
    if metodo is not null then
      raise exception 'Portabilidade não tem forma de pagamento' using errcode = '22023';
    end if;
  elsif metodo is null or metodo not in ('LINK', 'SALDO') then
    raise exception 'Forma de pagamento: LINK ou SALDO' using errcode = '22023';
  end if;
  if metodo = 'SALDO' and texto_item is null then
    raise exception 'SALDO: venda e receba o serviço no caixa antes de pedir à Nogle' using errcode = '22023';
  end if;
  -- Serviço já recebido no caixa não é cobrado de novo pelo LINK (REV-054, #57).
  if metodo = 'LINK' and texto_item is not null then
    raise exception 'Este serviço já foi pago no caixa: use SALDO (o LINK cobraria o cliente de novo)' using errcode = '22023';
  end if;
  if texto_item is not null then
    if texto_item !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      raise exception 'Item de venda inválido' using errcode = '22023';
    end if;
    select * into item from public.venda_itens i where i.id = texto_item::uuid;
    if found then
      select * into venda from public.vendas v where v.id = item.venda_id for share;
    end if;
    if not found or venda.unidade_id <> unidade or venda.situacao <> 'concluida' or item.tipo <> p_tipo then
      raise exception 'O item informado não é um serviço pago desta loja para esta operação' using errcode = 'P0002';
    end if;
    recebido := item.preco_unitario_centavos * item.quantidade - item.desconto_centavos;
  end if;

  if p_tipo in ('ativacao', 'recarga') then
    select * into plano from public.connect_referencias r
    where r.organizacao_id = organizacao and r.tipo = 'plano' and r.codigo = trim(p_pedido ->> 'plano') and r.ativo;
    if not found then
      raise exception 'Plano não encontrado na lista da Nogle' using errcode = 'P0002';
    end if;
  end if;

  if p_tipo = 'ativacao' then
    if eh_esim and numero_iccid is not null then
      raise exception 'eSIM não leva ICCID' using errcode = '22023';
    end if;
    if not eh_esim and (numero_iccid is null or not privado.iccid_valido(numero_iccid)) then
      raise exception 'ICCID inválido: confira os dígitos impressos no chip' using errcode = '22023';
    end if;
    if coalesce(p_pedido ->> 'ddd', '') !~ '^[1-9]{2}$'
       or not exists (select 1 from public.connect_referencias r
                      where r.organizacao_id = organizacao and r.tipo = 'ddd' and r.codigo = p_pedido ->> 'ddd' and r.ativo) then
      raise exception 'DDD fora da lista da Nogle' using errcode = '22023';
    end if;
    numero_ddd := (p_pedido ->> 'ddd')::int;
    if cliente is null or jsonb_typeof(cliente) <> 'object' then
      raise exception 'Informe os dados do cliente' using errcode = '22023';
    end if;
    cpf := nullif(regexp_replace(coalesce(cliente ->> 'cpf', ''), '[^0-9]', '', 'g'), '');
    cnpj := nullif(regexp_replace(coalesce(cliente ->> 'cnpj', ''), '[^0-9]', '', 'g'), '');
    if (cpf is null) = (cnpj is null) then
      raise exception 'Informe o CPF (pessoa física) ou o CNPJ (empresa)' using errcode = '22023';
    end if;
    if cpf is not null and not privado.cpf_valido(cpf) then
      raise exception 'CPF inválido' using errcode = '22023';
    end if;
    if cnpj is not null and not privado.cnpj_valido(cnpj) then
      raise exception 'CNPJ inválido' using errcode = '22023';
    end if;
    if cpf is not null then
      if coalesce(cliente ->> 'data_nascimento', '') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then
        raise exception 'Data de nascimento obrigatória para pessoa física' using errcode = '22023';
      end if;
      begin
        nascimento := (cliente ->> 'data_nascimento')::date;
      exception when others then
        raise exception 'Data de nascimento inválida' using errcode = '22023';
      end;
      if nascimento < date '1900-01-01' or nascimento >= current_date then
        raise exception 'Data de nascimento inválida' using errcode = '22023';
      end if;
    end if;
    email := lower(nullif(trim(cliente ->> 'email'), ''));
    if email is not null and (length(email) > 200 or email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$') then
      raise exception 'E-mail inválido' using errcode = '22023';
    end if;
    telefone := nullif(regexp_replace(coalesce(cliente ->> 'telefone', ''), '[^0-9]', '', 'g'), '');
    if telefone is not null and telefone !~ '^[1-9]{2}[0-9]{9}$' then
      raise exception 'Telefone com DDD: 11 dígitos' using errcode = '22023';
    end if;
    endereco := cliente -> 'endereco';
    if endereco is null or jsonb_typeof(endereco) <> 'object' then
      raise exception 'Informe o endereço do cliente' using errcode = '22023';
    end if;
    if coalesce(regexp_replace(endereco ->> 'cep', '[^0-9]', '', 'g'), '') !~ '^[0-9]{8}$' then
      raise exception 'CEP: 8 dígitos' using errcode = '22023';
    end if;
    if coalesce(endereco ->> 'id_cidade', '') !~ '^[0-9]{1,9}$'
       or not exists (select 1 from public.connect_referencias r
                      where r.organizacao_id = organizacao and r.tipo = 'cidade' and r.codigo = endereco ->> 'id_cidade' and r.ativo) then
      raise exception 'Cidade fora da lista da Nogle' using errcode = '22023';
    end if;
    -- Só os campos documentados de POST /ativacao/solicitar.
    dados := jsonb_strip_nulls(jsonb_build_object(
      'nome', privado.connect_texto(cliente, 'nome', 'o nome do cliente', 120),
      'cpf', cpf,
      'cnpj', cnpj,
      'email', email,
      'telefone', telefone,
      'data_nascimento', to_char(nascimento, 'YYYY-MM-DD'),
      'endereco', jsonb_strip_nulls(jsonb_build_object(
        'rua', privado.connect_texto(endereco, 'rua', 'a rua', 120),
        'numero', privado.connect_texto(endereco, 'numero', 'o número do endereço', 20),
        'complemento', privado.connect_texto(endereco, 'complemento', 'o complemento', 120, false),
        'bairro', privado.connect_texto(endereco, 'bairro', 'o bairro', 120),
        'cep', regexp_replace(endereco ->> 'cep', '[^0-9]', '', 'g'),
        'id_cidade', (endereco ->> 'id_cidade')::int))));
    if length(dados ->> 'nome') < 3 then
      raise exception 'Informe o nome completo do cliente' using errcode = '22023';
    end if;
    mascara := case when cpf is not null then '•••.•••.' || substr(cpf, 7, 3) || '-' || right(cpf, 2)
                    else '••.•••.•••/' || substr(cnpj, 9, 4) || '-' || right(cnpj, 2) end;
    -- Chip do nosso estoque: só depois de vendido (a venda do chip é outro fato).
    if numero_iccid is not null then
      select * into chip from public.itens_serializados s
      where s.organizacao_id = organizacao and s.iccid = numero_iccid for update;
      if found then
        if chip.situacao <> 'vendido' then
          raise exception 'Este chip ainda está no estoque: venda o chip antes de ativar' using errcode = 'OR011';
        end if;
        select vi.venda_id into venda_do_chip
        from public.venda_itens vi join public.vendas v on v.id = vi.venda_id
        where vi.item_serializado_id = chip.id and v.situacao = 'concluida'
        order by v.concluida_em desc limit 1;
      end if;
    end if;
  elsif p_tipo = 'recarga' then
    if not privado.linha_valida(numero_linha) then
      raise exception 'Linha: 11 dígitos com DDD' using errcode = '22023';
    end if;
  else
    if not privado.linha_valida(numero_linha) or not privado.linha_valida(doadora) then
      raise exception 'Linhas: 11 dígitos com DDD' using errcode = '22023';
    end if;
    if numero_linha = doadora then
      raise exception 'A linha doadora é a da outra operadora: não pode ser a mesma da Nogle' using errcode = '22023';
    end if;
    if coalesce(p_pedido ->> 'operadora', '') !~ '^[0-9]{1,9}$'
       or not exists (select 1 from public.connect_referencias r
                      where r.organizacao_id = organizacao and r.tipo = 'operadora' and r.codigo = p_pedido ->> 'operadora' and r.ativo) then
      raise exception 'Operadora doadora fora da lista da Nogle' using errcode = '22023';
    end if;
    operadora := (p_pedido ->> 'operadora')::int;
  end if;

  begin
    insert into public.connect_operacoes (
      organizacao_id, unidade_id, vendedor_id, tipo, chave, conteudo, metodo_pagamento, iccid, esim, ddd, linha, linha_doadora,
      operadora_doadora_id, plano_id, plano_nome, valor_face_centavos, item_serializado_id, venda_chip_id, venda_item_id,
      recebido_na_loja_centavos, cliente_nome, documento_mascarado)
    values (
      organizacao, unidade, usuario, p_tipo, p_chave, conteudo, metodo, numero_iccid, eh_esim, numero_ddd,
      case when p_tipo <> 'ativacao' then numero_linha end, case when p_tipo = 'portabilidade' then doadora end,
      operadora, plano.codigo::int, plano.nome, plano.valor_centavos, chip.id, venda_do_chip, item.id,
      recebido, dados ->> 'nome', mascara)
    returning * into nova;
  exception when unique_violation then
    raise exception 'Já existe operação em andamento (ou feita) para este chip, linha ou serviço pago' using errcode = 'OR013';
  end;
  if dados is not null then
    insert into privado.connect_dados_envio (operacao_id, dados) values (nova.id, dados);
  end if;
  perform privado.connect_evento(nova, 'registrada', null, 'registrada');
  return nova.id;
end;
$$;
