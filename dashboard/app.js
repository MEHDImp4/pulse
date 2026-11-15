"use strict";

const $ = (id) => document.getElementById(id);
const state = { csrf: "", guildId: "", guilds: [], player: null, busy: false };
let toastTimer;
const notice = (message) => {
  $("notice").textContent = message;
  $("notice").classList.add("visible");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => $("notice").classList.remove("visible"), 3500);
};

async function api(path, options = {}) {
  const response = await fetch(path, {
    credentials: "same-origin",
    cache: "no-store",
    ...options,
    headers: {
      ...(options.body ? { "Content-Type": "application/json", "x-csrf-token": state.csrf } : {}),
      ...(options.headers || {}),
    },
  });
  let body;
  try { body = await response.json(); } catch { body = {}; }
  if (!response.ok) throw new Error(body.error || `HTTP ${response.status}`);
  return body;
}

function formatTime(seconds) {
  const n = Math.max(0, Math.floor(Number(seconds) || 0));
  return `${Math.floor(n / 60)}:${String(n % 60).padStart(2, "0")}`;
}

function setConnected(connected) {
  for (const element of document.querySelectorAll("[data-action],#volume,#song-query,#add-song button,#party-toggle,#party-limit")) {
    element.disabled = !connected;
  }
}

function renderQueue(queue) {
  const list = $("queue-items");
  list.replaceChildren();
  $("queue-count").textContent = `${queue.length} titres`;
  $("queue-total").textContent = `${queue.length} titre${queue.length > 1 ? "s" : ""}`;
  if (!queue.length) {
    const li = document.createElement("li");
    li.className = "empty";
    li.textContent = "La file d’attente est vide. Ajoute un titre pour commencer.";
    list.append(li);
    return;
  }
  queue.forEach((track, index) => {
    const li = document.createElement("li");
    li.className = "queue-item";
    li.draggable = !state.player?.partyMode;
    li.dataset.position = String(index);
    const num = document.createElement("span"); num.className = "queue-num"; num.textContent = String(index + 1).padStart(2, "0");
    const icon = document.createElement("span"); icon.className = "queue-icon"; icon.textContent = "♫";
    const detail = document.createElement("div"); detail.className = "queue-details";
    const title = document.createElement("strong"); title.textContent = track.title;
    const artist = document.createElement("small"); artist.textContent = `${track.author || "YouTube"} · Ajouté par ${track.requester || "inconnu"}`;
    detail.append(title, artist);
    const remove = document.createElement("button"); remove.type = "button"; remove.className = "queue-remove"; remove.textContent = "×";
    remove.title = "Retirer cette musique";
    remove.setAttribute("aria-label", `Retirer ${track.title}`);
    remove.addEventListener("click", () => sendAction("remove", { value: index }));
    li.addEventListener("dragstart", (event) => {
      li.classList.add("dragging");
      event.dataTransfer.setData("text/plain", String(index));
      event.dataTransfer.effectAllowed = "move";
    });
    li.addEventListener("dragend", () => li.classList.remove("dragging"));
    li.addEventListener("dragover", (event) => { if (!state.player?.partyMode) event.preventDefault(); });
    li.addEventListener("drop", (event) => {
      event.preventDefault();
      if (state.player?.partyMode) return;
      const from = Number(event.dataTransfer.getData("text/plain"));
      if (Number.isInteger(from) && from !== index) sendAction("move", { value: from, target: index });
    });
    li.append(num, icon, detail, remove);
    list.append(li);
  });
}

function renderTopList(id, entries, nameKey) {
  const list = $(id);
  list.replaceChildren();
  if (!entries.length) {
    const empty = document.createElement("li");
    empty.className = "empty";
    empty.textContent = "Les premières écoutes apparaîtront ici.";
    list.append(empty);
    return;
  }
  entries.forEach((entry, index) => {
    const li = document.createElement("li"); li.className = "top-item";
    const number = document.createElement("span"); number.className = "top-number"; number.textContent = String(index + 1);
    const name = document.createElement("span"); name.className = "top-name"; name.textContent = entry[nameKey];
    const plays = document.createElement("strong"); plays.textContent = `${entry.plays} écoutes`;
    li.append(number, name, plays);
    list.append(li);
  });
}

