/* global window, document, fetch, localStorage */

const TOKEN_KEY = "hyperPmWebBearer";

const STATUSES = ["backlog", "todo", "in_progress", "done", "cancelled"];

/** @type {{ view: string; epicId?: string; storyId?: string; ticketId?: string; storyFilterEpic?: string; ticketFilterStory?: string }} */
const state = {
  view: "dashboard",
  storyFilterEpic: "",
  ticketFilterStory: "",
};

/**
 * @param {string} s
 */
function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * @param {string} status
 */
function badgeHtml(status) {
  const s = String(status);
  const label = s.replace(/_/g, " ");
  return `<span class="status-pill" data-status="${escapeHtml(s)}">${escapeHtml(label)}</span>`;
}

/**
 * @param {string} id
 */
function idChip(id) {
  return `<span class="id-chip">${escapeHtml(id)}</span>`;
}

/**
 * @param {string} v
 * @returns {string | undefined}
 */
function trimU(v) {
  const t = String(v).trim();
  return t.length > 0 ? t : undefined;
}

/**
 * @param {Record<string, unknown>} data
 */
async function runApi(data) {
  const headers = { "Content-Type": "application/json" };
  const token = localStorage.getItem(TOKEN_KEY);
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  const res = await fetch("/api/run", {
    method: "POST",
    headers,
    body: JSON.stringify(data),
  });
  const text = await res.text();
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = { raw: text };
  }
  return { ok: res.ok, status: res.status, body: parsed };
}

/**
 * @param {string[]} argv
 * @param {Record<string, unknown>} [extra]
 * @returns {Promise<unknown>}
 */
async function runCli(argv, extra = {}) {
  const r = await runApi({ argv, ...extra });
  const b = r.body;
  if (!r.ok) {
    const msg =
      typeof b.error === "string" ? b.error : `Request failed (${r.status})`;
    throw new Error(msg);
  }
  if (b.exitCode !== 0) {
    const errText = (b.stderr && String(b.stderr).trim()) || "";
    throw new Error(errText || `Command failed (exit ${b.exitCode})`);
  }
  return b.json;
}

/**
 * @param {unknown} json
 * @returns {unknown[]}
 */
function listFromJson(json) {
  if (
    json &&
    typeof json === "object" &&
    Array.isArray(/** @type {{items?: unknown[]}} */ (json).items)
  ) {
    return /** @type {{items: unknown[]}} */ (json).items;
  }
  return [];
}

/**
 * @param {string} message
 * @param {boolean} isError
 */
function toast(message, isError) {
  const el = document.getElementById("toast");
  if (!el) return;
  el.textContent = message;
  el.className = `show ${isError ? "error" : "ok"}`;
  window.clearTimeout(toast._t);
  toast._t = window.setTimeout(() => {
    el.className = "";
    el.textContent = "";
  }, 4500);
}

/**
 * @param {unknown[]} items
 * @param {(row: Record<string, unknown>) => string} rowHtml
 */
function tableHtml(items, rowHtml) {
  if (items.length === 0) {
    return '<div class="empty-state">Nothing here yet. Create your first item to get started.</div>';
  }
  const rows = items
    .map((row) => rowHtml(/** @type {Record<string, unknown>} */ (row)))
    .join("");
  return `<div class="table-wrap"><table class="data-table"><thead><tr><th>Title</th><th>Status</th><th>Id</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>`;
}

/**
 * @param {string} name
 * @param {string} [value]
 */
function statusOptionsHtml(name, value) {
  const v = value || "backlog";
  return `<select name="${escapeHtml(name)}" id="${escapeHtml(name)}">${STATUSES.map(
    (s) =>
      `<option value="${s}"${s === v ? " selected" : ""}>${escapeHtml(
        s.replace(/_/g, " "),
      )}</option>`,
  ).join("")}</select>`;
}

function navSectionKey() {
  if (state.view.startsWith("epic")) return "epics";
  if (state.view.startsWith("story")) return "stories";
  if (state.view.startsWith("ticket")) return "tickets";
  return state.view;
}

function setNavCurrent() {
  const key = navSectionKey();
  document.querySelectorAll(".nav-btn[data-nav]").forEach((btn) => {
    const v = /** @type {HTMLButtonElement} */ (btn).dataset.nav;
    btn.setAttribute("aria-current", v === key ? "true" : "false");
  });
}

function setPageTitle(title) {
  const el = document.getElementById("pageTitle");
  if (el) el.textContent = title;
}

/**
 * @param {Record<string, unknown>} row
 */
function epicRowHtml(row) {
  const id = String(row.id);
  return `<tr>
    <td class="cell-title">${escapeHtml(String(row.title))}</td>
    <td>${badgeHtml(String(row.status))}</td>
    <td>${idChip(id)}</td>
    <td><button type="button" class="ghost btn-open-epic" data-epic-id="${escapeHtml(id)}">Open</button></td>
  </tr>`;
}

