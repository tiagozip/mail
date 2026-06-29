import { Button, Dialog, DialogRoot, DropdownMenu, Input, Loader, Select } from "@cloudflare/kumo";
import {
  CaretDown,
  FileDoc,
  File as FileIcon,
  FileImage,
  FilePdf,
  FileText,
  FileZip,
  Lock,
  Paperclip,
  PaperPlaneTilt,
  Trash,
  X,
} from "@phosphor-icons/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "../api.js";
import * as pgp from "../pgp.js";
import { notify, notifyError } from "../toast.js";
import {
  fullDate,
  humanSize,
  initials,
  monoColor,
  parseRecipients,
  plainBodyToHtml,
  sendLaterPresets,
} from "../util.js";
import { RichEditor } from "./RichEditor.jsx";

function attIcon(mime) {
  const m = mime || "";
  if (m.startsWith("image/")) return FileImage;
  if (m === "application/pdf") return FilePdf;
  if (m.includes("zip") || m.includes("compressed") || m.includes("tar") || m.includes("rar"))
    return FileZip;
  if (m.includes("word") || m.includes("opendocument.text") || m.includes("msword")) return FileDoc;
  if (m.startsWith("text/")) return FileText;
  return FileIcon;
}

function RecipientField({ label, value, onChange, autoFocus }) {
  const [suggestions, setSuggestions] = useState([]);
  const [show, setShow] = useState(false);
  const [active, setActive] = useState(0);
  const timer = useRef(null);
  const listRef = useRef(null);
  const inputRef = useRef(null);

  const tokens = value.split(",");
  const recipients = tokens
    .slice(0, -1)
    .map((s) => s.trim())
    .filter(Boolean);
  const draft = (tokens[tokens.length - 1] || "").replace(/^\s+/, "");

  function queueSuggest(d) {
    const last = d.trim();
    clearTimeout(timer.current);
    if (!last) {
      setSuggestions([]);
      setShow(false);
      return;
    }
    timer.current = setTimeout(async () => {
      try {
        const r = await api.contacts(last);
        const list = r.contacts || [];
        setSuggestions(list);
        setActive(0);
        setShow(list.length > 0);
      } catch {
        setSuggestions([]);
        setShow(false);
      }
    }, 150);
  }

  function setDraft(d) {
    onChange(recipients.length ? `${recipients.join(", ")}, ${d}` : d);
    queueSuggest(d);
  }

  function commit(addr) {
    const a = String(addr ?? draft)
      .trim()
      .replace(/,+$/, "");
    if (!a) return;
    onChange(`${[...recipients, a].join(", ")}, `);
    setSuggestions([]);
    setShow(false);
    inputRef.current?.focus();
  }

  function removeAt(i) {
    const next = recipients.filter((_, idx) => idx !== i);
    if (!next.length) {
      onChange(draft);
      return;
    }
    onChange(draft ? `${next.join(", ")}, ${draft}` : `${next.join(", ")}, `);
  }

  function onKeyDown(e) {
    if (show && suggestions.length) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActive((i) => (i + 1) % suggestions.length);
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setActive((i) => (i - 1 + suggestions.length) % suggestions.length);
        return;
      }
      if ((e.key === "Enter" || e.key === "Tab") && suggestions[active]) {
        e.preventDefault();
        commit(suggestions[active].address);
        return;
      }
      if (e.key === "Escape") {
        setShow(false);
        return;
      }
    }
    if ((e.key === "Enter" || e.key === "," || e.key === "Tab") && draft.trim()) {
      e.preventDefault();
      commit();
      return;
    }
    if (e.key === "Backspace" && !draft && recipients.length) {
      e.preventDefault();
      removeAt(recipients.length - 1);
    }
  }

  useEffect(() => {
    const el = listRef.current?.children?.[active];
    el?.scrollIntoView({ block: "nearest" });
  }, [active]);

  return (
    <div className="em-recip-row">
      <label>{label}</label>
      <div className="em-recip-field" onClick={() => inputRef.current?.focus()}>
        {recipients.map((r, i) => (
          <span key={`${r}-${i}`} className="em-recip-chip">
            {r}
            <button
              type="button"
              aria-label={`Remove ${r}`}
              onMouseDown={(e) => {
                e.preventDefault();
                removeAt(i);
              }}
            >
              <X size={11} />
            </button>
          </span>
        ))}
        <div className="em-recip-input">
          <input
            ref={inputRef}
            aria-label={label}
            autoFocus={autoFocus}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={onKeyDown}
            onFocus={() => suggestions.length && setShow(true)}
            onBlur={() => setTimeout(() => setShow(false), 150)}
          />
          {show && suggestions.length > 0 && (
            <div className="em-suggest" ref={listRef}>
              {suggestions.map((c, i) => (
                <div
                  key={c.address}
                  className={`em-suggest-item${i === active ? " is-active" : ""}`}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    commit(c.address);
                  }}
                  onMouseEnter={() => setActive(i)}
                >
                  {c.avatar ? (
                    <img className="em-suggest-avatar" src={c.avatar} alt="" />
                  ) : (
                    <span
                      className="em-suggest-avatar em-suggest-mono"
                      style={{ background: monoColor(c.address) }}
                    >
                      {initials({ name: c.name, address: c.address })}
                    </span>
                  )}
                  <span className="em-suggest-text">
                    {c.name && <span className="em-suggest-name">{c.name}</span>}
                    <span className="em-suggest-addr">{c.address}</span>
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
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
  const [dropImages, setDropImages] = useState(null);
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
    if (editorRef.current && !editorRef.current.isDestroyed)
      editorRef.current.commands.setContent(html || "<p></p>");
    setShowCc(!!init.cc);
    setShowBcc(!!init.bcc);
    for (const url of previews.current.values()) URL.revokeObjectURL(url);
    previews.current.clear();
    setAtts([]);
    setDragOver(false);
    dragDepth.current = 0;
    setDraftId(init.draftId || null);
    draftIdRef.current = init.draftId || null;
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
  const keysReady = recipientAddrs.length > 0 && recipientAddrs.every((addr) => !!keyMap[addr]);
  const canE2E = user.pgpEnabled === true && keysReady && !bccFilled && !pendingAtts;

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
    const tmp = {
      id: tmpId,
      filename: file.name,
      mime: file.type,
      size: file.size,
      pending: true,
      file,
    };
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

  async function addInlineImages(files) {
    for (const file of files) {
      try {
        const d = await api.uploadAttachment(file);
        editorRef.current
          ?.chain()
          .focus()
          .setImage({ src: `/api/attachments/${d.id}/inline`, alt: file.name })
          .run();
      } catch (err) {
        notifyError(err);
      }
    }
  }

  function handleFiles(files, via) {
    dragDepth.current = 0;
    setDragOver(false);
    const images = files.filter((f) => f.type.startsWith("image/"));
    const others = files.filter((f) => !f.type.startsWith("image/"));
    if (others.length) uploadFiles(others);
    if (!images.length) return;
    if (via === "paste") addInlineImages(images);
    else setDropImages(images);
  }

  async function onPickFiles(e) {
    const files = [...(e.target.files || [])];
    e.target.value = "";
    await uploadFiles(files);
  }

  function onPaste(e) {
    const items = [...(e.clipboardData?.items || [])];
    const fileItems = items.filter((it) => it.kind === "file");
    if (!fileItems.length) return;
    e.preventDefault();
    const files = [];
    for (const it of fileItems) {
      const blob = it.getAsFile();
      if (!blob) continue;
      const ext = (blob.type.split("/")[1] || "png").split("+")[0];
      const named = blob.name
        ? blob
        : new File([blob], `pasted-${Date.now()}.${ext}`, { type: blob.type });
      files.push(named);
    }
    if (files.length) handleFiles(files, "paste");
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

  function onDrop(e) {
    if (![...(e.dataTransfer?.types || [])].includes("Files")) return;
    e.preventDefault();
    const files = [...(e.dataTransfer?.files || [])];
    if (files.length) handleFiles(files, "drop");
  }

  async function removeAtt(att) {
    revokePreview(att.id);
    setAtts((p) => p.filter((a) => a.id !== att.id));
    if (!att.pending) await api.deleteAttachment(att.id).catch(() => {});
  }

  function announce(resp, recipients, encrypted, sendAt) {
    if (resp?.scheduled && resp.undoMs > 0 && !sendAt) return;
    if (sendAt || resp?.scheduled) {
      notify("Scheduled", `Will send ${fullDate(sendAt || resp?.sendAt)}.`, "success");
      return;
    }
    const more = recipients.length > 1 ? ` +${recipients.length - 1}` : "";
    notify(
      "Sent",
      `${encrypted ? "Encrypted message" : "Message"} to ${recipients[0]}${more} sent.`,
      "success",
    );
  }

  async function onSend(sendAt) {
    const recipients = parseRecipients(to);
    if (!recipients.length) {
      notify("Add a recipient", "The To field is empty.", "warning");
      return;
    }
    setBusy(true);
    try {
      let payload;
      let plain = bodyText;
      if (canE2E) {
        await lookupKeys(recipientAddrs);
        const recipientKeys = recipientAddrs.map((addr) => keyCache.current.get(addr));
        if (recipientKeys.some((k) => !k)) {
          notify(
            "Cannot encrypt",
            "A recipient is missing an encryption key. Message not sent.",
            "warning",
          );
          setBusy(false);
          return;
        }
        if (!ownKeyRef.current) {
          const own = await api.getPgp();
          ownKeyRef.current = own?.publicKey || null;
        }
        if (!ownKeyRef.current) {
          notify(
            "Cannot encrypt",
            "Your own encryption key is unavailable. Message not sent.",
            "warning",
          );
          setBusy(false);
          return;
        }
        plain = editorRef.current?.getText?.() ?? bodyText;
        const armored = await pgp.encryptFor([...recipientKeys, ownKeyRef.current], plain);
        payload = {
          from,
          to: recipients,
          cc: parseRecipients(cc),
          subject,
          pgp: true,
          text: armored,
          inReplyTo: meta.inReplyTo,
          references: meta.references || [],
          draftId: draftIdRef.current || undefined,
        };
      } else {
        const html = bodyText.trim() || /<img/i.test(bodyHtml) ? bodyHtml : "";
        payload = {
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
        };
      }

      const undoMs = Math.min(120, Math.max(0, Number(user.settings?.undoSend) || 0)) * 1000;
      if (!sendAt) {
        const optimistic = {
          id: `tmp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          threadId: `tmp-${Date.now()}`,
          folder: "sent",
          from: { address: from, name: user.displayName || user.username },
          to: recipients.map((a) => ({ address: a, name: "" })),
          cc: parseRecipients(cc).map((a) => ({ address: a, name: "" })),
          subject: subject || "(no subject)",
          snippet: plain.replace(/\s+/g, " ").trim().slice(0, 140),
          bodyText: plain,
          bodyHtml: !canE2E && (bodyText.trim() || /<img/i.test(bodyHtml)) ? bodyHtml : null,
          hasHtml: !canE2E && bodyHtml ? 1 : 0,
          date: Date.now(),
          isRead: 1,
          pgp: 0,
          attachments: [],
          optimistic: true,
        };
        onSent?.({ deferred: true, undoMs, payload, optimistic });
        onClose();
        return;
      }

      const resp = await api.send(sendAt ? { ...payload, sendAt, skipUndo: true } : payload);
      announce(resp, recipients, canE2E, sendAt);
      onSent?.(resp);
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
    for (const a of atts.filter((x) => !x.pending))
      await api.deleteAttachment(a.id).catch(() => {});
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
          {draftId ? "Edit draft" : "New message"}
        </Dialog.Title>
        <div className="em-compose-fields">
          <div className="em-compose-from">
            <label>From</label>
            {multiAddr ? (
              <Select
                aria-label="From address"
                size="sm"
                value={from}
                onValueChange={(v) => setFrom(v)}
              >
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
            onFiles={handleFiles}
          />
          {dropImages && (
            <div className="em-img-choose">
              <span className="em-img-choose-label">
                Add {dropImages.length} image{dropImages.length > 1 ? "s" : ""} as
              </span>
              <Button
                size="sm"
                variant="primary"
                onClick={() => {
                  addInlineImages(dropImages);
                  setDropImages(null);
                }}
              >
                Inline
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  uploadFiles(dropImages);
                  setDropImages(null);
                }}
              >
                Attachment
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setDropImages(null)}>
                Cancel
              </Button>
            </div>
          )}
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
                      <span className="em-pending-size">
                        {a.pending ? "Uploading…" : humanSize(a.size)}
                      </span>
                    </span>
                    <button
                      type="button"
                      className="em-pending-x"
                      aria-label="Remove"
                      onClick={() => removeAtt(a)}
                    >
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
          <div className="em-split">
            <Button
              className="em-split-main"
              variant="primary"
              icon={PaperPlaneTilt}
              loading={busy}
              onClick={() => onSend()}
            >
              Send
            </Button>
            <DropdownMenu>
              <DropdownMenu.Trigger
                render={(p) => (
                  <Button
                    {...p}
                    className="em-split-caret"
                    variant="primary"
                    shape="square"
                    aria-label="Send later"
                    icon={CaretDown}
                    disabled={busy}
                  />
                )}
              />
              <DropdownMenu.Content>
                <DropdownMenu.Group>
                  <DropdownMenu.Label>Send later</DropdownMenu.Label>
                  {sendLaterPresets().map((p) => (
                    <DropdownMenu.Item key={p.key} onClick={() => onSend(p.sendAt)}>
                      <span className="em-snooze-item">
                        <span>{p.label}</span>
                        <span className="em-snooze-when">{fullDate(p.sendAt)}</span>
                      </span>
                    </DropdownMenu.Item>
                  ))}
                </DropdownMenu.Group>
              </DropdownMenu.Content>
            </DropdownMenu>
          </div>
          <Button variant="outline" icon={Paperclip} onClick={() => fileRef.current?.click()}>
            Attach
          </Button>
          <Button variant="ghost" onClick={onSaveDraftClick}>
            Save draft
          </Button>
          <div className="em-spacer" />
          {user.pgpEnabled === true && canE2E && (
            <span
              className="em-e2e-chip is-on"
              title="Only the recipients can read this. The server never sees it."
            >
              <Lock size={13} weight="fill" />
              End-to-end encrypted
            </span>
          )}
          <Button variant="secondary-destructive" icon={Trash} onClick={onDiscard}>
            Discard
          </Button>
        </div>
      </Dialog>
    </DialogRoot>
  );
}
