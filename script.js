/* -------------------------------------------------------------
 * 1. SUPABASE CLIENT
 * ----------------------------------------------------------- */
const SUPABASE_URL = "https://frhgflemlbpqmiurxdfg.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_WIzwdAuxc-xLSp_6y9J_ug_72aCSR6t";
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let teams = [];
let rounds = [];
let isAdmin = false;

// Ping-pong continuous scroll state
let scrollAnimationId = null;
let isScrollLoopActive = false;
let scrollDirection = 'down'; // 'down' or 'up'
let isPausing = false;
const SCROLL_SPEED = 0.75; // Pixels per frame (lower = slower, butter-smooth)

const $ = (id) => document.getElementById(id);

/* -------------------------------------------------------------
 * 2. SANITIZATION, METRICS & EXPRESSION PARSER
 * ----------------------------------------------------------- */
function esc(str) {
  return String(str ?? "").replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

function total(team) {
  return rounds.reduce((sum, r) => sum + (Number(team.scores?.[r.id]) || 0), 0);
}

function notify(id, text, isOk = true) {
  const el = $(id);
  el.textContent = text;
  el.className = `alert-box ${isOk ? 'alert-success' : 'alert-danger'}`;
  el.hidden = false;
  setTimeout(() => { el.hidden = true; }, 4000);
}

// Evaluates formulas, decimals, and relative modifiers (+, -, *, /)
function parseScoreMath(expr, baseValue = 0) {
  let val = String(expr ?? "").trim();
  if (!val) return 0;

  // Handles relative modifiers like "+10", "-5", "*2", "/2"
  if (/^[+\-*/]/.test(val)) {
    val = `${baseValue}${val}`;
  }

  // Safe arithmetic check: strictly numbers, basic operators, and parens
  if (!/^[0-9+\-*/().\s]+$/.test(val)) {
    return baseValue;
  }

  try {
    const result = Function(`'use strict'; return (${val})`)();
    return Number.isFinite(result) ? Math.round(result * 100) / 100 : baseValue;
  } catch {
    return baseValue;
  }
}

/* -------------------------------------------------------------
 * 3. PUBLIC REAL-TIME RENDERING
 * ----------------------------------------------------------- */
function renderPublic() {
  $('team-counter').textContent = `${teams.length} ${teams.length === 1 ? 'Team' : 'Teams'}`;
  
  // Sort descending by total score, secondary sort alphabetical
  const sorted = [...teams].sort((a, b) => {
    const diff = total(b) - total(a);
    return diff !== 0 ? diff : a.name.localeCompare(b.name);
  });

  // Overall Standings Table
  $('leaderboard-body').innerHTML = sorted.length ? sorted.map((team, idx) => {
    const rank = idx + 1;
    const rankClass = rank === 1 ? 'rank-1' : rank === 2 ? 'rank-2' : rank === 3 ? 'rank-3' : '';
    return `
      <tr>
        <td><span class="rank-badge ${rankClass}">#${rank}</span></td>
        <td><strong>${esc(team.name)}</strong></td>
        <td class="team-score">${total(team)}</td>
      </tr>
    `;
  }).join("") : '<tr><td colspan="3" class="state-cell">No registered teams yet.</td></tr>';

  // Round Results Table (Sorted Straight Down)
  const roundContainer = $('round-results-container');
  if (!rounds.length) {
    roundContainer.innerHTML = '<p class="state-cell">No tournament rounds created yet.</p>';
    return;
  }

  roundContainer.innerHTML = rounds.map((round) => {
    const rRanked = [...teams].sort((a, b) => {
      const scoreA = Number(a.scores?.[round.id]) || 0;
      const scoreB = Number(b.scores?.[round.id]) || 0;
      return scoreB - scoreA;
    });

    return `
      <div class="round-block">
        <div class="round-block-title">
          <span>${esc(round.name)}</span>
          <span style="font-size: 0.85rem; font-weight: normal;">Stage Results</span>
        </div>
        <table class="round-table">
          <tbody>
            ${rRanked.length ? rRanked.map((t, idx) => `
              <tr>
                <td style="width: 50px; font-weight: 700; color: var(--text-muted);">#${idx + 1}</td>
                <td><strong>${esc(t.name)}</strong></td>
                <td style="text-align: right; font-weight: 700; color: var(--primary-sky); font-variant-numeric: tabular-nums;">
                  ${Number(t.scores?.[round.id]) || 0} pts
                </td>
              </tr>
            `).join("") : '<tr><td colspan="3" class="state-cell">No scores recorded for this round.</td></tr>'}
          </tbody>
        </table>
      </div>
    `;
  }).join("");
}

/* -------------------------------------------------------------
 * 4. ADMIN DASHBOARD RENDERING
 * ----------------------------------------------------------- */
function renderAdmin() {
  $('admin-teams-list').innerHTML = teams.map(t => `
    <div class="list-row">
      <span>${esc(t.name)}</span>
      <button class="btn btn-danger btn-sm" data-del-team="${esc(t.id)}">Delete</button>
    </div>
  `).join("") || '<p class="text-muted">No teams registered.</p>';

  $('admin-rounds-list').innerHTML = rounds.map(r => `
    <div class="list-row">
      <span>${esc(r.name)}</span>
      <button class="btn btn-danger btn-sm" data-del-round="${esc(r.id)}">Delete</button>
    </div>
  `).join("") || '<p class="text-muted">No rounds defined.</p>';

  const sel = $('score-team-select');
  const cur = sel.value;
  sel.innerHTML = '<option value="">-- Choose Registered Team --</option>' +
    teams.map(t => `<option value="${esc(t.id)}">${esc(t.name)}</option>`).join("");
  
  if (teams.some(t => t.id === cur)) {
    sel.value = cur;
    renderScores(cur);
  } else {
    renderScores(null);
  }
}

function renderScores(teamId) {
  const box = $('score-inputs-container');
  const btn = $('save-scores-btn');
  const team = teams.find(t => t.id === teamId);

  if (!team || !rounds.length) {
    box.innerHTML = '<p class="state-cell">Select a team and configure at least one round.</p>';
    btn.disabled = true;
    return;
  }

  btn.disabled = false;
  box.innerHTML = rounds.map(r => `
    <div class="form-group">
      <label>${esc(r.name)}</label>
      <input type="text" data-r="${esc(r.id)}" value="${Number(team.scores?.[r.id]) || 0}" placeholder="e.g. 10 or +10">
    </div>
  `).join("");

  // Real-time evaluation on blur and Enter key
  box.querySelectorAll('input[data-r]').forEach(inp => {
    const calc = () => {
      const currentVal = Number(team.scores?.[inp.dataset.r]) || 0;
      inp.value = parseScoreMath(inp.value, currentVal);
    };
    inp.addEventListener('blur', calc);
    inp.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        calc();
      }
    });
  });
}