/**
 * @param {Record<string, unknown>} row
 */
function storyRowHtml(row) {
  const id = String(row.id);
  return `<tr>
    <td class="cell-title">${escapeHtml(String(row.title))}</td>
    <td>${badgeHtml(String(row.status))}</td>
    <td>${idChip(String(row.epicId))}</td>
    <td>${idChip(id)}</td>
    <td><button type="button" class="ghost btn-open-story" data-story-id="${escapeHtml(id)}">Open</button></td>
  </tr>`;
}

/**
 * @param {Record<string, unknown>} row
 */
function ticketRowHtml(row) {
  const id = String(row.id);
  const sidCell =
    row.storyId === null || row.storyId === undefined
      ? '<span class="muted">—</span>'
      : idChip(String(row.storyId));
  return `<tr>
    <td class="cell-title">${escapeHtml(String(row.title))}</td>
    <td>${badgeHtml(String(row.status))}</td>
    <td>${sidCell}</td>
    <td>${idChip(id)}</td>
    <td><button type="button" class="ghost btn-open-ticket" data-ticket-id="${escapeHtml(id)}">Open</button></td>
  </tr>`;
}

async function loadHealth() {
  const el = document.getElementById("healthLine");
  try {
    const r = await fetch("/api/health");
    const j = await r.json();
    if (el) {
      el.textContent = `Repo: ${j.repoPath ?? "—"} · Worktrees: ${j.tempDirParent ?? "—"}`;
    }
  } catch (e) {
    if (el) el.textContent = `Could not load health: ${String(e)}`;
  }
}

async function renderDashboard() {
  setPageTitle("Overview");
  const main = document.getElementById("main");
  if (!main) return;
  main.innerHTML = '<p class="muted">Loading…</p>';
  try {
    const [ej, sj, tj] = await Promise.all([
      runCli(["epic", "read"]),
      runCli(["story", "read"]),
      runCli(["ticket", "read"]),
    ]);
    const epics = listFromJson(ej);
    const stories = listFromJson(sj);
    const tickets = listFromJson(tj);
    main.innerHTML = `
      <div class="panel">
        <div class="panel-head">
          <h2>Overview</h2>
        </div>
        <p class="muted lead">Work item counts for this repository. Use <strong>Refresh</strong> in the header after edits outside this tab.</p>
        <div class="stat-grid">
          <div class="stat-card"><div class="label">Epics</div><strong>${epics.length}</strong></div>
          <div class="stat-card"><div class="label">Stories</div><strong>${stories.length}</strong></div>
          <div class="stat-card"><div class="label">Tickets</div><strong>${tickets.length}</strong></div>
        </div>
      </div>`;
  } catch (e) {
    main.innerHTML = `<div class="panel"><p class="muted">${escapeHtml(String(e))}</p></div>`;
  }
}

async function renderEpicsList() {
  setPageTitle("Epics");
  state.view = "epics";
  delete state.epicId;
  setNavCurrent();
  const main = document.getElementById("main");
  if (!main) return;
  main.innerHTML = '<p class="muted">Loading epics…</p>';
  try {
    const json = await runCli(["epic", "read"]);
    const items = listFromJson(json);
    main.innerHTML = `
      <div class="panel">
        <div class="panel-head">
          <h2>Epics</h2>
          <button type="button" class="primary" id="btnNewEpic">New epic</button>
        </div>
        ${tableHtml(items, epicRowHtml)}
      </div>`;
    document.getElementById("btnNewEpic")?.addEventListener("click", () => {
      state.view = "epicNew";
      void renderEpicNew();
    });
    main.querySelectorAll(".btn-open-epic").forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = /** @type {HTMLButtonElement} */ (btn).dataset.epicId;
        if (id) {
          state.epicId = id;
          void renderEpicEdit();
        }
      });
    });
  } catch (e) {
    main.innerHTML = `<div class="panel"><p class="muted">${escapeHtml(String(e))}</p></div>`;
  }
}

async function renderEpicNew() {
  setPageTitle("New epic");
  state.view = "epicNew";
  setNavCurrent();
  const main = document.getElementById("main");
  if (!main) return;
  main.innerHTML = `
      <div class="panel">
        <div class="back-link">
          <button type="button" class="ghost" id="btnBackEpics">← Back to epics</button>
        </div>
        <div class="panel-head" style="border-bottom:none;padding-bottom:0;margin-bottom:0.5rem">
          <h2>Create epic</h2>
        </div>
      <label for="newEpicTitle">Title</label>
      <input type="text" id="newEpicTitle" required />
      <label for="newEpicBody">Description</label>
      <textarea id="newEpicBody" rows="4"></textarea>
      <label for="newEpicStatus">Status</label>
      ${statusOptionsHtml("newEpicStatus", "backlog")}
      <div class="row">
        <button type="button" class="primary" id="btnCreateEpic">Create</button>
      </div>
    </div>`;
  document.getElementById("btnBackEpics")?.addEventListener("click", () => {
    void renderEpicsList();
  });
  document
    .getElementById("btnCreateEpic")
    ?.addEventListener("click", async () => {
      const title = trimU(document.getElementById("newEpicTitle")?.value ?? "");
      if (!title) {
        toast("Title is required", true);
        return;
      }
      const body = document.getElementById("newEpicBody")?.value ?? "";
      const status =
        document.getElementById("newEpicStatus")?.value ?? "backlog";
      const argv = [
        "epic",
        "create",
        "--title",
        title,
        "--body",
        body,
        "--status",
        status,
      ];
      try {
        await runCli(argv);
        toast("Epic created", false);
        void renderEpicsList();
      } catch (e) {
        toast(String(e), true);
      }
    });
}

