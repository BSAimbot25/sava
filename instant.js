import { init, i, id } from 'https://esm.sh/@instantdb/core';

const APP_ID = '55e9290c-92d5-4014-9061-7723025e462c';
const schema = i.schema({
  entities: {
    users: i.entity({
      username: i.string(), password: i.string(), role: i.string(),
      displayName: i.string(), avatarUrl: i.string(), statusText: i.string(),
      bio: i.string(), favGame: i.string(), notes: i.string(),
      createdAt: i.date(), updatedAt: i.date(),
    }),
    scores: i.entity({ game: i.string(), name: i.string(), score: i.number(), createdAt: i.date() }),
    follows: i.entity({ follower: i.string(), target: i.string(), createdAt: i.date() }),
    comments: i.entity({ profile: i.string(), author: i.string(), text: i.string(), createdAt: i.date() }),
    progress: i.entity({ owner: i.string(), scope: i.string(), data: i.string(), updatedAt: i.date() }),
    messages: i.entity({ from: i.string(), to: i.string(), text: i.string(), createdAt: i.date(), read: i.boolean() }),
  },
});

const db = init({ appId: APP_ID, schema });

function queryOnce(q, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    let done = false;
    const t = setTimeout(() => { if (done) return; done = true; try { unsub?.(); } catch {} reject(new Error('Instant query timeout')); }, timeoutMs);
    const unsub = db.subscribeQuery(q, (resp) => {
      if (done) return;
      if (resp?.error) { done = true; clearTimeout(t); try { unsub?.(); } catch {} reject(resp.error); return; }
      if (resp?.data) { done = true; clearTimeout(t); try { unsub?.(); } catch {} resolve(resp.data); }
    });
  });
}

async function findUserByName(username) {
  const data = await queryOnce({ users: {} });
  const list = data?.users || [];
  return list.find((u) => (u.username || '').toLowerCase() === (username || '').toLowerCase()) || null;
}