function renderStatus(data) {
  const p = data.player;
  state.player = p;
  $("uptime").textContent = `Pulse v2 · Disponibilité : ${formatTime(data.uptimeSeconds)}`;
  $("total-plays").textContent = String(data.listening?.totalPlays ?? 0);
  renderTopList("top-songs", data.listening?.topSongs ?? [], "title");
  renderTopList("top-artists", data.listening?.topArtists ?? [], "artist");
  setConnected(!!p);
  if (!p) {
    $("state").textContent = "Déconnecté";
    $("state-caption").textContent = "Aucun salon vocal actif";
    $("play-pill").textContent = "HORS LIGNE";
    $("play-pill").classList.remove("playing");
    $("song-title").textContent = "Aucune musique en cours";
    $("song-artist").textContent = "Lance /play dans Discord pour commencer";
    $("volume-stat").textContent = "—";
    $("duration").textContent = "--:--";
    $("party-state").textContent = "Aucun salon vocal connecté";
    $("party-toggle").textContent = "Activer";
    $("party-limit").value = "3";
    for (const id of ["cache-ready", "cache-downloads", "latency-avg", "latency-p95", "crossfade-count", "recoveries-count"]) {
      $(id).textContent = "—";
    }
    $("cache-pill").textContent = "CACHE INACTIF";
    renderQueue([]);
    return;
  }
  $("state").textContent = p.state === "PLAYING" ? "En lecture" : p.state === "PAUSED" ? "En pause" : p.state;
  $("state-caption").textContent = `Salon vocal · ${p.channelId}`;
  $("play-pill").textContent = p.state === "PLAYING" ? "● EN DIRECT" : "PAUSE / ATTENTE";
  $("play-pill").classList.toggle("playing", p.state === "PLAYING");
  $("song-title").textContent = p.current?.title || "En attente d’un morceau";
  $("song-artist").textContent = p.current?.author || "Pulse Music";
  $("duration").textContent = p.current?.duration ? formatTime(p.current.duration) : "--:--";
  $("play-toggle").dataset.action = p.state === "PAUSED" ? "resume" : "pause";
  $("play-toggle").textContent = p.state === "PAUSED" ? "▶" : "⏸";
  $("volume").value = p.volume;
  $("volume-label").textContent = `${p.volume}%`;
  $("volume-stat").textContent = `${p.volume}%`;
  $("mode").textContent = `Boucle : ${p.loopMode || "off"}`;
  $("filter").textContent = `Filtre : ${p.filter || "off"}`;
  $("party-state").textContent = p.partyMode
    ? "Actif · file équitable automatiquement"
    : "Désactivé · demandes libres";
  $("party-toggle").textContent = p.partyMode ? "Désactiver" : "Activer";
  $("party-limit").value = String(p.partyMaxPerUser ?? 3);
  const cache = p.cache;
  $("cache-ready").textContent = cache ? `${cache.ready} / ${cache.queued}` : "—";
  $("cache-downloads").textContent = cache ? String(cache.downloading) : "—";
  $("cache-pill").textContent = cache
    ? `${cache.pending} à préparer · ${cache.failed} échec(s)` : "CACHE INACTIF";
  const diag = p.diagnostics;
  $("latency-avg").textContent = diag?.transitions ? `${diag.avgTransitionMs} ms` : "—";
  $("latency-p95").textContent = diag?.transitions ? `${diag.p95TransitionMs} ms` : "—";
  $("crossfade-count").textContent = String(diag?.crossfadesStarted ?? 0);
  $("recoveries-count").textContent = String(diag?.stallRecoveries ?? 0);
  document.querySelector(".queue-meta span").textContent = p.partyMode
    ? "MODE SOIRÉE · ORDRE AUTOMATIQUE" : "GLISSE POUR RÉORGANISER";
  renderQueue(p.queue || []);
}