async function renderEpicEdit() {
  const id = state.epicId;
  if (!id) {
    void renderEpicsList();
    return;
  }
  setPageTitle("Epic");
  state.view = "epicEdit";
  setNavCurrent();
  const main = document.getElementById("main");
  if (!main) return;
  main.innerHTML = '<p class="muted">Loading…</p>';
  try {
    const row = /** @type {Record<string, unknown>} */ (
      await runCli(["epic", "read", "--id", id])
    );
    main.innerHTML = `
      <div class="panel">
        <div class="back-link">
          <button type="button" class="ghost" id="btnBackEpics2">← Epics</button>
        </div>
        <div class="panel-head" style="border-bottom:none;padding-bottom:0;margin-bottom:0.5rem">
          <h2>Edit epic</h2>
        </div>
        <p class="muted" style="margin-top:0">${idChip(id)}</p>
        <label for="editEpicTitle">Title</label>
        <input type="text" id="editEpicTitle" value="${escapeHtml(String(row.title))}" />
        <label for="editEpicBody">Description</label>
        <textarea id="editEpicBody" rows="6">${escapeHtml(String(row.body ?? ""))}</textarea>
        <label for="editEpicStatus">Status</label>
        ${statusOptionsHtml("editEpicStatus", String(row.status))}
        <div class="row">
          <button type="button" class="primary" id="btnSaveEpic">Save changes</button>
          <button type="button" class="danger" id="btnDeleteEpic">Delete epic</button>
        </div>
      </div>`;
    document.getElementById("btnBackEpics2")?.addEventListener("click", () => {
      void renderEpicsList();
    });
    document
      .getElementById("btnSaveEpic")
      ?.addEventListener("click", async () => {
        const title = trimU(
          document.getElementById("editEpicTitle")?.value ?? "",
        );
        const body = document.getElementById("editEpicBody")?.value ?? "";
        const status =
          document.getElementById("editEpicStatus")?.value ?? "backlog";
        if (!title) {
          toast("Title is required", true);
          return;
        }
        try {
          await runCli([
            "epic",
            "update",
            "--id",
            id,
            "--title",
            title,
            "--body",
            body,
            "--status",
            status,
          ]);
          toast("Epic saved", false);
          void renderEpicEdit();
        } catch (e) {
          toast(String(e), true);
        }
      });
    document
      .getElementById("btnDeleteEpic")
      ?.addEventListener("click", async () => {
        if (!window.confirm(`Delete epic ${id}? This cannot be undone.`))
          return;
        try {
          await runCli(["epic", "delete", "--id", id]);
          toast("Epic deleted", false);
          void renderEpicsList();
        } catch (e) {
          toast(String(e), true);
        }
      });
  } catch (e) {
    main.innerHTML = `<div class="panel"><p class="muted">${escapeHtml(String(e))}</p><button type="button" class="ghost" id="btnEpicErrBack">← Epics</button></div>`;
    document.getElementById("btnEpicErrBack")?.addEventListener("click", () => {
      void renderEpicsList();
    });
  }
}

