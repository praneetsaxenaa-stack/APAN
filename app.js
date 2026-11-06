import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// Add your Supabase Project URL and anon/public key here.
// Never put a service_role key in browser code.
const SUPABASE_URL = 'YOUR_SUPABASE_URL';
const SUPABASE_ANON_KEY = 'YOUR_SUPABASE_ANON_KEY';
const configured = SUPABASE_URL.startsWith('https://') && !SUPABASE_URL.includes('YOUR_') && !SUPABASE_ANON_KEY.includes('YOUR_');
const supabase = configured ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;
const $ = id => document.getElementById(id);
let user = null, activeYaar = null, selectedSong = null, authMode = 'login';

function show(id){$('boot').classList.add('hidden');$('auth').classList.add('hidden');$('app').classList.add('hidden');$(id).classList.remove('hidden')}
function note(id,msg){$(id).textContent=msg}
function escapeHtml(s=''){return s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}

async function start(){
 if(!configured){setTimeout(()=>show('auth'),900);note('authMessage','Setup required: add your Supabase URL and anon key in app.js, then run through a local web server.');return}
 const {data:{session}}=await supabase.auth.getSession();
 supabase.auth.onAuthStateChange((_event,session)=>{user=session?.user||null; if(user)loadApp();else show('auth')});
 if(session?.user){user=session.user;await loadApp()}else show('auth');
}
$('toggleAuth').onclick=()=>{authMode=authMode==='login'?'signup':'login';$('authSubmit').textContent=authMode==='login'?'Sign in':'Create account';$('toggleAuth').textContent=authMode==='login'?'New here? Create an account':'Already registered? Sign in'};
$('authForm').onsubmit=async e=>{e.preventDefault();if(!supabase)return;note('authMessage','Please wait…');const email=$('email').value.trim(),password=$('password').value;let result;
 if(authMode==='signup')result=await supabase.auth.signUp({email,password});else result=await supabase.auth.signInWithPassword({email,password});
 note('authMessage',result.error?.message||(authMode==='signup'?'Account created. Check your email if confirmation is enabled.':'Signed in.'));
 if(result.data?.session){user=result.data.user;await loadApp()}
};
$('logout').onclick=async()=>{await supabase.auth.signOut();};

async function loadApp(){show('app');$('whoami').textContent=user.email||'';await ensureProfile();await Promise.all([loadProfile(),loadIncoming(),loadMemories(),loadInstants(),loadChats()]);subscribeMessages()}
async function ensureProfile(){const {data}=await supabase.from('profiles').select('id').eq('id',user.id).maybeSingle();if(!data){const base=(user.email||'member').split('@')[0].toLowerCase().replace(/[^a-z0-9_]/g,'').slice(0,18)||'member';await supabase.from('profiles').insert({id:user.id,handle:base+'_'+user.id.slice(0,5),display_name:base})}}
function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;

  const button = document.getElementById('settingsThemeBtn');

  if (button) {
    button.textContent =
      theme === 'dark' ? 'Switch to Light' : 'Switch to Dark';
  }
}
async function loadProfile() {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single();

  if (error) {
    console.error(error.message);
    return;
  }

  $('profileName').textContent = data.display_name || 'Your name';
  $('profileHandle').textContent = '@' + data.handle;
  $('profileEmail').textContent = user.email || '';

  $('accountAvatar').textContent =
    (data.display_name || 'A').charAt(0).toUpperCase();
}
$('avatarFile').onchange = function () {
  const file = this.files[0];
  if (!file) return;

  const reader = new FileReader();

  reader.onload = () => {
    const avatar = $('accountAvatar');
    avatar.innerHTML = '';

    const img = document.createElement('img');
    img.src = reader.result;
    img.style.cssText =
      'width:100%;height:100%;object-fit:cover;border-radius:50%;';

    avatar.appendChild(img);
  };

  reader.readAsDataURL(file);
};

$('editProfile').onclick=()=>$('editDialog').showModal();
$('profileForm').onsubmit=async e=>{e.preventDefault();const {error}=await supabase.from('profiles').update({display_name:$('nameInput').value.trim(),handle:$('handleInput').value.trim().replace(/^@/,''),bio:$('bioInput').value.trim()}).eq('id',user.id);if(error)alert(error.message);else{$('editDialog').close();await loadProfile()}};

