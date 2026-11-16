(() => {
 const client=window.supabaseClient, $=s=>document.querySelector(s);
 const names=window.CRM_CAREER_ROLES||{};
 let page=0,rows=[],total=0,version=0,authenticated=false;
 const esc=v=>String(v??'—').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const date=v=>v?new Date(v).toLocaleString():'—';
 for(const [id,title] of Object.entries(names)){const o=document.createElement('option');o.value=id;o.textContent=title;$('#careers-role').append(o);}
 function pagination(){ $('#careers-prev').disabled=page===0;$('#careers-next').disabled=(page+1)*25>=total;$('#careers-page').textContent=total?`Page ${page+1} of ${Math.ceil(total/25)}`:''; }
 async function load(){
 if(!authenticated)return;
 const request=++version;$('#careers-rows').replaceChildren();rows=[];$('#careers-message').textContent='Loading applications…';$('#careers-prev').disabled=true;$('#careers-next').disabled=true;
 try{
 const {data,error}=await client.rpc('list_career_applications',{p_search:$('#careers-search').value.trim(),p_role:$('#careers-role').value,p_status:$('#careers-status').value,p_page:page});
 if(request!==version)return;
 if(error)throw error;
 if(!Array.isArray(data?.rows))throw Error('Invalid response');rows=data.rows;total=Number(data.total)||0;
 $('#careers-message').textContent=total?`${total} matching applications`:'No applications match these filters.';
 $('#careers-rows').innerHTML=rows.map((r,i)=>`<tr><td>${esc(r.full_name)}<small>${esc(r.email)}</small></td><td>${esc(names[r.role_id]||r.role_id)}</td><td>${esc(r.college)}</td><td>${esc(date(r.created_at))}</td><td>${esc(r.status)}</td><td><button class="secondary-btn" data-application="${i}">View</button></td></tr>`).join('');pagination();
 }catch(error){if(request!==version)return;total=0;$('#careers-page').textContent='';$('#careers-message').textContent=error.code==='42501'?'Access denied. Your account needs recruitment administrator access.':'Unable to load applications. Check your connection and confirm the careers CRM migration has been installed, then refresh.';}
 }
 $('#careers-filters').addEventListener('submit',e=>{e.preventDefault();page=0;load();});
 $('#careers-refresh').addEventListener('click',()=>load());
 $('#careers-prev').addEventListener('click',()=>{if(page>0){page--;load();}});
 $('#careers-next').addEventListener('click',()=>{if((page+1)*25<total){page++;load();}});
 $('#careers-rows').addEventListener('click',e=>{const b=e.target.closest('[data-application]');if(!b)return;const r=rows[Number(b.dataset.application)];if(!r)return;
 const fields=[['Name',r.full_name],['Email',r.email],['Role',names[r.role_id]||r.role_id],['College',r.college],['Branch',r.department],['Graduation year',r.graduation_year],['Motivation',r.motivation],['Submitted',date(r.created_at)],['Status',r.status],['Consent',r.consent?'Given':'Not recorded'],['Privacy version',r.privacy_version],['Reference',r.id]];
 $('#careers-detail-body').innerHTML='<dl class="careers-fields">'+fields.map(([k,v])=>`<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('')+'</dl>';
 try{const url=new URL(r.resume_url);if(url.protocol==='https:'){const a=document.createElement('a');a.href=url.href;a.textContent='Open résumé';a.target='_blank';a.rel='noopener noreferrer';a.className='secondary-btn';$('#careers-detail-body').append(a);}}catch{}
 $('#careers-detail').showModal();});$('#careers-close').addEventListener('click',()=>$('#careers-detail').close());
 client?.auth.onAuthStateChange((event,session)=>{if(event==='SIGNED_OUT'){version++;rows=[];$('#careers-rows').replaceChildren();$('#careers-detail').close();location.replace('index.html');}});
 (async()=>{try{if(!client)throw Error();const {data,error}=await client.auth.getSession();if(error)throw error;if(!data.session){location.replace('index.html');return;}authenticated=true;await load();}catch{$('#careers-message').textContent='Unable to verify your session. Return to User management and sign in again.';}})();
})();
