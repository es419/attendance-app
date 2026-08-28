"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { AttendanceEntry, AttendanceFile, DriveStatus } from "@/lib/types";

type Tab = "home" | "records" | "files";

const pad = (n: number) => String(n).padStart(2, "0");
const TARGET_MINUTES = 120 * 60;
const MONTHS_HE = ["ינואר", "פברואר", "מרץ", "אפריל", "מאי", "יוני", "יולי", "אוגוסט", "ספטמבר", "אוקטובר", "נובמבר", "דצמבר"];

function formatDuration(minutes: number) {
  const safe = Number.isFinite(minutes) ? Math.max(0, Math.floor(minutes)) : 0;
  return `${Math.floor(safe / 60)}:${pad(safe % 60)}`;
}

function Icon({ name }: { name: "home" | "records" | "files" | "more" | "plus" | "cloud" | "drive" | "trash" | "edit" | "external" | "close" }) {
  const paths = {
    home: <><path d="M3 10.8 12 3l9 7.8"/><path d="M5.5 9.5V21h13V9.5"/><path d="M9.5 21v-7h5v7"/></>,
    records: <><rect x="5" y="3" width="14" height="18" rx="2"/><path d="M8 8h8M8 12h8M8 16h5"/></>,
    files: <><path d="M3 7a2 2 0 0 1 2-2h5l2 2h7a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z"/></>,
    more: <><circle cx="5" cy="12" r="1" fill="currentColor"/><circle cx="12" cy="12" r="1" fill="currentColor"/><circle cx="19" cy="12" r="1" fill="currentColor"/></>,
    plus: <><path d="M12 5v14M5 12h14"/></>,
    cloud: <><path d="M7 18h10a4 4 0 0 0 .7-7.94A6 6 0 0 0 6.2 9.3 4.5 4.5 0 0 0 7 18Z"/><path d="m9 13 2 2 4-4"/></>,
    drive: <><path d="M8.3 3h7.4l5.1 8.8-3.7 6.4H6.9l-3.7-6.4L8.3 3Z"/><path d="m8.3 3 5.1 8.8h7.4M3.2 11.8h10.2l3.7 6.4"/></>,
    trash: <><path d="M4 7h16M9 7V4h6v3M7 7l1 14h8l1-14M10 11v6M14 11v6"/></>,
    edit: <><path d="m4 20 4.5-1 10-10a2.1 2.1 0 0 0-3-3l-10 10L4 20Z"/><path d="m14 7 3 3"/></>,
    external: <><path d="M14 4h6v6M20 4l-9 9"/><path d="M18 13v6a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h6"/></>,
    close: <><path d="m6 6 12 12M18 6 6 18"/></>,
  };
  return <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{paths[name]}</svg>;
}

async function api<T>(input: RequestInfo | URL, init?: RequestInit): Promise<T> {
  const response = await fetch(input, { ...init, cache: "no-store" });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "משהו השתבש");
  return data as T;
}

