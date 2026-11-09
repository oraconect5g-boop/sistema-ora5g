// Protótipo de UX, fora da aplicação operacional. Não chama API nem movimenta estoque.
import React,{useState} from 'react';
import {createRoot} from 'react-dom/client';
import referencia from '../../cadastros/LOJAS_CONFIRMADAS_2026-11-09.json';
import './style.css';
const numero=(n:number)=>n.toLocaleString('pt-BR');
const nome=(n:string)=>n.toLocaleLowerCase('pt-BR').replace(/(^|\s)\S/g,c=>c.toLocaleUpperCase('pt-BR'));
const atual='SANTA CANDIDA';
const lojas=referencia.locais.filter(l=>l.tipo_confirmado==='loja_comercial').sort((a,b)=>(a.nome_imagem===atual?-1:b.nome_imagem===atual?1:a.nome_imagem.localeCompare(b.nome_imagem)));
type Local=(typeof lojas)[number];
function App(){
 const [busca,setBusca]=useState('capinha');const [aberto,setAberto]=useState(false);const [filtro,setFiltro]=useState('Todas');
 const [origem,setOrigem]=useState<Local|null>(null);const [quantidade,setQuantidade]=useState('1');const [destino,setDestino]=useState(atual);
 const [detalhes,setDetalhes]=useState<string|null>(null);const [sucesso,setSucesso]=useState('');const [pedidos,setPedidos]=useState(0);
 const validos=Number.isInteger(Number(quantidade))&&Number(quantidade)>0&&Number(quantidade)<=(origem?.disponivel_imagem??0)&&destino!==origem?.nome_imagem;
 const mostrar=busca.trim()===''||'capinha colorida 4149'.includes(busca.toLowerCase());
 function pedir(l:Local){setOrigem(l);setQuantidade('1');setDestino(atual);}
 return <><div className="aviso">PROTÓTIPO VISUAL · dados da imagem · sem movimentação real</div>
 <header><span className="marca">ora<span>5G</span></span><nav>Estoque <b> / Buscar produto</b></nav><span className="unidade">● Santa Candida</span></header>
 <main><div className="titulo"><div><span className="eyebrow">ESTOQUE DA REDE</span><h1>Encontre. Confira. Peça.</h1><p>Um produto, todas as lojas no mesmo lugar.</p></div><span className="chip">11 lojas · 1 local de exceção</span></div>
 <label className="busca"><span aria-hidden>⌕</span><input aria-label="Buscar produto" value={busca} onChange={e=>setBusca(e.target.value)} placeholder="Nome, SKU, código de barras, IMEI ou ICCID"/><kbd>Buscar</kbd></label>
 {sucesso&&<div role="status" className="sucesso">✓ {sucesso} <small>Pedido simulado; os saldos permanecem iguais.</small></div>}
 <div className="linha"><h2>Produtos encontrados</h2><span>Pedidos internos {pedidos>0&&<b>{pedidos}</b>}</span></div>
 {mostrar?<button className="produto" onClick={()=>setAberto(true)}><span className="foto">▧<small>Foto pendente</small></span><span className="identidade"><b>Capinha colorida</b><small>Código 4149 · conferir variante pela foto</small><span className="tag">Disponível na sua loja</span></span><span className="quantia"><b>678</b><small>na sua loja</small></span><span className="abrir">Ver lojas →</span></button>:<div className="vazio">Nenhum produto corresponde à busca.</div>}
 <p className="legenda">Toque no produto para ver disponibilidade, pendências e solicitar uma transferência.</p>
 </main>
 {aberto&&<div className="overlay"><section className="painel" role="dialog" aria-modal="true" aria-label="Disponibilidade por loja">
 <div className="cabecalho"><span className="eyebrow">DISPONIBILIDADE POR LOJA</span><button aria-label="Fechar disponibilidade" className="fechar" onClick={()=>setAberto(false)}>×</button></div>
 <div className="produto-painel"><span className="foto">▧<small>Foto pendente</small></span><div><h2>Capinha colorida</h2><p>Código 4149 <span>·</span> identificação da variante pela foto</p></div></div>
 <div className="resumos"><div><small>Na sua loja</small><b>678</b><span>Santa Candida</span></div><div><small>Nas lojas listadas</small><b>6.724</b><span>disponível informado nas linhas</span></div><div><small>Transferências pendentes</small><b>31</b><span>ver pedidos por loja</span></div></div>
 <div className="conciliar"><b>Totais em conferência</b> A origem informa 6.688 disponíveis no cabeçalho e 6.725 nas linhas, incluindo DEFEITOS. A regra precisa ser conciliada antes de usar esses totais.</div>
 <div className="filtros">{['Todas','Com pendência'].map(f=><button key={f} aria-pressed={filtro===f} onClick={()=>setFiltro(f)} className={filtro===f?'ativo':''}>{f}</button>)}<span>11 lojas comerciais</span></div>
 <div className="tabela"><div className="rotulos"><span>Loja</span><span>Disponível</span><span>Físico</span><span>Ação</span></div>
 {lojas.filter(l=>filtro==='Todas'||l.pendencias_imagem>0).map(l=><React.Fragment key={l.nome_imagem}><div className={'loja '+(l.nome_imagem===atual?'minha':'')}>
 <div><strong>{nome(l.nome_imagem)}</strong>{l.nome_imagem===atual&&<small className="voce">Sua loja</small>}{l.pendencias_imagem>0&&<button className="pendencia" aria-expanded={detalhes===l.nome_imagem} onClick={()=>setDetalhes(detalhes===l.nome_imagem?null:l.nome_imagem)}>↔ {l.pendencias_imagem} pendentes · ver pedidos</button>}</div>
 <div className="disponivel"><small>Disponível</small><b>{numero(l.disponivel_imagem)}</b></div><div className="fisico"><small>Físico</small>{numero(l.quantidade_local_imagem)}</div>
 <button className="pedir" disabled={l.nome_imagem===atual} onClick={()=>pedir(l)}>{l.nome_imagem===atual?'Loja atual':'Pedir →'}</button></div>
 {detalhes===l.nome_imagem&&<div className="pedidos"><b>Pedidos informados na imagem</b><p>{l.pedidos_imagem.map(p=>`#${p}`).join(' · ')}</p><small>Origem, destino e situação serão exibidos após conciliação do cadastro.</small></div>}</React.Fragment>)}</div>
 <aside className="excecao"><span>◇</span><div><b>DEFEITOS <small>Local de exceção</small></b><p>1 unidade na imagem · transferência para tratar erro ou problema. Saldo separado das lojas comerciais.</p></div></aside>
 <footer>Solicitar uma transferência não aumenta o estoque do destino. O recebimento deve ser conferido.</footer>
 </section></div>}
 {origem&&<div className="overlay pedido-overlay"><form className="form-pedido" role="dialog" aria-modal="true" aria-label="Pedir transferência" onSubmit={e=>{e.preventDefault();if(!validos)return;setSucesso(`${quantidade} peça(s) de ${nome(origem.nome_imagem)} para ${nome(destino)}: aguardando autorização.`);setPedidos(pedidos+1);setOrigem(null);setAberto(false);}}>
 <div className="cabecalho"><span className="eyebrow">PEDIDO INTERNO</span><button type="button" aria-label="Cancelar pedido" className="fechar" onClick={()=>setOrigem(null)}>×</button></div><h2>Pedir transferência</h2><p>Capinha colorida · Código 4149</p>
 <div className="trajeto"><span><small>Origem</small><b>{nome(origem.nome_imagem)}</b></span><span>→</span><span><small>Disponível</small><b>{origem.disponivel_imagem} peças</b></span></div>
 <label>Destino<select value={destino} onChange={e=>setDestino(e.target.value)}>{lojas.filter(l=>l.nome_imagem!==origem.nome_imagem).map(l=><option key={l.nome_imagem}>{l.nome_imagem}</option>)}</select></label>
 <label>Quantidade<input aria-label="Quantidade a transferir" type="number" min="1" max={origem.disponivel_imagem} value={quantidade} onChange={e=>setQuantidade(e.target.value)}/></label>
 <label>Motivo<input placeholder="Ex.: atender um cliente da loja"/></label><p className="nota">A origem separa e envia. O destino confere o recebimento. Divergência e envio para DEFEITOS têm registro próprio.</p>
 <button className="confirmar" type="submit" disabled={!validos}>Criar pedido simulado</button><button type="button" className="cancelar" onClick={()=>setOrigem(null)}>Voltar</button>
 </form></div>}
 </>;
}
createRoot(document.getElementById('root')!).render(<App/>);