$('searchForm').onsubmit=async e=>{e.preventDefault();const q=$('userSearch').value.trim().replace(/^@/,'');if(!q)return;const {data,error}=await supabase.from('profiles').select('id,handle,display_name,bio').ilike('handle',`%${q}%`).neq('id',user.id).limit(20);if(error){alert(error.message);return}const {data:existing}=await supabase.from('yaar_requests').select('to_id').eq('from_id',user.id);const sent=new Set((existing||[]).map(x=>x.to_id));$('searchResults').innerHTML='';(data||[]).forEach(p=>{const card=document.createElement('div');card.className='person-card';card.innerHTML=`<strong>${escapeHtml(p.display_name)}</strong><p>@${escapeHtml(p.handle)} · ${escapeHtml(p.bio||'')}</p><button class="primary" ${sent.has(p.id)?'disabled':''}>${sent.has(p.id)?'Request sent':'Add Yaar'}</button>`;card.querySelector('button').onclick=async()=>{const {error}=await supabase.from('yaar_requests').insert({from_id:user.id,to_id:p.id});if(error)alert(error.message);else{card.querySelector('button').textContent='Request sent';card.querySelector('button').disabled=true}};$('searchResults').append(card)})};
async function loadIncoming(){const {data,error}=await supabase.from('yaar_requests').select('id,from_id,profiles!yaar_requests_from_id_fkey(display_name,handle)').eq('to_id',user.id);$('incoming').innerHTML='';if(error){$('incoming').textContent=error.message;return}if(!data?.length){$('incoming').textContent='No incoming requests.';return}data.forEach(r=>{const c=document.createElement('div');c.className='person-card';c.innerHTML=`<strong>${escapeHtml(r.profiles.display_name)}</strong><p>@${escapeHtml(r.profiles.handle)}</p><button class="primary">Accept</button> <button class="outline">Reject</button>`;c.querySelector('.primary').onclick=()=>answerRequest(r.id,r.from_id,true);c.querySelector('.outline').onclick=()=>answerRequest(r.id,r.from_id,false);$('incoming').append(c)})}
async function answerRequest(id,other,accept){if(accept){const {error}=await supabase.rpc('accept_yaar_request',{request_id:id});if(error){alert(error.message);return}}else{const {error}=await supabase.from('yaar_requests').delete().eq('id',id);if(error)alert(error.message)}await loadIncoming();await loadChats()}

async function loadChats(){const {data,error}=await supabase.from('yaars').select('yaar_id,profiles!yaars_yaar_id_fkey(id,display_name,handle)').eq('user_id',user.id);$('chatList').innerHTML='';if(error){$('chatList').textContent=error.message;return}if(!data?.length){$('chatList').textContent='No Yaar yet. Find people in Discover.';return}data.forEach(row=>{const b=document.createElement('div');b.className='chat-user';b.textContent=row.profiles.display_name+' · @'+row.profiles.handle;b.onclick=()=>openChat(row.profiles);$('chatList').append(b)})}
async function openChat(p){activeYaar=p;$('chatTitle').textContent='Chat with '+p.display_name;await loadMessages()}
async function loadMessages(){if(!activeYaar)return;const {data,error}=await supabase.from('messages').select('*').or(`and(sender_id.eq.${user.id},receiver_id.eq.${activeYaar.id}),and(sender_id.eq.${activeYaar.id},receiver_id.eq.${user.id})`).order('created_at');$('chatBody').innerHTML='';if(error){$('chatBody').textContent=error.message;return}(data||[]).forEach(m=>{const b=document.createElement('div');b.className='bubble'+(m.sender_id===user.id?' mine':'');b.textContent=m.body;$('chatBody').append(b)});$('chatBody').scrollTop=$('chatBody').scrollHeight}
$('sendForm').onsubmit=async e=>{e.preventDefault();const body=$('messageText').value.trim();if(!body||!activeYaar)return;const {error}=await supabase.from('messages').insert({sender_id:user.id,receiver_id:activeYaar.id,body});if(error)alert(error.message);else{$('messageText').value='';await loadMessages()}};
function subscribeMessages(){supabase.channel('apan-messages-'+user.id).on('postgres_changes',{event:'INSERT',schema:'public',table:'messages',filter:`receiver_id=eq.${user.id}`},()=>{if(activeYaar)loadMessages()}).subscribe()}

