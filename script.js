
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.0/firebase-app.js";

import {
  getAuth,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/11.6.0/firebase-auth.js";

import {
  getFirestore,
  doc,
  onSnapshot,
  setDoc
} from "https://www.gstatic.com/firebasejs/11.6.0/firebase-firestore.js";

// Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyA4ebgnudQIYwyTWv4n3peRiSVlN-R30X0",
  authDomain: "ible-quiz-results.firebaseapp.com",
  projectId: "ible-quiz-results",
  storageBucket: "ible-quiz-results.firebasestorage.app",
  messagingSenderId: "734322533722",
  appId: "1:734322533722:web:e69c736258bc5061c27f63"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

const ADMIN_UID = "zoU3h5wMpcdVkCC1ckqpN3dNSx53";
const dataRef = doc(db, "quizData", "leaderboard");

let teams = [];
let rounds = [];
let currentUser = null;
let databaseReady = false;
let saveInProgress = false;
let operationInProgress = false;

const $ = (id) => document.getElementById(id);

function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  })[char]);
}

function newId() {
  return crypto.randomUUID();
}

function isAdmin() {
  return Boolean(currentUser && currentUser.uid === ADMIN_UID);
}

function showMessage(id, message, type = "") {
  const element = $(id);
  if (!element) return;

  element.textContent = message;
  element.className =
    (id === "status-message" ? "notice" : "admin-message") +
    (type ? ` ${type}` : "");
}

function roundName(round, index) {
  return typeof round.name === "string" && round.name.trim()
    ? round.name.trim()
    : `Round ${index + 1}`;
}

function totalScore(team) {
  return rounds.reduce((total, round) => {
    const score = Number(team.scores?.[round.id] ?? 0);
    return total + (Number.isFinite(score) ? score : 0);
  }, 0);
}

// Save only through the authorized admin account.
async function saveData(updatedTeams = teams, updatedRounds = rounds) {
  if (!isAdmin()) {
    throw new Error("Administrator login required.");
  }

  if (!databaseReady) {
    throw new Error("Database is not ready. Please try again.");
  }

  await setDoc(dataRef, {
    teams: updatedTeams,
    rounds: updatedRounds
  });

  teams = updatedTeams;
  rounds = updatedRounds;
}

