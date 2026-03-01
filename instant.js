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
  async getCurrentUser(){ const cur=localStorage.getItem('sava_current_user_v1')||''; return cur?findUserByName(cur):null; },

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
    const data = await queryOnce({ scores: {} }); const rows = data?.scores || []; const out = {}; for (const g of games) out[g] = [];
    for (const r of rows) { if (!out[r.game]) out[r.game] = []; out[r.game].push({ name:r.name, score:Number(r.score||0), game:r.game }); }
    for (const g of Object.keys(out)) { out[g].sort((a,b)=>b.score-a.score); out[g]=out[g].slice(0,20); }
    return out;
  },

  async fetchUserScores(username) {
    const data = await queryOnce({ scores: {} });
    const rows = (data?.scores || []).filter(r => (r.name||'').toLowerCase() === String(username||'').toLowerCase());
    rows.sort((a,b)=>Number(b.score||0)-Number(a.score||0)); return rows;
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
  }
};

api.ready = Promise.resolve(api);
api.waitReady = async function(timeoutMs=6000){ const start=Date.now(); while(!window.InstantSync && Date.now()-start<timeoutMs){ await new Promise(r=>setTimeout(r,60)); } return window.InstantSync||api; };
api.syncLocalShadow = async function(){ const cur=localStorage.getItem('sava_current_user_v1')||''; if(!cur) return null; const localUsers=JSON.parse(localStorage.getItem('sava_users_v1')||'{}'); const lu=localUsers[cur]||null; const remote=await findUserByName(cur); if(remote&&lu){ await db.transact(db.tx.users[remote.id].update({ displayName:lu.displayName||remote.displayName||cur, avatarUrl:lu.avatarUrl||remote.avatarUrl||'', statusText:lu.statusText||remote.statusText||'', bio:lu.bio||remote.bio||'', favGame:lu.favGame||remote.favGame||'tetris', notes:lu.notes||remote.notes||'', updatedAt:Date.now() })); } return true; };

window.InstantSync = api;