async function renderStoriesList() {
  setPageTitle("Stories");
  state.view = "stories";
  delete state.storyId;
  setNavCurrent();
  const main = document.getElementById("main");
  if (!main) return;
  main.innerHTML = '<p class="muted">Loading…</p>';
  try {
    const ej = await runCli(["epic", "read"]);
    const epics = listFromJson(ej);
    const argv = ["story", "read"];
    const fe = trimU(state.storyFilterEpic);
    if (fe) {
      argv.push("--epic", fe);
    }
    const json = await runCli(argv);
    const items = listFromJson(json);
    const epicOpts = [
      `<option value="">All epics</option>`,
      ...epics.map(
        (e) =>
          `<option value="${escapeHtml(String(/** @type {{id:string}} */ (e).id))}"${String(/** @type {{id:string}} */ (e).id) === fe ? " selected" : ""}>${escapeHtml(String(/** @type {{title:string}} */ (e).title))}</option>`,
      ),
    ].join("");
    const storyTable =
      items.length === 0
        ? '<div class="empty-state">No stories match this filter.</div>'
        : `<div class="table-wrap"><table class="data-table"><thead><tr><th>Title</th><th>Status</th><th>Epic</th><th>Id</th><th></th></tr></thead><tbody>
          ${items.map((row) => storyRowHtml(/** @type {Record<string, unknown>} */ (row))).join("")}
        </tbody></table></div>`;
    main.innerHTML = `
      <div class="panel">
        <div class="filter-bar">
          <label for="filterStoryEpic">Filter by epic</label>
          <select id="filterStoryEpic">${epicOpts}</select>
        </div>
        <div class="panel-head">
          <h2>Stories</h2>
          <button type="button" class="primary" id="btnNewStory">New story</button>
        </div>
        ${storyTable}
      </div>`;
    document
      .getElementById("filterStoryEpic")
      ?.addEventListener("change", (ev) => {
        state.storyFilterEpic = /** @type {HTMLSelectElement} */ (
          ev.target
        ).value;
        void renderStoriesList();
      });
    document.getElementById("btnNewStory")?.addEventListener("click", () => {
      state.view = "storyNew";
      void renderStoryNew();
    });
    main.querySelectorAll(".btn-open-story").forEach((btn) => {
      btn.addEventListener("click", () => {
        const sid = /** @type {HTMLButtonElement} */ (btn).dataset.storyId;
        if (sid) {
          state.storyId = sid;
          void renderStoryEdit();
        }
      });
    });
  } catch (e) {
    main.innerHTML = `<div class="panel"><p class="muted">${escapeHtml(String(e))}</p></div>`;
  }
}

async function renderStoryNew() {
  setPageTitle("New story");
  state.view = "storyNew";
  setNavCurrent();
  const main = document.getElementById("main");
  if (!main) return;
  const ej = await runCli(["epic", "read"]).catch(() => ({ items: [] }));
  const epics = listFromJson(ej);
  const epicOpts = epics
    .map(
      (e) =>
        `<option value="${escapeHtml(String(/** @type {{id:string}} */ (e).id))}">${escapeHtml(String(/** @type {{title:string}} */ (e).title))}</option>`,
    )
    .join("");
  main.innerHTML = `
    <div class="panel">
      <div class="back-link">
        <button type="button" class="ghost" id="btnBackStories">← Stories</button>
      </div>
      <div class="panel-head" style="border-bottom:none;padding-bottom:0;margin-bottom:0.5rem">
        <h2>Create story</h2>
      </div>
      <label for="newStoryEpic">Epic</label>
      <select id="newStoryEpic" required><option value="">Select epic…</option>${epicOpts}</select>
      <label for="newStoryTitle">Title</label>
      <input type="text" id="newStoryTitle" />
      <label for="newStoryBody">Description</label>
      <textarea id="newStoryBody" rows="4"></textarea>
      <label for="newStoryStatus">Status</label>
      ${statusOptionsHtml("newStoryStatus", "backlog")}
      <div class="row">
        <button type="button" class="primary" id="btnCreateStory">Create</button>
      </div>
    </div>`;
  document.getElementById("btnBackStories")?.addEventListener("click", () => {
    void renderStoriesList();
  });
  document
    .getElementById("btnCreateStory")
    ?.addEventListener("click", async () => {
      const epic = trimU(document.getElementById("newStoryEpic")?.value ?? "");
      const title = trimU(
        document.getElementById("newStoryTitle")?.value ?? "",
      );
      const body = document.getElementById("newStoryBody")?.value ?? "";
      const status =
        document.getElementById("newStoryStatus")?.value ?? "backlog";
      if (!epic || !title) {
        toast("Epic and title are required", true);
        return;
      }
      try {
        await runCli([
          "story",
          "create",
          "--title",
          title,
          "--epic",
          epic,
          "--body",
          body,
          "--status",
          status,
        ]);
        toast("Story created", false);
        void renderStoriesList();
      } catch (e) {
        toast(String(e), true);
      }
    });
}

