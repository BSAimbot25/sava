import { init, i, id } from 'https://esm.sh/@instantdb/core';

const APP_ID = '55e9290c-92d5-4014-9061-7723025e462c';
const schema = i.schema({
  entities: {
    users: i.entity({
      username: i.string(),
      password: i.string(),
      role: i.string(),
      displayName: i.string(),
      bio: i.string(),
      favGame: i.string(),
      notes: i.string(),
      createdAt: i.date(),
      updatedAt: i.date(),
    }),
    scores: i.entity({
      game: i.string(),
      name: i.string(),
      score: i.number(),
      createdAt: i.date(),
    }),
  },
});

const db = init({ appId: APP_ID, schema });

function queryOnce(q, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    let done = false;
    const t = setTimeout(() => {
      if (done) return;
      done = true;
      try { unsub?.(); } catch {}
      reject(new Error('Instant query timeout'));
    }, timeoutMs);

    const unsub = db.subscribeQuery(q, (resp) => {
      if (done) return;
      if (resp?.error) {
        done = true;
        clearTimeout(t);
        try { unsub?.(); } catch {}
        reject(resp.error);
        return;
      }
      if (resp?.data) {
        done = true;
        clearTimeout(t);
        try { unsub?.(); } catch {}
        resolve(resp.data);
      }
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
  async userExists(username){
    const u = await findUserByName(String(username||'').trim());
    return !!u;
  },

  async register(username, password) {
    const n = String(username || '').trim();
    const p = String(password || '');
    if (!n || !p) throw new Error('Missing username/password');

    const existing = await findUserByName(n);
    if (existing) throw new Error('Username already exists');

    const role = n === 'PapaSava' ? 'Master Sava' : 'Silkin Slave';
    const uid = id();
    await db.transact(db.tx.users[uid].update({
      username: n,
      password: p,
      role,
      displayName: n,
      bio: '',
      favGame: 'tetris',
      notes: '',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }));
    const u = { id: uid, username: n, role, displayName: n, bio: '', favGame: 'tetris', notes: '' };
    localStorage.setItem('sava_current_user_v1', u.username);
    localStorage.setItem('sava_last_user_v1', u.username);
    return u;
  },

  async login(username, password) {
    const n = String(username || '').trim();
    const p = String(password || '');
    if (!n || !p) throw new Error('Missing username/password');
    const u = await findUserByName(n);
    if (!u) throw new Error('User not found');
    if ((u.password || '') !== p) throw new Error('Invalid password');
    if (u.username === 'PapaSava' && u.role !== 'Master Sava') {
      await db.transact(db.tx.users[u.id].update({ role: 'Master Sava', updatedAt: Date.now() }));
      u.role = 'Master Sava';
    }
    localStorage.setItem('sava_current_user_v1', u.username);
    localStorage.setItem('sava_last_user_v1', u.username);
    return u;
  },

  async createOrLogin(username, password) { return this.login(username,password).catch(()=>this.register(username,password)); },

  async getCurrentUser() {
    const cur = localStorage.getItem('sava_current_user_v1') || '';
    if (!cur) return null;
    return findUserByName(cur);
  },

  async saveProfile(username, patch) {
    const u = await findUserByName(username);
    if (!u) throw new Error('User not found');
    const role = username === 'PapaSava' ? 'Master Sava' : 'Silkin Slave';
    await db.transact(db.tx.users[u.id].update({ ...patch, role, updatedAt: Date.now() }));
    return true;
  },

  async submitScore(game, name, score) {
    const s = Number(score || 0);
    if (!Number.isFinite(s)) return false;
    await db.transact(db.tx.scores[id()].update({ game, name, score: s, createdAt: Date.now() }));
    return true;
  },

  async fetchBoards(games = ['tetris','dodge','snake','pong','clicker','memory','snus']) {
    const data = await queryOnce({ scores: {} });
    const rows = data?.scores || [];
    const out = {};
    for (const g of games) out[g] = [];
    for (const r of rows) {
      if (!out[r.game]) out[r.game] = [];
      out[r.game].push({ name: r.name, score: Number(r.score || 0), game: r.game });
    }
    for (const g of Object.keys(out)) {
      out[g].sort((a,b)=>b.score-a.score);
      out[g] = out[g].slice(0, 20);
    }
    return out;
  },

  async fetchUserScores(username) {
    const data = await queryOnce({ scores: {} });
    const rows = (data?.scores || []).filter(r => (r.name||'').toLowerCase() === String(username||'').toLowerCase());
    rows.sort((a,b)=>Number(b.score||0)-Number(a.score||0));
    return rows;
  },

  async fetchUserProfile(username){
    return findUserByName(String(username||'').trim());
  }
};

window.InstantSync = api;