async function uploadFile(file,folder){const ext=file.name.split('.').pop().toLowerCase();const path=`${user.id}/${folder}/${crypto.randomUUID()}.${ext}`;const {error}=await supabase.storage.from('apan-media').upload(path,file,{upsert:false,contentType:file.type});if(error)throw error;return {path}}
$('memoryForm').onsubmit=async e=>{e.preventDefault();const file=$('memoryFile').files[0];if(!file)return;try{const uploaded=await uploadFile(file,'memories');const {error}=await supabase.from('memories').insert({user_id:user.id,storage_path:uploaded.path,caption:$('memoryCaption').value,song_title:$('memorySong').value||null});if(error)throw error;$('memoryDialog').close();$('memoryForm').reset();await loadMemories()}catch(err){alert(err.message)}};
$('newMemory').onclick=()=>$('memoryDialog').showModal();
async function loadMemories(){const {data,error}=await supabase.from('memories').select('*').eq('user_id',user.id).order('created_at',{ascending:false});$('memories').innerHTML='';if(error){$('memories').textContent=error.message;return}for(const m of (data||[])){const {data:u,error:signError}=await supabase.storage.from('apan-media').createSignedUrl(m.storage_path,3600);if(signError)continue;const card=document.createElement('div');card.className='photo-card';const img=document.createElement('img');img.src=u.signedUrl;img.alt=m.caption||'APAN Memory';const p=document.createElement('p');p.textContent=(m.caption||'')+(m.song_title?' · ♪ '+m.song_title:'');card.append(img,p);$('memories').append(card)}}

$('instantForm').onsubmit=async e=>{e.preventDefault();const file=$('instantFile').files[0],text=$('instantText').value.trim();if(!file&&!text){alert('Add a photo, video or text.');return}try{let path=null;if(file)path=(await uploadFile(file,'instants')).path;const {error}=await supabase.from('instants').insert({user_id:user.id,storage_path:path,text});if(error)throw error;$('instantForm').reset();await loadInstants()}catch(err){alert(err.message)}};
async function loadInstants(){const since=new Date(Date.now()-86400000).toISOString();const {data,error}=await supabase.from('instants').select('*').gte('created_at',since).order('created_at',{ascending:false});$('instantFeed').innerHTML='';$('archive').innerHTML='';if(error){$('instantFeed').textContent=error.message;return}for(const m of (data||[])){const c=document.createElement('div');c.className='person-card';if(m.storage_path){const {data:u}=await supabase.storage.from('apan-media').createSignedUrl(m.storage_path,3600);const media=document.createElement('img');media.src=u.signedUrl;media.className='instant-media';c.append(media)}const p=document.createElement('p');p.textContent=m.text||'';c.append(p);$('instantFeed').append(c)}}

// iTunes Search provides track metadata and short previews where available.
$('findSong').onclick=async()=>{const q=$('memorySong').value.trim();if(!q){alert('Type a song or artist first.');return}const box=$('songResults');box.textContent='Searching…';try{const r=await fetch('https://itunes.apple.com/search?term='+encodeURIComponent(q)+'&entity=song&limit=8');const d=await r.json();box.innerHTML='';(d.results||[]).forEach(track=>{const row=document.createElement('div');row.className='song-option';const img=document.createElement('img');img.src=track.artworkUrl60;const title=document.createElement('span');title.textContent=track.trackName+' — '+track.artistName;const pick=document.createElement('button');pick.textContent='Select';pick.onclick=()=>{$('memorySong').value=track.trackName+' — '+track.artistName;selectedSong=track;let audio=box.querySelector('audio');if(audio)audio.remove();if(track.previewUrl){audio=document.createElement('audio');audio.controls=true;audio.src=track.previewUrl;box.append(audio)}};row.append(img,title,pick);box.append(row)})}catch(e){box.textContent='Music search unavailable. Check your internet connection.'}};

$('nav').onclick=e=>{const b=e.target.closest('button[data-page]');if(!b)return;document.querySelectorAll('nav button').forEach(x=>x.classList.toggle('selected',x===b));document.querySelectorAll('.page').forEach(x=>x.classList.toggle('hidden',x.id!==b.dataset.page))};
start();