async function renderStoryEdit() {
  const id = state.storyId;
  if (!id) {
    void renderStoriesList();
    return;
  }
  setPageTitle("Story");
  state.view = "storyEdit";
  setNavCurrent();
  const main = document.getElementById("main");
  if (!main) return;
  main.innerHTML = '<p class="muted">Loading…</p>';
  try {
    const row = /** @type {Record<string, unknown>} */ (
      await runCli(["story", "read", "--id", id])
    );
    const epicId = String(row.epicId);
    let epicLine = `Epic id <code>${escapeHtml(epicId)}</code>`;
    try {
      const epicRow = /** @type {Record<string, unknown>} */ (
        await runCli(["epic", "read", "--id", epicId])
      );
      epicLine = `Epic: ${escapeHtml(String(epicRow.title))} (<code>${escapeHtml(epicId)}</code>)`;
    } catch {
      /* keep epicLine */
    }
    main.innerHTML = `
      <div class="panel">
        <div class="back-link">
          <button type="button" class="ghost" id="btnBackStories2">← Stories</button>
        </div>
        <div class="panel-head" style="border-bottom:none;padding-bottom:0;margin-bottom:0.5rem">
          <h2>Edit story</h2>
        </div>
        <p class="muted" style="margin-top:0">${idChip(id)} · ${epicLine}</p>
        <p class="muted" style="font-size:0.85rem">To move a story to another epic, delete and recreate it (CLI does not support changing epic on update).</p>
        <label for="editStoryTitle">Title</label>
        <input type="text" id="editStoryTitle" value="${escapeHtml(String(row.title))}" />
        <label for="editStoryBody">Description</label>
        <textarea id="editStoryBody" rows="6">${escapeHtml(String(row.body ?? ""))}</textarea>
        <label for="editStoryStatus">Status</label>
        ${statusOptionsHtml("editStoryStatus", String(row.status))}
        <div class="row">
          <button type="button" class="primary" id="btnSaveStory">Save</button>
          <button type="button" class="danger" id="btnDeleteStory">Delete</button>
        </div>
      </div>`;
    document
      .getElementById("btnBackStories2")
      ?.addEventListener("click", () => {
        void renderStoriesList();
      });
    document
      .getElementById("btnSaveStory")
      ?.addEventListener("click", async () => {
        const title = trimU(
          document.getElementById("editStoryTitle")?.value ?? "",
        );
        const body = document.getElementById("editStoryBody")?.value ?? "";
        const status =
          document.getElementById("editStoryStatus")?.value ?? "backlog";
        if (!title) {
          toast("Title is required", true);
          return;
        }
        try {
          await runCli([
            "story",
            "update",
            "--id",
            id,
            "--title",
            title,
            "--body",
            body,
            "--status",
            status,
          ]);
          toast("Story saved", false);
          void renderStoryEdit();
        } catch (e) {
          toast(String(e), true);
        }
      });
    document
      .getElementById("btnDeleteStory")
      ?.addEventListener("click", async () => {
        if (!window.confirm(`Delete story ${id}?`)) return;
        try {
          await runCli(["story", "delete", "--id", id]);
          toast("Story deleted", false);
          void renderStoriesList();
        } catch (e) {
          toast(String(e), true);
        }
      });
  } catch (e) {
    main.innerHTML = `<div class="panel"><p class="muted">${escapeHtml(String(e))}</p><button type="button" class="ghost" id="btnStoryErrBack">← Stories</button></div>`;
    document
      .getElementById("btnStoryErrBack")
      ?.addEventListener("click", () => {
        void renderStoriesList();
      });
  }
}

async function renderTicketsList() {
  setPageTitle("Tickets");
  state.view = "tickets";
  delete state.ticketId;
  setNavCurrent();
  const main = document.getElementById("main");
  if (!main) return;
  main.innerHTML = '<p class="muted">Loading…</p>';
  try {
    const sj = await runCli(["story", "read"]);
    const stories = listFromJson(sj);
    const argv = ["ticket", "read"];
    const fs = trimU(state.ticketFilterStory);
    if (fs) argv.push("--story", fs);
    const json = await runCli(argv);
    const items = listFromJson(json);
    const storyOpts = [
      `<option value="">All tickets</option>`,
      ...stories.map(
        (s) =>
          `<option value="${escapeHtml(String(/** @type {{id:string}} */ (s).id))}"${String(/** @type {{id:string}} */ (s).id) === fs ? " selected" : ""}>${escapeHtml(String(/** @type {{title:string}} */ (s).title))}</option>`,
      ),
    ].join("");
    const ticketTable =
      items.length === 0
        ? '<div class="empty-state">No tickets match this filter.</div>'
        : `<div class="table-wrap"><table class="data-table"><thead><tr><th>Title</th><th>Status</th><th>Story</th><th>Id</th><th></th></tr></thead><tbody>
          ${items.map((row) => ticketRowHtml(/** @type {Record<string, unknown>} */ (row))).join("")}
        </tbody></table></div>`;
    main.innerHTML = `
      <div class="panel">
        <div class="filter-bar">
          <label for="filterTicketStory">Filter by story</label>
          <select id="filterTicketStory">${storyOpts}</select>
        </div>
        <div class="panel-head">
          <h2>Tickets</h2>
          <button type="button" class="primary" id="btnNewTicket">New ticket</button>
        </div>
        ${ticketTable}
      </div>`;
    document
      .getElementById("filterTicketStory")
      ?.addEventListener("change", (ev) => {
        state.ticketFilterStory = /** @type {HTMLSelectElement} */ (
          ev.target
        ).value;
        void renderTicketsList();
      });
    document.getElementById("btnNewTicket")?.addEventListener("click", () => {
      state.view = "ticketNew";
      void renderTicketNew();
    });
    main.querySelectorAll(".btn-open-ticket").forEach((btn) => {
      btn.addEventListener("click", () => {
        const tid = /** @type {HTMLButtonElement} */ (btn).dataset.ticketId;
        if (tid) {
          state.ticketId = tid;
          void renderTicketEdit();
        }
      });
    });
  } catch (e) {
    main.innerHTML = `<div class="panel"><p class="muted">${escapeHtml(String(e))}</p></div>`;
  }
}

