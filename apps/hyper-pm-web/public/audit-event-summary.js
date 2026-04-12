"use strict";
var HyperPmAuditSummary = (() => {
  var __defProp = Object.defineProperty;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, { get: all[name], enumerable: true });
  };
  var __copyProps = (to, from, except, desc) => {
    if (from && typeof from === "object" || typeof from === "function") {
      for (let key of __getOwnPropNames(from))
        if (!__hasOwnProp.call(to, key) && key !== except)
          __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
    }
    return to;
  };
  var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

  // src/audit-event-summary.ts
  var audit_event_summary_exports = {};
  __export(audit_event_summary_exports, {
    summarizeAuditEventForWeb: () => summarizeAuditEventForWeb
  });
  var isRecord = (v) => typeof v === "object" && v !== null && !Array.isArray(v);
  var pickStr = (p, key) => {
    const v = p[key];
    return typeof v === "string" ? v : void 0;
  };
  var quoteStatus = (s) => JSON.stringify(s);
  var normalizeStrList = (raw) => {
    if (!Array.isArray(raw)) return [];
    return raw.filter((x) => typeof x === "string" && x.length > 0);
  };
  var branchesPhrase = (branches) => {
    const usable = branches.filter((b) => b.length > 0 && b.length <= 40);
    if (usable.length === 0 || usable.length > 3) {
      return "updated linked branches";
    }
    return `updated linked branches (${usable.join(", ")})`;
  };
  var workItemUpdateAspects = (kind, payload) => {
    const aspects = [];
    const idOnly = Object.keys(payload).filter((k) => k !== "id");
    if (idOnly.length === 0) {
      return [];
    }
    if (payload["status"] !== void 0) {
      aspects.push(
        `Status set to ${quoteStatus(String(payload["status"]))}.`
      );
    }
    if (kind === "ticket" && payload["assignee"] !== void 0) {
      const a = payload["assignee"];
      if (a === null) {
        aspects.push("Assignee cleared.");
      } else if (typeof a === "string" && a.length > 0) {
        aspects.push(`Assignee set to ${quoteStatus(a)}.`);
      }
    }
    if (kind === "ticket" && payload["storyId"] !== void 0) {
      aspects.push(`Story link: ${String(payload["storyId"])}.`);
    }
    if (kind === "ticket" && payload["branches"] !== void 0) {
      aspects.push(branchesPhrase(normalizeStrList(payload["branches"])));
    }
    if (kind === "ticket" && payload["labels"] !== void 0) {
      if (payload["labels"] === null) {
        aspects.push("Labels cleared.");
      } else {
        const lb = normalizeStrList(payload["labels"]);
        aspects.push(
          lb.length > 0 ? `Labels: ${lb.join(", ")}.` : "Labels cleared."
        );
      }
    }
    if (kind === "ticket" && payload["priority"] !== void 0) {
      aspects.push(
        payload["priority"] === null ? "Priority cleared." : `Priority: ${quoteStatus(String(payload["priority"]))}.`
      );
    }
    if (kind === "ticket" && payload["size"] !== void 0) {
      aspects.push(
        payload["size"] === null ? "Size cleared." : `Size: ${quoteStatus(String(payload["size"]))}.`
      );
    }
    if (kind === "ticket" && payload["estimate"] !== void 0) {
      aspects.push(
        payload["estimate"] === null ? "Estimate cleared." : `Estimate: ${String(payload["estimate"])}.`
      );
    }
    if (payload["title"] !== void 0) {
      aspects.push("Title changed.");
    }
    if (payload["body"] !== void 0) {
      aspects.push("Description updated.");
    }
    return aspects;
  };
  var EVENT_TITLE = {
    EpicCreated: "Epic created",
    EpicUpdated: "Epic updated",
    EpicDeleted: "Epic deleted",
    StoryCreated: "Story created",
    StoryUpdated: "Story updated",
    StoryDeleted: "Story deleted",
    TicketCreated: "Ticket created",
    TicketUpdated: "Ticket updated",
    TicketDeleted: "Ticket deleted",
    TicketCommentAdded: "Comment added",
    SyncCursor: "Sync cursor",
    GithubInboundUpdate: "GitHub inbound update",
    GithubIssueLinked: "GitHub issue linked",
    GithubPrActivity: "Pull request activity"
  };
  var summarizeAuditEventForWeb = (evt) => {
    if (!isRecord(evt)) {
      return { title: "Unknown event", detailLines: [] };
    }
    const type = typeof evt["type"] === "string" ? evt["type"] : "";
    const payload = isRecord(evt["payload"]) ? evt["payload"] : {};
    const title = EVENT_TITLE[type] ?? (type.length > 0 ? type : "Unknown event");
    const details = [];
    switch (type) {
      case "EpicUpdated":
        details.push(...workItemUpdateAspects("epic", payload));
        break;
      case "StoryUpdated":
        details.push(...workItemUpdateAspects("story", payload));
        break;
      case "TicketUpdated":
        details.push(...workItemUpdateAspects("ticket", payload));
        break;
      case "TicketCommentAdded": {
        const body = pickStr(payload, "body");
        if (body !== void 0 && body.trim().length > 0) {
          const one = body.trim().replace(/\s+/g, " ");
          details.push(
            one.length > 200 ? `${one.slice(0, 197).trimEnd()}\u2026` : one
          );
        }
        break;
      }
      case "GithubPrActivity": {
        const pr = payload["prNumber"];
        const kind = pickStr(payload, "kind");
        const prn = typeof pr === "number" ? String(pr) : String(pr ?? "");
        if (prn || kind) {
          details.push(
            [prn ? `PR #${prn}` : "", kind ?? ""].filter(Boolean).join(" \xB7 ")
          );
        }
        break;
      }
      case "GithubIssueLinked": {
        const n = payload["issueNumber"];
        if (typeof n === "number") {
          details.push(`Issue #${n}`);
        }
        break;
      }
      case "GithubInboundUpdate": {
        const parts = [];
        if (payload["title"] !== void 0) parts.push("title");
        if (payload["body"] !== void 0) parts.push("description");
        if (payload["status"] !== void 0) parts.push("status");
        if (parts.length > 0) {
          details.push(`Fields: ${parts.join(", ")}.`);
        }
        break;
      }
      case "SyncCursor": {
        const c = pickStr(payload, "cursor");
        if (c !== void 0) details.push(`Cursor: ${c}`);
        break;
      }
      default:
        break;
    }
    return { title, detailLines: details };
  };
  return __toCommonJS(audit_event_summary_exports);
})();
