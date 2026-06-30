import { Badge, Button, Link, Loader } from "@cloudflare/kumo";
import { ArrowLeft, ArrowSquareOut, Check, Globe, X } from "@phosphor-icons/react";
import { useEffect, useState } from "react";
import { api } from "../api.js";
import { notifyError } from "../toast.js";
import { humanSize, relativeTime } from "../util.js";

function PublicDomains() {
  const [list, setList] = useState(null);

  useEffect(() => {
    api
      .adminPublicDomains()
      .then((d) => setList(d.domains || []))
      .catch(notifyError);
  }, []);

  async function act(id, approve) {
    try {
      if (approve) await api.approvePublicDomain(id);
      else await api.rejectPublicDomain(id);
      setList((p) =>
        approve
          ? (p || []).map((d) => (d.id === id ? { ...d, public: true, pending: false } : d))
          : (p || []).filter((d) => d.id !== id),
      );
    } catch (err) {
      notifyError(err);
    }
  }

  return (
    <div className="em-card">
      <div className="em-card-head">
        <h2 className="em-card-title">Public domains</h2>
        <p className="em-card-sub">
          Approve a domain to list it in the public directory so anyone here can make addresses on
          it. Reject removes it from the directory.
        </p>
      </div>
      {!list ? (
        <Loader size="sm" />
      ) : list.length === 0 ? (
        <p className="em-card-sub">No domains have requested to be public yet.</p>
      ) : (
        <div className="em-alias-list">
          {list.map((d) => (
          <div key={d.id} className="em-domain-row">
            <div className="em-domain-main">
              <span className="em-alias-addr">{d.domain}</span>
              {d.owner && <span className="em-hidden-meta">by {d.owner}</span>}
              {d.pending ? (
                <Badge variant="neutral">pending</Badge>
              ) : (
                <Badge variant="green" icon={Globe}>
                  public
                </Badge>
              )}
            </div>
            <div className="em-alias-actions">
              {d.pending && (
                <Button size="sm" variant="outline" icon={Check} onClick={() => act(d.id, true)}>
                  Approve
                </Button>
              )}
              <Button
                size="sm"
                variant="ghost"
                icon={X}
                onClick={() => act(d.id, false)}
              >
                {d.pending ? "Reject" : "Unpublish"}
              </Button>
            </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function Admin({ onBack }) {
  const [users, setUsers] = useState(null);

  useEffect(() => {
    api
      .adminUsers()
      .then((d) => setUsers(d.users || []))
      .catch(notifyError);
  }, []);

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

        <div className="em-card">
          <div className="em-card-head">
            <h2 className="em-card-title">Mailboxes</h2>
          </div>
        {!users ? (
          <Loader size="sm" />
        ) : (
          <table className="em-table">
            <thead>
              <tr>
                <th>Address</th>
                <th>Name</th>
                <th>Account email</th>
                <th>Storage</th>
                <th>Last sign-in</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
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
                  <td>{humanSize(u.storage_used || 0)}</td>
                  <td>{u.last_login ? relativeTime(u.last_login) : "never"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        </div>

        <PublicDomains />

        </div>
      </div>
    </div>
  );
}
