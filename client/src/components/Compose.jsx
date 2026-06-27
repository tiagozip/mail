import { Button, Dialog, DialogRoot, Input, Loader, Select } from "@cloudflare/kumo";
import {
  File as FileIcon,
  FileDoc,
  FileImage,
  FilePdf,
  FileText,
  FileZip,
  Lock,
  PaperPlaneTilt,
  Paperclip,
  Trash,
  X,
} from "@phosphor-icons/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "../api.js";
import * as pgp from "../pgp.js";
import { notify, notifyError } from "../toast.js";
import { humanSize, parseRecipients, plainBodyToHtml } from "../util.js";
import { RichEditor } from "./RichEditor.jsx";

function attIcon(mime) {
  const m = mime || "";
  if (m.startsWith("image/")) return FileImage;
  if (m === "application/pdf") return FilePdf;
  if (m.includes("zip") || m.includes("compressed") || m.includes("tar") || m.includes("rar")) return FileZip;
  if (m.includes("word") || m.includes("opendocument.text") || m.includes("msword")) return FileDoc;
  if (m.startsWith("text/")) return FileText;
  return FileIcon;
}

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
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef(null);
  const saveTimer = useRef(null);
  const draftIdRef = useRef(null);
  const dragDepth = useRef(0);
  const previews = useRef(new Map());
  const keyCache = useRef(new Map());
  const ownKeyRef = useRef(null);
  const [keyMap, setKeyMap] = useState({});
  const keyTimer = useRef(null);

  function previewUrl(id, file) {
    if (!file || !file.type?.startsWith("image/")) return null;
    const existing = previews.current.get(id);
    if (existing) return existing;
    const url = URL.createObjectURL(file);
    previews.current.set(id, url);
    return url;
  }

  function revokePreview(id) {
    const url = previews.current.get(id);
    if (url) {
      URL.revokeObjectURL(url);
      previews.current.delete(id);
    }
  }

  useEffect(() => {
    return () => {
      for (const url of previews.current.values()) URL.revokeObjectURL(url);
      previews.current.clear();
    };
  }, []);

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
    for (const url of previews.current.values()) URL.revokeObjectURL(url);
    previews.current.clear();
    setAtts([]);
    setDragOver(false);
    dragDepth.current = 0;
    setDraftId(null);
    draftIdRef.current = null;
    setMeta({ inReplyTo: init.inReplyTo, references: init.references || [] });
    keyCache.current.clear();
    setKeyMap({});
  }, [open, initial, primary]);

  useEffect(() => {
    if (!open) return;
    clearTimeout(saveTimer.current);
    if (!to && !subject && !bodyText.trim()) return;
    saveTimer.current = setTimeout(saveDraft, 3000);
    return () => clearTimeout(saveTimer.current);
  }, [to, cc, bcc, subject, bodyText, open]);

  const recipientAddrs = useMemo(() => {
    const seen = new Set();
    const out = [];
    for (const addr of [...parseRecipients(to), ...parseRecipients(cc)]) {
      const lower = addr.toLowerCase();
      if (seen.has(lower)) continue;
      seen.add(lower);
      out.push(lower);
    }
    return out;
  }, [to, cc]);

  async function lookupKeys(addrs) {
    const pending = addrs.filter((addr) => !keyCache.current.has(addr));
    if (!pending.length) return;
    await Promise.all(
      pending.map(async (addr) => {
        try {
          const d = await api.pgpPubkey(addr);
          keyCache.current.set(addr, d?.publicKey || null);
        } catch {
          keyCache.current.set(addr, null);
        }
      }),
    );
    const next = {};
    for (const [addr, key] of keyCache.current.entries()) next[addr] = key;
    setKeyMap(next);
  }

  useEffect(() => {
    if (!open || !user.pgpEnabled) return;
    clearTimeout(keyTimer.current);
    if (!recipientAddrs.length) return;
    keyTimer.current = setTimeout(() => lookupKeys(recipientAddrs), 350);
    return () => clearTimeout(keyTimer.current);
  }, [open, user.pgpEnabled, recipientAddrs]);

  const pendingAtts = atts.length > 0;
  const bccFilled = parseRecipients(bcc).length > 0;
  const keysReady =
    recipientAddrs.length > 0 && recipientAddrs.every((addr) => !!keyMap[addr]);
  const canE2E =
    user.pgpEnabled === true && keysReady && !bccFilled && !pendingAtts;

  function e2eReason() {
    if (recipientAddrs.length === 0) return "add a recipient to encrypt";
    if (bccFilled) return "bcc not supported with encryption";
    if (pendingAtts) return "remove attachments to encrypt";
    if (!keysReady) return "recipient has no encryption key";
    return "";
  }

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

  async function uploadFile(file) {
    const tmpId = `pending-${Math.random()}`;
    const tmp = { id: tmpId, filename: file.name, mime: file.type, size: file.size, pending: true, file };
    setAtts((p) => [...p, tmp]);
    try {
      const d = await api.uploadAttachment(file);
      previewUrl(d.id, file);
      revokePreview(tmpId);
      setAtts((p) => p.map((a) => (a.id === tmpId ? { ...d, file } : a)));
    } catch (err) {
      revokePreview(tmpId);
      setAtts((p) => p.filter((a) => a.id !== tmpId));
      notifyError(err);
    }
  }

  async function uploadFiles(files) {
    for (const file of files) await uploadFile(file);
  }

  async function onPickFiles(e) {
    const files = [...(e.target.files || [])];
    e.target.value = "";
    await uploadFiles(files);
  }

  async function onPaste(e) {
    const items = [...(e.clipboardData?.items || [])];
    const images = items.filter((it) => it.kind === "file" && it.type.startsWith("image/"));
    if (!images.length) return;
    e.preventDefault();
    const files = [];
    for (const it of images) {
      const blob = it.getAsFile();
      if (!blob) continue;
      const ext = (blob.type.split("/")[1] || "png").split("+")[0];
      const named = blob.name
        ? blob
        : new File([blob], `pasted-${Date.now()}.${ext}`, { type: blob.type });
      files.push(named);
    }
    if (!files.length) return;
    await uploadFiles(files);
    notify("Image attached", files.length > 1 ? `${files.length} pasted images attached.` : "Pasted image attached.", "success");
  }

  function onDragEnter(e) {
    if (![...(e.dataTransfer?.types || [])].includes("Files")) return;
    e.preventDefault();
    dragDepth.current += 1;
    setDragOver(true);
  }

  function onDragOver(e) {
    if (![...(e.dataTransfer?.types || [])].includes("Files")) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
  }

  function onDragLeave(e) {
    if (![...(e.dataTransfer?.types || [])].includes("Files")) return;
    dragDepth.current = Math.max(0, dragDepth.current - 1);
    if (dragDepth.current === 0) setDragOver(false);
  }

  async function onDrop(e) {
    if (![...(e.dataTransfer?.types || [])].includes("Files")) return;
    e.preventDefault();
    dragDepth.current = 0;
    setDragOver(false);
    const files = [...(e.dataTransfer?.files || [])];
    if (files.length) await uploadFiles(files);
  }

  async function removeAtt(att) {
    revokePreview(att.id);
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
      if (canE2E) {
        await lookupKeys(recipientAddrs);
        const recipientKeys = recipientAddrs.map((addr) => keyCache.current.get(addr));
        if (recipientKeys.some((k) => !k)) {
          notify(
            "Cannot encrypt",
            "A recipient is missing an encryption key. Message not sent.",
            "warning",
          );
          return;
        }
        if (!ownKeyRef.current) {
          const own = await api.getPgp();
          ownKeyRef.current = own?.publicKey || null;
        }
        if (!ownKeyRef.current) {
          notify("Cannot encrypt", "Your own encryption key is unavailable. Message not sent.", "warning");
          return;
        }
        const editorText = editorRef.current?.getText?.() ?? bodyText;
        const armored = await pgp.encryptFor([...recipientKeys, ownKeyRef.current], editorText);
        await api.send({
          from,
          to: recipients,
          cc: parseRecipients(cc),
          subject,
          pgp: true,
          text: armored,
          inReplyTo: meta.inReplyTo,
          references: meta.references || [],
          draftId: draftIdRef.current || undefined,
        });
        notify(
          "Sent",
          `Encrypted message to ${recipients[0]}${recipients.length > 1 ? ` +${recipients.length - 1}` : ""} sent.`,
          "success",
        );
        onSent?.();
        onClose();
        return;
      }
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
      <Dialog
        style={{ width: 640, maxWidth: "94vw", padding: 24 }}
        className={dragOver ? "em-compose-dragging" : undefined}
        onPaste={onPaste}
        onDragEnter={onDragEnter}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
      >
        {dragOver && (
          <div className="em-drop-overlay">
            <Paperclip size={26} />
            <span>Drop to attach</span>
          </div>
        )}
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
              {atts.map((a) => {
                const thumb = previewUrl(a.id, a.file);
                const Glyph = attIcon(a.mime);
                return (
                  <span key={a.id} className="em-pending-chip">
                    <span className="em-pending-thumb">
                      {a.pending ? (
                        <Loader size="sm" />
                      ) : thumb ? (
                        <img src={thumb} alt="" />
                      ) : (
                        <Glyph size={18} />
                      )}
                    </span>
                    <span className="em-pending-meta">
                      <span className="em-pending-name">{a.filename}</span>
                      <span className="em-pending-size">{a.pending ? "Uploading…" : humanSize(a.size)}</span>
                    </span>
                    <button type="button" className="em-pending-x" aria-label="Remove" onClick={() => removeAtt(a)}>
                      <X size={12} />
                    </button>
                  </span>
                );
              })}
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
          {user.pgpEnabled === true &&
            (canE2E ? (
              <span
                className="em-e2e-chip is-on"
                title="Only the recipients can read this. The server never sees it."
              >
                <Lock size={13} weight="fill" />
                End-to-end encrypted
              </span>
            ) : (
              <span className="em-e2e-chip" title={e2eReason()}>
                <Lock size={13} />
                Not end-to-end encrypted
              </span>
            ))}
          <Button variant="secondary-destructive" icon={Trash} onClick={onDiscard}>
            Discard
          </Button>
        </div>
      </Dialog>
    </DialogRoot>
  );
}
