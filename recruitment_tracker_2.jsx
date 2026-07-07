import { useState, useEffect, useCallback, useMemo } from "react";
import {
  Send, Reply, CalendarCheck2, FileSignature, CheckCircle2, Circle,
  Plus, ChevronLeft, ChevronRight, X, Save, ChevronDown, ChevronUp,
  Users, ClipboardList, CalendarDays, Trash2, GripHorizontal, Upload, ClipboardCheck,
  ListChecks, AlertTriangle, Check, XCircle, MinusCircle, Tag
} from "lucide-react";

/* ---------- constants ---------- */

const STAGES = [
  { key: "outreachSent", label: "Outreach sent", icon: Send, color: "var(--ochre)" },
  { key: "responded", label: "Responded", icon: Reply, color: "var(--slate)" },
  { key: "interviewConfirmed", label: "Interview confirmed", icon: CalendarCheck2, color: "var(--sage)" },
  { key: "ndaSent", label: "NDA sent", icon: FileSignature, color: "var(--rust)" },
  { key: "ndaSigned", label: "NDA signed", icon: CheckCircle2, color: "var(--ink)" },
];

const TIMEZONES = [
  "America/Los_Angeles", "America/Denver", "America/Chicago", "America/New_York",
  "America/Toronto", "Europe/London", "Europe/Berlin", "Europe/Madrid",
  "Asia/Kolkata", "Asia/Singapore", "Asia/Tokyo", "Australia/Sydney", "UTC",
];

const emptyParticipant = () => ({
  id: crypto.randomUUID(),
  name: "",
  email: "",
  timezone: "America/Los_Angeles",
  rankScore: 3,
  surveyNotes: "",
  screenerAnswers: {},
  outreachSent: { done: false, date: "" },
  responded: { done: false, date: "" },
  interviewConfirmed: { done: false, datetime: "" },
  ndaSent: { done: false, date: "" },
  ndaSigned: { done: false, date: "" },
});

const emptyCriteria = () => ({
  totalN: "",
  userTypes: "",
  stakeholderNotes: "",
  lastUpdated: "",
});

const emptyOption = () => ({ id: crypto.randomUUID(), label: "", rule: "qualifies" });
const emptyQuestion = (category = "screener") => ({
  id: crypto.randomUUID(),
  category, // "demographic" | "screener"
  allowMultiple: false, // false = select one, true = select all that apply
  segment: false, // true = use this question's answers to label/color calendar interviews
  text: "",
  options: [emptyOption()],
});

const SEGMENT_COLORS = ["#B0812C", "#5F7A5E", "#A24D3F", "#4A6FA5", "#7C5C97", "#8C6239", "#3E7C7C"];

// Normalizes an option's rule for the question's current answer mode.
// Select-one only knows "qualifies" / "disqualifies".
// Select-all-that-apply knows "must" / "disqualifies" / "may".
// Falls back gracefully for older saved data (a boolean `qualifies` field) and
// for options carrying a rule from the other answer mode.
function ruleFor(o, allowMultiple) {
  const raw = o.rule || (o.qualifies === false ? "disqualifies" : "qualifies");
  if (allowMultiple) {
    return raw === "must" || raw === "disqualifies" ? raw : "may";
  }
  return raw === "disqualifies" ? "disqualifies" : "qualifies";
}

/* ---------- bulk import parsing ---------- */
// Accepts pasted rows from a spreadsheet (tab-separated) or plain CSV (comma-separated).
// Expected column order: Name, Email, Timezone, [Rank score], Notes
// Rank score column is optional — if omitted, everything after Timezone is treated as Notes.
function parseBulkRows(text) {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length === 0) return [];

  let rows = lines.map((line) => {
    const delim = line.includes("\t") ? "\t" : ",";
    return line.split(delim).map((c) => c.trim());
  });

  // Skip an obvious header row, e.g. "Name, Email, Timezone, ..."
  if (rows.length > 1 && /^name$/i.test(rows[0][0] || "")) {
    rows = rows.slice(1);
  }

  return rows
    .map((cols) => {
      const [name = "", email = "", timezone = "", col4 = "", col5 = ""] = cols;
      let rankScore = 3;
      let notes = "";

      if (cols.length >= 5) {
        const parsedRank = Number(col4);
        rankScore = Number.isFinite(parsedRank) && parsedRank >= 1 && parsedRank <= 5 ? parsedRank : 3;
        notes = cols.slice(4).join(", ");
      } else {
        notes = col4 || "";
      }

      const base = emptyParticipant();
      return {
        ...base,
        name,
        email,
        timezone: timezone || base.timezone,
        rankScore,
        surveyNotes: notes,
      };
    })
    .filter((p) => p.name);
}

/* ---------- storage helpers ---------- */

async function loadKey(key, fallback) {
  try {
    const res = await window.storage.get(key, false);
    return res ? JSON.parse(res.value) : fallback;
  } catch {
    return fallback;
  }
}
async function saveKey(key, value) {
  try {
    await window.storage.set(key, JSON.stringify(value), false);
  } catch (e) {
    console.error("storage save failed", e);
  }
}

/* ---------- small ui atoms ---------- */

function Stamp({ label, active, color }) {
  return (
    <span
      className="stamp"
      style={{
        borderColor: active ? color : "var(--line)",
        color: active ? color : "var(--slate)",
        opacity: active ? 1 : 0.55,
      }}
    >
      {label}
    </span>
  );
}

function Field({ label, children }) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      {children}
    </label>
  );
}

/* ---------- Criteria Tab ---------- */

function CriteriaTab({ criteria, setCriteria }) {
  const [draft, setDraft] = useState(criteria);
  const [savedFlash, setSavedFlash] = useState(false);

  useEffect(() => setDraft(criteria), [criteria]);

  const save = () => {
    const updated = { ...draft, lastUpdated: new Date().toLocaleString() };
    setCriteria(updated);
    setSavedFlash(true);
    setTimeout(() => setSavedFlash(false), 1600);
  };

  return (
    <div className="panel-inner">
      <div className="panel-heading">
        <h2>Recruitment criteria</h2>
        <p className="subtle">
          The working agreement with stakeholders. Edit freely, then confirm to lock in the version everyone reviewed.
        </p>
      </div>

      <div className="criteria-grid">
        <Field label="Total N needed">
          <input
            type="number"
            min="0"
            value={draft.totalN}
            onChange={(e) => setDraft({ ...draft, totalN: e.target.value })}
            placeholder="e.g. 12"
          />
        </Field>

        <Field label="Participant types">
          <textarea
            rows={3}
            value={draft.userTypes}
            onChange={(e) => setDraft({ ...draft, userTypes: e.target.value })}
            placeholder="e.g. 6 power users (3+ yrs), 6 lapsed users (churned in last 90 days)"
          />
        </Field>

        <Field label="Notes from stakeholders">
          <textarea
            rows={5}
            value={draft.stakeholderNotes}
            onChange={(e) => setDraft({ ...draft, stakeholderNotes: e.target.value })}
            placeholder="Decisions, open questions, who signed off..."
          />
        </Field>
      </div>

      <div className="criteria-footer">
        <span className="subtle mono">
          {criteria.lastUpdated ? `Last confirmed ${criteria.lastUpdated}` : "Not yet confirmed"}
        </span>
        <button className="btn-primary" onClick={save}>
          <Save size={15} /> {savedFlash ? "Confirmed" : "Confirm with stakeholders"}
        </button>
      </div>
    </div>
  );
}

