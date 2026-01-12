let audioCtx = null, isPlaying = false, isAutoMode = false, currentPulse = 0, nextNoteTime = 0.0, timerID = null, currentSongIndex = 0, liveBpm = 120;
let sortableInstance = null, isOrderLocked = false, wakeLock = null;

const DEFAULT_DATA = {
    settings: { autoPulses: 8, fontSize: 24, darkMode: false },
    currentPlaylistIndex: 0,
    playlists: [{ id: Date.now(), name: "Ma Setlist", songs: [{ name: "Morceau 1", bpm: 120, metric: 4 }] }]
};

let appData = JSON.parse(localStorage.getItem('metronomeData')) || DEFAULT_DATA;

window.addEventListener('DOMContentLoaded', () => {
    document.getElementById('add-btn').onclick = addItem;
    setupLongPress(document.getElementById('lock-btn'), toggleOrderLock);
    document.getElementById('dark-mode-toggle').onchange = (e) => { appData.settings.darkMode = e.target.checked; applySettings(); saveData(); };
    document.getElementById('font-size-slider').oninput = (e) => {
        appData.settings.fontSize = e.target.value;
        document.getElementById('font-val').innerText = e.target.value;
        if(!document.getElementById('screen-1').classList.contains('hidden')) renderTempoRects();
        saveData();
    };
    document.getElementById('auto-pulses-input').onchange = (e) => {
        appData.settings.autoPulses = parseInt(e.target.value) || 8;
        saveData();
    };

    const initAudio = async () => {
        if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        if (audioCtx.state === 'suspended') await audioCtx.resume();
    };
        window.addEventListener('touchstart', initAudio, {once: true});
        window.addEventListener('click', initAudio, {once: true});

        applySettings();
        showScreen(1);
});

async function requestWakeLock() {
    try { if ('wakeLock' in navigator) { wakeLock = await navigator.wakeLock.request('screen'); } }
    catch (err) { console.log("WakeLock non actif (HTTPS requis)"); }
}

function scheduler() {
    while (nextNoteTime < audioCtx.currentTime + 0.1) {
        if (isAutoMode && currentPulse >= appData.settings.autoPulses) {
            toggleMetronome();
            nextSong(); // Passage au morceau suivant
            return;
        }
        scheduleVisualChange(nextNoteTime, currentPulse % getCurrentSong().metric);
        nextNoteTime += (60.0 / liveBpm);
        currentPulse++;
    }
    if (isPlaying) timerID = setTimeout(scheduler, 25);
}

function scheduleVisualChange(time, index) {
    const osc = audioCtx.createOscillator();
    osc.onended = () => {
        const rects = document.querySelectorAll('.tempo-rect');
        rects.forEach(r => r.classList.remove('active'));
        if (isPlaying && rects[index]) rects[index].classList.add('active');
    };
        osc.start(time); osc.stop(time + 0.001);
}

async function toggleMetronome() {
    if (isPlaying) {
        isPlaying = false; clearTimeout(timerID);
        document.getElementById('start-btn').innerText = "START";
        document.getElementById('start-btn').style.background = "var(--orange)";
        document.querySelectorAll('.tempo-rect').forEach(r => r.classList.remove('active'));
        if(wakeLock) { await wakeLock.release(); wakeLock = null; }
    } else {
        if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        await requestWakeLock();
        isPlaying = true; currentPulse = 0; nextNoteTime = audioCtx.currentTime + 0.05;
        document.getElementById('start-btn').innerText = "STOP";
        document.getElementById('start-btn').style.background = "#ff3b30";
        scheduler();
    }
}

function showScreen(n) {
    document.querySelectorAll('.screen').forEach((s, i) => s.classList.toggle('hidden', i !== n-1));
    document.getElementById('add-btn').classList.toggle('hidden', n !== 2 && n !== 3);
    document.getElementById('lock-btn').classList.toggle('hidden', n !== 2);
    document.getElementById('realtime-controls').classList.toggle('hidden', n !== 1);
    if(n===1) renderTempoRects(); if(n===2) { renderSongs(); initSortable(); } if(n===3) renderPlaylists();
}