export default function Page() {
  const [tab, setTab] = useState<Tab>("home");
  const [now, setNow] = useState(new Date());
  const [status, setStatus] = useState<DriveStatus | null>(null);
  const [files, setFiles] = useState<AttendanceFile[]>([]);
  const [selectedFileId, setSelectedFileId] = useState<string | null>(null);
  const [entries, setEntries] = useState<AttendanceEntry[]>([]);
  const [loadingFiles, setLoadingFiles] = useState(false);
  const [loadingEntries, setLoadingEntries] = useState(false);
  const [pendingAction, setPendingAction] = useState<"in" | "out" | "create" | "rename" | "delete" | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [createName, setCreateName] = useState("");
  const [createFolderName, setCreateFolderName] = useState("");
  const [createSubfolderName, setCreateSubfolderName] = useState("");
  const [menuFile, setMenuFile] = useState<AttendanceFile | null>(null);

  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const loadStatus = useCallback(async () => {
    try {
      const data = await api<DriveStatus>("/api/drive/status");
      setStatus(data);
      return data;
    } catch {
      const fallback: DriveStatus = { configured: false, connected: false, mode: "not-configured" };
      setStatus(fallback);
      return fallback;
    }
  }, []);

  const loadFiles = useCallback(async () => {
    setLoadingFiles(true);
    try {
      const data = await api<{ files: AttendanceFile[] }>("/api/drive/files");
      setFiles(data.files);
      setSelectedFileId((current) => {
        const saved = typeof window !== "undefined" ? window.localStorage.getItem("attendance:selectedWorkspace") : null;
        const candidate = current || saved;
        if (candidate && data.files.some((file) => file.id === candidate)) return candidate;
        return data.files[0]?.id || null;
      });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "לא ניתן לסנכרן את Drive");
    } finally {
      setLoadingFiles(false);
    }
  }, []);

  const loadEntries = useCallback(async (workspaceId: string) => {
    setLoadingEntries(true);
    try {
      const data = await api<{ entries: AttendanceEntry[] }>(`/api/attendance?workspaceId=${encodeURIComponent(workspaceId)}`);
      setEntries(data.entries);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "לא ניתן לקרוא רשומות");
    } finally {
      setLoadingEntries(false);
    }
  }, []);

  useEffect(() => {
    void (async () => {
      const currentStatus = await loadStatus();
      if (currentStatus.connected) await loadFiles();
    })();
  }, [loadFiles, loadStatus]);

  useEffect(() => {
    if (!selectedFileId || !status?.connected) {
      setEntries([]);
      return;
    }
    window.localStorage.setItem("attendance:selectedWorkspace", selectedFileId);
    void loadEntries(selectedFileId);
  }, [selectedFileId, status?.connected, loadEntries]);

  useEffect(() => {
    if (!status?.connected) return;
    const sync = () => {
      void loadFiles();
      if (selectedFileId) void loadEntries(selectedFileId);
    };
    const interval = window.setInterval(sync, 15000);
    const onVisible = () => document.visibilityState === "visible" && sync();
    window.addEventListener("focus", sync);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", sync);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [status?.connected, selectedFileId, loadEntries, loadFiles]);

  useEffect(() => {
    if (!message) return;
    const id = window.setTimeout(() => setMessage(null), 4200);
    return () => window.clearTimeout(id);
  }, [message]);

  const selectedFile = files.find((file) => file.id === selectedFileId) || null;
  const activeEntry = entries.find((entry) => !entry.clockOut && entry.clockInIso) || null;
  const activeStart = activeEntry?.clockInIso ? new Date(activeEntry.clockInIso) : null;
  const activeMinutes = activeStart ? Math.max(0, Math.floor((now.getTime() - activeStart.getTime()) / 60000)) : 0;
  const monthMinutes = useMemo(
    () => entries.reduce((sum, entry) => sum + (entry.clockOut ? entry.durationMinutes : 0), 0) + (activeEntry ? activeMinutes : 0),
    [entries, activeEntry, activeMinutes]
  );
  const progress = Math.min(100, Math.round((monthMinutes / TARGET_MINUTES) * 100));
  const todayDate = `${pad(now.getDate())}.${pad(now.getMonth() + 1)}.${now.getFullYear()}`;
  const todayEntry = entries.find((entry) => entry.date === todayDate) || activeEntry || null;

  const refreshCurrent = useCallback(async () => {
    if (!selectedFileId) return;
    await Promise.all([loadFiles(), loadEntries(selectedFileId)]);
  }, [selectedFileId, loadFiles, loadEntries]);

  async function clock(action: "in" | "out") {
    if (!selectedFileId || pendingAction) return;
    setPendingAction(action);
    try {
      await api(`/api/attendance/clock-${action}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspaceId: selectedFileId }),
      });
      await refreshCurrent();
      setMessage(action === "in" ? "הכניסה נשמרה ב-Google Sheets" : "היציאה נשמרה ב-Google Sheets");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "הפעולה נכשלה");
    } finally {
      setPendingAction(null);
    }
  }

  async function createFile() {
    const name = createName.trim();
    const folderName = createFolderName.trim();
    const subfolderName = createSubfolderName.trim();
    if (!name || !folderName || pendingAction) return;
    setPendingAction("create");
    try {
      const data = await api<{ file: AttendanceFile }>("/api/drive/files", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, folderName, subfolderName: subfolderName || undefined }),
      });
      setCreateOpen(false);
      setCreateName("");
      setCreateFolderName("");
      setCreateSubfolderName("");
      await loadFiles();
      setSelectedFileId(data.file.id);
      setTab("home");
      setMessage("התיקייה וקובץ הנוכחות נוצרו ב-Google Drive");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "לא ניתן ליצור קובץ");
    } finally {
      setPendingAction(null);
    }
  }

  async function renameFile(file: AttendanceFile) {
    const name = window.prompt("שם חדש", file.name)?.trim();
    if (!name || name === file.name) return;
    setPendingAction("rename");
    try {
      await api(`/api/drive/files/${encodeURIComponent(file.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      setMenuFile(null);
      await loadFiles();
      setMessage("השם עודכן גם ב-Google Drive");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "לא ניתן לשנות שם");
    } finally {
      setPendingAction(null);
    }
  }

  async function deleteFile(file: AttendanceFile) {
    const ok = window.confirm(`להעביר את “${file.name}” לאשפה ב-Google Drive?`);
    if (!ok) return;
    setPendingAction("delete");
    try {
      await api(`/api/drive/files/${encodeURIComponent(file.id)}`, { method: "DELETE" });
      setMenuFile(null);
      if (selectedFileId === file.id) setSelectedFileId(null);
      await loadFiles();
      setMessage("הקובץ הועבר לאשפה ב-Google Drive");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "לא ניתן למחוק");
    } finally {
      setPendingAction(null);
    }
  }

  async function disconnect() {
    await fetch("/api/auth/logout", { method: "POST" });
    setStatus({ configured: true, connected: false, mode: "disconnected" });
    setFiles([]);
    setEntries([]);
    setSelectedFileId(null);
    window.localStorage.removeItem("attendance:selectedWorkspace");
  }

  const connected = Boolean(status?.connected);
  const configured = Boolean(status?.configured);
  const hasWorkspace = connected && Boolean(selectedFile);

  return (
    <main className="app-shell">
      <section className="app-card">
        <header className="topbar">
          <div>
            <p className="eyebrow">{selectedFile?.name || "נוכחות בעבודה"}</p>
            <h1>{tab === "home" ? "היום" : tab === "records" ? "רשומות" : "הקבצים שלי"}</h1>
          </div>
          <button className="icon-button" aria-label="עבור לקבצים" onClick={() => setTab("files")}><Icon name="more" /></button>
        </header>

        {tab === "home" && (
          <div className="screen-content home-screen">
            <div className="date-clock">
              <p>{now.toLocaleDateString("he-IL", { weekday: "long", day: "numeric", month: "long" })}</p>
              <strong>{pad(now.getHours())}:{pad(now.getMinutes())}</strong>
            </div>

            {!status && <section className="panel center-panel"><div className="spinner"/><p>בודק חיבור ל-Google Drive…</p></section>}

            {status && !configured && (
              <section className="panel connect-panel">
                <div className="large-icon"><Icon name="drive" /></div>
                <h2>צריך להגדיר Google OAuth</h2>
                <p>הקוד כבר מוכן. הוסף את פרטי Google Cloud ל־<code>.env.local</code> ואז הפעל מחדש את השרת.</p>
              </section>
            )}

            {status && configured && !connected && (
              <section className="panel connect-panel">
                <div className="large-icon"><Icon name="drive" /></div>
                <h2>חבר את Google Drive</h2>
                <p>Drive יהיה מקור הנתונים של האפליקציה. יצירה, שינוי ומחיקה יתבצעו ישירות שם.</p>
                <a className="primary-link" href="/api/auth/google">חבר Google Drive</a>
              </section>
            )}

            {connected && !selectedFile && (
              <section className="panel connect-panel">
                <div className="large-icon"><Icon name="files" /></div>
                <h2>אין עדיין קובץ נוכחות</h2>
                <p>צור קובץ ראשון. תיווצר ב-Drive תיקייה ובתוכה Google Sheet לשנה הנוכחית עם 12 חודשי השנה.</p>
                <button className="primary-link button-link" onClick={() => setCreateOpen(true)}>צור קובץ ראשון</button>
              </section>
            )}

            {hasWorkspace && (
              <>
                <div className="action-stack">
                  <button className="primary-action" onClick={() => void clock("in")} disabled={Boolean(activeEntry) || Boolean(pendingAction)}>
                    <span className="action-dot in" /> {pendingAction === "in" ? "שומר…" : "כניסה לעבודה"}
                  </button>
                  <button className="secondary-action" onClick={() => void clock("out")} disabled={!activeEntry || Boolean(pendingAction)}>
                    <span className="action-dot out" /> {pendingAction === "out" ? "שומר…" : "יציאה מהעבודה"}
                  </button>
                </div>

                <section className="panel today-panel">
                  <div className="panel-title"><h2>היום</h2><span className={activeEntry ? "status active" : "status"}>{activeEntry ? "בעבודה" : "לא בעבודה"}</span></div>
                  <div className="stats-grid">
                    <div><span>כניסה</span><b>{todayEntry?.clockIn ?? "--"}</b></div>
                    <div><span>יציאה</span><b>{todayEntry?.clockOut ?? "--"}</b></div>
                    <div><span>זמן עבודה</span><b>{activeEntry ? formatDuration(activeMinutes) : formatDuration(todayEntry?.durationMinutes ?? 0)}</b></div>
                  </div>
                </section>

                <section className="panel monthly-panel">
                  <div className="panel-title"><h2>{MONTHS_HE[now.getMonth()]}</h2><span>{progress}%</span></div>
                  <div className="hours-line"><strong>{formatDuration(monthMinutes)}</strong><span>מתוך 120:00 שעות</span></div>
                  <div className="progress-track"><div style={{ width: `${progress}%` }} /></div>
                  <div className="remaining">נותרו {formatDuration(Math.max(0, TARGET_MINUTES - monthMinutes))} שעות</div>
                </section>

                <div className="sync-pill"><Icon name="cloud" /> {loadingEntries ? "מסנכרן…" : "Google Drive הוא מקור הנתונים"}</div>
              </>
            )}
          </div>
        )}

        {tab === "records" && (
          <div className="screen-content">
            {!connected ? (
              <section className="panel connect-panel"><h2>Google Drive לא מחובר</h2><p>חבר אותו במסך הבית כדי לראות רשומות.</p></section>
            ) : !selectedFile ? (
              <section className="panel connect-panel"><h2>בחר קובץ נוכחות</h2><button className="small-button" onClick={() => setTab("files")}>עבור לקבצים</button></section>
            ) : (
              <>
                <div className="section-heading"><div><p className="eyebrow">{MONTHS_HE[now.getMonth()]} {now.getFullYear()}</p><h2>רשומות אחרונות</h2></div><span className="live-label">{loadingEntries ? "מסנכרן" : "חי מ-Sheets"}</span></div>
                <div className="record-list">
                  {entries.length === 0 && <div className="empty-state">עדיין אין רשומות בחודש הזה.</div>}
                  {entries.map((entry) => (
                    <article className="record-card" key={entry.id}>
                      <div className="record-date"><strong>{entry.date}</strong><span>{entry.weekday}</span></div>
                      <div className="record-times"><span>{entry.clockIn}</span><i>→</i><span>{entry.clockOut ?? "עכשיו"}</span></div>
                      <strong className="record-total">{entry.clockOut ? formatDuration(entry.durationMinutes) : formatDuration(activeMinutes)}</strong>
                    </article>
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        {tab === "files" && (
          <div className="screen-content">
            <div className="section-heading">
              <div><p className="eyebrow">Google Drive</p><h2>קבצי נוכחות</h2></div>
              {connected && <button className="small-button" onClick={() => setCreateOpen(true)}><Icon name="plus"/> קובץ חדש</button>}
            </div>

            {connected && (
              <section className="drive-account">
                <div className="drive-badge"><Icon name="drive" /></div>
                <div><strong>{status?.name || "Google Drive"}</strong><span>{status?.email || "מחובר"}</span></div>
                <button className="text-button" onClick={() => void disconnect()}>נתק</button>
              </section>
            )}

            {!configured && <section className="panel connect-panel"><h2>Google OAuth עדיין לא מוגדר</h2><p>לאחר שנוסיף את המפתחות ל־<code>.env.local</code>, החיבור יופיע כאן.</p></section>}
            {configured && !connected && <section className="panel connect-panel"><h2>Drive לא מחובר</h2><a className="primary-link" href="/api/auth/google">חבר Google Drive</a></section>}

            {connected && loadingFiles && files.length === 0 && <div className="empty-state">טוען קבצים מ-Drive…</div>}
            {connected && !loadingFiles && files.length === 0 && <div className="empty-state">אין עדיין קבצים. צור אחד מהכפתור למעלה.</div>}

            {files.map((file) => (
              <article className={`file-card ${selectedFileId === file.id ? "selected-file" : ""}`} key={file.id} onClick={() => { setSelectedFileId(file.id); setTab("home"); }}>
                <div className="file-icon"><Icon name="files" /></div>
                <div className="file-info">
                  <strong>{file.name}</strong>
                  <span className="file-path">{file.folderPath?.length ? `נוכחות בעבודה / ${file.folderPath.join(" / ")}` : "נוכחות בעבודה"}</span>
                  <span>{selectedFileId === file.id ? "קובץ פעיל · מסונכרן" : "מסונכרן עם Google Drive"}</span>
                </div>
                <span className="sync-dot" title="מסונכרן" />
                <button className="icon-button compact" aria-label={`אפשרויות ${file.name}`} onClick={(event) => { event.stopPropagation(); setMenuFile(file); }}><Icon name="more" /></button>
              </article>
            ))}
            {connected && <p className="files-note">הרשימה נקראת ישירות מ-Google Drive ומתעדכנת גם כשחוזרים לאפליקציה וגם כל 15 שניות.</p>}
          </div>
        )}

        <nav className="bottom-nav" aria-label="ניווט ראשי">
          <button className={tab === "home" ? "selected" : ""} onClick={() => setTab("home")}><Icon name="home"/><span>בית</span></button>
          <button className={tab === "records" ? "selected" : ""} onClick={() => setTab("records")}><Icon name="records"/><span>רשומות</span></button>
          <button className={tab === "files" ? "selected" : ""} onClick={() => setTab("files")}><Icon name="files"/><span>קבצים</span></button>
        </nav>
      </section>

      {message && <div className="toast" role="status">{message}</div>}

      {createOpen && (
        <div className="modal-backdrop" onMouseDown={() => !pendingAction && setCreateOpen(false)}>
          <section className="modal-card" onMouseDown={(event) => event.stopPropagation()}>
            <div className="modal-title"><div><p className="eyebrow">Google Drive</p><h2>קובץ נוכחות חדש</h2></div><button className="icon-button compact" onClick={() => setCreateOpen(false)} aria-label="סגור"><Icon name="close"/></button></div>

            <label className="field-label" htmlFor="file-name">שם קובץ הנוכחות</label>
            <input id="file-name" className="text-input" autoFocus value={createName} onChange={(event) => setCreateName(event.target.value)} placeholder="לדוגמה: מס הכנסה" />

            <label className="field-label" htmlFor="folder-name">שם התיקייה ב-Drive</label>
            <input id="folder-name" className="text-input" value={createFolderName} onChange={(event) => setCreateFolderName(event.target.value)} placeholder="לדוגמה: עבודה" />

            <label className="field-label" htmlFor="subfolder-name">תת-תיקייה <span className="optional-label">אופציונלי</span></label>
            <input id="subfolder-name" className="text-input" value={createSubfolderName} onChange={(event) => setCreateSubfolderName(event.target.value)} placeholder="לדוגמה: רשות המסים" onKeyDown={(event) => event.key === "Enter" && void createFile()} />

            <div className="drive-preview">
              <span>הנתיב שייווצר</span>
              <strong>נוכחות בעבודה / {createFolderName.trim() || "תיקייה"}{createSubfolderName.trim() ? ` / ${createSubfolderName.trim()}` : ""} / {createName.trim() || "קובץ נוכחות"}</strong>
              <small>בתוך קובץ הנוכחות ייווצר אוטומטית Google Sheet בשם נוכחות {now.getFullYear()} עם 12 חודשי השנה.</small>
            </div>

            <p className="modal-note">התיקיות הן תיקיות Drive אמיתיות. שינוי שם, העברה או מחיקה ב-Drive יתעדכנו באפליקציה בסנכרון הבא.</p>
            <button className="primary-action modal-action" disabled={!createName.trim() || !createFolderName.trim() || pendingAction === "create"} onClick={() => void createFile()}>{pendingAction === "create" ? "יוצר ב-Drive…" : "צור ב-Google Drive"}</button>
          </section>
        </div>
      )}

      {menuFile && (
        <div className="modal-backdrop bottom-sheet-backdrop" onMouseDown={() => !pendingAction && setMenuFile(null)}>
          <section className="bottom-sheet" onMouseDown={(event) => event.stopPropagation()}>
            <div className="sheet-grabber"/>
            <div className="sheet-file-title"><strong>{menuFile.name}</strong><span>Google Drive</span></div>
            {menuFile.webViewLink && <a className="sheet-action" href={menuFile.webViewLink} target="_blank" rel="noreferrer"><Icon name="external"/> פתח ב-Google Drive</a>}
            <button className="sheet-action" onClick={() => void renameFile(menuFile)} disabled={Boolean(pendingAction)}><Icon name="edit"/> שנה שם</button>
            <button className="sheet-action danger" onClick={() => void deleteFile(menuFile)} disabled={Boolean(pendingAction)}><Icon name="trash"/> העבר לאשפה</button>
            <button className="sheet-cancel" onClick={() => setMenuFile(null)}>ביטול</button>
          </section>
        </div>
      )}
    </main>
  );
}
