import { Button, Dialog, DialogRoot, Input, Select } from "@cloudflare/kumo";
import { PaperPlaneTilt, Paperclip, Trash, X } from "@phosphor-icons/react";
import { useEffect, useRef, useState } from "react";
import { api } from "../api.js";
import { notify, notifyError } from "../toast.js";
import { humanSize, parseRecipients, plainBodyToHtml } from "../util.js";
import { RichEditor } from "./RichEditor.jsx";

function RecipientField({ label, value, onChange, autoFocus }) {
  const [suggestions, setSuggestions] = useState([]);
  const [show, setShow] = useState(false);
  const timer = useRef(null);

  function onInput(v) {
    onChange(v);
    const last = v.split(/[,\s]+/).pop();
    clearTimeout(timer.current);
    if (!last || last.length < 2) {
      setSuggestions([]);
      return;
    }
    timer.current = setTimeout(async () => {
      try {
        const d = await api.contacts(last);
        setSuggestions(d.contacts || []);
        setShow(true);
      } catch {
        setSuggestions([]);
      }
    }, 200);
  }

  function pick(addr) {
    const parts = value.split(/[,\s]+/);
    parts[parts.length - 1] = addr;
    onChange(`${parts.join(", ")}, `);
    setShow(false);
    setSuggestions([]);
  }

  return (
    <div className="em-recip-row">
      <label>{label}</label>
      <div className="em-recip-input">
        <Input
          aria-label={label}
          autoFocus={autoFocus}
          value={value}
          onChange={(e) => onInput(e.target.value)}
          onFocus={() => suggestions.length && setShow(true)}
          onBlur={() => setTimeout(() => setShow(false), 150)}
        />
        {show && suggestions.length > 0 && (
          <div className="em-suggest">
            {suggestions.map((c) => (
              <div key={c.address} className="em-suggest-item" onMouseDown={() => pick(c.address)}>
                {c.name ? `${c.name} ` : ""}
                <span className="em-suggest-addr">{c.address}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export function Compose({ open, initial, user, onClose, onSent }) {
  const addresses = user.addresses?.length
    ? user.addresses
    : [{ address: user.address, isPrimary: true }];
  const primary = addresses.find((a) => a.isPrimary)?.address || addresses[0].address;

  const [from, setFrom] = useState(primary);
  const [to, setTo] = useState("");
  const [cc, setCc] = useState("");
  const [bcc, setBcc] = useState("");
  const [subject, setSubject] = useState("");
  const [bodyHtml, setBodyHtml] = useState("");
  const [bodyText, setBodyText] = useState("");
  const editorRef = useRef(null);
  const [showCc, setShowCc] = useState(false);
  const [showBcc, setShowBcc] = useState(false);
  const [atts, setAtts] = useState([]);
  const [busy, setBusy] = useState(false);
  const [draftId, setDraftId] = useState(null);
  const [meta, setMeta] = useState({});
  const fileRef = useRef(null);
  const saveTimer = useRef(null);
  const draftIdRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const init = initial || {};
    const html = plainBodyToHtml(init.body || "");
    setFrom(primary);
    setTo(init.to || "");
    setCc(init.cc || "");
    setBcc(init.bcc || "");
    setSubject(init.subject || "");
    setBodyHtml(html);
    setBodyText(init.body || "");
    if (editorRef.current) editorRef.current.commands.setContent(html || "<p></p>");
    setShowCc(!!init.cc);
    setShowBcc(false);
    setAtts([]);
    setDraftId(null);
    draftIdRef.current = null;
    setMeta({ inReplyTo: init.inReplyTo, references: init.references || [] });
  }, [open, initial, primary]);

  useEffect(() => {
    if (!open) return;
    clearTimeout(saveTimer.current);
    if (!to && !subject && !bodyText.trim()) return;
    saveTimer.current = setTimeout(saveDraft, 3000);
    return () => clearTimeout(saveTimer.current);
  }, [to, cc, bcc, subject, bodyText, open]);

  async function saveDraft() {
    const payload = {
      to: parseRecipients(to),
      cc: parseRecipients(cc),
      bcc: parseRecipients(bcc),
      subject,
      text: bodyText,
    };
    try {
      if (draftIdRef.current) {
        await api.updateDraft(draftIdRef.current, payload);
      } else {
        const d = await api.createDraft(payload);
        draftIdRef.current = d.id;
        setDraftId(d.id);
      }
    } catch {}
  }

  async function onPickFiles(e) {
    const files = [...(e.target.files || [])];
    e.target.value = "";
    for (const file of files) {
      const tmp = { id: `pending-${Math.random()}`, filename: file.name, size: file.size, pending: true };
      setAtts((p) => [...p, tmp]);
      try {
        const d = await api.uploadAttachment(file);
        setAtts((p) => p.map((a) => (a.id === tmp.id ? d : a)));
      } catch (err) {
        setAtts((p) => p.filter((a) => a.id !== tmp.id));
        notifyError(err);
      }
    }
  }

  async function removeAtt(att) {
    setAtts((p) => p.filter((a) => a.id !== att.id));
    if (!att.pending) await api.deleteAttachment(att.id).catch(() => {});
  }

  async function onSend() {
    const recipients = parseRecipients(to);
    if (!recipients.length) {
      notify("Add a recipient", "The To field is empty.", "warning");
      return;
    }
    setBusy(true);
    try {
      const html = bodyText.trim() ? bodyHtml : "";
      await api.send({
        from,
        to: recipients,
        cc: parseRecipients(cc),
        bcc: parseRecipients(bcc),
        subject,
        text: bodyText,
        html,
        inReplyTo: meta.inReplyTo,
        references: meta.references || [],
        attachmentIds: atts.filter((a) => !a.pending).map((a) => a.id),
        draftId: draftIdRef.current || undefined,
      });
      notify("Sent", `Message to ${recipients[0]}${recipients.length > 1 ? ` +${recipients.length - 1}` : ""} sent.`, "success");
      onSent?.();
      onClose();
    } catch (e) {
      notifyError(e);
    } finally {
      setBusy(false);
    }
  }

  async function onSaveDraftClick() {
    await saveDraft();
    notify("Draft saved", "Saved to Drafts.");
    onSent?.();
    onClose();
  }

  async function onDiscard() {
    if (draftIdRef.current) await api.deleteMessage(draftIdRef.current).catch(() => {});
    for (const a of atts.filter((x) => !x.pending)) await api.deleteAttachment(a.id).catch(() => {});
    onSent?.();
    onClose();
  }

  const multiAddr = addresses.length > 1;

  return (
    <DialogRoot open={open} onOpenChange={(o) => !o && onClose()}>
      <Dialog style={{ width: 640, maxWidth: "94vw", padding: 24 }}>
        <Dialog.Title className="em-display" style={{ marginBottom: 16 }}>
          New message
        </Dialog.Title>
        <div className="em-compose-fields">
          <div className="em-compose-from">
            <label>From</label>
            {multiAddr ? (
              <Select aria-label="From address" size="sm" value={from} onValueChange={(v) => setFrom(v)}>
                {addresses.map((a) => (
                  <Select.Option key={a.address} value={a.address}>
                    {a.address}
                  </Select.Option>
                ))}
              </Select>
            ) : (
              <span className="em-compose-from-static">{from}</span>
            )}
          </div>
          <RecipientField label="To" value={to} onChange={setTo} autoFocus />
          {showCc && <RecipientField label="Cc" value={cc} onChange={setCc} />}
          {showBcc && <RecipientField label="Bcc" value={bcc} onChange={setBcc} />}
          {(!showCc || !showBcc) && (
            <div className="em-recip-extra">
              {!showCc && (
                <button type="button" className="em-linkbtn" onClick={() => setShowCc(true)}>
                  Add Cc
                </button>
              )}
              {!showBcc && (
                <button type="button" className="em-linkbtn" onClick={() => setShowBcc(true)}>
                  Add Bcc
                </button>
              )}
            </div>
          )}
          <Input
            className="em-compose-subject"
            aria-label="Subject"
            placeholder="Subject"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
          />
          <RichEditor
            placeholder="Write your message"
            value={bodyHtml}
            onEditorReady={(ed) => {
              editorRef.current = ed;
            }}
            onUpdate={({ html, text }) => {
              setBodyHtml(html);
              setBodyText(text);
            }}
          />
          {atts.length > 0 && (
            <div className="em-pending-atts">
              {atts.map((a) => (
                <span key={a.id} className="em-pending-chip">
                  <Paperclip size={13} />
                  {a.filename}
                  <span style={{ color: "var(--text-color-kumo-subtle)" }}>
                    {a.pending ? "…" : humanSize(a.size)}
                  </span>
                  <button type="button" className="em-pending-x" aria-label="Remove" onClick={() => removeAtt(a)}>
                    <X size={12} />
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>

        <input ref={fileRef} type="file" multiple hidden onChange={onPickFiles} />
        <div className="em-compose-actions">
          <Button variant="primary" icon={PaperPlaneTilt} loading={busy} onClick={onSend}>
            Send
          </Button>
          <Button variant="outline" icon={Paperclip} onClick={() => fileRef.current?.click()}>
            Attach
          </Button>
          <Button variant="ghost" onClick={onSaveDraftClick}>
            Save draft
          </Button>
          <div className="em-spacer" />
          <Button variant="secondary-destructive" icon={Trash} onClick={onDiscard}>
            Discard
          </Button>
        </div>
      </Dialog>
    </DialogRoot>
  );
}