function renderTempoRects() {
    const song = getCurrentSong();
    document.getElementById('playlist-badge').innerText = appData.playlists[appData.currentPlaylistIndex].name;
    const container = document.getElementById('tempo-visuals');
    container.innerHTML = '';
    for (let i = 0; i < (song.metric || 4); i++) {
        const r = document.createElement('div');
        r.className = 'tempo-rect';
        container.appendChild(r);
    }
    const nameEl = document.getElementById('current-song-name');
    nameEl.innerText = song.name;
    nameEl.style.fontSize = appData.settings.fontSize + "px";
    setLiveBpm(song.bpm);
}

function renderSongs() {
    const list = document.getElementById('song-list');
    list.innerHTML = '';
    appData.playlists[appData.currentPlaylistIndex].songs.forEach((song, i) => {
        const li = document.createElement('li');
        li.className = 'song-item';
        li.innerHTML = `<span class="handle">☰</span>
        <input type="text" value="${song.name}" onchange="updateSongData(${i}, 'name', this.value)">
        <input type="number" value="${song.bpm}" class="small-input" onchange="updateSongData(${i}, 'bpm', this.value)">
        <input type="number" value="${song.metric}" class="small-input" onchange="updateSongData(${i}, 'metric', this.value)">`;
        setupLongPress(li, () => openSongMenu(i));
        list.appendChild(li);
    });
}

function renderPlaylists() {
    const list = document.getElementById('playlist-list');
    list.innerHTML = '';
    appData.playlists.forEach((pl, i) => {
        const li = document.createElement('li');
        li.className = 'playlist-item';
        li.innerHTML = `<span style="flex:1; font-weight:700">📁 ${pl.name}</span><span style="opacity:0.5">${pl.songs.length} 🎵</span>`;
        li.onclick = () => { appData.currentPlaylistIndex = i; currentSongIndex = 0; saveData(); showScreen(1); };
        setupLongPress(li, () => openPlaylistMenu(i));
        list.appendChild(li);
    });
}

function addItem() {
    if (!document.getElementById('screen-2').classList.contains('hidden')) {
        appData.playlists[appData.currentPlaylistIndex].songs.push({name: "Nouveau", bpm: 120, metric: 4});
        renderSongs();
    } else if (!document.getElementById('screen-3').classList.contains('hidden')) {
        const name = prompt("Nom de la Setlist :");
        if (name) {
            appData.playlists.push({ id: Date.now(), name: name, songs: [{name: "Morceau 1", bpm: 120, metric: 4}] });
            renderPlaylists();
        }
    }
    saveData();
}

function exportData() {
    const blob = new Blob([JSON.stringify(appData)], {type: 'application/json'});
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'tempo_backup.json'; a.click();
}

function importData() {
    const input = document.createElement('input'); input.type = 'file';
    input.onchange = e => {
        const reader = new FileReader();
        reader.onload = () => { appData = JSON.parse(reader.result); saveData(); location.reload(); };
        reader.readAsText(e.target.files[0]);
    };
    input.click();
}

function setupLongPress(el, callback) {
    let timer;
    el.oncontextmenu = (e) => { if (e.pointerType !== 'mouse') e.preventDefault(); };
    const start = (e) => {
        if (e.type === 'mousedown' && e.button !== 0) return;
        timer = setTimeout(() => { if ('vibrate' in navigator) navigator.vibrate(60); callback(); }, 800);
    };
    const cancel = () => clearTimeout(timer);
    el.addEventListener('touchstart', start, { passive: true });
    el.addEventListener('touchend', cancel);
    el.addEventListener('touchmove', cancel);
    el.addEventListener('mousedown', start);
    el.addEventListener('mouseup', cancel);
    el.addEventListener('mouseleave', cancel);
}

