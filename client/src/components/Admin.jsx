import { Badge, Button, Input, Link, Loader } from "@cloudflare/kumo";
import {
  ArrowLeft,
  ArrowSquareOut,
  ArrowsClockwise,
  Check,
  Globe,
  X,
} from "@phosphor-icons/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "../api.js";
import { notify, notifyError } from "../toast.js";
import { humanSize, relativeTime } from "../util.js";

function niceCeil(n) {
  if (n <= 5) return 5;
  const pow = 10 ** Math.floor(Math.log10(n));
  for (const m of [1, 2, 5, 10]) if (m * pow >= n) return m * pow;
  return 10 * pow;
}

function dayLabel(iso) {
  const d = new Date(`${iso}T00:00:00`);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function VolumeChart({ days }) {
  const wrapRef = useRef(null);
  const [width, setWidth] = useState(0);
  const [hover, setHover] = useState(null);
  const [asTable, setAsTable] = useState(false);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, [asTable]);

  const height = 190;
  const pad = { top: 14, right: 12, bottom: 24, left: 34 };
  const innerW = Math.max(0, width - pad.left - pad.right);
  const innerH = height - pad.top - pad.bottom;
  const yMax = niceCeil(Math.max(1, ...days.map((d) => Math.max(d.received, d.sent))));
  const x = (i) => pad.left + (days.length < 2 ? 0 : (i / (days.length - 1)) * innerW);
  const y = (v) => pad.top + innerH - (v / yMax) * innerH;
  const line = (key) => days.map((d, i) => `${i ? "L" : "M"}${x(i)},${y(d[key])}`).join("");

  const series = [
    { key: "received", label: "Received", color: "var(--em-chart-1)" },
    { key: "sent", label: "Sent", color: "var(--em-chart-2)" },
  ];

  function onMove(e) {
    if (!innerW || days.length < 2) return;
    const rect = wrapRef.current.getBoundingClientRect();
    const px = e.clientX - rect.left - pad.left;
    const i = Math.max(0, Math.min(days.length - 1, Math.round((px / innerW) * (days.length - 1))));
    setHover(i);
  }

  const totals = series.map((s) => ({ ...s, total: days.reduce((a, d) => a + d[s.key], 0) }));

  return (
    <div className="em-card">
      <div className="em-card-head em-chart-head">
        <div>
          <h2 className="em-card-title">Mail volume</h2>
          <p className="em-card-sub">Messages received and sent per day, last 31 days.</p>
        </div>
        <Button size="sm" variant="ghost" onClick={() => setAsTable((v) => !v)}>
          {asTable ? "Chart" : "Table"}
        </Button>
      </div>
      <div className="em-chart-legend">
        {totals.map((s) => (
          <span key={s.key} className="em-chart-legend-item">
            <span className="em-chart-swatch" style={{ background: s.color }} />
            {s.label}
            <span className="em-chart-legend-n">{s.total.toLocaleString()}</span>
          </span>
        ))}
      </div>
      {asTable ? (
        <div className="em-chart-tablewrap">
          <table className="em-table">
            <thead>
              <tr>
                <th>Day</th>
                <th>Received</th>
                <th>Sent</th>
              </tr>
            </thead>
            <tbody>
              {[...days].reverse().map((d) => (
                <tr key={d.day}>
                  <td>{dayLabel(d.day)}</td>
                  <td>{d.received}</td>
                  <td>{d.sent}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div
          className="em-chart-wrap"
          ref={wrapRef}
          onMouseMove={onMove}
          onMouseLeave={() => setHover(null)}
        >
          {width > 0 && (
            <svg width={width} height={height} role="img" aria-label="Mail volume per day">
              {[0, 0.5, 1].map((f) => (
                <g key={f}>
                  <line
                    x1={pad.left}
                    x2={width - pad.right}
                    y1={y(f * yMax)}
                    y2={y(f * yMax)}
                    className="em-chart-grid"
                  />
                  <text x={pad.left - 6} y={y(f * yMax) + 3} className="em-chart-tick" textAnchor="end">
                    {Math.round(f * yMax)}
                  </text>
                </g>
              ))}
              {days.map((d, i) =>
                i % 7 === 3 ? (
                  <text key={d.day} x={x(i)} y={height - 7} className="em-chart-tick" textAnchor="middle">
                    {dayLabel(d.day)}
                  </text>
                ) : null,
              )}
              {hover !== null && (
                <line x1={x(hover)} x2={x(hover)} y1={pad.top} y2={pad.top + innerH} className="em-chart-cursor" />
              )}
              {series.map((s) => (
                <path key={s.key} d={line(s.key)} fill="none" stroke={s.color} strokeWidth="2" strokeLinejoin="round" />
              ))}
              {hover !== null &&
                series.map((s) => (
                  <circle
                    key={s.key}
                    cx={x(hover)}
                    cy={y(days[hover][s.key])}
                    r="4"
                    fill={s.color}
                    className="em-chart-dot"
                  />
                ))}
            </svg>
          )}
          {hover !== null && width > 0 && (
            <div
              className="em-chart-tip"
              style={{
                left: x(hover) + (x(hover) > width - 130 ? -118 : 10),
                top: pad.top,
              }}
            >
              <div className="em-chart-tip-day">{dayLabel(days[hover].day)}</div>
              {series.map((s) => (
                <div key={s.key} className="em-chart-tip-row">
                  <span className="em-chart-swatch" style={{ background: s.color }} />
                  {s.label}
                  <span className="em-chart-tip-n">{days[hover][s.key]}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Dashboard() {
  const [stats, setStats] = useState(null);

  useEffect(() => {
    api.adminStats().then(setStats).catch(notifyError);
  }, []);

  if (!stats) {
    return (
      <div className="em-card">
        <Loader size="sm" />
      </div>
    );
  }

  const t = stats.totals || {};
  const tiles = [
    ["Mailboxes", t.users || 0, t.new_month ? `+${t.new_month} this month` : null],
    ["Active this week", t.active_week || 0, null],
    ["Messages", (t.messages || 0).toLocaleString(), null],
    ["Storage used", humanSize(t.storage || 0), null],
    ["Spam caught", t.spam_month || 0, "last 31 days"],
    ["Scheduled sends", t.scheduled || 0, "pending"],
  ];

  return (
    <>
      <div className="em-stats-grid">
        {tiles.map(([label, value, sub]) => (
          <div key={label} className="em-stat">
            <span className="em-stat-label">{label}</span>
            <span className="em-stat-value em-display">{value}</span>
            {sub && <span className="em-stat-sub">{sub}</span>}
          </div>
        ))}
      </div>
      <VolumeChart days={stats.days || []} />
    </>
  );
}

function DomainStatus({ d }) {
  if (!d.verified)
    return (
      <Badge variant="neutral" title="Ownership has not been proven yet">
        unverified
      </Badge>
    );
  if (d.isByod && d.relayFailingSince)
    return (
      <Badge variant="red" title={`Relay unreachable since ${relativeTime(d.relayFailingSince)}`}>
        relay down {relativeTime(d.relayFailingSince)}
      </Badge>
    );
  if (!d.sendVerified)
    return (
      <Badge variant="orange" title="Receiving works, sending is not set up">
        receive only
      </Badge>
    );
  return <Badge variant="green">verified</Badge>;
}

function Domains() {
  const [list, setList] = useState(null);
  const [checking, setChecking] = useState(null);

  useEffect(() => {
    api
      .adminDomains()
      .then((d) => setList(d.domains || []))
      .catch(notifyError);
  }, []);

  function patch(id, fields) {
    setList((p) => (p || []).map((d) => (d.id === id ? { ...d, ...fields } : d)));
  }

  async function act(id, approve) {
    try {
      if (approve) await api.approvePublicDomain(id);
      else await api.rejectPublicDomain(id);
      patch(id, { public: approve, pending: false });
    } catch (err) {
      notifyError(err);
    }
  }

  async function check(d) {
    setChecking(d.id);
    try {
      const r = await api.adminDomainHealth(d.id);
      patch(d.id, {
        relayOk: r.ok,
        relayCheckedAt: r.checkedAt,
        relayFailingSince: r.ok ? null : d.relayFailingSince || r.checkedAt,
      });
      if (r.ok) notify("Relay healthy", `${d.domain} answered the health check.`, "success");
      else notify("Relay failing", r.error || `${d.domain} did not answer.`, "error");
    } catch (err) {
      notifyError(err);
    } finally {
      setChecking(null);
    }
  }

  const pending = (list || []).filter((d) => d.pending).length;

  return (
    <div className="em-card">
      <div className="em-card-head">
        <h2 className="em-card-title">
          Domains
          {pending > 0 && (
            <Badge variant="orange" style={{ marginLeft: 8 }}>
              {pending} awaiting review
            </Badge>
          )}
        </h2>
        <p className="em-card-sub">
          Every domain on the server. Approving one lists it in the public directory, so anyone here
          can make addresses on it. A relay that stays down for three days loses its verification.
        </p>
      </div>
      {!list ? (
        <Loader size="sm" />
      ) : list.length === 0 ? (
        <p className="em-card-sub">No custom domains yet.</p>
      ) : (
        <div className="em-alias-list">
          {list.map((d) => (
            <div key={d.id} className="em-domain-row">
              <div className="em-domain-main">
                <span className="em-alias-addr">{d.domain}</span>
                <DomainStatus d={d} />
                {d.pending ? (
                  <Badge variant="neutral">public pending</Badge>
                ) : d.public ? (
                  <Badge variant="green" icon={Globe}>
                    public
                  </Badge>
                ) : null}
                <span className="em-hidden-meta">
                  {d.owner ? `by ${d.owner}` : "no owner"} · {d.isByod ? "relay" : "dns"} ·{" "}
                  {d.addresses} {d.addresses === 1 ? "address" : "addresses"}
                  {d.relayCheckedAt ? ` · checked ${relativeTime(d.relayCheckedAt)}` : ""}
                </span>
              </div>
              <div className="em-alias-actions">
                {d.isByod && (
                  <Button
                    size="sm"
                    variant="ghost"
                    icon={ArrowsClockwise}
                    loading={checking === d.id}
                    onClick={() => check(d)}
                  >
                    Check relay
                  </Button>
                )}
                {d.pending && (
                  <Button size="sm" variant="outline" icon={Check} onClick={() => act(d.id, true)}>
                    Approve
                  </Button>
                )}
                {(d.pending || d.public) && (
                  <Button size="sm" variant="ghost" icon={X} onClick={() => act(d.id, false)}>
                    {d.pending ? "Reject" : "Unpublish"}
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const MAILBOX_COLUMNS = [
  { key: "address", label: "Address" },
  { key: "display_name", label: "Name" },
  { key: "email", label: "Account email" },
  { key: "messages", label: "Messages", numeric: true },
  { key: "aliases", label: "Aliases", numeric: true },
  { key: "storage_used", label: "Storage", numeric: true },
  { key: "last_login", label: "Last sign-in", numeric: true },
];

function Mailboxes() {
  const [users, setUsers] = useState(null);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState({ key: "last_login", desc: true });

  useEffect(() => {
    api
      .adminUsers()
      .then((d) => setUsers(d.users || []))
      .catch(notifyError);
  }, []);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = (users || []).filter((u) =>
      !q
        ? true
        : [u.address, u.display_name, u.email, u.username]
            .filter(Boolean)
            .some((v) => String(v).toLowerCase().includes(q)),
    );
    const col = MAILBOX_COLUMNS.find((c) => c.key === sort.key);
    return [...filtered].sort((a, b) => {
      const av = a[sort.key];
      const bv = b[sort.key];
      if (col?.numeric) return (sort.desc ? -1 : 1) * ((av || 0) - (bv || 0));
      return (
        (sort.desc ? -1 : 1) * String(av || "").localeCompare(String(bv || ""), undefined, { numeric: true })
      );
    });
  }, [users, query, sort]);

  function toggleSort(key) {
    setSort((p) => (p.key === key ? { key, desc: !p.desc } : { key, desc: true }));
  }

  return (
    <div className="em-card">
      <div className="em-card-head em-chart-head">
        <div>
          <h2 className="em-card-title">Mailboxes</h2>
          {users && (
            <p className="em-card-sub">
              {rows.length === users.length
                ? `${users.length} total`
                : `${rows.length} of ${users.length}`}
            </p>
          )}
        </div>
        <Input
          size="sm"
          placeholder="Filter mailboxes"
          aria-label="Filter mailboxes"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>
      {!users ? (
        <Loader size="sm" />
      ) : (
        <table className="em-table">
          <thead>
            <tr>
              {MAILBOX_COLUMNS.map((c) => (
                <th key={c.key}>
                  <button
                    type="button"
                    className={`em-sort ${sort.key === c.key ? "active" : ""}`}
                    onClick={() => toggleSort(c.key)}
                  >
                    {c.label}
                    {sort.key === c.key && <span aria-hidden="true">{sort.desc ? "↓" : "↑"}</span>}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((u) => (
              <tr key={u.id}>
                <td>
                  {u.address}
                  {u.is_admin ? (
                    <Badge variant="purple" style={{ marginLeft: 6 }}>
                      admin
                    </Badge>
                  ) : null}
                </td>
                <td>{u.display_name || "-"}</td>
                <td>{u.email || "-"}</td>
                <td>{(u.messages || 0).toLocaleString()}</td>
                <td>{u.aliases || 0}</td>
                <td>{humanSize(u.storage_used || 0)}</td>
                <td>{u.last_login ? relativeTime(u.last_login) : "never"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

export function Admin({ onBack }) {
  return (
    <div className="em-read-pane">
      <div className="em-topbar">
        <Button size="sm" variant="ghost" icon={ArrowLeft} onClick={onBack}>
          Back
        </Button>
        <span className="em-topbar-title">Admin</span>
      </div>
      <div className="em-section">
        <div className="em-section-inner">
          <h1 className="em-display">Admin</h1>
          <p className="em-section-lede">
            Accounts, groups, and sign-in are managed in hrtID. Anyone you provision there with
            access to this app gets a mailbox here on first sign-in.{" "}
            <Link href="https://id.estrogen.delivery" target="_blank" rel="noreferrer">
              Open hrtID <ArrowSquareOut size={13} />
            </Link>
          </p>

          <Dashboard />
          <Mailboxes />
          <Domains />
        </div>
      </div>
    </div>
  );
}