/* ---------- Participant Card ---------- */

function currentStageIndex(p) {
  let idx = -1;
  STAGES.forEach((s, i) => {
    if (p[s.key]?.done) idx = i;
  });
  return idx;
}

function ParticipantCard({ p, onChange, onDelete, timezoneOptions, screener = [] }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(() => structuredClone(p));

  // Keep the draft in sync if the committed participant changes for a reason
  // other than this card's own save (e.g. a fresh bulk import, or first load).
  useEffect(() => {
    setDraft(structuredClone(p));
  }, [p]);

  const dirty = JSON.stringify(draft) !== JSON.stringify(p);
  const stageIdx = currentStageIndex(draft);

  const flagged = screener
    .filter((q) => q.category === "screener")
    .some((q) => {
      const raw = draft.screenerAnswers?.[q.id];
      const selected = Array.isArray(raw) ? raw : raw ? [raw] : [];
      if (selected.length === 0) return false; // no answer yet — nothing to flag

      const anyDisqualifying = selected.some((label) => {
        const opt = q.options.find((o) => o.label === label);
        return opt && ruleFor(opt, q.allowMultiple) === "disqualifies";
      });
      if (anyDisqualifying) return true;

      if (q.allowMultiple) {
        const mustOptions = q.options.filter((o) => ruleFor(o, true) === "must");
        const missingMust = mustOptions.some((o) => !selected.includes(o.label));
        if (missingMust) return true;
      }
      return false;
    });

  const toggleStage = (key, extraField) => {
    const now = new Date();
    const current = draft[key];
    const done = !current.done;
    const patch = { ...current, done };
    if (extraField) {
      patch[extraField] = done ? (current[extraField] || (extraField === "datetime"
        ? now.toISOString().slice(0, 16)
        : now.toISOString().slice(0, 10))) : current[extraField];
    }
    setDraft({ ...draft, [key]: patch });
  };

  const save = () => {
    onChange(draft);
    setOpen(false);
  };
  const cancel = () => {
    setDraft(structuredClone(p));
    setOpen(false);
  };

  return (
    <div className="p-card">
      <div className="p-card-top" onClick={() => setOpen(!open)}>
        <div className="p-card-id">
          <span className="rank-badge" title="Rank score">{draft.rankScore}</span>
          <div>
            <div className="p-name">
              {draft.name || "Unnamed participant"}
              {flagged && (
                <span className="flag-badge" title="A screener answer on file does not qualify">
                  <AlertTriangle size={12} /> Flagged
                </span>
              )}
              {dirty && (
                <span className="unsaved-badge" title="You have unsaved changes on this participant">Unsaved</span>
              )}
            </div>
            <div className="subtle mono small">{draft.email || "no email set"} · {draft.timezone}</div>
          </div>
        </div>
        <div className="p-card-stages">
          {STAGES.map((s) => (
            <Stamp key={s.key} label={s.label} active={draft[s.key].done} color={s.color} />
          ))}
          {open ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </div>
      </div>

      {open && (
        <div className="p-card-body">
          <div className="p-edit-grid">
            <Field label="Name">
              <input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
            </Field>
            <Field label="Email">
              <input value={draft.email} onChange={(e) => setDraft({ ...draft, email: e.target.value })} />
            </Field>
            <Field label="Time zone">
              <select value={draft.timezone} onChange={(e) => setDraft({ ...draft, timezone: e.target.value })}>
                {(timezoneOptions || TIMEZONES).map((tz) => <option key={tz} value={tz}>{tz}</option>)}
              </select>
            </Field>
            <Field label="Rank score (1 worst – 5 best)">
              <input
                type="number" min="1" max="5"
                value={draft.rankScore}
                onChange={(e) => setDraft({ ...draft, rankScore: Number(e.target.value) })}
              />
            </Field>
          </div>

          <Field label="Recruitment survey response / notes">
            <textarea
              rows={3}
              value={draft.surveyNotes}
              onChange={(e) => setDraft({ ...draft, surveyNotes: e.target.value })}
              placeholder="Paste or summarize their survey answers here..."
            />
          </Field>

          {screener.length > 0 && (
            <div className="answer-grid">
              {screener.map((q) => (
                <ScreenerAnswerField
                  key={q.id}
                  q={q}
                  value={draft.screenerAnswers?.[q.id]}
                  onChange={(val) => setDraft({ ...draft, screenerAnswers: { ...draft.screenerAnswers, [q.id]: val } })}
                />
              ))}
            </div>
          )}

          <div className="interview-time-section">
            <Field label="Confirmed interview date & time">
              <input
                type="datetime-local"
                value={draft.interviewConfirmed.datetime}
                onChange={(e) => setDraft({
                  ...draft,
                  interviewConfirmed: { done: !!e.target.value, datetime: e.target.value },
                })}
              />
            </Field>
            <p className="subtle small" style={{ margin: "-8px 0 0" }}>
              Set this once a time is locked in — it'll show up automatically on the Calendar tab.
            </p>
          </div>

          <div className="stage-tracker">
            <div className="stage-row" onClick={() => toggleStage("outreachSent", "date")}>
              {draft.outreachSent.done ? <CheckCircle2 size={16} color="var(--sage)" /> : <Circle size={16} />}
              <span>Reached out to schedule interview</span>
              {draft.outreachSent.done && (
                <input
                  className="inline-date"
                  type="date"
                  value={draft.outreachSent.date}
                  onClick={(e) => e.stopPropagation()}
                  onChange={(e) => setDraft({ ...draft, outreachSent: { ...draft.outreachSent, date: e.target.value } })}
                />
              )}
            </div>

            <div className="stage-row" onClick={() => toggleStage("responded", "date")}>
              {draft.responded.done ? <CheckCircle2 size={16} color="var(--sage)" /> : <Circle size={16} />}
              <span>Responded back</span>
              {draft.responded.done && (
                <input
                  className="inline-date"
                  type="date"
                  value={draft.responded.date}
                  onClick={(e) => e.stopPropagation()}
                  onChange={(e) => setDraft({ ...draft, responded: { ...draft.responded, date: e.target.value } })}
                />
              )}
            </div>

            <div className="stage-row no-click">
              {draft.interviewConfirmed.done ? <CheckCircle2 size={16} color="var(--sage)" /> : <Circle size={16} />}
              <span>Interview date & time confirmed</span>
              <span className="subtle small" style={{ marginLeft: "auto" }}>set above</span>
            </div>

            <div className="stage-row" onClick={() => toggleStage("ndaSent", "date")}>
              {draft.ndaSent.done ? <CheckCircle2 size={16} color="var(--sage)" /> : <Circle size={16} />}
              <span>NDA sent</span>
              {draft.ndaSent.done && (
                <input
                  className="inline-date"
                  type="date"
                  value={draft.ndaSent.date}
                  onClick={(e) => e.stopPropagation()}
                  onChange={(e) => setDraft({ ...draft, ndaSent: { ...draft.ndaSent, date: e.target.value } })}
                />
              )}
            </div>

            <div className="stage-row" onClick={() => toggleStage("ndaSigned", "date")}>
              {draft.ndaSigned.done ? <CheckCircle2 size={16} color="var(--sage)" /> : <Circle size={16} />}
              <span>NDA signed</span>
              {draft.ndaSigned.done && (
                <input
                  className="inline-date"
                  type="date"
                  value={draft.ndaSigned.date}
                  onClick={(e) => e.stopPropagation()}
                  onChange={(e) => setDraft({ ...draft, ndaSigned: { ...draft.ndaSigned, date: e.target.value } })}
                />
              )}
            </div>
          </div>

          <div className="card-footer-actions">
            <button className="btn-ghost danger" onClick={() => onDelete(p.id)}>
              <Trash2 size={14} /> Remove participant
            </button>
            <div className="card-footer-save">
              {dirty ? (
                <>
                  <button className="btn-ghost" onClick={cancel}><X size={14} /> Discard</button>
                  <button className="btn-primary" onClick={save}>
                    <Save size={14} /> Save & minimize
                  </button>
                </>
              ) : (
                <button className="btn-ghost" onClick={() => setOpen(false)}>
                  <ChevronUp size={14} /> Minimize
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------- Screener Tab ---------- */

function QuestionCard({ q, onChange, onDelete }) {
  const updateOption = (optId, patch) => {
    onChange({ ...q, options: q.options.map((o) => (o.id === optId ? { ...o, ...patch } : o)) });
  };
  const addOption = () => onChange({ ...q, options: [...q.options, emptyOption()] });
  const removeOption = (optId) => onChange({ ...q, options: q.options.filter((o) => o.id !== optId) });

  return (
    <div className="q-card">
      <div className="q-card-top">
        <div className="toggle-row">
          <div className="cat-toggle">
            <button
              className={q.category === "demographic" ? "cat-btn active" : "cat-btn"}
              onClick={() => onChange({ ...q, category: "demographic" })}
            >
              Demographic
            </button>
            <button
              className={q.category === "screener" ? "cat-btn active" : "cat-btn"}
              onClick={() => onChange({ ...q, category: "screener" })}
            >
              Screener
            </button>
          </div>
          <div className="cat-toggle">
            <button
              className={!q.allowMultiple ? "cat-btn active" : "cat-btn"}
              onClick={() => onChange({ ...q, allowMultiple: false })}
            >
              Select one
            </button>
            <button
              className={q.allowMultiple ? "cat-btn active" : "cat-btn"}
              onClick={() => onChange({ ...q, allowMultiple: true })}
            >
              Select all that apply
            </button>
          </div>
          <button
            className={q.segment ? "segment-btn active" : "segment-btn"}
            onClick={() => onChange({ ...q, segment: !q.segment })}
            title="Label and color-code confirmed interviews on the Calendar tab by this question's answers"
          >
            <Tag size={12} /> {q.segment ? "Used for calendar segments" : "Use for calendar segments"}
          </button>
        </div>
        <button className="btn-ghost danger small-btn" onClick={() => onDelete(q.id)}>
          <Trash2 size={13} /> Remove question
        </button>
      </div>

      <input
        className="q-text-input"
        placeholder="Type the question, e.g. How often do you use the product?"
        value={q.text}
        onChange={(e) => onChange({ ...q, text: e.target.value })}
      />

      <div className="q-options">
        {q.options.map((o) => (
          <div key={o.id} className="q-option-row">
            <input
              placeholder="Answer option"
              value={o.label}
              onChange={(e) => updateOption(o.id, { label: e.target.value })}
            />
            {q.category === "screener" && !q.allowMultiple && (
              <button
                className={ruleFor(o, false) === "qualifies" ? "qualify-btn qualifies" : "qualify-btn disqualifies"}
                onClick={() => updateOption(o.id, { rule: ruleFor(o, false) === "qualifies" ? "disqualifies" : "qualifies" })}
                title={ruleFor(o, false) === "qualifies" ? "Marked as qualifying" : "Marked as does not qualify"}
              >
                {ruleFor(o, false) === "qualifies" ? <Check size={13} /> : <XCircle size={13} />}
                {ruleFor(o, false) === "qualifies" ? "Qualifies" : "Disqualifies"}
              </button>
            )}
            {q.category === "screener" && q.allowMultiple && (
              <div className="rule-toggle">
                <button
                  className={ruleFor(o, true) === "must" ? "qualify-btn rule-must active" : "qualify-btn rule-must"}
                  onClick={() => updateOption(o.id, { rule: "must" })}
                  title="Participant must select this option to qualify"
                >
                  <Check size={13} /> Must select
                </button>
                <button
                  className={ruleFor(o, true) === "disqualifies" ? "qualify-btn rule-disqualify active" : "qualify-btn rule-disqualify"}
                  onClick={() => updateOption(o.id, { rule: "disqualifies" })}
                  title="Selecting this disqualifies the participant"
                >
                  <XCircle size={13} /> Disqualifies
                </button>
                <button
                  className={ruleFor(o, true) === "may" ? "qualify-btn rule-may active" : "qualify-btn rule-may"}
                  onClick={() => updateOption(o.id, { rule: "may" })}
                  title="Selecting this has no effect on qualification"
                >
                  May select
                </button>
              </div>
            )}
            <button className="icon-btn" onClick={() => removeOption(o.id)} title="Remove option">
              <MinusCircle size={15} />
            </button>
          </div>
        ))}
        <button className="btn-ghost small-btn" onClick={addOption}><Plus size={13} /> Add option</button>
      </div>
    </div>
  );
}

function ScreenerTab({ screener, setScreener }) {
  const updateOne = (updated) => {
    let next = screener.map((q) => (q.id === updated.id ? updated : q));
    if (updated.segment) {
      next = next.map((q) => (q.id === updated.id ? q : { ...q, segment: false }));
    }
    setScreener(next);
  };
  const deleteOne = (id) => setScreener(screener.filter((q) => q.id !== id));
  const addQuestion = (category) => setScreener([...screener, emptyQuestion(category)]);

  const demographic = screener.filter((q) => q.category === "demographic");
  const screenerQs = screener.filter((q) => q.category === "screener");

  return (
    <div className="panel-inner">
      <div className="panel-heading">
        <h2>Screener & demographic questions</h2>
        <p className="subtle">
          Lay out the questions from your recruitment survey and the answer options for each. Mark which
          screener answers actually qualify someone — those show up when you're adding participants to the roster.
          Flag one question with "Use for calendar segments" (e.g. an age range question) to label and
          color-code confirmed interviews by that answer on the Calendar tab.
        </p>
      </div>

      <div className="q-section">
        <div className="q-section-head">
          <h3>Demographic questions</h3>
          <span className="subtle small">Background info — no right or wrong answer</span>
        </div>
        {demographic.length === 0 && <p className="subtle empty-note">No demographic questions yet.</p>}
        <div className="q-list">
          {demographic.map((q) => <QuestionCard key={q.id} q={q} onChange={updateOne} onDelete={deleteOne} />)}
        </div>
        <button className="btn-ghost" onClick={() => addQuestion("demographic")}>
          <Plus size={14} /> Add demographic question
        </button>
      </div>

      <div className="q-section">
        <div className="q-section-head">
          <h3>Screener questions</h3>
          <span className="subtle small">Mark each answer as qualifying or disqualifying</span>
        </div>
        {screenerQs.length === 0 && <p className="subtle empty-note">No screener questions yet.</p>}
        <div className="q-list">
          {screenerQs.map((q) => <QuestionCard key={q.id} q={q} onChange={updateOne} onDelete={deleteOne} />)}
        </div>
        <button className="btn-ghost" onClick={() => addQuestion("screener")}>
          <Plus size={14} /> Add screener question
        </button>
      </div>
    </div>
  );
}

/* ---------- Screener answer field (shared by add-form and card) ---------- */

function ScreenerAnswerField({ q, value, onChange }) {
  if (q.allowMultiple) {
    const selected = Array.isArray(value) ? value : value ? [value] : [];
    return (
      <Field label={q.text || "Untitled question"}>
        <div className="check-group">
          {q.options.map((o) => {
            const isChecked = selected.includes(o.label);
            const rule = ruleFor(o, true);
            const bad = q.category === "screener" && rule === "disqualifies" && isChecked;
            const suffix =
              q.category !== "screener" ? "" :
              rule === "disqualifies" ? " — disqualifies" :
              rule === "must" ? " — must select to qualify" : "";
            return (
              <label key={o.id} className={bad ? "check-row check-bad" : "check-row"}>
                <input
                  type="checkbox"
                  checked={isChecked}
                  onChange={() => {
                    const next = isChecked ? selected.filter((l) => l !== o.label) : [...selected, o.label];
                    onChange(next);
                  }}
                />
                <span>{o.label}{suffix}</span>
              </label>
            );
          })}
        </div>
      </Field>
    );
  }

  const opt = q.options.find((o) => o.label === value);
  const bad = q.category === "screener" && opt && ruleFor(opt, false) === "disqualifies";
  return (
    <Field label={q.text || "Untitled question"}>
      <select value={typeof value === "string" ? value : ""} className={bad ? "select-bad" : ""} onChange={(e) => onChange(e.target.value)}>
        <option value="">— no answer —</option>
        {q.options.map((o) => (
          <option key={o.id} value={o.label}>
            {o.label}{q.category === "screener" && ruleFor(o, false) === "disqualifies" ? " — does not qualify" : ""}
          </option>
        ))}
      </select>
    </Field>
  );
}

function RosterTab({ participants, setParticipants, screener }) {
  const [showForm, setShowForm] = useState(false);
  const [showBulk, setShowBulk] = useState(false);
  const [bulkText, setBulkText] = useState("");
  const [draft, setDraft] = useState(emptyParticipant());
  const [filter, setFilter] = useState("all");

  const timezoneOptions = useMemo(
    () => Array.from(new Set([...TIMEZONES, ...participants.map((p) => p.timezone).filter(Boolean)])),
    [participants]
  );

  const bulkPreview = useMemo(() => parseBulkRows(bulkText), [bulkText]);

  const confirmBulkImport = () => {
    if (bulkPreview.length === 0) return;
    setParticipants([...participants, ...bulkPreview]);
    setBulkText("");
    setShowBulk(false);
  };

  const updateOne = (updated) => {
    setParticipants(participants.map((p) => (p.id === updated.id ? updated : p)));
  };
  const deleteOne = (id) => setParticipants(participants.filter((p) => p.id !== id));

  const addOne = () => {
    if (!draft.name.trim()) return;
    setParticipants([...participants, draft]);
    setDraft(emptyParticipant());
    setShowForm(false);
  };

  // Priority group: 0 = interview confirmed, 1 = responded, 2 = outreach sent, 3 = not yet contacted.
  const groupOf = (p) => {
    if (p.interviewConfirmed.done && p.interviewConfirmed.datetime) return 0;
    if (p.responded.done) return 1;
    if (p.outreachSent.done) return 2;
    return 3;
  };

  const sorted = useMemo(
    () =>
      [...participants].sort((a, b) => {
        const ga = groupOf(a);
        const gb = groupOf(b);
        if (ga !== gb) return ga - gb;
        if (ga === 0) {
          // Within confirmed interviews, earliest date/time first.
          return new Date(a.interviewConfirmed.datetime) - new Date(b.interviewConfirmed.datetime);
        }
        // Otherwise, best-ranked participants first.
        return b.rankScore - a.rankScore;
      }),
    [participants]
  );

  const filtered = sorted.filter((p) => {
    if (filter === "all") return true;
    const idx = currentStageIndex(p);
    const stageOrder = ["none", ...STAGES.map((s) => s.key)];
    return stageOrder[idx + 1] === filter;
  });

  return (
    <div className="panel-inner">
      <div className="panel-heading roster-heading">
        <div>
          <h2>Eligible participants</h2>
          <p className="subtle">Ranked best → worst. Click a card to log outreach, responses, and NDA status.</p>
        </div>
        <div className="roster-actions">
          <button className="btn-ghost" onClick={() => { setShowBulk(!showBulk); setShowForm(false); }}>
            <Upload size={15} /> Bulk import
          </button>
          <button className="btn-primary" onClick={() => { setShowForm(!showForm); setShowBulk(false); }}>
            <Plus size={15} /> Add participant
          </button>
        </div>
      </div>

      {showBulk && (
        <div className="add-form">
          <p className="subtle" style={{ marginBottom: 10 }}>
            Copy rows straight from a spreadsheet (Google Sheets, Excel) or a survey export, then paste below.
            One row per participant, in this column order: <b>Name, Email, Timezone, Notes</b> — or include a
            rank score before the notes: <b>Name, Email, Timezone, Rank (1–5), Notes</b>. A header row is fine,
            it'll be skipped automatically.
          </p>
          <textarea
            rows={6}
            placeholder={"Jamie Chen\tjamie@email.com\tAmerica/New_York\tUses the app daily, power user\nAlex Rivera\talex@email.com\tEurope/London\t4\tChurned after 2 months"}
            value={bulkText}
            onChange={(e) => setBulkText(e.target.value)}
          />
          {bulkText.trim().length > 0 && (
            <div className="bulk-preview">
              <div className="subtle mono small" style={{ marginBottom: 8 }}>
                <ClipboardCheck size={13} style={{ verticalAlign: "-2px", marginRight: 4 }} />
                {bulkPreview.length} participant{bulkPreview.length === 1 ? "" : "s"} detected
              </div>
              {bulkPreview.length > 0 && (
                <div className="bulk-preview-table">
                  {bulkPreview.map((p, i) => (
                    <div key={i} className="bulk-preview-row">
                      <span className="p-name">{p.name}</span>
                      <span className="subtle small">{p.email || "no email"}</span>
                      <span className="subtle small mono">{p.timezone}</span>
                      <span className="subtle small">{p.surveyNotes ? p.surveyNotes.slice(0, 40) : "—"}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
          <div className="add-form-actions">
            <button className="btn-ghost" onClick={() => { setShowBulk(false); setBulkText(""); }}>
              <X size={14} /> Cancel
            </button>
            <button className="btn-primary" disabled={bulkPreview.length === 0} onClick={confirmBulkImport}>
              <Plus size={14} /> Import {bulkPreview.length > 0 ? bulkPreview.length : ""} participant{bulkPreview.length === 1 ? "" : "s"}
            </button>
          </div>
        </div>
      )}

      <div className="filter-row">
        <button className={filter === "all" ? "chip active" : "chip"} onClick={() => setFilter("all")}>All ({participants.length})</button>
        {STAGES.map((s) => (
          <button
            key={s.key}
            className={filter === s.key ? "chip active" : "chip"}
            onClick={() => setFilter(s.key)}
          >
            {s.label} ({participants.filter((p) => p[s.key].done).length})
          </button>
        ))}
      </div>

      {showForm && (
        <div className="add-form">
          <div className="p-edit-grid">
            <Field label="Name">
              <input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
            </Field>
            <Field label="Email">
              <input value={draft.email} onChange={(e) => setDraft({ ...draft, email: e.target.value })} />
            </Field>
            <Field label="Time zone">
              <select value={draft.timezone} onChange={(e) => setDraft({ ...draft, timezone: e.target.value })}>
                {timezoneOptions.map((tz) => <option key={tz} value={tz}>{tz}</option>)}
              </select>
            </Field>
            <Field label="Rank score (1–5)">
              <input type="number" min="1" max="5" value={draft.rankScore}
                onChange={(e) => setDraft({ ...draft, rankScore: Number(e.target.value) })} />
            </Field>
          </div>
          <Field label="Survey response / notes">
            <textarea rows={2} value={draft.surveyNotes}
              onChange={(e) => setDraft({ ...draft, surveyNotes: e.target.value })} />
          </Field>
          {screener.length > 0 && (
            <div className="answer-grid">
              {screener.map((q) => (
                <ScreenerAnswerField
                  key={q.id}
                  q={q}
                  value={draft.screenerAnswers[q.id]}
                  onChange={(val) => setDraft({ ...draft, screenerAnswers: { ...draft.screenerAnswers, [q.id]: val } })}
                />
              ))}
            </div>
          )}
          <div className="add-form-actions">
            <button className="btn-ghost" onClick={() => setShowForm(false)}><X size={14} /> Cancel</button>
            <button className="btn-primary" onClick={addOne}><Plus size={14} /> Add to roster</button>
          </div>
        </div>
      )}

      <div className="card-list">
        {filtered.length === 0 && <p className="subtle empty-note">No participants in this view yet.</p>}
        {filtered.map((p) => (
          <ParticipantCard key={p.id} p={p} onChange={updateOne} onDelete={deleteOne} timezoneOptions={timezoneOptions} screener={screener} />
        ))}
      </div>
    </div>
  );
}

/* ---------- Calendar Tab ---------- */

function ParticipantDetailPanel({ p, screener, onClose, segmentLabel, segmentDotColor }) {
  const flagged = screener
    .filter((q) => q.category === "screener")
    .some((q) => {
      const raw = p.screenerAnswers?.[q.id];
      const selected = Array.isArray(raw) ? raw : raw ? [raw] : [];
      if (selected.length === 0) return false;
      const anyDisqualifying = selected.some((label) => {
        const opt = q.options.find((o) => o.label === label);
        return opt && ruleFor(opt, q.allowMultiple) === "disqualifies";
      });
      if (anyDisqualifying) return true;
      if (q.allowMultiple) {
        const mustOptions = q.options.filter((o) => ruleFor(o, true) === "must");
        return mustOptions.some((o) => !selected.includes(o.label));
      }
      return false;
    });

  return (
    <div className="detail-panel">
      <div className="detail-panel-top">
        <div>
          <div className="p-name">
            {p.name || "Unnamed participant"}
            {flagged && (
              <span className="flag-badge" title="A screener answer on file does not qualify">
                <AlertTriangle size={12} /> Flagged
              </span>
            )}
          </div>
          <div className="subtle mono small">{p.email || "no email set"} · {p.timezone}</div>
        </div>
        <button className="icon-btn" onClick={onClose} title="Close"><X size={18} /></button>
      </div>

      <div className="detail-stamps">
        {STAGES.map((s) => <Stamp key={s.key} label={s.label} active={p[s.key].done} color={s.color} />)}
      </div>

      <div className="detail-grid">
        <div>
          <div className="field-label">Rank score</div>
          <div className="detail-value">{p.rankScore} / 5</div>
        </div>
        <div>
          <div className="field-label">Interview</div>
          <div className="detail-value mono">
            {p.interviewConfirmed.datetime
              ? new Date(p.interviewConfirmed.datetime).toLocaleString(undefined, {
                  weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
                })
              : "—"}
          </div>
        </div>
        {segmentLabel && (
          <div>
            <div className="field-label">Segment</div>
            <div className="detail-value">
              <span className="segment-chip"><span className="segment-dot" style={{ background: segmentDotColor }} />{segmentLabel}</span>
            </div>
          </div>
        )}
      </div>

      {p.surveyNotes && (
        <div className="detail-block">
          <div className="field-label">Survey response / notes</div>
          <p className="detail-notes">{p.surveyNotes}</p>
        </div>
      )}

      {screener.length > 0 && (
        <div className="detail-block">
          <div className="field-label">Screener & demographic answers</div>
          <div className="detail-answers">
            {screener.map((q) => {
              const raw = p.screenerAnswers?.[q.id];
              const selected = Array.isArray(raw) ? raw : raw ? [raw] : [];
              const bad = q.category === "screener" && selected.some((label) => {
                const opt = q.options.find((o) => o.label === label);
                return opt && ruleFor(opt, q.allowMultiple) === "disqualifies";
              });
              return (
                <div key={q.id} className={bad ? "detail-answer-row detail-answer-bad" : "detail-answer-row"}>
                  <span className="subtle small">{q.text || "Untitled question"}</span>
                  <span className="detail-answer-value">{selected.length > 0 ? selected.join(", ") : "— no answer —"}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function CalendarTab({ participants, screener = [] }) {
  const [cursor, setCursor] = useState(new Date());
  const [selectedId, setSelectedId] = useState(null);

  const confirmed = participants.filter((p) => p.interviewConfirmed.done && p.interviewConfirmed.datetime);
  const selectedParticipant = confirmed.find((p) => p.id === selectedId) || null;

  const segmentQuestion = screener.find((q) => q.segment) || null;
  const getSegment = (p) => {
    if (!segmentQuestion) return null;
    const raw = p.screenerAnswers?.[segmentQuestion.id];
    const arr = Array.isArray(raw) ? raw : raw ? [raw] : [];
    return arr.length > 0 ? arr.join(", ") : "Unspecified";
  };
  const segmentLabels = segmentQuestion
    ? Array.from(new Set(confirmed.map((p) => getSegment(p))))
    : [];
  const segmentColor = (label) => {
    const idx = segmentLabels.indexOf(label);
    return SEGMENT_COLORS[idx >= 0 ? idx % SEGMENT_COLORS.length : 0];
  };

  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const firstDay = new Date(year, month, 1);
  const startWeekday = firstDay.getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const byDay = {};
  confirmed.forEach((p) => {
    const d = new Date(p.interviewConfirmed.datetime);
    if (d.getFullYear() === year && d.getMonth() === month) {
      const day = d.getDate();
      byDay[day] = byDay[day] || [];
      byDay[day].push(p);
    }
  });

  const cells = [];
  for (let i = 0; i < startWeekday; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  const monthLabel = cursor.toLocaleDateString(undefined, { month: "long", year: "numeric" });

  const upcoming = [...confirmed].sort(
    (a, b) => new Date(a.interviewConfirmed.datetime) - new Date(b.interviewConfirmed.datetime)
  );

  return (
    <div className="panel-inner">
      <div className="panel-heading">
        <h2>Confirmed interviews</h2>
        <p className="subtle">Every participant with a locked interview date and time.</p>
        {segmentQuestion && segmentLabels.length > 0 && (
          <div className="segment-legend">
            <span className="subtle small mono">Segment: {segmentQuestion.text || "Untitled question"}</span>
            <div className="segment-legend-items">
              {segmentLabels.map((label) => (
                <span key={label} className="segment-chip">
                  <span className="segment-dot" style={{ background: segmentColor(label) }} />
                  {label}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="cal-shell">
        <div className="cal-grid-wrap">
          <div className="cal-nav">
            <button className="btn-ghost" onClick={() => setCursor(new Date(year, month - 1, 1))}><ChevronLeft size={16} /></button>
            <span className="mono">{monthLabel}</span>
            <button className="btn-ghost" onClick={() => setCursor(new Date(year, month + 1, 1))}><ChevronRight size={16} /></button>
          </div>
          <div className="cal-grid">
            {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => (
              <div key={i} className="cal-dow">{d}</div>
            ))}
            {cells.map((day, i) => (
              <div key={i} className={`cal-cell ${day ? "" : "empty"}`}>
                {day && (
                  <>
                    <span className="cal-daynum">{day}</span>
                    {byDay[day]?.map((p) => (
                      <div
                        key={p.id}
                        className={selectedId === p.id ? "cal-pill selected" : "cal-pill"}
                        style={segmentQuestion ? { background: segmentColor(getSegment(p)) } : undefined}
                        title={segmentQuestion ? `${p.name} · ${getSegment(p)}` : p.name}
                        onClick={() => setSelectedId(selectedId === p.id ? null : p.id)}
                      >
                        {p.name.split(" ")[0]}
                      </div>
                    ))}
                  </>
                )}
              </div>
            ))}
          </div>
        </div>

        <div className="cal-list">
          <h3>Upcoming, in order</h3>
          {upcoming.length === 0 && <p className="subtle empty-note">No interviews confirmed yet.</p>}
          {upcoming.map((p) => (
            <div
              key={p.id}
              className={selectedId === p.id ? "cal-list-row selected" : "cal-list-row"}
              onClick={() => setSelectedId(selectedId === p.id ? null : p.id)}
            >
              <div className="cal-list-date mono">
                {new Date(p.interviewConfirmed.datetime).toLocaleString(undefined, {
                  month: "short", day: "numeric", hour: "numeric", minute: "2-digit"
                })}
              </div>
              <div>
                <div className="p-name">{p.name}</div>
                <div className="subtle small mono">{p.timezone}</div>
              </div>
              {segmentQuestion && (
                <span className="segment-chip">
                  <span className="segment-dot" style={{ background: segmentColor(getSegment(p)) }} />
                  {getSegment(p)}
                </span>
              )}
              <Stamp label={p.ndaSigned.done ? "NDA signed" : p.ndaSent.done ? "NDA pending" : "NDA not sent"}
                active color={p.ndaSigned.done ? "var(--sage)" : p.ndaSent.done ? "var(--rust)" : "var(--slate)"} />
            </div>
          ))}
        </div>
      </div>

      {selectedParticipant && (
        <ParticipantDetailPanel
          p={selectedParticipant}
          screener={screener}
          onClose={() => setSelectedId(null)}
          segmentLabel={segmentQuestion ? getSegment(selectedParticipant) : null}
          segmentDotColor={segmentQuestion ? segmentColor(getSegment(selectedParticipant)) : null}
        />
      )}
    </div>
  );
}

/* ---------- App ---------- */

export default function App() {
  const [tab, setTab] = useState("criteria");
  const [criteria, setCriteriaState] = useState(emptyCriteria());
  const [screener, setScreenerState] = useState([]);
  const [participants, setParticipantsState] = useState([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    (async () => {
      const c = await loadKey("recruitment:criteria", emptyCriteria());
      const s = await loadKey("recruitment:screener", []);
      const p = await loadKey("recruitment:participants", []);
      setCriteriaState(c);
      setScreenerState(s);
      setParticipantsState(p);
      setLoaded(true);
    })();
  }, []);

  const setCriteria = useCallback((c) => {
    setCriteriaState(c);
    saveKey("recruitment:criteria", c);
  }, []);

  const setScreener = useCallback((s) => {
    setScreenerState(s);
    saveKey("recruitment:screener", s);
  }, []);

  const setParticipants = useCallback((p) => {
    setParticipantsState(p);
    saveKey("recruitment:participants", p);
  }, []);

  const tabs = [
    { key: "criteria", label: "Criteria", icon: ClipboardList },
    { key: "screener", label: "Screener", icon: ListChecks },
    { key: "roster", label: "Roster", icon: Users },
    { key: "calendar", label: "Calendar", icon: CalendarDays },
  ];

  return (
    <div className="app-shell">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Lora:wght@500;600;700&family=Inter:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500&display=swap');

        :root {
          --ink: #23303B;
          --parchment: #ECE7DA;
          --paper: #F8F5EC;
          --ochre: #B0812C;
          --rust: #A24D3F;
          --sage: #5F7A5E;
          --slate: #63707A;
          --line: #D9D0BC;
        }
        .app-shell {
          background: var(--parchment);
          min-height: 100vh;
          font-family: 'Inter', sans-serif;
          color: var(--ink);
          padding: 32px 24px 60px;
        }
        .mono { font-family: 'IBM Plex Mono', monospace; }
        .subtle { color: var(--slate); font-size: 13.5px; line-height: 1.5; }
        .small { font-size: 12px; }

        .header {
          max-width: 980px;
          margin: 0 auto 8px;
        }
        .header h1 {
          font-family: 'Lora', serif;
          font-weight: 600;
          font-size: 28px;
          margin: 0 0 4px;
          letter-spacing: -0.01em;
        }
        .header p { margin: 0; }

        .tab-bar {
          max-width: 980px;
          margin: 24px auto 0;
          display: flex;
          gap: 4px;
        }
        .tab-btn {
          font-family: 'IBM Plex Mono', monospace;
          font-size: 12.5px;
          letter-spacing: 0.03em;
          text-transform: uppercase;
          padding: 10px 18px 12px;
          background: #E3DCC9;
          border: 1px solid var(--line);
          border-bottom: none;
          border-radius: 8px 8px 0 0;
          color: var(--slate);
          cursor: pointer;
          display: flex;
          align-items: center;
          gap: 6px;
          transform: translateY(2px);
        }
        .tab-btn.active {
          background: var(--paper);
          color: var(--ink);
          transform: translateY(0);
          box-shadow: 0 -2px 0 rgba(0,0,0,0.02);
        }

        .panel {
          max-width: 980px;
          margin: 0 auto;
          background: var(--paper);
          border: 1px solid var(--line);
          border-radius: 0 10px 10px 10px;
          box-shadow: 0 8px 24px rgba(35,48,59,0.06);
        }
        .panel-inner { padding: 28px 32px 36px; }
        .panel-heading h2 {
          font-family: 'Lora', serif;
          font-size: 21px;
          font-weight: 600;
          margin: 0 0 4px;
        }
        .panel-heading p { margin: 0 0 20px; }
        .roster-heading { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; }

        .field { display: flex; flex-direction: column; gap: 5px; margin-bottom: 14px; }
        .field-label {
          font-family: 'IBM Plex Mono', monospace;
          font-size: 11px;
          text-transform: uppercase;
          letter-spacing: 0.04em;
          color: var(--slate);
        }
        input, textarea, select {
          font-family: 'Inter', sans-serif;
          font-size: 14px;
          padding: 8px 10px;
          border: 1px solid var(--line);
          border-radius: 6px;
          background: #FBF9F3;
          color: var(--ink);
          resize: vertical;
        }
        input:focus, textarea:focus, select:focus {
          outline: 2px solid var(--ochre);
          outline-offset: 1px;
        }

        .criteria-grid { max-width: 640px; }
        .criteria-footer {
          display: flex;
          align-items: center;
          justify-content: space-between;
          border-top: 1px solid var(--line);
          padding-top: 16px;
          margin-top: 8px;
        }

        .btn-primary {
          font-family: 'Inter', sans-serif;
          font-weight: 600;
          font-size: 13.5px;
          background: var(--ink);
          color: var(--paper);
          border: none;
          border-radius: 6px;
          padding: 9px 16px;
          display: inline-flex;
          align-items: center;
          gap: 6px;
          cursor: pointer;
        }
        .btn-ghost {
          font-family: 'Inter', sans-serif;
          font-size: 13px;
          background: transparent;
          border: 1px solid var(--line);
          border-radius: 6px;
          padding: 7px 12px;
          display: inline-flex;
          align-items: center;
          gap: 6px;
          cursor: pointer;
          color: var(--ink);
        }
        .btn-ghost.danger { color: var(--rust); border-color: var(--rust); }
        .card-footer-actions .btn-ghost.danger { margin-top: 0; }

        .filter-row { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 20px; }
        .chip {
          font-family: 'IBM Plex Mono', monospace;
          font-size: 11.5px;
          border: 1px solid var(--line);
          background: transparent;
          border-radius: 20px;
          padding: 5px 12px;
          cursor: pointer;
          color: var(--slate);
        }
        .chip.active { background: var(--ink); color: var(--paper); border-color: var(--ink); }

        .add-form {
          border: 1px dashed var(--line);
          border-radius: 8px;
          padding: 18px 20px 10px;
          margin-bottom: 20px;
          background: #FBF9F3;
        }
        .add-form-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 6px; }
        .roster-actions { display: flex; gap: 8px; flex-shrink: 0; }
        .btn-primary:disabled { opacity: 0.45; cursor: not-allowed; }
        .bulk-preview {
          border: 1px solid var(--line);
          border-radius: 6px;
          background: var(--paper);
          padding: 10px 12px;
          margin-top: 10px;
          max-height: 220px;
          overflow-y: auto;
        }
        .bulk-preview-row {
          display: grid;
          grid-template-columns: 1.1fr 1.3fr 1.1fr 1.5fr;
          gap: 10px;
          padding: 5px 0;
          border-bottom: 1px solid var(--line);
          align-items: center;
        }
        .bulk-preview-row:last-child { border-bottom: none; }

        .q-section { margin-bottom: 28px; }
        .q-section-head {
          display: flex;
          align-items: baseline;
          justify-content: space-between;
          margin-bottom: 12px;
        }
        .q-section-head h3 {
          font-family: 'Lora', serif;
          font-size: 16px;
          margin: 0;
        }
        .q-list { display: flex; flex-direction: column; gap: 12px; margin-bottom: 12px; }
        .q-card {
          border: 1px solid var(--line);
          border-radius: 8px;
          background: #FBF9F3;
          padding: 14px 16px;
        }
        .q-card-top { display: flex; align-items: flex-start; justify-content: space-between; margin-bottom: 10px; gap: 12px; flex-wrap: wrap; }
        .toggle-row { display: flex; gap: 10px; flex-wrap: wrap; }
        .cat-toggle { display: flex; gap: 4px; }
        .cat-btn {
          font-family: 'IBM Plex Mono', monospace;
          font-size: 10.5px;
          text-transform: uppercase;
          letter-spacing: 0.03em;
          border: 1px solid var(--line);
          background: transparent;
          border-radius: 14px;
          padding: 4px 10px;
          cursor: pointer;
          color: var(--slate);
        }
        .cat-btn.active { background: var(--ink); color: var(--paper); border-color: var(--ink); }
        .segment-btn {
          font-family: 'IBM Plex Mono', monospace;
          font-size: 10.5px;
          text-transform: uppercase;
          letter-spacing: 0.03em;
          border: 1px solid var(--line);
          background: transparent;
          border-radius: 14px;
          padding: 4px 10px;
          cursor: pointer;
          color: var(--slate);
          display: inline-flex;
          align-items: center;
          gap: 5px;
        }
        .segment-btn.active { background: rgba(176,129,44,0.12); color: var(--ochre); border-color: var(--ochre); }
        .segment-legend { margin-top: 12px; }
        .segment-legend-items { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 6px; }
        .segment-chip {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          font-size: 12px;
          border: 1px solid var(--line);
          border-radius: 20px;
          padding: 3px 10px;
          white-space: nowrap;
        }
        .segment-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
        .small-btn { font-size: 12px; padding: 5px 10px; }
        .q-text-input {
          width: 100%;
          font-family: 'Inter', sans-serif;
          font-weight: 600;
          font-size: 14.5px;
          border: none;
          border-bottom: 1px solid var(--line);
          background: transparent;
          padding: 4px 2px 8px;
          margin-bottom: 10px;
        }
        .q-text-input:focus { outline: none; border-bottom-color: var(--ochre); }
        .q-options { display: flex; flex-direction: column; gap: 8px; }
        .q-option-row { display: flex; align-items: center; gap: 8px; }
        .q-option-row input { flex: 1; padding: 6px 9px; font-size: 13px; }
        .qualify-btn {
          font-family: 'IBM Plex Mono', monospace;
          font-size: 10.5px;
          text-transform: uppercase;
          border-radius: 5px;
          padding: 5px 8px;
          display: inline-flex;
          align-items: center;
          gap: 4px;
          cursor: pointer;
          border: 1px solid var(--line);
          white-space: nowrap;
          background: transparent;
          color: var(--slate);
          opacity: 0.55;
        }
        .qualify-btn.active,
        .qualify-btn.qualifies,
        .qualify-btn.disqualifies { opacity: 1; }
        .qualify-btn.qualifies { color: var(--sage); border-color: var(--sage); background: rgba(95,122,94,0.08); }
        .qualify-btn.disqualifies { color: var(--rust); border-color: var(--rust); background: rgba(162,77,63,0.08); }
        .qualify-btn.rule-must.active { color: var(--sage); border-color: var(--sage); background: rgba(95,122,94,0.08); }
        .qualify-btn.rule-disqualify.active { color: var(--rust); border-color: var(--rust); background: rgba(162,77,63,0.08); }
        .qualify-btn.rule-may.active { color: var(--ochre); border-color: var(--ochre); background: rgba(176,129,44,0.08); }
        .rule-toggle { display: flex; gap: 4px; flex-wrap: wrap; }
        .icon-btn {
          background: transparent;
          border: none;
          cursor: pointer;
          color: var(--slate);
          display: flex;
          align-items: center;
          padding: 2px;
        }
        .icon-btn:hover { color: var(--rust); }

        .answer-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 12px 16px;
          margin-top: 4px;
          margin-bottom: 14px;
          padding-top: 12px;
          border-top: 1px dashed var(--line);
        }
        .select-bad { border-color: var(--rust); color: var(--rust); }
        .check-group {
          display: flex;
          flex-direction: column;
          gap: 6px;
          border: 1px solid var(--line);
          border-radius: 6px;
          padding: 8px 10px;
          background: #FBF9F3;
        }
        .check-row {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 13px;
          cursor: pointer;
        }
        .check-row input { width: auto; padding: 0; }
        .check-row.check-bad { color: var(--rust); }
        .flag-badge {
          display: inline-flex;
          align-items: center;
          gap: 3px;
          font-family: 'IBM Plex Mono', monospace;
          font-size: 9.5px;
          text-transform: uppercase;
          color: var(--rust);
          border: 1px solid var(--rust);
          border-radius: 4px;
          padding: 1px 6px;
          margin-left: 8px;
          vertical-align: middle;
        }
        .unsaved-badge {
          display: inline-block;
          font-family: 'IBM Plex Mono', monospace;
          font-size: 9.5px;
          text-transform: uppercase;
          color: var(--ochre);
          border: 1px solid var(--ochre);
          border-radius: 4px;
          padding: 1px 6px;
          margin-left: 8px;
          vertical-align: middle;
        }
        .interview-time-section {
          border: 1px solid var(--line);
          border-radius: 8px;
          padding: 12px 14px 14px;
          margin-bottom: 16px;
          background: #FBF9F3;
        }
        .interview-time-section .field { margin-bottom: 0; max-width: 280px; }
        .stage-row.no-click { cursor: default; }
        .card-footer-actions {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          margin-top: 18px;
          padding-top: 14px;
          border-top: 1px solid var(--line);
        }
        .card-footer-save { display: flex; gap: 8px; }

        .card-list { display: flex; flex-direction: column; gap: 12px; }
        .empty-note { padding: 20px 0; text-align: center; }

        .p-card {
          border: 1px solid var(--line);
          border-radius: 8px;
          background: #FBF9F3;
          overflow: hidden;
        }
        .p-card-top {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 14px 16px;
          cursor: pointer;
          gap: 12px;
        }
        .p-card-id { display: flex; align-items: center; gap: 12px; min-width: 0; }
        .rank-badge {
          font-family: 'Lora', serif;
          font-weight: 600;
          font-size: 15px;
          width: 30px; height: 30px;
          border-radius: 50%;
          background: var(--ink);
          color: var(--paper);
          display: flex; align-items: center; justify-content: center;
          flex-shrink: 0;
        }
        .p-name { font-weight: 600; font-size: 14.5px; }
        .p-card-stages { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; justify-content: flex-end; }

        .stamp {
          display: inline-block;
          font-family: 'IBM Plex Mono', monospace;
          font-size: 9.5px;
          text-transform: uppercase;
          letter-spacing: 0.04em;
          border: 1.5px solid;
          border-radius: 3px;
          padding: 2px 6px;
          transform: rotate(-1.5deg);
          white-space: nowrap;
        }

        .p-card-body { padding: 4px 16px 20px; border-top: 1px solid var(--line); }
        .p-edit-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 12px 16px;
          margin-top: 16px;
        }

        .stage-tracker { margin-top: 16px; display: flex; flex-direction: column; gap: 10px; }
        .stage-row {
          display: flex;
          align-items: center;
          gap: 10px;
          font-size: 13.5px;
          cursor: pointer;
          padding: 4px 0;
        }
        .stage-row span { flex-shrink: 0; }
        .inline-date {
          margin-left: auto;
          font-size: 12px;
          padding: 4px 8px;
        }

        .cal-shell { display: grid; grid-template-columns: 1.3fr 1fr; gap: 24px; }
        .cal-nav {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 12px;
          font-size: 13px;
        }
        .cal-grid { display: grid; grid-template-columns: repeat(7, 1fr); gap: 4px; }
        .cal-dow {
          font-family: 'IBM Plex Mono', monospace;
          font-size: 10.5px;
          text-align: center;
          color: var(--slate);
          padding-bottom: 4px;
        }
        .cal-cell {
          min-height: 64px;
          border: 1px solid var(--line);
          border-radius: 6px;
          padding: 4px 5px;
          font-size: 11px;
        }
        .cal-cell.empty { border-color: transparent; }
        .cal-daynum { font-family: 'IBM Plex Mono', monospace; color: var(--slate); font-size: 10.5px; }
        .cal-pill {
          background: var(--ink);
          color: var(--paper);
          border-radius: 4px;
          padding: 1px 5px;
          margin-top: 3px;
          font-size: 10px;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          cursor: pointer;
        }
        .cal-pill:hover { opacity: 0.85; }
        .cal-pill.selected { outline: 2px solid var(--ink); outline-offset: 1px; }
        .cal-list h3 {
          font-family: 'Lora', serif;
          font-size: 15px;
          margin: 0 0 12px;
        }
        .cal-list-row {
          display: grid;
          grid-template-columns: 64px 1fr auto auto;
          align-items: center;
          gap: 10px;
          padding: 8px 6px;
          border-bottom: 1px solid var(--line);
          cursor: pointer;
          border-radius: 6px;
        }
        .cal-list-row:hover { background: #F1ECDE; }
        .cal-list-row.selected { background: rgba(176,129,44,0.12); border-bottom-color: var(--ochre); }
        .cal-list-date { font-size: 11.5px; color: var(--slate); }

        .detail-panel {
          margin-top: 22px;
          border: 1px solid var(--ochre);
          border-radius: 8px;
          padding: 18px 20px;
          background: #FBF9F3;
        }
        .detail-panel-top { display: flex; align-items: flex-start; justify-content: space-between; margin-bottom: 12px; }
        .detail-stamps { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 16px; }
        .detail-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(140px, 1fr));
          gap: 14px;
          margin-bottom: 16px;
        }
        .detail-value { font-size: 14px; margin-top: 2px; }
        .detail-block { margin-bottom: 16px; }
        .detail-notes { font-size: 13.5px; line-height: 1.5; margin: 6px 0 0; white-space: pre-wrap; }
        .detail-answers { display: flex; flex-direction: column; gap: 8px; margin-top: 8px; }
        .detail-answer-row {
          display: flex;
          justify-content: space-between;
          gap: 12px;
          padding: 6px 0;
          border-bottom: 1px solid var(--line);
        }
        .detail-answer-row:last-child { border-bottom: none; }
        .detail-answer-value { font-size: 13px; font-weight: 500; text-align: right; }
        .detail-answer-bad .detail-answer-value { color: var(--rust); }

        @media (max-width: 720px) {
          .cal-shell { grid-template-columns: 1fr; }
          .p-edit-grid { grid-template-columns: 1fr; }
          .answer-grid { grid-template-columns: 1fr; }
          .detail-grid { grid-template-columns: 1fr; }
        }
      `}</style>

      <div className="header">
        <h1>Recruitment Desk</h1>
        <p className="subtle">A working case file for participant recruitment — criteria, roster, and interview calendar.</p>
      </div>

      <div className="tab-bar">
        {tabs.map((t) => (
          <button
            key={t.key}
            className={`tab-btn ${tab === t.key ? "active" : ""}`}
            onClick={() => setTab(t.key)}
          >
            <t.icon size={13} /> {t.label}
          </button>
        ))}
      </div>

      <div className="panel">
        {!loaded ? (
          <div className="panel-inner"><p className="subtle">Loading your roster…</p></div>
        ) : tab === "criteria" ? (
          <CriteriaTab criteria={criteria} setCriteria={setCriteria} />
        ) : tab === "screener" ? (
          <ScreenerTab screener={screener} setScreener={setScreener} />
        ) : tab === "roster" ? (
          <RosterTab participants={participants} setParticipants={setParticipants} screener={screener} />
        ) : (
          <CalendarTab participants={participants} screener={screener} />
        )}
      </div>
    </div>
  );
}