const api = {
  db,
  appId: APP_ID,

  async userExists(username){ return !!(await findUserByName(String(username||'').trim())); },

  async register(username, password) {
    const n = String(username || '').trim(); const p = String(password || '');
    if (!n || !p) throw new Error('Missing username/password');
    const existing = await findUserByName(n); if (existing) throw new Error('Username already exists');
    const role = n === 'PapaSava' ? 'Master Sava' : 'Silkin Slave'; const uid = id();
    await db.transact(db.tx.users[uid].update({ username:n, password:p, role, displayName:n, avatarUrl:'', statusText:'', bio:'', favGame:'tetris', notes:'', createdAt:Date.now(), updatedAt:Date.now() }));
    localStorage.setItem('sava_current_user_v1', n); localStorage.setItem('sava_last_user_v1', n);
    return { id: uid, username:n, role, displayName:n, bio:'', favGame:'tetris', notes:'' };
  },

  async login(username, password) {
    const n = String(username || '').trim(); const p = String(password || '');
    if (!n || !p) throw new Error('Missing username/password');
    const u = await findUserByName(n); if (!u) throw new Error('User not found'); if ((u.password || '') !== p) throw new Error('Invalid password');
    if (u.username === 'PapaSava' && u.role !== 'Master Sava') await db.transact(db.tx.users[u.id].update({ role:'Master Sava', updatedAt:Date.now() }));
    localStorage.setItem('sava_current_user_v1', u.username); localStorage.setItem('sava_last_user_v1', u.username);
    return u;
  },

  async createOrLogin(username,password){ return this.login(username,password).catch(()=>this.register(username,password)); },
  async getCurrentUser(){
    const cur=localStorage.getItem('sava_current_user_v1')||'';
    if(cur){
      const u = await findUserByName(cur);
      if(u) return u;
    }
    const last = localStorage.getItem('sava_last_user_v1')||'';
    if(last){
      const u = await findUserByName(last);
      if(u){ localStorage.setItem('sava_current_user_v1',u.username); return u; }
    }
    return null;
  },

  async saveProfile(username, patch) {
    const u = await findUserByName(username); if (!u) throw new Error('User not found');
    const role = username === 'PapaSava' ? 'Master Sava' : 'Silkin Slave';
    await db.transact(db.tx.users[u.id].update({ ...patch, role, updatedAt: Date.now() })); return true;
  },

  async submitScore(game, name, score) {
    const s = Number(score || 0); if (!Number.isFinite(s)) return false;
    await db.transact(db.tx.scores[id()].update({ game, name, score: s, createdAt: Date.now() })); return true;
  },

  async fetchBoards(games = ['tetris','dodge','snake','pong','clicker','memory','snus']) {
    const data = await queryOnce({ scores: {} });
    const rows = data?.scores || [];
    const out = {};
    const SNUS_RESET_AT = 1772469840000; // 2026-03-02 reset window
    for (const g of games) out[g] = [];

    for (const g of games) {
      const byName = new Map();
      for (const r of rows) {
        if (String(r.game||'') !== g) continue;
        if (g==='snus' && Number(r.createdAt||0) < SNUS_RESET_AT) continue;
        const name = String(r.name || 'Player');
        const key = name.toLowerCase();
        const sc = Number(r.score || 0);
        const prev = byName.get(key);
        if (!prev || sc > prev.score) byName.set(key, { name, score: sc, game: g });
      }
      out[g] = Array.from(byName.values()).sort((a,b)=>b.score-a.score).slice(0,20);
    }
    return out;
  },

  async fetchUserScores(username) {
    const data = await queryOnce({ scores: {} });
    const rows = (data?.scores || []).filter(r => (r.name||'').toLowerCase() === String(username||'').toLowerCase());
    rows.sort((a,b)=>Number(b.score||0)-Number(a.score||0)); return rows;
  },

  async fetchGameScores(game){
    const data = await queryOnce({ scores: {} });
    const SNUS_RESET_AT = 1772469840000;
    const rows = (data?.scores || []).filter(r => String(r.game||'')===String(game||'')).filter(r => !(String(game||'')==='snus' && Number(r.createdAt||0) < SNUS_RESET_AT));
    const byName = new Map();
    for (const r of rows) {
      const name = String(r.name || 'Player');
      const key = name.toLowerCase();
      const sc = Number(r.score || 0);
      const prev = byName.get(key);
      if (!prev || sc > prev.score) byName.set(key, { name, score: sc, game: String(game||'') });
    }
    return Array.from(byName.values()).sort((a,b)=>b.score-a.score);
  },

  async fetchUserProfile(username){ return findUserByName(String(username||'').trim()); },

  async follow(target){
    const me = localStorage.getItem('sava_current_user_v1') || ''; if(!me || !target || me.toLowerCase()===target.toLowerCase()) return false;
    const d = await queryOnce({ follows:{} });
    const exists = (d?.follows||[]).find(f=>f.follower?.toLowerCase()===me.toLowerCase() && f.target?.toLowerCase()===target.toLowerCase());
    if(exists) return true;
    await db.transact(db.tx.follows[id()].update({ follower: me, target, createdAt: Date.now() })); return true;
  },

  async unfollow(target){
    const me = localStorage.getItem('sava_current_user_v1') || ''; if(!me || !target) return false;
    const d = await queryOnce({ follows:{} });
    const list = (d?.follows||[]).filter(f=>f.follower?.toLowerCase()===me.toLowerCase() && f.target?.toLowerCase()===target.toLowerCase());
    if(!list.length) return true;
    await db.transact(list.map(f=>db.tx.follows[f.id].delete())); return true;
  },

  async isFollowing(target){
    const me = localStorage.getItem('sava_current_user_v1') || ''; if(!me || !target) return false;
    const d = await queryOnce({ follows:{} });
    return !!(d?.follows||[]).find(f=>f.follower?.toLowerCase()===me.toLowerCase() && f.target?.toLowerCase()===target.toLowerCase());
  },

  async followStats(target){
    const d = await queryOnce({ follows:{} });
    const all=d?.follows||[];
    return { followers: all.filter(f=>f.target?.toLowerCase()===String(target).toLowerCase()).length, following: all.filter(f=>f.follower?.toLowerCase()===String(target).toLowerCase()).length };
  },

  async addComment(profile, text){
    const author = localStorage.getItem('sava_current_user_v1') || 'Player';
    const t=String(text||'').trim().slice(0,220); if(!profile||!t) return false;
    await db.transact(db.tx.comments[id()].update({ profile, author, text:t, createdAt: Date.now() })); return true;
  },

  async fetchComments(profile){
    const d = await queryOnce({ comments:{} });
    return (d?.comments||[]).filter(c=>c.profile?.toLowerCase()===String(profile).toLowerCase()).sort((a,b)=>Number(b.createdAt||0)-Number(a.createdAt||0)).slice(0,40);
  },

  async cloudStatus(){
    try{ await queryOnce({ users:{} }, 3500); return { ok:true, text:'Connected' }; }
    catch{ return { ok:false, text:'Offline / retrying' }; }
  },

  async saveProgress(scope, dataObj){
    const owner = localStorage.getItem('sava_current_user_v1') || localStorage.getItem('sava_last_user_v1') || 'Player';
    const d = await queryOnce({ progress:{} });
    const row = (d?.progress||[]).find(p=>String(p.owner||'').toLowerCase()===owner.toLowerCase() && p.scope===scope);
    const payload = JSON.stringify(dataObj||{});
    if(row){
      await db.transact(db.tx.progress[row.id].update({ data: payload, updatedAt: Date.now() }));
    }else{
      await db.transact(db.tx.progress[id()].update({ owner, scope, data: payload, updatedAt: Date.now() }));
    }
    return true;
  },

  async loadProgress(scope){
    const owner = localStorage.getItem('sava_current_user_v1') || localStorage.getItem('sava_last_user_v1') || 'Player';
    const d = await queryOnce({ progress:{} });
    const row = (d?.progress||[]).find(p=>String(p.owner||'').toLowerCase()===owner.toLowerCase() && p.scope===scope);
    if(!row?.data) return null;
    try{return JSON.parse(row.data);}catch{return null;}
  },

  async sendMessage(to, text){
    const from = localStorage.getItem('sava_current_user_v1') || localStorage.getItem('sava_last_user_v1') || 'Player';
    const t = String(text||'').trim().slice(0,1000);
    if(!to || !t) return false;
    await db.transact(db.tx.messages[id()].update({ from, to, text:t, createdAt:Date.now(), read:false }));
    return true;
  },

  async fetchConversations(){
    const me = localStorage.getItem('sava_current_user_v1') || localStorage.getItem('sava_last_user_v1') || 'Player';
    const d = await queryOnce({ messages:{} });
    const msgs=(d?.messages||[]).filter(m=>String(m.from||'').toLowerCase()===me.toLowerCase()||String(m.to||'').toLowerCase()===me.toLowerCase());
    const map=new Map();
    for(const m of msgs){
      const other = String(m.from||'').toLowerCase()===me.toLowerCase()?m.to:m.from;
      const prev=map.get(other);
      if(!prev || Number(m.createdAt||0)>Number(prev.createdAt||0)) map.set(other,m);
    }
    return Array.from(map.entries()).map(([other,m])=>({other,lastText:m.text,lastAt:m.createdAt,unread: String(m.to||'').toLowerCase()===me.toLowerCase() && !m.read})).sort((a,b)=>Number(b.lastAt||0)-Number(a.lastAt||0));
  },

  async fetchMessages(withUser){
    const me = localStorage.getItem('sava_current_user_v1') || localStorage.getItem('sava_last_user_v1') || 'Player';
    const d = await queryOnce({ messages:{} });
    const msgs=(d?.messages||[]).filter(m=>{
      const a=String(m.from||'').toLowerCase(), b=String(m.to||'').toLowerCase(), w=String(withUser||'').toLowerCase(), meL=me.toLowerCase();
      return (a===meL&&b===w)||(a===w&&b===meL);
    }).sort((a,b)=>Number(a.createdAt||0)-Number(b.createdAt||0));
    return msgs.slice(-200);
  }
};

api.ready = Promise.resolve(api);
api.waitReady = async function(timeoutMs=6000){ const start=Date.now(); while(!window.InstantSync && Date.now()-start<timeoutMs){ await new Promise(r=>setTimeout(r,60)); } return window.InstantSync||api; };
api.syncLocalShadow = async function(){ const cur=localStorage.getItem('sava_current_user_v1')||''; if(!cur) return null; const localUsers=JSON.parse(localStorage.getItem('sava_users_v1')||'{}'); const lu=localUsers[cur]||null; const remote=await findUserByName(cur); if(remote&&lu){ await db.transact(db.tx.users[remote.id].update({ displayName:lu.displayName||remote.displayName||cur, avatarUrl:lu.avatarUrl||remote.avatarUrl||'', statusText:lu.statusText||remote.statusText||'', bio:lu.bio||remote.bio||'', favGame:lu.favGame||remote.favGame||'tetris', notes:lu.notes||remote.notes||'', updatedAt:Date.now() })); } return true; };

window.InstantSync = api;