async function renderTicketNew() {
  setPageTitle("New ticket");
  state.view = "ticketNew";
  setNavCurrent();
  const main = document.getElementById("main");
  if (!main) return;
  const sj = await runCli(["story", "read"]).catch(() => ({ items: [] }));
  const stories = listFromJson(sj);
  const storyOpts = [
    `<option value="">No story (unlinked)</option>`,
    ...stories.map(
      (s) =>
        `<option value="${escapeHtml(String(/** @type {{id:string}} */ (s).id))}">${escapeHtml(String(/** @type {{title:string}} */ (s).title))}</option>`,
    ),
  ].join("");
  main.innerHTML = `
    <div class="panel">
      <div class="back-link">
        <button type="button" class="ghost" id="btnBackTickets">← Tickets</button>
      </div>
      <div class="panel-head" style="border-bottom:none;padding-bottom:0;margin-bottom:0.5rem">
        <h2>Create ticket</h2>
      </div>
      <label for="newTicketStory">Story (optional)</label>
      <select id="newTicketStory">${storyOpts}</select>
      <label for="newTicketTitle">Title</label>
      <input type="text" id="newTicketTitle" />
      <label for="newTicketBody">Description</label>
      <textarea id="newTicketBody" rows="5"></textarea>
      <label for="newTicketStatus">Status</label>
      ${statusOptionsHtml("newTicketStatus", "todo")}
      <div class="row">
        <button type="button" class="primary" id="btnCreateTicket">Create</button>
      </div>
    </div>`;
  document.getElementById("btnBackTickets")?.addEventListener("click", () => {
    void renderTicketsList();
  });
  document
    .getElementById("btnCreateTicket")
    ?.addEventListener("click", async () => {
      const title = trimU(
        document.getElementById("newTicketTitle")?.value ?? "",
      );
      const body = document.getElementById("newTicketBody")?.value ?? "";
      const status =
        document.getElementById("newTicketStatus")?.value ?? "todo";
      const story = trimU(
        document.getElementById("newTicketStory")?.value ?? "",
      );
      if (!title) {
        toast("Title is required", true);
        return;
      }
      const argv = [
        "ticket",
        "create",
        "--title",
        title,
        "--body",
        body,
        "--status",
        status,
      ];
      if (story) argv.push("--story", story);
      try {
        await runCli(argv);
        toast("Ticket created", false);
        void renderTicketsList();
      } catch (e) {
        toast(String(e), true);
      }
    });
}

/**
 * @param {unknown[]} comments
 */
function commentsHtml(comments) {
  if (!comments || comments.length === 0) {
    return '<p class="muted">No comments yet.</p>';
  }
  return comments
    .map((c) => {
      const r = /** @type {{body:string;createdAt:string;createdBy:string}} */ (
        c
      );
      return `<div class="comment">
        <div class="comment-meta">${escapeHtml(r.createdAt)} · ${escapeHtml(r.createdBy)}</div>
        <div>${escapeHtml(r.body).replace(/\n/g, "<br />")}</div>
      </div>`;
    })
    .join("");
}