// Public leaderboard
function renderLeaderboard() {
  const body = $("leaderboard-body");

  $("team-count").textContent =
    `${teams.length} ${teams.length === 1 ? "team" : "teams"}`;

  const sorted = [...teams].sort(
    (a, b) => totalScore(b) - totalScore(a)
  );

  if (!sorted.length) {
    body.innerHTML =
      '<tr><td colspan="3" class="empty">No teams have been added yet.</td></tr>';
    return;
  }

  body.innerHTML = sorted.map((team, index) => {
    const medal = ["🥇", "🥈", "🥉"][index];

    return `
      <tr>
        <td class="rank-cell">
          ${medal
            ? `<span class="rank-medal">${medal}</span>`
            : `#${index + 1}`}
        </td>
        <td class="team-name">${escapeHTML(team.name)}</td>
        <td class="score-cell">${totalScore(team)}</td>
      </tr>
    `;
  }).join("");
}

// Public results for each round
function renderRoundResults() {
  const container = $("round-results");

  if (!rounds.length) {
    container.innerHTML =
      '<p class="empty">Quiz rounds will appear here.</p>';
    return;
  }

  container.innerHTML = rounds.map((round, index) => {
    const sorted = [...teams].sort(
      (a, b) =>
        Number(b.scores?.[round.id] ?? 0) -
        Number(a.scores?.[round.id] ?? 0)
    );

    const resultRows = sorted.length
      ? sorted.map((team) => `
          <p>
            <span>${escapeHTML(team.name)}</span>
            <strong>${Number(team.scores?.[round.id] ?? 0)}</strong>
          </p>
        `).join("")
      : '<p class="empty">No team scores yet.</p>';

    return `
      <article class="round-card">
        <h3>${escapeHTML(roundName(round, index))}</h3>
        ${resultRows}
      </article>
    `;
  }).join("");
}

// Admin team list
function renderAdminTeams() {
  const list = $("admin-team-list");

  list.innerHTML = teams.length
    ? teams.map((team) => `
        <div class="manage-item">
          <span>${escapeHTML(team.name)}</span>
          <button class="button danger" type="button"
                  data-delete-team="${escapeHTML(team.id)}">
            Delete
          </button>
        </div>
      `).join("")
    : '<p class="empty">No teams added yet.</p>';
}

// Admin round list
function renderAdminRounds() {
  const list = $("admin-round-list");

  list.innerHTML = rounds.length
    ? rounds.map((round, index) => `
        <div class="manage-item">
          <span>${escapeHTML(roundName(round, index))}</span>
          <button class="button danger" type="button"
                  data-delete-round="${escapeHTML(round.id)}">
            Delete
          </button>
        </div>
      `).join("")
    : '<p class="empty">No rounds added yet. Click + to create one.</p>';
}

// Score editor with editable round names
function renderScoreEditor() {
  const editor = $("score-editor");

  if (!rounds.length) {
    editor.innerHTML =
      '<p class="empty">Click + to add your first round.</p>';
    return;
  }

  const headers = rounds.map((round, index) => `
    <th>
      <input
        class="round-name-input"
        type="text"
        value="${escapeHTML(roundName(round, index))}"
        data-edit-round="${escapeHTML(round.id)}"
        aria-label="Round name"
        maxlength="60"
        required
      >
    </th>
  `).join("");

  const rows = teams.map((team) => {
    const cells = rounds.map((round, index) => {
      const value = Number(team.scores?.[round.id] ?? 0);
      const score = Number.isFinite(value) && value >= 0 ? value : 0;

      return `
        <td>
          <input
            class="score-input"
            type="number"
            min="0"
            step="1"
            value="${score}"
            data-team-id="${escapeHTML(team.id)}"
            data-round-id="${escapeHTML(round.id)}"
            aria-label="${escapeHTML(team.name)} score for ${escapeHTML(roundName(round, index))}"
            required
          >
        </td>
      `;
    }).join("");

    return `
      <tr>
        <td class="team-name">${escapeHTML(team.name)}</td>
        ${cells}
      </tr>
    `;
  }).join("");

  editor.innerHTML = `
    <table class="score-table">
      <thead>
        <tr><th>Team</th>${headers}</tr>
      </thead>
      <tbody>
        ${rows || `
          <tr>
            <td colspan="${rounds.length + 1}" class="empty">
              Add teams to enter scores.
            </td>
          </tr>
        `}
      </tbody>
    </table>
    <button id="save-round-names-button"
            class="button secondary save-button" type="button">
      Save Round Names
    </button>
  `;
}

function renderEverything() {
  renderLeaderboard();
  renderRoundResults();

  if (isAdmin()) {
    renderAdminTeams();
    renderAdminRounds();
    renderScoreEditor();
  }
}

// Load current results and update them live.
onSnapshot(dataRef, (snapshot) => {
  databaseReady = true;

  if (snapshot.exists()) {
    const data = snapshot.data();

    teams = Array.isArray(data.teams)
      ? data.teams.map((team, index) => ({
          ...team,
          id: team.id || `team-${index + 1}`,
          name: typeof team.name === "string" && team.name.trim()
            ? team.name.trim()
            : `Team ${index + 1}`,
          scores: team.scores && typeof team.scores === "object"
            ? team.scores
            : {}
        }))
      : [];

    rounds = Array.isArray(data.rounds)
      ? data.rounds.map((round, index) => ({
          ...round,
          id: round.id || `round-${index + 1}`,
          name: typeof round.name === "string" && round.name.trim()
            ? round.name.trim()
            : `Round ${index + 1}`
        }))
      : [];
  } else {
    teams = [];
    rounds = [];
  }

  renderEverything();
  showMessage("status-message", "Results are updating live.", "success");
}, (error) => {
  console.error("Firestore error:", error);
  databaseReady = false;

  showMessage(
    "status-message",
    "Unable to load results. Check your connection and Firestore rules.",
    "error"
  );
});

// Click the top-left logo to open the login/dashboard.
$("logo-button").addEventListener("click", () => {
  if (isAdmin()) {
    $("login-section").hidden = true;
    $("admin-section").hidden = !$("admin-section").hidden;

    if (!$("admin-section").hidden) {
      renderEverything();
      $("admin-section").scrollIntoView({
        behavior: "smooth",
        block: "start"
      });
    }
  } else {
    $("admin-section").hidden = true;
    $("login-section").hidden = !$("login-section").hidden;

    if (!$("login-section").hidden) {
      $("login-section").scrollIntoView({
        behavior: "smooth",
        block: "center"
      });
    }
  }
});

$("close-login-button").addEventListener("click", () => {
  $("login-section").hidden = true;
});

// Admin login
$("login-form").addEventListener("submit", async (event) => {
  event.preventDefault();

  const button = $("login-button");
  button.disabled = true;
  button.textContent = "Signing in...";

  showMessage("login-message", "");

  try {
    const credential = await signInWithEmailAndPassword(
      auth,
      $("admin-email").value.trim(),
      $("admin-password").value
    );

    if (credential.user.uid !== ADMIN_UID) {
      await signOut(auth);
      throw new Error("This account is not authorized as administrator.");
    }

    $("login-section").hidden = true;
    $("admin-section").hidden = false;

    showMessage("admin-message", "Login successful.", "success");
    renderEverything();
    $("admin-section").scrollIntoView({ behavior: "smooth" });
  } catch (error) {
    console.error(error);

    let message = error.message || "Login failed.";

    if (error.code === "auth/invalid-credential") {
      message = "Incorrect email or password.";
    } else if (error.code === "auth/invalid-email") {
      message = "Please enter a valid email address.";
    } else if (error.code === "auth/too-many-requests") {
      message = "Too many attempts. Please try again later.";
    }

    showMessage("login-message", message, "error");
  } finally {
    button.disabled = false;
    button.textContent = "Log In";
  }
});

// Maintain admin login state.
onAuthStateChanged(auth, (user) => {
  currentUser = user;

  if (user && user.uid === ADMIN_UID) {
    $("admin-section").hidden = false;
    $("login-section").hidden = true;
    renderEverything();
  } else {
    $("admin-section").hidden = true;

    if (user) {
      signOut(auth).catch(console.error);
    }
  }
});

// Add team
$("add-team-form").addEventListener("submit", async (event) => {
  event.preventDefault();

  if (!isAdmin()) {
    showMessage("admin-message", "Administrator login required.", "error");
    return;
  }

  const input = $("new-team-name");
  const name = input.value.trim();

  if (!name) return;

  if (teams.some((team) =>
    team.name.toLowerCase() === name.toLowerCase()
  )) {
    showMessage("admin-message", "That team already exists.", "error");
    return;
  }

  try {
    await saveData(
      [...teams, { id: newId(), name, scores: {} }],
      rounds
    );

    input.value = "";
    renderEverything();
    showMessage("admin-message", `Team "${name}" added.`, "success");
  } catch (error) {
    console.error(error);
    showMessage("admin-message", error.message, "error");
  }
});

// Add a round using the + button.
$("add-round-button").addEventListener("click", async () => {
  if (!isAdmin() || operationInProgress) return;

  const name = prompt("Enter the new round name:");
  if (name === null) return;

  const cleanName = name.trim();

  if (!cleanName) {
    showMessage("admin-message", "Please enter a round name.", "error");
    return;
  }

  if (rounds.some((round, index) =>
    roundName(round, index).toLowerCase() === cleanName.toLowerCase()
  )) {
    showMessage("admin-message", "That round name already exists.", "error");
    return;
  }

  operationInProgress = true;
  $("add-round-button").disabled = true;

  try {
    await saveData(
      teams,
      [...rounds, { id: newId(), name: cleanName }]
    );

    renderEverything();
    showMessage("admin-message", `Round "${cleanName}" added.`, "success");
  } catch (error) {
    console.error(error);
    showMessage("admin-message", error.message, "error");
  } finally {
    operationInProgress = false;
    $("add-round-button").disabled = false;
  }
});

// Save edited round names.
$("score-editor").addEventListener("click", async (event) => {
  if (!event.target.closest("#save-round-names-button")) return;

  if (!isAdmin()) return;

  const inputs = [...document.querySelectorAll(".round-name-input")];
  const editedNames = inputs.map((input) => ({
    id: input.dataset.editRound,
    name: input.value.trim()
  }));

  if (editedNames.some((item) => !item.name)) {
    showMessage("admin-message", "Every round needs a name.", "error");
    return;
  }

  const normalized = editedNames.map((item) => item.name.toLowerCase());

  if (new Set(normalized).size !== normalized.length) {
    showMessage("admin-message", "Round names must be unique.", "error");
    return;
  }

  try {
    const updatedRounds = rounds.map((round) => {
      const edited = editedNames.find((item) => item.id === round.id);
      return edited ? { ...round, name: edited.name } : round;
    });

    await saveData(teams, updatedRounds);
    renderEverything();
    showMessage("admin-message", "Round names saved successfully.", "success");
  } catch (error) {
    console.error(error);
    showMessage("admin-message", error.message, "error");
  }
});

// Delete a team and all its scores.
$("admin-team-list").addEventListener("click", async (event) => {
  const button = event.target.closest("[data-delete-team]");
  if (!button || !isAdmin()) return;

  const team = teams.find((item) => item.id === button.dataset.deleteTeam);
  if (!team || !confirm(`Delete "${team.name}" and its scores?`)) return;

  try {
    await saveData(teams.filter((item) => item.id !== team.id), rounds);
    renderEverything();
    showMessage("admin-message", "Team deleted.", "success");
  } catch (error) {
    console.error(error);
    showMessage("admin-message", error.message, "error");
  }
});

// Delete a round and remove that round's scores.
$("admin-round-list").addEventListener("click", async (event) => {
  const button = event.target.closest("[data-delete-round]");
  if (!button || !isAdmin()) return;

  const round = rounds.find((item) => item.id === button.dataset.deleteRound);
  if (!round || !confirm(`Delete "${round.name}" and its scores?`)) return;

  try {
    const updatedRounds = rounds.filter((item) => item.id !== round.id);

    const updatedTeams = teams.map((team) => {
      const scores = { ...(team.scores || {}) };
      delete scores[round.id];
      return { ...team, scores };
    });

    await saveData(updatedTeams, updatedRounds);
    renderEverything();
    showMessage("admin-message", "Round deleted.", "success");
  } catch (error) {
    console.error(error);
    showMessage("admin-message", error.message, "error");
  }
});

// Save scores and current round names together.
$("save-scores-button").addEventListener("click", async () => {
  if (!isAdmin() || saveInProgress) return;

  const nameInputs = [...document.querySelectorAll(".round-name-input")];
  const editedNames = nameInputs.map((input) => ({
    id: input.dataset.editRound,
    name: input.value.trim()
  }));

  if (editedNames.some((item) => !item.name)) {
    showMessage("admin-message", "Every round needs a name.", "error");
    return;
  }

  if (new Set(editedNames.map((item) => item.name.toLowerCase())).size
      !== editedNames.length) {
    showMessage("admin-message", "Round names must be unique.", "error");
    return;
  }

  const updatedRounds = rounds.map((round) => {
    const edited = editedNames.find((item) => item.id === round.id);
    return edited ? { ...round, name: edited.name } : round;
  });

  const updatedTeams = teams.map((team) => ({
    ...team,
    scores: { ...(team.scores || {}) }
  }));

  const scoreInputs = [...document.querySelectorAll(".score-input")];

  for (const input of scoreInputs) {
    const raw = input.value.trim();
    const score = Number(raw);

    if (raw === "" || !Number.isInteger(score) || score < 0) {
      showMessage(
        "admin-message",
        "Scores must be whole numbers of zero or greater.",
        "error"
      );
      input.focus();
      return;
    }

    const team = updatedTeams.find(
      (item) => item.id === input.dataset.teamId
    );

    if (team) {
      team.scores[input.dataset.roundId] = score;
    }
  }

  saveInProgress = true;
  const button = $("save-scores-button");
  button.disabled = true;
  button.textContent = "Saving...";

  try {
    await saveData(updatedTeams, updatedRounds);
    renderEverything();
    showMessage(
      "admin-message",
      "Scores and round names saved successfully!",
      "success"
    );
  } catch (error) {
    console.error(error);
    showMessage("admin-message", error.message, "error");
  } finally {
    saveInProgress = false;
    button.disabled = false;
    button.textContent = "Save All Scores";
  }
});

// Log out
$("logout-button").addEventListener("click", async () => {
  try {
    await signOut(auth);
    $("admin-section").hidden = true;
    $("login-section").hidden = true;
    showMessage("status-message", "You have logged out.", "success");
  } catch (error) {
    console.error(error);
    showMessage("admin-message", error.message, "error");
  }
});
