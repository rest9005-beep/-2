'use strict';

/**
 * SonyaTub (static / GitHub Pages friendly)
 * - Видео видны всем, потому что берутся из /videos/videos.json и файлов в репозитории.
 * - "Загрузка" видео в браузер НЕ делает его доступным другим (GitHub Pages — статический хостинг).
 */

const $ = (sel, root=document) => root.querySelector(sel);
const $$ = (sel, root=document) => Array.from(root.querySelectorAll(sel));

const Utils = (() => {
  const pad2 = (n)=>String(n).padStart(2,'0');
  function fmtTime(secs){
    if(!isFinite(secs)||secs<0) return '0:00';
    const h=Math.floor(secs/3600), m=Math.floor((secs%3600)/60), s=Math.floor(secs%60);
    return h ? `${h}:${pad2(m)}:${pad2(s)}` : `${m}:${pad2(s)}`;
  }
  function fmtViews(n){
    n = Number(n||0);
    if(n>=1e9) return (n/1e9).toFixed(1)+' млрд';
    if(n>=1e6) return (n/1e6).toFixed(1)+' млн';
    if(n>=1e3) return (n/1e3).toFixed(1)+' тыс';
    return String(n);
  }
  function safeText(s){ return String(s ?? '').replace(/[<>]/g, ''); }
  return { fmtTime, fmtViews, safeText };
})();

const Storage = (() => {
  const key = 'sonyatub_state_v1';
  function load(){
    try { return JSON.parse(localStorage.getItem(key) || '{}') || {}; }
    catch { return {}; }
  }
  function save(state){
    localStorage.setItem(key, JSON.stringify(state));
  }
  function get(){
    return {
      likes: {},
      dislikes: {},
      views: {},
      ...load(),
    };
  }
  function set(next){
    save(next);
  }
  return { get, set };
})();

async function loadCatalog(){
  // cache-bust to avoid aggressive caching on GitHub Pages
  const url = `videos/videos.json?v=${Date.now()}`;
  const res = await fetch(url);
  if(!res.ok) throw new Error(`Не удалось загрузить ${url} (HTTP ${res.status})`);
  const data = await res.json();
  if(!Array.isArray(data)) throw new Error('videos.json должен быть массивом');
  // Normalize
  return data.map((v, i) => ({
    id: String(v.id ?? i),
    title: String(v.title ?? 'Без названия'),
    author: String(v.author ?? 'Unknown'),
    src: String(v.src ?? ''),
    poster: String(v.poster ?? ''),
    description: String(v.description ?? ''),
    createdAt: Number(v.createdAt ?? Date.now()),
    views: Number(v.views ?? 0),
  })).filter(v => v.src);
}

function ensureElements(){
  // We try to reuse existing markup from your original page.
  // Fallbacks if some elements are missing:
  if(!$('#videoPlayer')){
    const main = $('#main') || document.body;
    const wrap = document.createElement('div');
    wrap.innerHTML = `
      <div class="playerWrap">
        <video id="videoPlayer" controls playsinline></video>
        <div class="meta">
          <h1 id="videoTitle"></h1>
          <div class="sub" id="videoSub"></div>
          <div class="actions">
            <button id="likeBtn">👍 <span id="likeCount">0</span></button>
            <button id="dislikeBtn">👎 <span id="dislikeCount">0</span></button>
          </div>
          <p id="videoDesc"></p>
        </div>
      </div>
      <div class="sidebar">
        <h2>Видео</h2>
        <div id="videoList" class="list"></div>
      </div>
    `;
    main.prepend(wrap);
  }
  if(!$('#videoList')){
    const list = document.createElement('div');
    list.id='videoList';
    document.body.appendChild(list);
  }
}

function renderList(catalog, activeId){
  const list = $('#videoList');
  if(!list) return;
  list.innerHTML = '';
  for(const v of catalog){
    const card = document.createElement('button');
    card.className = 'videoCard' + (v.id===activeId ? ' active' : '');
    card.type = 'button';
    card.innerHTML = `
      <div class="thumb">
        ${v.poster ? `<img src="${Utils.safeText(v.poster)}" alt="">` : `<div class="thumbPh"></div>`}
      </div>
      <div class="info">
        <div class="t">${Utils.safeText(v.title)}</div>
        <div class="a">${Utils.safeText(v.author)}</div>
      </div>
    `;
    card.addEventListener('click', ()=>openVideo(catalog, v.id));
    list.appendChild(card);
  }
}