async function renderTicketEdit() {
  const id = state.ticketId;
  if (!id) {
    void renderTicketsList();
    return;
  }
  setPageTitle("Ticket");
  state.view = "ticketEdit";
  setNavCurrent();
  const main = document.getElementById("main");
  if (!main) return;
  main.innerHTML = '<p class="muted">Loading…</p>';
  try {
    const row = /** @type {Record<string, unknown>} */ (
      await runCli(["ticket", "read", "--id", id])
    );
    const sj = await runCli(["story", "read"]);
    const stories = listFromJson(sj);
    const curStory = row.storyId == null ? "" : String(row.storyId);
    const storyOpts = [
      `<option value="">No story</option>`,
      ...stories.map((s) => {
        const sid = String(/** @type {{id:string}} */ (s).id);
        const sel = sid === curStory ? " selected" : "";
        return `<option value="${escapeHtml(sid)}"${sel}>${escapeHtml(String(/** @type {{title:string}} */ (s).title))}</option>`;
      }),
    ].join("");
    const comments = Array.isArray(row.comments) ? row.comments : [];
    main.innerHTML = `
      <div class="panel">
        <div class="back-link">
          <button type="button" class="ghost" id="btnBackTickets2">← Tickets</button>
        </div>
        <div class="panel-head" style="border-bottom:none;padding-bottom:0;margin-bottom:0.5rem">
          <h2>Edit ticket</h2>
        </div>
        <p class="muted" style="margin-top:0">${idChip(id)}</p>
        <label for="editTicketStory">Story</label>
        <select id="editTicketStory">${storyOpts}</select>
        <label for="editTicketTitle">Title</label>
        <input type="text" id="editTicketTitle" value="${escapeHtml(String(row.title))}" />
        <label for="editTicketBody">Description</label>
        <textarea id="editTicketBody" rows="8">${escapeHtml(String(row.body ?? ""))}</textarea>
        <label for="editTicketStatus">Status</label>
        ${statusOptionsHtml("editTicketStatus", String(row.status))}
        <div class="row">
          <button type="button" class="primary" id="btnSaveTicket">Save</button>
          <button type="button" class="danger" id="btnDeleteTicket">Delete</button>
        </div>
      </div>
      <div class="panel">
        <div class="panel-head">
          <h2>Comments</h2>
        </div>
        ${commentsHtml(comments)}
        <label for="newCommentBody">Add comment</label>
        <textarea id="newCommentBody" rows="3" placeholder="Write a comment…"></textarea>
        <div class="row">
          <button type="button" class="primary" id="btnAddComment">Post comment</button>
        </div>
      </div>`;
    document
      .getElementById("btnBackTickets2")
      ?.addEventListener("click", () => {
        void renderTicketsList();
      });
    document
      .getElementById("btnSaveTicket")
      ?.addEventListener("click", async () => {
        const title = trimU(
          document.getElementById("editTicketTitle")?.value ?? "",
        );
        const body = document.getElementById("editTicketBody")?.value ?? "";
        const status =
          document.getElementById("editTicketStatus")?.value ?? "todo";
        const storySel =
          document.getElementById("editTicketStory")?.value ?? "";
        if (!title) {
          toast("Title is required", true);
          return;
        }
        const argv = [
          "ticket",
          "update",
          "--id",
          id,
          "--title",
          title,
          "--body",
          body,
          "--status",
          status,
        ];
        if (storySel) {
          argv.push("--story", storySel);
        } else {
          argv.push("--unlink-story");
        }
        try {
          await runCli(argv);
          toast("Ticket saved", false);
          void renderTicketEdit();
        } catch (e) {
          toast(String(e), true);
        }
      });
    document
      .getElementById("btnDeleteTicket")
      ?.addEventListener("click", async () => {
        if (!window.confirm(`Delete ticket ${id}?`)) return;
        try {
          await runCli(["ticket", "delete", "--id", id]);
          toast("Ticket deleted", false);
          void renderTicketsList();
        } catch (e) {
          toast(String(e), true);
        }
      });
    document
      .getElementById("btnAddComment")
      ?.addEventListener("click", async () => {
        const text =
          document.getElementById("newCommentBody")?.value?.trim() ?? "";
        if (!text) {
          toast("Comment cannot be empty", true);
          return;
        }
        try {
          await runCli(["ticket", "comment", "--id", id, "--body", text]);
          toast("Comment added", false);
          void renderTicketEdit();
        } catch (e) {
          toast(String(e), true);
        }
      });
  } catch (e) {
    main.innerHTML = `<div class="panel"><p class="muted">${escapeHtml(String(e))}</p><button type="button" class="ghost" id="btnTicketErrBack">← Tickets</button></div>`;
    document
      .getElementById("btnTicketErrBack")
      ?.addEventListener("click", () => {
        void renderTicketsList();
      });
  }
}

function renderTools() {
  setPageTitle("Tools");
  state.view = "tools";
  setNavCurrent();
  const main = document.getElementById("main");
  if (!main) return;
  main.innerHTML = `
    <div class="panel panel-tools">
      <div class="panel-head">
        <h2>Initialize repository</h2>
      </div>
      <p class="muted">Creates the hyper-pm data branch and config if missing.</p>
      <label><input type="checkbox" id="initSyncOff" checked /> Start with sync off</label>
      <div class="row">
        <button type="button" class="primary" id="btnInit">Run init</button>
      </div>
    </div>
    <div class="panel panel-tools">
      <div class="panel-head">
        <h2>Sync with GitHub</h2>
      </div>
      <label><input type="checkbox" id="syncNoGithub" /> Skip GitHub network (<code>--no-github</code>)</label>
      <div class="row">
        <button type="button" class="primary" id="btnSync">Run sync</button>
      </div>
    </div>
    <div class="panel panel-tools">
      <div class="panel-head">
        <h2>Audit &amp; doctor</h2>
      </div>
      <label for="auditLimit">Audit limit</label>
      <input type="text" id="auditLimit" placeholder="e.g. 50" />
      <label for="auditType">Event type</label>
      <input type="text" id="auditType" placeholder="TicketUpdated" />
      <div class="row">
        <button type="button" id="btnAudit">Run audit</button>
        <button type="button" id="btnDoctor">Run doctor</button>
      </div>
    </div>`;
  document.getElementById("btnInit")?.addEventListener("click", async () => {
    const syncOff = document.getElementById("initSyncOff")?.checked;
    const argv = syncOff ? ["--sync", "off", "init"] : ["init"];
    try {
      await runCli(argv);
      toast("Init completed", false);
    } catch (e) {
      toast(String(e), true);
    }
  });
  document.getElementById("btnSync")?.addEventListener("click", async () => {
    const argv = ["sync"];
    if (document.getElementById("syncNoGithub")?.checked)
      argv.push("--no-github");
    try {
      await runCli(argv);
      toast("Sync finished", false);
    } catch (e) {
      toast(String(e), true);
    }
  });
  document.getElementById("btnAudit")?.addEventListener("click", async () => {
    const argv = ["audit"];
    const lim = trimU(document.getElementById("auditLimit")?.value ?? "");
    const typ = trimU(document.getElementById("auditType")?.value ?? "");
    if (lim) argv.push("--limit", lim);
    if (typ) argv.push("--type", typ);
    try {
      const j = await runCli(argv);
      window.alert(JSON.stringify(j, null, 2));
    } catch (e) {
      toast(String(e), true);
    }
  });
  document.getElementById("btnDoctor")?.addEventListener("click", async () => {
    try {
      const j = await runCli(["doctor"]);
      toast(JSON.stringify(j), false);
    } catch (e) {
      toast(String(e), true);
    }
  });
}

