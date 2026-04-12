/* global window, document, fetch, localStorage */

const TOKEN_KEY = "hyperPmWebBearer";

/**
 * @param {string} v
 * @returns {string | undefined}
 */
const trimU = (v) => {
  const t = v.trim();
  return t.length > 0 ? t : undefined;
};

/**
 * @param {unknown} data
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
 * @param {unknown} body
 */
function showResult(body) {
  const el = document.getElementById("out");
  if (!el) return;
  el.textContent =
    typeof body === "object" && body !== null
      ? JSON.stringify(body, null, 2)
      : String(body);
}

/**
 * @param {Record<string, unknown>} payload
 */
async function runAndShow(payload) {
  const r = await runApi(payload);
  showResult({ httpStatus: r.status, ...r.body });
}

function wire() {
  document.getElementById("saveToken")?.addEventListener("click", () => {
    const v = document.getElementById("bearer")?.value ?? "";
    if (v.trim()) {
      localStorage.setItem(TOKEN_KEY, v.trim());
    } else {
      localStorage.removeItem(TOKEN_KEY);
    }
  });

  const existing = localStorage.getItem(TOKEN_KEY);
  const bearerInput = document.getElementById("bearer");
  if (bearerInput && existing) {
    bearerInput.value = existing;
  }

  document.getElementById("btnInit")?.addEventListener("click", async () => {
    const syncOff = document.getElementById("initSyncOff")?.checked;
    const argv = syncOff ? ["--sync", "off", "init"] : ["init"];
    await runAndShow({ argv });
  });

  document
    .getElementById("btnEpicCreate")
    ?.addEventListener("click", async () => {
      const title = trimU(document.getElementById("epicTitle")?.value ?? "");
      if (!title) {
        showResult({ error: "title required" });
        return;
      }
      const argv = ["epic", "create", "--title", title];
      const body = trimU(document.getElementById("epicBody")?.value ?? "");
      const id = trimU(document.getElementById("epicId")?.value ?? "");
      const status = trimU(document.getElementById("epicStatus")?.value ?? "");
      if (body !== undefined) argv.push("--body", body);
      if (id !== undefined) argv.push("--id", id);
      if (status !== undefined) argv.push("--status", status);
      await runAndShow({ argv });
    });

  document
    .getElementById("btnEpicRead")
    ?.addEventListener("click", async () => {
      const id = trimU(document.getElementById("epicReadId")?.value ?? "");
      const argv = id ? ["epic", "read", "--id", id] : ["epic", "read"];
      await runAndShow({ argv });
    });

  document
    .getElementById("btnEpicUpdate")
    ?.addEventListener("click", async () => {
      const id = trimU(document.getElementById("epicUpId")?.value ?? "");
      if (!id) {
        showResult({ error: "id required" });
        return;
      }
      const argv = ["epic", "update", "--id", id];
      const title = trimU(document.getElementById("epicUpTitle")?.value ?? "");
      const body = trimU(document.getElementById("epicUpBody")?.value ?? "");
      const status = trimU(
        document.getElementById("epicUpStatus")?.value ?? "",
      );
      if (title !== undefined) argv.push("--title", title);
      if (body !== undefined) argv.push("--body", body);
      if (status !== undefined) argv.push("--status", status);
      await runAndShow({ argv });
    });

  document
    .getElementById("btnEpicDelete")
    ?.addEventListener("click", async () => {
      const id = trimU(document.getElementById("epicDelId")?.value ?? "");
      if (!id) {
        showResult({ error: "id required" });
        return;
      }
      await runAndShow({ argv: ["epic", "delete", "--id", id] });
    });

  document
    .getElementById("btnStoryCreate")
    ?.addEventListener("click", async () => {
      const title = trimU(document.getElementById("storyTitle")?.value ?? "");
      const epic = trimU(document.getElementById("storyEpic")?.value ?? "");
      if (!title || !epic) {
        showResult({ error: "title and epic required" });
        return;
      }
      const argv = ["story", "create", "--title", title, "--epic", epic];
      const body = trimU(document.getElementById("storyBody")?.value ?? "");
      const id = trimU(document.getElementById("storyId")?.value ?? "");
      const status = trimU(document.getElementById("storyStatus")?.value ?? "");
      if (body !== undefined) argv.push("--body", body);
      if (id !== undefined) argv.push("--id", id);
      if (status !== undefined) argv.push("--status", status);
      await runAndShow({ argv });
    });

  document
    .getElementById("btnStoryRead")
    ?.addEventListener("click", async () => {
      const id = trimU(document.getElementById("storyReadId")?.value ?? "");
      const epic = trimU(document.getElementById("storyReadEpic")?.value ?? "");
      const argv = ["story", "read"];
      if (id) argv.push("--id", id);
      if (epic) argv.push("--epic", epic);
      await runAndShow({ argv });
    });

  document
    .getElementById("btnStoryUpdate")
    ?.addEventListener("click", async () => {
      const id = trimU(document.getElementById("storyUpId")?.value ?? "");
      if (!id) {
        showResult({ error: "id required" });
        return;
      }
      const argv = ["story", "update", "--id", id];
      const title = trimU(document.getElementById("storyUpTitle")?.value ?? "");
      const body = trimU(document.getElementById("storyUpBody")?.value ?? "");
      const status = trimU(
        document.getElementById("storyUpStatus")?.value ?? "",
      );
      if (title !== undefined) argv.push("--title", title);
      if (body !== undefined) argv.push("--body", body);
      if (status !== undefined) argv.push("--status", status);
      await runAndShow({ argv });
    });

  document
    .getElementById("btnStoryDelete")
    ?.addEventListener("click", async () => {
      const id = trimU(document.getElementById("storyDelId")?.value ?? "");
      if (!id) {
        showResult({ error: "id required" });
        return;
      }
      await runAndShow({ argv: ["story", "delete", "--id", id] });
    });

  document
    .getElementById("btnTicketCreate")
    ?.addEventListener("click", async () => {
      const title = trimU(document.getElementById("ticketTitle")?.value ?? "");
      if (!title) {
        showResult({ error: "title required" });
        return;
      }
      const argv = ["ticket", "create", "--title", title];
      const story = trimU(document.getElementById("ticketStory")?.value ?? "");
      const body = document.getElementById("ticketBody")?.value ?? "";
      const id = trimU(document.getElementById("ticketId")?.value ?? "");
      const status = trimU(
        document.getElementById("ticketStatus")?.value ?? "",
      );
      if (story !== undefined) argv.push("--story", story);
      if (body.trim()) argv.push("--body", body);
      if (id !== undefined) argv.push("--id", id);
      if (status !== undefined) argv.push("--status", status);
      await runAndShow({ argv });
    });

  document
    .getElementById("btnTicketRead")
    ?.addEventListener("click", async () => {
      const id = trimU(document.getElementById("ticketReadId")?.value ?? "");
      const argv = id ? ["ticket", "read", "--id", id] : ["ticket", "read"];
      await runAndShow({ argv });
    });

  document
    .getElementById("btnTicketUpdate")
    ?.addEventListener("click", async () => {
      const id = trimU(document.getElementById("ticketUpId")?.value ?? "");
      if (!id) {
        showResult({ error: "id required" });
        return;
      }
      const argv = ["ticket", "update", "--id", id];
      const title = trimU(
        document.getElementById("ticketUpTitle")?.value ?? "",
      );
      const body = document.getElementById("ticketUpBody")?.value ?? "";
      const status = trimU(
        document.getElementById("ticketUpStatus")?.value ?? "",
      );
      if (title !== undefined) argv.push("--title", title);
      if (body.trim()) argv.push("--body", body);
      if (status !== undefined) argv.push("--status", status);
      await runAndShow({ argv });
    });

  document
    .getElementById("btnTicketComment")
    ?.addEventListener("click", async () => {
      const id = trimU(document.getElementById("ticketCommentId")?.value ?? "");
      const body =
        document.getElementById("ticketCommentBody")?.value?.trim() ?? "";
      if (!id || !body) {
        showResult({ error: "ticket id and body required" });
        return;
      }
      await runAndShow({
        argv: ["ticket", "comment", "--id", id, "--body", body],
      });
    });

  document
    .getElementById("btnTicketDelete")
    ?.addEventListener("click", async () => {
      const id = trimU(document.getElementById("ticketDelId")?.value ?? "");
      if (!id) {
        showResult({ error: "id required" });
        return;
      }
      await runAndShow({ argv: ["ticket", "delete", "--id", id] });
    });

  document.getElementById("btnSync")?.addEventListener("click", async () => {
    const argv = ["sync"];
    if (document.getElementById("syncNoGithub")?.checked) {
      argv.push("--no-github");
    }
    await runAndShow({ argv });
  });

  document.getElementById("btnAudit")?.addEventListener("click", async () => {
    const argv = ["audit"];
    const limit = trimU(document.getElementById("auditLimit")?.value ?? "");
    const type = trimU(document.getElementById("auditType")?.value ?? "");
    const entity = trimU(document.getElementById("auditEntity")?.value ?? "");
    if (limit !== undefined) argv.push("--limit", limit);
    if (type !== undefined) argv.push("--type", type);
    if (entity !== undefined) argv.push("--entity-id", entity);
    await runAndShow({ argv });
  });

  document.getElementById("btnDoctor")?.addEventListener("click", async () => {
    await runAndShow({ argv: ["doctor"] });
  });

  document.getElementById("btnAdvRun")?.addEventListener("click", async () => {
    const raw = document.getElementById("advArgv")?.value ?? "";
    let argv;
    try {
      argv = JSON.parse(raw);
    } catch (e) {
      showResult({ error: "invalid JSON", detail: String(e) });
      return;
    }
    if (!Array.isArray(argv) || !argv.every((x) => typeof x === "string")) {
      showResult({ error: "expected JSON array of strings" });
      return;
    }
    await runAndShow({ argv });
  });
}

window.addEventListener("DOMContentLoaded", async () => {
  wire();
  const st = document.getElementById("status");
  try {
    const r = await fetch("/api/health");
    const j = await r.json();
    if (st) {
      st.textContent = `Repo: ${j.repoPath ?? "—"} · Temp parent: ${j.tempDirParent ?? "—"}`;
    }
  } catch (e) {
    if (st) {
      st.textContent = `Health check failed: ${String(e)}`;
    }
  }
});
