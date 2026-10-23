/* -------------------------------------------------------------
 * 1. SUPABASE CLIENT
 * ----------------------------------------------------------- */
const SUPABASE_URL = "https://frhgflemlbpqmiurxdfg.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_WIzwdAuxc-xLSp_6y9J_ug_72aCSR6t";
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let teams = [];
let rounds = [];
let isAdmin = false;

const $ = (id) => document.getElementById(id);

/* -------------------------------------------------------------
 * 2. SANITIZATION & MATH EXPRESSION PARSER
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
  if (!el) return;
  el.textContent = text;
  el.className = `alert-box ${isOk ? 'alert-success' : 'alert-danger'}`;
  el.hidden = false;
  setTimeout(() => { el.hidden = true; }, 4000);
}

function parseScoreMath(expr, baseValue = 0) {
  let val = String(expr ?? "").trim();
  if (!val) return 0;

  if (/^[+\-*/]/.test(val)) {
    val = `${baseValue}${val}`;
  }

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
 * 3. PUBLIC STAGE MATRIX RENDERER (REGISTRATION ORDER - NO RE-SORTING)
 * ----------------------------------------------------------- */
function renderPublic() {
  $('team-counter').textContent = teams.length;

  // Build Header Columns
  const headerRow = $('table-header-row');
  const roundHeaders = rounds.map(r => `<th>${esc(r.name)}</th>`).join("");
  headerRow.innerHTML = `
    <th class="th-seq">#</th>
    <th class="th-team">Team Name</th>
    ${roundHeaders}
    <th class="th-total">Total Score</th>
  `;

  const tbody = $('leaderboard-body');
  if (!teams.length) {
    const colSpan = rounds.length + 3;
    tbody.innerHTML = `<tr><td colspan="${colSpan}" class="state-cell">No registered teams yet.</td></tr>`;
    return;
  }

  // Render rows strictly as registered (teams preserved in original order)
  tbody.innerHTML = teams.map((team, idx) => {
    const seq = idx + 1;

    const roundCells = rounds.map(r => {
      const score = Number(team.scores?.[r.id]) || 0;
      return `<td class="td-score">${score}</td>`;
    }).join("");

    return `
      <tr>
        <td class="td-seq"><span class="seq-badge">#${seq}</span></td>
        <td class="td-team">${esc(team.name)}</td>
        ${roundCells}
        <td class="td-total">${total(team)}</td>
      </tr>
    `;
  }).join("");
}

/* -------------------------------------------------------------
 * 4. ADMIN DASHBOARD & LIVE EDITABLE MATRIX
 * ----------------------------------------------------------- */
function renderAdmin() {
  // Render Management Lists
  $('admin-teams-list').innerHTML = teams.map(t => `
    <div class="list-row">
      <span><strong>${esc(t.name)}</strong></span>
      <button class="btn btn-danger btn-sm" data-del-team="${esc(t.id)}">Delete</button>
    </div>
  `).join("") || '<p class="muted-note">No teams registered.</p>';

  $('admin-rounds-list').innerHTML = rounds.map(r => `
    <div class="list-row">
      <span><strong>${esc(r.name)}</strong></span>
      <button class="btn btn-danger btn-sm" data-del-round="${esc(r.id)}">Delete</button>
    </div>
  `).join("") || '<p class="muted-note">No rounds defined.</p>';

  // Render Admin Live Matrix Header
  const adminHeaderRow = $('admin-table-header-row');
  const roundHeaders = rounds.map(r => `<th>${esc(r.name)}</th>`).join("");
  adminHeaderRow.innerHTML = `
    <th class="th-seq">#</th>
    <th class="th-team">Team Name</th>
    ${roundHeaders}
    <th class="th-total">Total</th>
  `;

  const adminBody = $('admin-matrix-body');
  if (!teams.length) {
    const colSpan = rounds.length + 3;
    adminBody.innerHTML = `<tr><td colspan="${colSpan}" class="state-cell">Register teams and rounds above to start recording scores.</td></tr>`;
    return;
  }

  // Render Admin Live Matrix Rows with editable inputs (original registration order)
  adminBody.innerHTML = teams.map((team, idx) => {
    const seq = idx + 1;

    const roundInputs = rounds.map(r => {
      const score = Number(team.scores?.[r.id]) || 0;
      return `
        <td>
          <input 
            type="text" 
            class="admin-cell-input" 
            data-team-id="${esc(team.id)}" 
            data-round-id="${esc(r.id)}" 
            value="${score}" 
            placeholder="0"
          >
        </td>
      `;
    }).join("");

    return `
      <tr id="admin-row-${esc(team.id)}">
        <td class="td-seq"><span class="seq-badge">#${seq}</span></td>
        <td class="td-team">${esc(team.name)}</td>
        ${roundInputs}
        <td class="td-total" id="admin-total-${esc(team.id)}">${total(team)}</td>
      </tr>
    `;
  }).join("");

  attachAdminCellListeners();
}

function attachAdminCellListeners() {
  document.querySelectorAll('.admin-cell-input').forEach(input => {
    const applyCalculation = async () => {
      const teamId = input.dataset.teamId;
      const roundId = input.dataset.roundId;
      const team = teams.find(t => t.id === teamId);
      if (!team) return;

      const currentScore = Number(team.scores?.[roundId]) || 0;
      const newScore = parseScoreMath(input.value, currentScore);

      // Reflect formatted value
      input.value = newScore;

      if (team.scores?.[roundId] === newScore) return;

      // Update state
      team.scores = { ...(team.scores || {}), [roundId]: newScore };

      // Update row total instantly without altering row sequence
      const totalCell = $(`admin-total-${teamId}`);
      if (totalCell) totalCell.textContent = total(team);

      // Refresh public board without re-sorting
      renderPublic();

      // Sync to Supabase
      try {
        await sync(teams, rounds, `Updated scores for "${team.name}".`);
      } catch (err) {
        notify('admin-status', err.message, false);
      }
    };

    input.addEventListener('blur', applyCalculation);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        input.blur();
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
  if (msg) notify('admin-status', msg, true);
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

/* -------------------------------------------------------------
 * 7. STATIC FULLSCREEN (NO AUTO-SCROLLING)
 * ----------------------------------------------------------- */
const isFullscreenActive = () => Boolean(document.fullscreenElement);

$('fullscreen-toggle-btn').onclick = () => {
  if (isFullscreenActive()) {
    document.exitFullscreen();
  } else {
    document.documentElement.requestFullscreen().catch(err => {
      console.error("Fullscreen request failed:", err);
    });
  }
};

document.addEventListener('fullscreenchange', () => {
  if (isFullscreenActive()) {
    $('fullscreen-toggle-btn').textContent = '× Exit Fullscreen';
    $('fullscreen-toggle-btn').title = "Exit Fullscreen (Esc)";
  } else {
    $('fullscreen-toggle-btn').textContent = '⛶ Fullscreen';
    $('fullscreen-toggle-btn').title = "Toggle Fullscreen Projector Mode";
  }
});

$('logo-btn').onclick = () => {
  if (isAdmin) {
    $('admin-panel').scrollIntoView({ behavior: 'smooth' });
  } else {
    $('login-modal').hidden = false;
    $('admin-email').focus();
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