import { Button, Input, Loader, Select, Switch } from "@cloudflare/kumo";
import { ArrowDown, ArrowUp, Funnel, PencilSimple, Plus, Trash, X } from "@phosphor-icons/react";
import { useEffect, useState } from "react";
import { api } from "../api.js";
import { notify, notifyError } from "../toast.js";

const FIELDS = {
  from: "From",
  from_address: "Sender address",
  from_domain: "Sender domain",
  to: "To",
  cc: "Cc",
  delivered_to: "Delivered to",
  subject: "Subject",
  body: "Body",
  attachment_name: "Attachment name",
  has_attachment: "Has attachments",
  header: "Header",
};
const TEXT_OPS = {
  contains: "contains",
  not_contains: "doesn't contain",
  is: "is",
  is_not: "isn't",
  starts_with: "starts with",
  ends_with: "ends with",
  matches: "matches pattern",
  not_matches: "doesn't match pattern",
};
const HEADER_OPS = { ...TEXT_OPS, exists: "exists", not_exists: "doesn't exist" };
const ATTACHMENT_OPS = { exists: "yes", not_exists: "no" };
const opsFor = (field) =>
  field === "has_attachment" ? ATTACHMENT_OPS : field === "header" ? HEADER_OPS : TEXT_OPS;
const needsValue = (c) => c.field !== "has_attachment" && c.op !== "exists" && c.op !== "not_exists";

const ACTIONS = {
  read: "Mark as read",
  star: "Star it",
  archive: "Archive it",
  trash: "Move to trash",
  spam: "Move to spam",
  move: "Move to folder",
  label: "Add label",
  forward: "Forward to",
  never_spam: "Never send to spam",
  block: "Block, drop on arrival",
};
const ORGANIZE = new Set(["read", "star", "archive", "trash", "spam", "move", "label", "block"]);

const PLACEHOLDERS = {
  from: "Jane or jane@example.com",
  from_address: "jane@example.com",
  from_domain: "example.com",
  to: "you@estrogen.delivery",
  cc: "team@example.com",
  delivered_to: "alias@estrogen.delivery",
  subject: "Invoice",
  body: "unsubscribe",
  attachment_name: ".pdf",
  header: "value",
};

const blank = () => ({
  name: "",
  match: "all",
  conditions: [{ field: "from_address", op: "is", value: "" }],
  actions: [{ type: "archive" }],
  stop: false,
  enabled: true,
});

function summary(f, labels, folders) {
  const conds = f.conditions
    .map((c) => {
      const field = c.field === "header" ? `${c.header} header` : FIELDS[c.field];
      if (c.field === "has_attachment")
        return c.op === "not_exists" ? "has no attachments" : "has attachments";
      const op = opsFor(c.field)[c.op] || c.op;
      return needsValue(c) ? `${field} ${op} "${c.value}"` : `${field} ${op}`;
    })
    .join(f.match === "any" ? " or " : " and ");
  const acts = f.actions
    .map((a) => {
      if (a.type === "label") return `label ${labels.find((l) => l.id === a.value)?.name || "?"}`;
      if (a.type === "move") return `move to ${folders.find((x) => x.id === a.value)?.name || "?"}`;
      if (a.type === "forward") return `forward to ${a.value}`;
      return ACTIONS[a.type].toLowerCase();
    })
    .join(", ");
  return { conds, acts };
}

