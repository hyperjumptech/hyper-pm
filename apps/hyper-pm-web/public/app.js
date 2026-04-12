/* global window, document, fetch, localStorage */

const TOKEN_KEY = "hyperPmWebBearer";

const STATUSES = ["backlog", "todo", "in_progress", "done", "cancelled"];

/** @type {{ view: string; epicId?: string; storyId?: string; ticketId?: string; storyFilterEpic?: string; ticketFilterStory?: string; epicDetailForm?: boolean; storyDetailForm?: boolean; ticketDetailForm?: boolean }} */
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
 * Renders plain text as safe HTML for read-only multiline display.
 * @param {unknown} text
 * @returns {string}
 */
function readBodyHtml(text) {
  const s = String(text ?? "");
  if (!trimU(s)) {
    return '<p class="muted read-empty">No description.</p>';
  }
  return `<div class="read-body">${escapeHtml(s).replace(/\n/g, "<br />")}</div>`;
}

/**
 * One labeled block in a read-only detail stack (`innerHtml` is trusted HTML from this file only).
 * @param {string} label
 * @param {string} innerHtml
 * @returns {string}
 */
function readRowHtml(label, innerHtml) {
  return `<div class="read-row"><div class="read-label">${escapeHtml(label)}</div><div class="read-value">${innerHtml}</div></div>`;
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
 * Opens an epic in read mode (detail view).
 * @param {string} epicId
 */
function navigateToEpic(epicId) {
  state.epicId = epicId;
  state.epicDetailForm = false;
  void renderEpicEdit();
}

/**
 * Opens a story in read mode (detail view).
 * @param {string} storyId
 */
function navigateToStory(storyId) {
  state.storyId = storyId;
  state.storyDetailForm = false;
  void renderStoryEdit();
}

/**
 * Opens a ticket in read mode (detail view).
 * @param {string} ticketId
 */
function navigateToTicket(ticketId) {
  state.ticketId = ticketId;
  state.ticketDetailForm = false;
  void renderTicketEdit();
}

/**
 * Goes to the stories list filtered to one epic.
 * @param {string} epicId
 */
function navigateToStoriesForEpic(epicId) {
  state.storyFilterEpic = epicId;
  state.view = "stories";
  void renderStoriesList();
}

/**
 * Goes to the tickets list filtered to one story.
 * @param {string} storyId
 */
function navigateToTicketsForStory(storyId) {
  state.ticketFilterStory = storyId;
  state.view = "tickets";
  void renderTicketsList();
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
    <td class="cell-title"><button type="button" class="link-title btn-open-epic" data-epic-id="${escapeHtml(id)}">${escapeHtml(String(row.title))}</button></td>
    <td>${badgeHtml(String(row.status))}</td>
    <td>${idChip(id)}</td>
    <td><button type="button" class="ghost btn-open-epic" data-epic-id="${escapeHtml(id)}">Open</button></td>
  </tr>`;
}

/**
 * @param {Record<string, unknown>} row
 * @param {Record<string, string>} epicTitles epic id → title
 */
function storyRowHtml(row, epicTitles) {
  const id = String(row.id);
  const eid = String(row.epicId);
  const epicTitle = epicTitles[eid];
  const epicCell = epicTitle
    ? `<button type="button" class="link-title btn-nav-epic" data-epic-id="${escapeHtml(eid)}">${escapeHtml(epicTitle)}</button>`
    : idChip(eid);
  return `<tr>
    <td class="cell-title"><button type="button" class="link-title btn-open-story" data-story-id="${escapeHtml(id)}">${escapeHtml(String(row.title))}</button></td>
    <td>${badgeHtml(String(row.status))}</td>
    <td>${epicCell}</td>
    <td>${idChip(id)}</td>
    <td><button type="button" class="ghost btn-open-story" data-story-id="${escapeHtml(id)}">Open</button></td>
  </tr>`;
}

/**
 * @param {Record<string, unknown>} row
 * @param {Record<string, string>} storyTitles story id → title
 */
function ticketRowHtml(row, storyTitles) {
  const id = String(row.id);
  const sid =
    row.storyId === null || row.storyId === undefined
      ? ""
      : String(row.storyId);
  const stitle = sid ? storyTitles[sid] : "";
  const sidCell =
    sid === ""
      ? '<span class="muted">—</span>'
      : stitle
        ? `<button type="button" class="link-title btn-nav-story" data-story-id="${escapeHtml(sid)}">${escapeHtml(stitle)}</button>`
        : idChip(sid);
  return `<tr>
    <td class="cell-title"><button type="button" class="link-title btn-open-ticket" data-ticket-id="${escapeHtml(id)}">${escapeHtml(String(row.title))}</button></td>
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
        <div class="nav-related row" style="margin-top:1.25rem">
          <button type="button" class="primary" id="dashOpenEpics">Browse epics</button>
          <button type="button" class="ghost" id="dashOpenStories">Browse stories</button>
          <button type="button" class="ghost" id="dashOpenTickets">Browse tickets</button>
        </div>
      </div>`;
    document.getElementById("dashOpenEpics")?.addEventListener("click", () => {
      state.view = "epics";
      void renderEpicsList();
    });
    document
      .getElementById("dashOpenStories")
      ?.addEventListener("click", () => {
        state.storyFilterEpic = "";
        state.view = "stories";
        void renderStoriesList();
      });
    document
      .getElementById("dashOpenTickets")
      ?.addEventListener("click", () => {
        state.ticketFilterStory = "";
        state.view = "tickets";
        void renderTicketsList();
      });
  } catch (e) {
    main.innerHTML = `<div class="panel"><p class="muted">${escapeHtml(String(e))}</p></div>`;
  }
}

async function renderEpicsList() {
  setPageTitle("Epics");
  state.view = "epics";
  delete state.epicId;
  delete state.epicDetailForm;
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
        const eid = /** @type {HTMLButtonElement} */ (btn).dataset.epicId;
        if (eid) navigateToEpic(eid);
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
  state.view = "epicEdit";
  setNavCurrent();
  const main = document.getElementById("main");
  if (!main) return;
  main.innerHTML = '<p class="muted">Loading…</p>';
  try {
    const row = /** @type {Record<string, unknown>} */ (
      await runCli(["epic", "read", "--id", id])
    );
    const showForm = Boolean(state.epicDetailForm);
    setPageTitle(showForm ? "Edit epic" : String(row.title));
    const readBlock = `
        <div class="panel-head">
          <div>
            <p class="muted" style="margin:0 0 0.25rem;font-size:0.8125rem">Epic</p>
            <h2 style="margin:0">${escapeHtml(String(row.title))}</h2>
          </div>
          <button type="button" class="primary" id="btnEpicEnterEdit">Edit</button>
        </div>
        <p class="muted" style="margin-top:0">${idChip(id)}</p>
        <div class="read-stack">
          ${readRowHtml("Status", badgeHtml(String(row.status)))}
          ${readRowHtml("Description", readBodyHtml(row.body))}
        </div>`;
    const formBlock = `
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
          <button type="button" class="ghost" id="btnEpicCancelEdit">Cancel</button>
          <button type="button" class="danger" id="btnDeleteEpic">Delete epic</button>
        </div>`;
    const epicTrail = `
        <nav class="crumbs" aria-label="Breadcrumb">
          <button type="button" class="ghost crumb-btn" id="bcEpicEpics">Epics</button>
          <span class="crumb-sep" aria-hidden="true">/</span>
          <span class="crumb-current">${escapeHtml(String(row.title))}</span>
        </nav>
        <div class="nav-related row">
          <button type="button" class="ghost" id="btnEpicSeeStories">Stories in this epic</button>
        </div>`;
    main.innerHTML = `
      <div class="panel">
        <div class="back-link">
          <button type="button" class="ghost" id="btnBackEpics2">← Epics</button>
        </div>
        ${epicTrail}
        ${showForm ? formBlock : readBlock}
      </div>`;
    document.getElementById("btnBackEpics2")?.addEventListener("click", () => {
      void renderEpicsList();
    });
    document.getElementById("bcEpicEpics")?.addEventListener("click", () => {
      void renderEpicsList();
    });
    document
      .getElementById("btnEpicSeeStories")
      ?.addEventListener("click", () => {
        navigateToStoriesForEpic(id);
      });
    if (!showForm) {
      document
        .getElementById("btnEpicEnterEdit")
        ?.addEventListener("click", () => {
          state.epicDetailForm = true;
          void renderEpicEdit();
        });
    } else {
      document
        .getElementById("btnEpicCancelEdit")
        ?.addEventListener("click", () => {
          state.epicDetailForm = false;
          void renderEpicEdit();
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
            state.epicDetailForm = false;
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
    }
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
  delete state.storyDetailForm;
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
    /** @type {Record<string, string>} */
    const epicTitles = {};
    for (const e of epics) {
      epicTitles[String(/** @type {{id:string}} */ (e).id)] = String(
        /** @type {{title:string}} */ (e).title,
      );
    }
    const epicOpts = [
      `<option value="">All epics</option>`,
      ...epics.map(
        (e) =>
          `<option value="${escapeHtml(String(/** @type {{id:string}} */ (e).id))}"${String(/** @type {{id:string}} */ (e).id) === fe ? " selected" : ""}>${escapeHtml(String(/** @type {{title:string}} */ (e).title))}</option>`,
      ),
    ].join("");
    const filteredEpicRow = fe
      ? epics.find((e) => String(/** @type {{id:string}} */ (e).id) === fe)
      : undefined;
    const storyFilterBanner = fe
      ? `<div class="filter-context-bar"><span>Showing stories in <strong>${filteredEpicRow ? escapeHtml(String(/** @type {{title:string}} */ (filteredEpicRow).title)) : escapeHtml(fe)}</strong></span><div class="filter-actions"><button type="button" class="ghost" id="btnStoriesCtxEpic">View epic</button><button type="button" class="ghost" id="btnStoriesClearEpic">All stories</button></div></div>`
      : "";
    const storyTable =
      items.length === 0
        ? '<div class="empty-state">No stories match this filter.</div>'
        : `<div class="table-wrap"><table class="data-table"><thead><tr><th>Title</th><th>Status</th><th>Epic</th><th>Id</th><th></th></tr></thead><tbody>
          ${items
            .map((row) =>
              storyRowHtml(
                /** @type {Record<string, unknown>} */ (row),
                epicTitles,
              ),
            )
            .join("")}
        </tbody></table></div>`;
    main.innerHTML = `
      <div class="panel">
        ${storyFilterBanner}
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
    if (fe) {
      document
        .getElementById("btnStoriesCtxEpic")
        ?.addEventListener("click", () => {
          navigateToEpic(fe);
        });
      document
        .getElementById("btnStoriesClearEpic")
        ?.addEventListener("click", () => {
          state.storyFilterEpic = "";
          void renderStoriesList();
        });
    }
    main.querySelectorAll(".btn-open-story").forEach((btn) => {
      btn.addEventListener("click", () => {
        const sid = /** @type {HTMLButtonElement} */ (btn).dataset.storyId;
        if (sid) navigateToStory(sid);
      });
    });
    main.querySelectorAll(".btn-nav-epic").forEach((btn) => {
      btn.addEventListener("click", (ev) => {
        ev.stopPropagation();
        const eid = /** @type {HTMLButtonElement} */ (btn).dataset.epicId;
        if (eid) navigateToEpic(eid);
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
    let epicCrumbEscaped = escapeHtml(epicId);
    let epicReadInner = idChip(epicId);
    let epicFormLine = `Epic id <code>${escapeHtml(epicId)}</code>`;
    try {
      const epicRow = /** @type {Record<string, unknown>} */ (
        await runCli(["epic", "read", "--id", epicId])
      );
      const t = escapeHtml(String(epicRow.title));
      epicCrumbEscaped = t;
      epicReadInner = `<span>${t}</span> · ${idChip(epicId)}`;
      epicFormLine = `Epic: ${t} (<code>${escapeHtml(epicId)}</code>)`;
    } catch {
      /* keep defaults */
    }
    const storyTrail = `
        <nav class="crumbs" aria-label="Breadcrumb">
          <button type="button" class="ghost crumb-btn" id="bcStoryStories">Stories</button>
          <span class="crumb-sep" aria-hidden="true">/</span>
          <button type="button" class="ghost crumb-btn" id="bcStoryEpic">${epicCrumbEscaped}</button>
          <span class="crumb-sep" aria-hidden="true">/</span>
          <span class="crumb-current">${escapeHtml(String(row.title))}</span>
        </nav>
        <div class="nav-related row">
          <button type="button" class="ghost" id="btnStoryOpenEpic">Open epic</button>
          <button type="button" class="ghost" id="btnStorySeeTickets">Tickets for this story</button>
        </div>`;
    const showForm = Boolean(state.storyDetailForm);
    setPageTitle(showForm ? "Edit story" : String(row.title));
    const readBlock = `
        <div class="panel-head">
          <div>
            <p class="muted" style="margin:0 0 0.25rem;font-size:0.8125rem">Story</p>
            <h2 style="margin:0">${escapeHtml(String(row.title))}</h2>
          </div>
          <button type="button" class="primary" id="btnStoryEnterEdit">Edit</button>
        </div>
        <p class="muted" style="margin-top:0">${idChip(id)}</p>
        <div class="read-stack">
          ${readRowHtml("Epic", epicReadInner)}
          ${readRowHtml("Status", badgeHtml(String(row.status)))}
          ${readRowHtml("Description", readBodyHtml(row.body))}
        </div>`;
    const formBlock = `
        <div class="panel-head" style="border-bottom:none;padding-bottom:0;margin-bottom:0.5rem">
          <h2>Edit story</h2>
        </div>
        <p class="muted" style="margin-top:0">${idChip(id)} · ${epicFormLine}</p>
        <p class="muted" style="font-size:0.85rem">To move a story to another epic, delete and recreate it (CLI does not support changing epic on update).</p>
        <label for="editStoryTitle">Title</label>
        <input type="text" id="editStoryTitle" value="${escapeHtml(String(row.title))}" />
        <label for="editStoryBody">Description</label>
        <textarea id="editStoryBody" rows="6">${escapeHtml(String(row.body ?? ""))}</textarea>
        <label for="editStoryStatus">Status</label>
        ${statusOptionsHtml("editStoryStatus", String(row.status))}
        <div class="row">
          <button type="button" class="primary" id="btnSaveStory">Save</button>
          <button type="button" class="ghost" id="btnStoryCancelEdit">Cancel</button>
          <button type="button" class="danger" id="btnDeleteStory">Delete</button>
        </div>`;
    main.innerHTML = `
      <div class="panel">
        <div class="back-link">
          <button type="button" class="ghost" id="btnBackStories2">← Stories</button>
        </div>
        ${storyTrail}
        ${showForm ? formBlock : readBlock}
      </div>`;
    document
      .getElementById("btnBackStories2")
      ?.addEventListener("click", () => {
        void renderStoriesList();
      });
    document.getElementById("bcStoryStories")?.addEventListener("click", () => {
      state.storyFilterEpic = "";
      void renderStoriesList();
    });
    document.getElementById("bcStoryEpic")?.addEventListener("click", () => {
      navigateToEpic(epicId);
    });
    document
      .getElementById("btnStoryOpenEpic")
      ?.addEventListener("click", () => {
        navigateToEpic(epicId);
      });
    document
      .getElementById("btnStorySeeTickets")
      ?.addEventListener("click", () => {
        navigateToTicketsForStory(id);
      });
    if (!showForm) {
      document
        .getElementById("btnStoryEnterEdit")
        ?.addEventListener("click", () => {
          state.storyDetailForm = true;
          void renderStoryEdit();
        });
    } else {
      document
        .getElementById("btnStoryCancelEdit")
        ?.addEventListener("click", () => {
          state.storyDetailForm = false;
          void renderStoryEdit();
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
            state.storyDetailForm = false;
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
    }
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
  delete state.ticketDetailForm;
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
    /** @type {Record<string, string>} */
    const storyTitles = {};
    for (const s of stories) {
      storyTitles[String(/** @type {{id:string}} */ (s).id)] = String(
        /** @type {{title:string}} */ (s).title,
      );
    }
    const storyOpts = [
      `<option value="">All tickets</option>`,
      ...stories.map(
        (s) =>
          `<option value="${escapeHtml(String(/** @type {{id:string}} */ (s).id))}"${String(/** @type {{id:string}} */ (s).id) === fs ? " selected" : ""}>${escapeHtml(String(/** @type {{title:string}} */ (s).title))}</option>`,
      ),
    ].join("");
    const filteredStoryRow = fs
      ? stories.find((s) => String(/** @type {{id:string}} */ (s).id) === fs)
      : undefined;
    const ticketFilterBanner = fs
      ? `<div class="filter-context-bar"><span>Showing tickets for <strong>${filteredStoryRow ? escapeHtml(String(/** @type {{title:string}} */ (filteredStoryRow).title)) : escapeHtml(fs)}</strong></span><div class="filter-actions"><button type="button" class="ghost" id="btnTicketsCtxStory">View story</button><button type="button" class="ghost" id="btnTicketsClearStory">All tickets</button></div></div>`
      : "";
    const ticketTable =
      items.length === 0
        ? '<div class="empty-state">No tickets match this filter.</div>'
        : `<div class="table-wrap"><table class="data-table"><thead><tr><th>Title</th><th>Status</th><th>Story</th><th>Id</th><th></th></tr></thead><tbody>
          ${items
            .map((row) =>
              ticketRowHtml(
                /** @type {Record<string, unknown>} */ (row),
                storyTitles,
              ),
            )
            .join("")}
        </tbody></table></div>`;
    main.innerHTML = `
      <div class="panel">
        ${ticketFilterBanner}
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
    if (fs) {
      document
        .getElementById("btnTicketsCtxStory")
        ?.addEventListener("click", () => {
          navigateToStory(fs);
        });
      document
        .getElementById("btnTicketsClearStory")
        ?.addEventListener("click", () => {
          state.ticketFilterStory = "";
          void renderTicketsList();
        });
    }
    main.querySelectorAll(".btn-open-ticket").forEach((btn) => {
      btn.addEventListener("click", () => {
        const tid = /** @type {HTMLButtonElement} */ (btn).dataset.ticketId;
        if (tid) navigateToTicket(tid);
      });
    });
    main.querySelectorAll(".btn-nav-story").forEach((btn) => {
      btn.addEventListener("click", (ev) => {
        ev.stopPropagation();
        const sid = /** @type {HTMLButtonElement} */ (btn).dataset.storyId;
        if (sid) navigateToStory(sid);
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
    let storyCrumbEscaped = "";
    let storyReadInner = '<span class="muted">No linked story</span>';
    if (curStory) {
      const st = stories.find(
        (s) => String(/** @type {{id:string}} */ (s).id) === curStory,
      );
      if (st) {
        const stit = String(/** @type {{title:string}} */ (st).title);
        storyCrumbEscaped = escapeHtml(stit);
        storyReadInner = `<span>${storyCrumbEscaped}</span> · ${idChip(curStory)}`;
      } else {
        storyCrumbEscaped = escapeHtml(curStory);
        storyReadInner = idChip(curStory);
      }
    }
    const ticketTrail = curStory
      ? `<nav class="crumbs" aria-label="Breadcrumb">
          <button type="button" class="ghost crumb-btn" id="bcTixTickets">Tickets</button>
          <span class="crumb-sep" aria-hidden="true">/</span>
          <button type="button" class="ghost crumb-btn" id="bcTixStory">${storyCrumbEscaped}</button>
          <span class="crumb-sep" aria-hidden="true">/</span>
          <span class="crumb-current">${escapeHtml(String(row.title))}</span>
        </nav>
        <div class="nav-related row">
          <button type="button" class="ghost" id="btnTixOpenStory">Open story</button>
          <button type="button" class="ghost" id="btnTixTicketsThisStory">Tickets in this story</button>
        </div>`
      : `<nav class="crumbs" aria-label="Breadcrumb">
          <button type="button" class="ghost crumb-btn" id="bcTixTickets">Tickets</button>
          <span class="crumb-sep" aria-hidden="true">/</span>
          <span class="crumb-current">${escapeHtml(String(row.title))}</span>
        </nav>`;
    const storyOpts = [
      `<option value="">No story</option>`,
      ...stories.map((s) => {
        const sid = String(/** @type {{id:string}} */ (s).id);
        const sel = sid === curStory ? " selected" : "";
        return `<option value="${escapeHtml(sid)}"${sel}>${escapeHtml(String(/** @type {{title:string}} */ (s).title))}</option>`;
      }),
    ].join("");
    const comments = Array.isArray(row.comments) ? row.comments : [];
    const showForm = Boolean(state.ticketDetailForm);
    setPageTitle(showForm ? "Edit ticket" : String(row.title));
    const readBlock = `
        <div class="panel-head">
          <div>
            <p class="muted" style="margin:0 0 0.25rem;font-size:0.8125rem">Ticket</p>
            <h2 style="margin:0">${escapeHtml(String(row.title))}</h2>
          </div>
          <button type="button" class="primary" id="btnTicketEnterEdit">Edit</button>
        </div>
        <p class="muted" style="margin-top:0">${idChip(id)}</p>
        <div class="read-stack">
          ${readRowHtml("Story", storyReadInner)}
          ${readRowHtml("Status", badgeHtml(String(row.status)))}
          ${readRowHtml("Description", readBodyHtml(row.body))}
        </div>`;
    const formBlock = `
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
          <button type="button" class="ghost" id="btnTicketCancelEdit">Cancel</button>
          <button type="button" class="danger" id="btnDeleteTicket">Delete</button>
        </div>`;
    main.innerHTML = `
      <div class="panel">
        <div class="back-link">
          <button type="button" class="ghost" id="btnBackTickets2">← Tickets</button>
        </div>
        ${ticketTrail}
        ${showForm ? formBlock : readBlock}
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
    document.getElementById("bcTixTickets")?.addEventListener("click", () => {
      state.ticketFilterStory = "";
      void renderTicketsList();
    });
    if (curStory) {
      document.getElementById("bcTixStory")?.addEventListener("click", () => {
        navigateToStory(curStory);
      });
      document
        .getElementById("btnTixOpenStory")
        ?.addEventListener("click", () => {
          navigateToStory(curStory);
        });
      document
        .getElementById("btnTixTicketsThisStory")
        ?.addEventListener("click", () => {
          navigateToTicketsForStory(curStory);
        });
    }
    if (!showForm) {
      document
        .getElementById("btnTicketEnterEdit")
        ?.addEventListener("click", () => {
          state.ticketDetailForm = true;
          void renderTicketEdit();
        });
    } else {
      document
        .getElementById("btnTicketCancelEdit")
        ?.addEventListener("click", () => {
          state.ticketDetailForm = false;
          void renderTicketEdit();
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
            state.ticketDetailForm = false;
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
    }
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
      else if (v === "stories") {
        state.storyFilterEpic = "";
        void renderStoriesList();
      } else if (v === "tickets") {
        state.ticketFilterStory = "";
        void renderTicketsList();
      } else if (v === "tools") renderTools();
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
