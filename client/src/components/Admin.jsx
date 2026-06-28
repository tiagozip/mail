import { Badge, Button, Link, Loader } from "@cloudflare/kumo";
import { ArrowLeft, ArrowSquareOut } from "@phosphor-icons/react";
import { useEffect, useState } from "react";
import { api } from "../api.js";
import { notifyError } from "../toast.js";
import { humanSize, relativeTime } from "../util.js";

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

        </div>
      </div>
    </div>
  );
}