async function sync(newT, newR, msg) {
  const { error } = await supabaseClient
    .from('quiz_championship')
    .update({ teams: newT, rounds: newR, updated_at: new Date().toISOString() })
    .eq('id', 'leaderboard');

  if (error) throw error;
  notify('admin-status', msg, true);
}

/* -------------------------------------------------------------
 * 5. AUTHENTICATION HANDLERS
 * ----------------------------------------------------------- */
$('admin-login-form').onsubmit = async (e) => {
  e.preventDefault();
  const { error } = await supabaseClient.auth.signInWithPassword({
    email: $('admin-email').value.trim(),
    password: $('admin-password').value
  });
  if (error) notify('login-status', error.message, false);
};

$('logout-btn').onclick = () => supabaseClient.auth.signOut();
$('close-login-btn').onclick = () => { $('login-modal').hidden = true; };

supabaseClient.auth.onAuthStateChange((_, session) => {
  isAdmin = Boolean(session?.user);
  $('admin-panel').hidden = !isAdmin;
  $('login-modal').hidden = true;
  if (isAdmin) renderAdmin();
});

/* -------------------------------------------------------------
 * 6. CRUD ACTIONS
 * ----------------------------------------------------------- */
$('add-team-form').onsubmit = async (e) => {
  e.preventDefault();
  const name = $('new-team-name').value.trim();
  if (!name) return;
  try {
    const updated = [...teams, { id: `team_${Date.now()}`, name, scores: {} }];
    await sync(updated, rounds, `Team "${name}" registered.`);
    $('new-team-name').value = "";
  } catch (err) { notify('admin-status', err.message, false); }
};

$('add-round-form').onsubmit = async (e) => {
  e.preventDefault();
  const name = $('new-round-name').value.trim();
  if (!name) return;
  try {
    const updated = [...rounds, { id: `round_${Date.now()}`, name }];
    await sync(teams, updated, `Round "${name}" established.`);
    $('new-round-name').value = "";
  } catch (err) { notify('admin-status', err.message, false); }
};

$('admin-teams-list').onclick = async (e) => {
  const id = e.target.dataset.delTeam;
  if (!id || !confirm("Delete team and all recorded points?")) return;
  try {
    await sync(teams.filter(t => t.id !== id), rounds, "Team removed.");
  } catch (err) { notify('admin-status', err.message, false); }
};

$('admin-rounds-list').onclick = async (e) => {
  const id = e.target.dataset.delRound;
  if (!id || !confirm("Delete round and remove its allocated points?")) return;
  try {
    const newR = rounds.filter(r => r.id !== id);
    const newT = teams.map(t => {
      const copy = { ...t.scores };
      delete copy[id];
      return { ...t, scores: copy };
    });
    await sync(newT, newR, "Round removed.");
  } catch (err) { notify('admin-status', err.message, false); }
};

$('score-team-select').onchange = (e) => renderScores(e.target.value);

