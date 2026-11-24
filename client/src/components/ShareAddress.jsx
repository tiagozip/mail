import { Button, Dialog, DialogRoot, Input } from "@cloudflare/kumo";
import { X } from "@phosphor-icons/react";
import { useEffect, useState } from "react";
import { api } from "../api.js";
import { notifyError } from "../toast.js";
import { initials, monoColor } from "../util.js";

export function ShareAddress({ address, onClose }) {
  const [members, setMembers] = useState(null);
  const [who, setWho] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!address) return;
    setMembers(null);
    setWho("");
    setError("");
    api
      .addressMembers(address)
      .then((d) => setMembers(d.members || []))
      .catch((e) => {
        notifyError(e);
        setMembers([]);
      });
  }, [address]);

  async function add(e) {
    e.preventDefault();
    if (!who.trim()) return;
    setBusy(true);
    setError("");
    try {
      const { member } = await api.addAddressMember(address, who.trim());
      setMembers((list) => [...(list || []).filter((m) => m.id !== member.id), member]);
      setWho("");
    } catch (err) {
      setError(err.message || "could not share");
    } finally {
      setBusy(false);
    }
  }

  async function remove(id) {
    const before = members;
    setMembers((list) => list.filter((m) => m.id !== id));
    try {
      await api.removeAddressMember(address, id);
    } catch (err) {
      setMembers(before);
      notifyError(err);
    }
  }

  return (
    <DialogRoot open={!!address} onOpenChange={(o) => !o && onClose()}>
      <Dialog className="em-label-dialog" style={{ width: 480, maxWidth: "94vw" }}>
        <div className="em-label-head">
          <Dialog.Title className="em-label-title">Share {address}</Dialog.Title>
          <Button size="sm" variant="ghost" shape="square" aria-label="Close" icon={X} onClick={onClose} />
        </div>
        <div className="em-label-body">
          <p className="em-card-sub">
            People you add get their own copy of every message sent to this address and can send as
            it. They can't change or remove the address.
          </p>
          <form className="em-share-add" onSubmit={add}>
            <Input
              aria-label="Username or address"
              placeholder="Username or address"
              value={who}
              aria-invalid={error ? "true" : undefined}
              onChange={(e) => {
                setWho(e.target.value);
                setError("");
              }}
            />
            <Button type="submit" variant="primary" loading={busy}>
              Add person
            </Button>
          </form>
          {error && <div className="em-form-error">{error}</div>}
          <div className="em-share-list">
            {members === null ? null : members.length === 0 ? (
              <div className="em-empty-hint">Only you get mail sent to this address.</div>
            ) : (
              members.map((m) => (
                <div key={m.id} className="em-share-row">
                  {m.avatar ? (
                    <img className="em-avatar em-avatar-img" src={m.avatar} alt="" />
                  ) : (
                    <span className="em-avatar" style={{ background: monoColor(m.address) }}>
                      {initials({ name: m.displayName, address: m.address })}
                    </span>
                  )}
                  <span className="em-share-who">
                    <span>{m.displayName || m.username}</span>
                    <span className="em-share-addr">{m.address}</span>
                  </span>
                  <Button size="sm" variant="ghost" onClick={() => remove(m.id)}>
                    Remove
                  </Button>
                </div>
              ))
            )}
          </div>
        </div>
      </Dialog>
    </DialogRoot>
  );
}