async function loadGuild() {
  if (!state.guildId || state.busy) return;
  try {
    const guildId = state.guildId;
    const data = await api(`/api/guilds/${guildId}`);
    if (state.guildId !== guildId) return; // avoid stale cross-guild refreshes
    renderStatus(data);
  } catch (error) { notice(error.message); }
}

function drawGuilds() {
  const node = $("guilds");
  node.replaceChildren();
  $("guild-count").textContent = String(state.guilds.length);
  if (!state.guilds.length) {
    const div = document.createElement("div");
    div.className = "muted";
    div.textContent = "Aucun serveur gérable avec Pulse.";
    node.append(div);
    return;
  }
  state.guilds.forEach((guild) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `guild-link${guild.id === state.guildId ? " selected" : ""}`;
    const letter = document.createElement("span"); letter.className = "guild-initial"; letter.textContent = guild.name[0]?.toUpperCase() || "S";
    const name = document.createElement("span"); name.className = "guild-name"; name.textContent = guild.name;
    button.append(letter, name);
    button.addEventListener("click", () => {
      state.guildId = guild.id;
      $("current-server").textContent = guild.name;
      drawGuilds();
      void loadGuild();
    });
    node.append(button);
  });
}

async function sendAction(action, params = {}) {
  if (!state.guildId || state.busy) return;
  state.busy = true;
  try {
    await api(`/api/guilds/${state.guildId}/action`, {
      method: "POST",
      body: JSON.stringify({ action, ...params }),
    });
    notice("Commande envoyée avec succès");
  } catch (error) {
    notice(error.message);
  } finally {
    state.busy = false;
    await loadGuild();
  }
}

async function start() {
  try {
    const me = await api("/api/me");
    state.csrf = me.csrf;
    $("username").textContent = me.username;
    $("gate").hidden = true;
    $("workspace").hidden = false;
    $("logout").hidden = false;
    state.guilds = await api("/api/guilds");
    if (state.guilds.length) {
      state.guildId = state.guilds[0].id;
      $("current-server").textContent = state.guilds[0].name;
    }
    drawGuilds();
    await loadGuild();
  } catch (error) {
    $("gate").hidden = false;
    $("workspace").hidden = true;
    if (error.message !== "Connexion requise") notice(error.message);
  }
}
$("party-toggle").addEventListener("click", () => {
  if (!state.player) return;
  void sendAction("party", {
    value: state.player.partyMode ? 0 : 1,
    target: Number($("party-limit").value),
  });
});
$("party-limit").addEventListener("change", () => {
  if (state.player?.partyMode) {
    void sendAction("party", { value: 1, target: Number($("party-limit").value) });
  }
});
for (const button of document.querySelectorAll("[data-action]")) {
  button.addEventListener("click", () => sendAction(button.dataset.action));
}
$("refresh").addEventListener("click", () => loadGuild());
$("volume").addEventListener("input", (event) => { $("volume-label").textContent = `${event.target.value}%`; });
$("volume").addEventListener("change", (event) => sendAction("volume", { value: Number(event.target.value) }));
$("add-song").addEventListener("submit", async (event) => {
  event.preventDefault();
  const query = $("song-query").value.trim();
  if (!query) return;
  await sendAction("add", { query });
  $("song-query").value = "";
});
$("logout").addEventListener("click", async () => {
  try {
    await api("/logout", { method: "POST", body: "{}" });
    window.location.assign("/");
  } catch (error) { notice(error.message); }
});
void start();
setInterval(() => { if (state.guildId && document.visibilityState === "visible") void loadGuild(); }, 5000);