export function Filters() {
  const [filters, setFilters] = useState(null);
  const [labels, setLabels] = useState([]);
  const [folders, setFolders] = useState([]);
  const [draft, setDraft] = useState(null);
  const [applyOffer, setApplyOffer] = useState(null);

  useEffect(() => {
    Promise.all([api.filters(), api.labels(), api.folders()])
      .then(([f, l, fo]) => {
        setFilters(f.filters || []);
        setLabels(l.labels || []);
        setFolders(fo.folders || []);
      })
      .catch(notifyError);
  }, []);

  async function toggle(f, enabled) {
    setFilters((p) => p.map((x) => (x.id === f.id ? { ...x, enabled } : x)));
    try {
      await api.updateFilter(f.id, { ...f, enabled });
    } catch (e) {
      setFilters((p) => p.map((x) => (x.id === f.id ? f : x)));
      notifyError(e);
    }
  }

  async function move(index, dir) {
    const next = [...filters];
    const [item] = next.splice(index, 1);
    next.splice(index + dir, 0, item);
    setFilters(next);
    try {
      await api.reorderFilters(next.map((f) => f.id));
    } catch (e) {
      setFilters(filters);
      notifyError(e);
    }
  }

  async function remove(f) {
    try {
      await api.deleteFilter(f.id);
      setFilters((p) => p.filter((x) => x.id !== f.id));
    } catch (e) {
      notifyError(e);
    }
  }

  async function applyExisting() {
    const { id, count } = applyOffer;
    setApplyOffer({ ...applyOffer, busy: true });
    try {
      const res = await api.applyFilter(id);
      notify("Filter applied", `Updated ${res.updated} message${res.updated === 1 ? "" : "s"}.`, "success");
      setApplyOffer(null);
    } catch (e) {
      notifyError(e);
      setApplyOffer({ id, count });
    }
  }

  function saved(f, isNew, matched) {
    setFilters((p) => (isNew ? [...p, f] : p.map((x) => (x.id === f.id ? { ...x, ...f } : x))));
    setDraft(null);
    const organizes = f.actions.some((a) => ORGANIZE.has(a.type));
    setApplyOffer(organizes && matched > 0 ? { id: f.id, count: matched } : null);
  }

  return (
    <div className="em-card">
      <div className="em-card-head em-filters-head">
        <div>
          <h2 className="em-card-title">Filters</h2>
          <p className="em-card-sub">
            Filters run on incoming mail from top to bottom, before spam checks. Matching ignores
            case.
          </p>
        </div>
        {!draft && filters && (
          <Button variant="outline" icon={Plus} onClick={() => setDraft(blank())}>
            New filter
          </Button>
        )}
      </div>

      {applyOffer && (
        <div className="em-filter-apply">
          <span>
            This filter matches {applyOffer.count} recent message{applyOffer.count === 1 ? "" : "s"}.
          </span>
          <Button size="sm" variant="ghost" onClick={() => setApplyOffer(null)}>
            Skip
          </Button>
          <Button size="sm" variant="primary" loading={applyOffer.busy} onClick={applyExisting}>
            Apply to them
          </Button>
        </div>
      )}

      {draft ? (
        <FilterEditor
          initial={draft}
          labels={labels}
          folders={folders}
          onCancel={() => setDraft(null)}
          onSaved={saved}
        />
      ) : !filters ? (
        <Loader size="sm" />
      ) : filters.length === 0 ? (
        <div className="em-filter-empty">
          <Funnel size={20} />
          <span>Block senders, sort newsletters or forward receipts automatically.</span>
        </div>
      ) : (
        <ol className="em-filter-list">
          {filters.map((f, i) => {
            const { conds, acts } = summary(f, labels, folders);
            return (
              <li key={f.id} className="em-filter-row" data-off={!f.enabled || undefined}>
                <div className="em-filter-order">
                  <Button
                    size="xs"
                    variant="ghost"
                    shape="square"
                    aria-label="Move up"
                    icon={ArrowUp}
                    disabled={i === 0}
                    onClick={() => move(i, -1)}
                  />
                  <Button
                    size="xs"
                    variant="ghost"
                    shape="square"
                    aria-label="Move down"
                    icon={ArrowDown}
                    disabled={i === filters.length - 1}
                    onClick={() => move(i, 1)}
                  />
                </div>
                <div className="em-filter-rule">
                  {f.name && <div className="em-filter-name">{f.name}</div>}
                  <div>
                    If {conds}, then <strong>{acts}</strong>
                    {f.stop ? ", and stop" : ""}.
                  </div>
                  {f.hits > 0 && (
                    <div className="em-filter-hits">
                      Matched {f.hits} time{f.hits === 1 ? "" : "s"}
                    </div>
                  )}
                </div>
                <Switch
                  aria-label={f.enabled ? "Turn off filter" : "Turn on filter"}
                  checked={f.enabled}
                  onCheckedChange={(v) => toggle(f, v)}
                />
                <Button
                  size="sm"
                  variant="ghost"
                  shape="square"
                  aria-label="Edit filter"
                  icon={PencilSimple}
                  onClick={() => setDraft(f)}
                />
                <Button
                  size="sm"
                  variant="ghost"
                  shape="square"
                  aria-label="Delete filter"
                  icon={Trash}
                  onClick={() => remove(f)}
                />
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}

function FilterEditor({ initial, labels, folders, onCancel, onSaved }) {
  const [f, setF] = useState(() => structuredClone(initial));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [preview, setPreview] = useState(null);

  const patch = (next) => {
    setF((p) => ({ ...p, ...next }));
    setError("");
    setPreview(null);
  };
  const setCond = (i, next) =>
    patch({ conditions: f.conditions.map((c, j) => (j === i ? { ...c, ...next } : c)) });
  const setAction = (i, next) =>
    patch({ actions: f.actions.map((a, j) => (j === i ? { ...a, ...next } : a)) });

  async function runPreview() {
    try {
      setPreview({ loading: true });
      setPreview(await api.previewFilter(f));
    } catch (e) {
      setPreview(null);
      setError(e.message);
    }
  }

  async function save(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const isNew = !f.id;
      const res = isNew ? await api.createFilter(f) : await api.updateFilter(f.id, f);
      const p = preview?.matched ?? (await api.previewFilter(f).catch(() => null))?.matched ?? 0;
      onSaved({ ...f, ...res, hits: f.hits || 0 }, isNew, p);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  const blocks = f.actions.some((a) => a.type === "block");

  return (
    <form className="em-filter-editor" onSubmit={save}>
      <Input
        aria-label="Filter name"
        placeholder="Name, optional"
        value={f.name}
        onChange={(e) => patch({ name: e.target.value })}
      />

      <div className="em-filter-section">
        <div className="em-filter-section-head">
          <span>If</span>
          <Select
            aria-label="Match mode"
            items={{ all: "all", any: "any" }}
            size="sm"
            value={f.match}
            onValueChange={(v) => patch({ match: v })}
          >
            <Select.Option value="all">all</Select.Option>
            <Select.Option value="any">any</Select.Option>
          </Select>
          <span>of these are true</span>
        </div>
        {f.conditions.map((c, i) => (
          <div key={i} className="em-filter-line">
            <Select
              aria-label="Field"
              items={FIELDS}
              size="sm"
              value={c.field}
              onValueChange={(field) => {
                const ops = opsFor(field);
                setCond(i, { field, op: c.op in ops ? c.op : Object.keys(ops)[0] });
              }}
            >
              {Object.entries(FIELDS).map(([k, v]) => (
                <Select.Option key={k} value={k}>
                  {v}
                </Select.Option>
              ))}
            </Select>
            {c.field === "header" && (
              <Input
                aria-label="Header name"
                placeholder="list-id"
                className="em-filter-header"
                value={c.header || ""}
                onChange={(e) => setCond(i, { header: e.target.value })}
              />
            )}
            <Select
              aria-label="Operator"
              items={opsFor(c.field)}
              size="sm"
              value={c.op}
              onValueChange={(op) => setCond(i, { op })}
            >
              {Object.entries(opsFor(c.field)).map(([k, v]) => (
                <Select.Option key={k} value={k}>
                  {v}
                </Select.Option>
              ))}
            </Select>
            {needsValue(c) && (
              <Input
                aria-label="Value"
                placeholder={c.op.includes("matches") ? "^news(letter)?@" : PLACEHOLDERS[c.field]}
                value={c.value}
                onChange={(e) => setCond(i, { value: e.target.value })}
              />
            )}
            <Button
              size="sm"
              variant="ghost"
              shape="square"
              aria-label="Remove condition"
              icon={X}
              disabled={f.conditions.length === 1}
              onClick={() => patch({ conditions: f.conditions.filter((_, j) => j !== i) })}
            />
          </div>
        ))}
        <Button
          size="sm"
          variant="ghost"
          icon={Plus}
          className="em-filter-more"
          onClick={() =>
            patch({ conditions: [...f.conditions, { field: "subject", op: "contains", value: "" }] })
          }
        >
          Add condition
        </Button>
      </div>

      <div className="em-filter-section">
        <div className="em-filter-section-head">
          <span>Then</span>
        </div>
        {f.actions.map((a, i) => (
          <div key={i} className="em-filter-line">
            <Select
              aria-label="Action"
              items={ACTIONS}
              size="sm"
              value={a.type}
              onValueChange={(type) =>
                setAction(i, {
                  type,
                  value:
                    type === "label"
                      ? labels[0]?.id
                      : type === "move"
                        ? folders[0]?.id
                        : type === "forward"
                          ? ""
                          : undefined,
                })
              }
            >
              {Object.entries(ACTIONS).map(([k, v]) => (
                <Select.Option
                  key={k}
                  value={k}
                  disabled={(k === "label" && !labels.length) || (k === "move" && !folders.length)}
                >
                  {v}
                </Select.Option>
              ))}
            </Select>
            {a.type === "label" && (
              <Select
                aria-label="Label"
                items={Object.fromEntries(labels.map((l) => [l.id, l.name]))}
                size="sm"
                value={a.value}
                onValueChange={(value) => setAction(i, { value })}
              >
                {labels.map((l) => (
                  <Select.Option key={l.id} value={l.id}>
                    {l.name}
                  </Select.Option>
                ))}
              </Select>
            )}
            {a.type === "move" && (
              <Select
                aria-label="Folder"
                items={Object.fromEntries(folders.map((x) => [x.id, x.name]))}
                size="sm"
                value={a.value}
                onValueChange={(value) => setAction(i, { value })}
              >
                {folders.map((x) => (
                  <Select.Option key={x.id} value={x.id}>
                    {x.name}
                  </Select.Option>
                ))}
              </Select>
            )}
            {a.type === "forward" && (
              <Input
                aria-label="Forwarding address"
                type="email"
                placeholder="you@example.com"
                value={a.value || ""}
                onChange={(e) => setAction(i, { value: e.target.value })}
              />
            )}
            <Button
              size="sm"
              variant="ghost"
              shape="square"
              aria-label="Remove action"
              icon={X}
              disabled={f.actions.length === 1}
              onClick={() => patch({ actions: f.actions.filter((_, j) => j !== i) })}
            />
          </div>
        ))}
        {!blocks && (
          <Button
            size="sm"
            variant="ghost"
            icon={Plus}
            className="em-filter-more"
            onClick={() => patch({ actions: [...f.actions, { type: "read" }] })}
          >
            Add action
          </Button>
        )}
        {blocks && (
          <p className="em-filter-note">
            Blocked mail is dropped without a bounce, so the sender can't tell. It won't show up
            anywhere, including spam.
          </p>
        )}
      </div>

      <label className="em-filter-toggle">
        <Switch checked={f.stop} onCheckedChange={(stop) => patch({ stop })} />
        <span>Don't run filters below this one when it matches</span>
      </label>

      {preview && !preview.loading && (
        <div className="em-filter-preview" role="status">
          <div>
            Matches {preview.matched} of your last {preview.scanned} messages.
          </div>
          {preview.samples.map((s) => (
            <div key={s.id} className="em-filter-sample">
              <span className="em-filter-sample-from">{s.from}</span>
              <span className="em-filter-sample-subject">{s.subject}</span>
            </div>
          ))}
        </div>
      )}
      {error && <div className="em-form-error">{error}</div>}

      <div className="em-filter-actions">
        <Button variant="ghost" loading={preview?.loading} onClick={runPreview}>
          Test on recent mail
        </Button>
        <span className="em-filter-spacer" />
        <Button variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" variant="primary" loading={busy}>
          {f.id ? "Save filter" : "Create filter"}
        </Button>
      </div>
    </form>
  );
}