function renderAdvanced() {
  setPageTitle("Advanced CLI");
  state.view = "advanced";
  setNavCurrent();
  const main = document.getElementById("main");
  if (!main) return;
  main.innerHTML = `
    <div class="panel">
      <div class="panel-head">
        <h2>Raw argv</h2>
      </div>
      <p class="muted">JSON array of CLI tokens after global flags. Repo, temp dir, and format are still enforced by the server.</p>
      <textarea id="advArgv" rows="6" placeholder='["ticket", "read", "--id", "…"]'></textarea>
      <div class="row">
        <button type="button" class="primary" id="btnAdvRun">Run</button>
      </div>
      <h3>Output</h3>
      <pre id="advOut" class="pre-out muted"></pre>
    </div>`;
  document.getElementById("btnAdvRun")?.addEventListener("click", async () => {
    const raw = document.getElementById("advArgv")?.value ?? "";
    const out = document.getElementById("advOut");
    let argv;
    try {
      argv = JSON.parse(raw);
    } catch (e) {
      if (out) out.textContent = String(e);
      return;
    }
    if (!Array.isArray(argv) || !argv.every((x) => typeof x === "string")) {
      if (out) out.textContent = "Expected JSON array of strings.";
      return;
    }
    const r = await runApi({ argv });
    if (out) out.textContent = JSON.stringify(r.body, null, 2);
  });
}

function refreshCurrentView() {
  switch (state.view) {
    case "dashboard":
      return renderDashboard();
    case "epics":
    case "epicNew":
      return state.view === "epicNew" ? renderEpicNew() : renderEpicsList();
    case "epicEdit":
      return renderEpicEdit();
    case "stories":
    case "storyNew":
      return state.view === "storyNew" ? renderStoryNew() : renderStoriesList();
    case "storyEdit":
      return renderStoryEdit();
    case "tickets":
    case "ticketNew":
      return state.view === "ticketNew"
        ? renderTicketNew()
        : renderTicketsList();
    case "ticketEdit":
      return renderTicketEdit();
    case "tools":
      return Promise.resolve(renderTools());
    case "advanced":
      return Promise.resolve(renderAdvanced());
    default:
      return renderDashboard();
  }
}

function wireNav() {
  document.querySelectorAll(".nav-btn[data-nav]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const v = /** @type {HTMLButtonElement} */ (btn).dataset.nav;
      if (!v) return;
      state.view = v;
      if (v === "dashboard") void renderDashboard();
      else if (v === "epics") void renderEpicsList();
      else if (v === "stories") void renderStoriesList();
      else if (v === "tickets") void renderTicketsList();
      else if (v === "tools") renderTools();
      else if (v === "advanced") renderAdvanced();
    });
  });
  document.getElementById("btnRefresh")?.addEventListener("click", () => {
    void loadHealth();
    void refreshCurrentView();
  });
  document.getElementById("saveToken")?.addEventListener("click", () => {
    const v = document.getElementById("bearer")?.value ?? "";
    if (v.trim()) localStorage.setItem(TOKEN_KEY, v.trim());
    else localStorage.removeItem(TOKEN_KEY);
    toast("Token saved", false);
  });
}

window.addEventListener("DOMContentLoaded", async () => {
  const existing = localStorage.getItem(TOKEN_KEY);
  const bearerInput = document.getElementById("bearer");
  if (bearerInput && existing) bearerInput.value = existing;
  wireNav();
  await loadHealth();
  state.view = "dashboard";
  setNavCurrent();
  await renderDashboard();
});