$('save-scores-btn').onclick = async () => {
  const id = $('score-team-select').value;
  const team = teams.find(t => t.id === id);
  if (!team) return;
  
  const updatedScores = { ...team.scores };
  document.querySelectorAll('[data-r]').forEach(inp => {
    const currentVal = Number(team.scores?.[inp.dataset.r]) || 0;
    const finalVal = parseScoreMath(inp.value, currentVal);
    inp.value = finalVal;
    updatedScores[inp.dataset.r] = finalVal;
  });

  const updatedTeams = teams.map(t => t.id === id ? { ...t, scores: updatedScores } : t);
  try {
    await sync(updatedTeams, rounds, `Scores committed for "${team.name}".`);
  } catch (err) { notify('admin-status', err.message, false); }
};

/* -------------------------------------------------------------
 * 7. CONTINUOUS SLOW PING-PONG AUTO-SCROLL LOOP
 * ----------------------------------------------------------- */
const isFullscreenActive = () => Boolean(document.fullscreenElement);

function stepPingPongScroll() {
  if (!isScrollLoopActive || !isFullscreenActive()) {
    stopAutoScroll();
    return;
  }

  if (!isPausing) {
    const maxScroll = document.documentElement.scrollHeight - window.innerHeight;
    const currentScroll = window.scrollY;

    if (scrollDirection === 'down') {
      if (currentScroll >= maxScroll - 2) {
        // Hit the bottom: pause for 3 seconds, then scroll up
        isPausing = true;
        setTimeout(() => {
          scrollDirection = 'up';
          isPausing = false;
        }, 3000);
      } else {
        window.scrollBy(0, SCROLL_SPEED);
      }
    } else {
      // scrollDirection === 'up'
      if (currentScroll <= 2) {
        // Hit the top: pause for 3 seconds, then scroll down
        isPausing = true;
        setTimeout(() => {
          scrollDirection = 'down';
          isPausing = false;
        }, 3000);
      } else {
        window.scrollBy(0, -SCROLL_SPEED);
      }
    }
  }

  scrollAnimationId = requestAnimationFrame(stepPingPongScroll);
}

function startAutoScroll() {
  if (!isFullscreenActive() || isScrollLoopActive) return;
  isScrollLoopActive = true;
  isPausing = false;
  scrollDirection = 'down';
  scrollAnimationId = requestAnimationFrame(stepPingPongScroll);
}

function stopAutoScroll() {
  isScrollLoopActive = false;
  isPausing = false;
  if (scrollAnimationId) {
    cancelAnimationFrame(scrollAnimationId);
    scrollAnimationId = null;
  }
}

// Fullscreen Floating Button Trigger
$('fullscreen-toggle-btn').onclick = () => {
  if (isFullscreenActive()) {
    document.exitFullscreen();
  } else {
    document.documentElement.requestFullscreen().catch(err => {
      console.error("Fullscreen request failed:", err);
    });
  }
};

// Fullscreen State Listener (Triggers continuous scroll loop automatically)
document.addEventListener('fullscreenchange', () => {
  if (isFullscreenActive()) {
    $('fullscreen-toggle-btn').textContent = '×';
    $('fullscreen-toggle-btn').title = "Exit Fullscreen (Esc)";
    startAutoScroll();
  } else {
    $('fullscreen-toggle-btn').textContent = '⛶';
    $('fullscreen-toggle-btn').title = "Toggle Fullscreen Projector Mode";
    stopAutoScroll();
  }
});

// Logo Button Action
$('logo-btn').onclick = () => {
  if (!isFullscreenActive()) {
    if (isAdmin) {
      $('admin-panel').scrollIntoView({ behavior: 'smooth' });
    } else {
      $('login-modal').hidden = false;
      $('admin-email').focus();
    }
  } else {
    // If in fullscreen, clicking the logo pauses/unpauses the scroll loop
    if (isScrollLoopActive) {
      stopAutoScroll();
    } else {
      startAutoScroll();
    }
  }
};

/* -------------------------------------------------------------
 * 8. REAL-TIME DATA REPLICATION & INITIALIZATION
 * ----------------------------------------------------------- */
async function loadInitialData() {
  const { data, error } = await supabaseClient
    .from('quiz_championship')
    .select('teams, rounds')
    .eq('id', 'leaderboard')
    .single();

  if (error) {
    console.error("Initial fetch error:", error);
    return;
  }

  teams = data.teams || [];
  rounds = data.rounds || [];
  renderPublic();
  if (isAdmin) renderAdmin();
}

supabaseClient.channel('public:quiz_championship')
  .on(
    'postgres_changes',
    { event: 'UPDATE', schema: 'public', table: 'quiz_championship', filter: 'id=eq.leaderboard' },
    (payload) => {
      teams = payload.new.teams || [];
      rounds = payload.new.rounds || [];
      renderPublic();
      if (isAdmin) renderAdmin();
    }
  )
  .subscribe();

loadInitialData();