function updateMeta(v, state){
  const titleEl = $('#videoTitle');
  const subEl = $('#videoSub');
  const descEl = $('#videoDesc');
  if(titleEl) titleEl.textContent = v.title;
  const totalViews = (state.views?.[v.id] ?? 0) + v.views;
  if(subEl) subEl.textContent = `${Utils.fmtViews(totalViews)} просмотров`;
  if(descEl) descEl.textContent = v.description || '';
}

function updateReactions(v, state){
  const likeCountEl = $('#likeCount');
  const dislikeCountEl = $('#dislikeCount');
  const likeBtn = $('#likeBtn');
  const dislikeBtn = $('#dislikeBtn');

  const liked = !!state.likes?.[v.id];
  const disliked = !!state.dislikes?.[v.id];

  if(likeBtn) likeBtn.classList.toggle('on', liked);
  if(dislikeBtn) dislikeBtn.classList.toggle('on', disliked);

  // counts are local-per-browser (static hosting)
  const likeCount = liked ? 1 : 0;
  const dislikeCount = disliked ? 1 : 0;

  if(likeCountEl) likeCountEl.textContent = String(likeCount);
  if(dislikeCountEl) dislikeCountEl.textContent = String(dislikeCount);
}

function bindReactions(v, catalog){
  const likeBtn = $('#likeBtn');
  const dislikeBtn = $('#dislikeBtn');
  if(likeBtn){
    likeBtn.onclick = () => {
      const st = Storage.get();
      st.likes[v.id] = !st.likes[v.id];
      if(st.likes[v.id]) st.dislikes[v.id] = false;
      Storage.set(st);
      updateReactions(v, st);
      updateMeta(v, st);
    };
  }
  if(dislikeBtn){
    dislikeBtn.onclick = () => {
      const st = Storage.get();
      st.dislikes[v.id] = !st.dislikes[v.id];
      if(st.dislikes[v.id]) st.likes[v.id] = false;
      Storage.set(st);
      updateReactions(v, st);
      updateMeta(v, st);
    };
  }
}

function openVideo(catalog, id){
  const v = catalog.find(x=>x.id===id) || catalog[0];
  if(!v) return;

  const player = $('#videoPlayer');
  if(player){
    player.src = v.src;
    if(v.poster) player.poster = v.poster;
  }

  const st = Storage.get();
  st.views[v.id] = (st.views?.[v.id] ?? 0) + 1;
  Storage.set(st);

  updateMeta(v, st);
  updateReactions(v, st);
  bindReactions(v, catalog);
  renderList(catalog, v.id);

  // Update URL hash (so you can share link)
  try { history.replaceState(null,'',`#v=${encodeURIComponent(v.id)}`); } catch {}
}

function pickFromHash(catalog){
  const m = location.hash.match(/v=([^&]+)/);
  if(!m) return catalog[0]?.id;
  const id = decodeURIComponent(m[1]);
  return catalog.some(v=>v.id===id) ? id : catalog[0]?.id;
}

function showError(err){
  const box = document.createElement('div');
  box.style.padding = '16px';
  box.style.maxWidth = '860px';
  box.style.margin = '24px auto';
  box.style.border = '1px solid rgba(255,255,255,.14)';
  box.style.borderRadius = '14px';
  box.innerHTML = `
    <h2 style="margin:0 0 10px 0;">Не вижу видео 😕</h2>
    <div style="opacity:.85; line-height:1.45;">
      <p style="margin:0 0 10px 0;"><b>Причина:</b> GitHub Pages — статический хостинг. Чтобы другие видели видео, файл <b>должен быть в репозитории</b>, а список — в <code>videos/videos.json</code>.</p>
      <p style="margin:0 0 10px 0;"><b>Что делать:</b></p>
      <ol style="margin:0 0 10px 18px;">
        <li>Залей видеофайл в репозиторий (например <code>videos/myvideo.mp4</code>).</li>
        <li>Открой <code>videos/videos.json</code> и добавь запись с <code>"src": "videos/myvideo.mp4"</code>.</li>
        <li>Подожди 1–2 минуты и обнови страницу.</li>
      </ol>
      <p style="margin:0;"><b>Техническая ошибка:</b> ${Utils.safeText(err?.message || err)}</p>
    </div>
  `;
  document.body.prepend(box);
}

async function main(){
  ensureElements();
  try{
    const catalog = await loadCatalog();
    const id = pickFromHash(catalog);
    renderList(catalog, id);
    openVideo(catalog, id);
  }catch(err){
    console.error(err);
    showError(err);
  }
}

document.addEventListener('DOMContentLoaded', main);
