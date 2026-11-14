#!/usr/bin/env python3
"""Export this build's agent sessions for make.fun's transcript bundle.

The agent that built this entry (Hermes Agent, running on Android/Termux) keeps its session journal
in a SQLite database (~/.hermes/state.db). The kit's bundler can read Hermes session directories,
but that store is not one of the layouts it walks, so the sessions are exported here, unchanged in
content and order, as the SDK-style session files the bundler accepts:

    {"harness": ..., "model": ..., "messages": [{role, content, time, usage?}, ...]}

Rules followed (see the competition's deliverables):
  * messages are copied verbatim, in order, with their real timestamps;
  * token usage is recorded only on the session's final assistant message, because that is the only
    place the harness records the provider's cumulative counts for the session;
  * nothing is written, rebuilt or summarised by hand.
"""

import json
import os
import sqlite3
import sys
from datetime import datetime, timezone

DB = os.path.expanduser("~/.hermes/state.db")
# The session in which this entry was built, and the assistant reply that reported the previous
# stop; both are kept so the export is complete and traceable.
SESSION_IDS = ["20261114_075938_31151e", "20261114_023906_2a086ebc"]
HARNESS = "Hermes Agent 0.x (CLI)"
HANDOVER = (
    "Hermes Agent's session journal on Android/Termux lives in a SQLite database "
    "($HOME/.hermes/state.db), not in a session directory the make.fun bundler walks, so the "
    "sessions are exported from it verbatim; token usage is recorded only where the harness stores "
    "it, as the session's cumulative counts on its last assistant message."
)


def iso(ts):
    return datetime.fromtimestamp(ts, tz=timezone.utc).isoformat().replace("+00:00", "Z")


def export(con, sid, out_dir):
    row = con.execute(
        "select id, model, input_tokens, output_tokens, started_at, ended_at from sessions where id=?",
        (sid,),
    ).fetchone()
    if row is None:
        print(f"skip {sid}: not in the journal", file=sys.stderr)
        return None
    _, model, in_tok, out_tok, started, ended = row
    msgs = con.execute(
        "select role, content, tool_calls, tool_name, timestamp from messages "
        "where session_id=? order by id",
        (sid,),
    ).fetchall()
    out = []
    known = {"system", "developer", "user", "assistant", "tool", "function"}
    last_assistant = max(i for i, m in enumerate(msgs) if m[0] == "assistant")
    usage_given = False
    for i, (role, content, tool_calls, tool_name, ts) in enumerate(msgs):
        # The journal also records its own bookkeeping rows (session_meta, handoff, ...); those are
        # not conversation turns and a chat log has no role for them, so they are left out.
        if role not in known:
            continue
        text = content or ""
        if tool_calls:
            try:
                calls = json.loads(tool_calls)
                text += "\n" + json.dumps(calls, ensure_ascii=False)
            except Exception:
                text += "\n" + str(tool_calls)
        msg = {"role": role, "content": text, "timestamp": iso(ts)}
        if role == "assistant" and i == last_assistant and not usage_given and (in_tok or out_tok):
            msg["usage"] = {"input_tokens": in_tok or 0, "output_tokens": out_tok or 0}
            usage_given = True
        out.append(msg)
    doc = {
        "harness": HARNESS,
        "model": model,
        "handed_over": HANDOVER,
        "messages": out,
    }
    path = os.path.join(out_dir, f"session-{sid}.json")
    with open(path, "w", encoding="utf-8") as f:
        json.dump(doc, f, ensure_ascii=False, indent=1)
    print(f"wrote {path}: {len(out)} messages, model {model}, usage {'yes' if usage_given else 'no'}")
    return path


def main():
    out_dir = sys.argv[1] if len(sys.argv) > 1 else "sessions"
    os.makedirs(out_dir, exist_ok=True)
    con = sqlite3.connect(f"file:{DB}?mode=ro", uri=True)
    for sid in SESSION_IDS:
        export(con, sid, out_dir)


if __name__ == "__main__":
    main()