function openSongMenu(i) {
    showModal(`Morceau`, [{ text: "SUPPRIMER", class: "big-action-btn btn-danger-flat", action: () => { appData.playlists[appData.currentPlaylistIndex].songs.splice(i, 1); saveData(); renderSongs(); closeModal(); }}]);
}

function openPlaylistMenu(i) {
    showModal(`Playlist`, [
        { text: "RENOMMER", class: "big-action-btn", action: () => { const n = prompt("Nom :", appData.playlists[i].name); if(n) appData.playlists[i].name = n; saveData(); renderPlaylists(); closeModal(); }},
              { text: "SUPPRIMER", class: "big-action-btn btn-danger-flat", action: () => { if(appData.playlists.length > 1) { appData.playlists.splice(i, 1); saveData(); renderPlaylists(); } closeModal(); }}
    ]);
}

function showModal(title, buttons) {
    document.getElementById('modal-title').innerText = title;
    const container = document.getElementById('modal-buttons'); container.innerHTML = '';
    buttons.forEach(b => {
        const btn = document.createElement('button'); btn.innerText = b.text; btn.className = b.class; btn.onclick = b.action;
        container.appendChild(btn);
    });
    document.getElementById('action-modal').classList.remove('hidden');
}

function closeModal() { document.getElementById('action-modal').classList.add('hidden'); }
function setLiveBpm(v) { liveBpm = Math.max(20, Math.min(300, parseInt(v) || 120)); document.getElementById('rt-bpm-input').value = liveBpm; }
function changeTempo(d) { setLiveBpm(parseInt(liveBpm) + d); }
function getCurrentSong() { const pl = appData.playlists[appData.currentPlaylistIndex]; return pl.songs[currentSongIndex] || {name: "-", bpm: 120, metric: 4}; }
function updateSongData(i, k, v) { appData.playlists[appData.currentPlaylistIndex].songs[i][k] = (k==='name'?v:parseInt(v)); saveData(); }
function nextSong() { currentSongIndex = (currentSongIndex + 1) % appData.playlists[appData.currentPlaylistIndex].songs.length; renderTempoRects(); }
function prevSong() { const s = appData.playlists[appData.currentPlaylistIndex].songs; currentSongIndex = (currentSongIndex - 1 + s.length) % s.length; renderTempoRects(); }
function saveData() { localStorage.setItem('metronomeData', JSON.stringify(appData)); }
function applySettings() {
    document.body.className = appData.settings.darkMode ? 'dark-mode' : 'light-mode';
    document.getElementById('dark-mode-toggle').checked = appData.settings.darkMode;
    document.getElementById('font-size-slider').value = appData.settings.fontSize;
    document.getElementById('auto-pulses-input').value = appData.settings.autoPulses;
}
function toggleOrderLock() { isOrderLocked = !isOrderLocked; document.getElementById('lock-btn').innerText = isOrderLocked ? "🔒" : "🔓"; if (sortableInstance) sortableInstance.option("disabled", isOrderLocked); }

function initSortable() {
    if (sortableInstance) sortableInstance.destroy();
    sortableInstance = Sortable.create(document.getElementById('song-list'), {
        handle: '.handle', animation: 150, disabled: isOrderLocked,
        onEnd: () => {
            const newOrder = [];
            document.querySelectorAll('#song-list li').forEach((li) => {
                const name = li.querySelector('input[type="text"]').value;
                const bpm = parseInt(li.querySelectorAll('input[type="number"]')[0].value);
                const metric = parseInt(li.querySelectorAll('input[type="number"]')[1].value);
                newOrder.push({ name, bpm, metric });
            });
            appData.playlists[appData.currentPlaylistIndex].songs = newOrder;
            saveData();
        }
    });
}

function resetApp() { if(confirm("RESET TOUT ?")) { localStorage.clear(); location.reload(); } }
function toggleAutoMode() { isAutoMode = !isAutoMode; document.getElementById('auto-btn').classList.toggle('active', isAutoMode); }
