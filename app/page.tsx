"use client";

import { useEffect, useMemo, useState } from "react";
import { entries as initialEntries, files } from "@/lib/mock-data";
import type { AttendanceEntry } from "@/lib/types";

type Tab = "home" | "records" | "files";

const pad = (n: number) => String(n).padStart(2, "0");
const timeNow = () => {
  const d = new Date();
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

function formatDuration(minutes: number) {
  return `${Math.floor(minutes / 60)}:${pad(minutes % 60)}`;
}

function Icon({ name }: { name: "home" | "records" | "files" | "more" | "plus" | "cloud" }) {
  const paths = {
    home: <><path d="M3 10.8 12 3l9 7.8"/><path d="M5.5 9.5V21h13V9.5"/><path d="M9.5 21v-7h5v7"/></>,
    records: <><rect x="5" y="3" width="14" height="18" rx="2"/><path d="M8 8h8M8 12h8M8 16h5"/></>,
    files: <><path d="M3 7a2 2 0 0 1 2-2h5l2 2h7a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z"/></>,
    more: <><circle cx="5" cy="12" r="1" fill="currentColor"/><circle cx="12" cy="12" r="1" fill="currentColor"/><circle cx="19" cy="12" r="1" fill="currentColor"/></>,
    plus: <><path d="M12 5v14M5 12h14"/></>,
    cloud: <><path d="M7 18h10a4 4 0 0 0 .7-7.94A6 6 0 0 0 6.2 9.3 4.5 4.5 0 0 0 7 18Z"/><path d="m9 13 2 2 4-4"/></>,
  };
  return <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{paths[name]}</svg>;
}

export default function Page() {
  const [tab, setTab] = useState<Tab>("home");
  const [now, setNow] = useState(new Date());
  const [entries, setEntries] = useState<AttendanceEntry[]>(initialEntries);
  const [activeStart, setActiveStart] = useState<Date | null>(() => {
    const today = initialEntries.find((e) => !e.clockOut);
    if (!today) return null;
    const [h, m] = today.clockIn.split(":").map(Number);
    const d = new Date(); d.setHours(h, m, 0, 0); return d;
  });
  const [driveMode, setDriveMode] = useState<"loading" | "mock" | "google-drive">("loading");

  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 1000);
    fetch("/api/drive/status").then((r) => r.json()).then((d) => setDriveMode(d.mode)).catch(() => setDriveMode("mock"));
    return () => clearInterval(id);
  }, []);

  const activeMinutes = activeStart ? Math.max(0, Math.floor((now.getTime() - activeStart.getTime()) / 60000)) : 0;
  const monthMinutes = useMemo(() => entries.reduce((sum, e) => sum + e.durationMinutes, 0) + activeMinutes, [entries, activeMinutes]);
  const targetMinutes = 120 * 60;
  const progress = Math.min(100, Math.round((monthMinutes / targetMinutes) * 100));

  function clockIn() {
    if (activeStart) return;
    const d = new Date();
    setActiveStart(d);
    setEntries((prev) => [{ id: crypto.randomUUID(), date: d.toLocaleDateString("he-IL"), weekday: d.toLocaleDateString("he-IL", { weekday: "long" }), clockIn: timeNow(), durationMinutes: 0 }, ...prev.filter(e => e.clockOut)]);
  }

  function clockOut() {
    if (!activeStart) return;
    const mins = Math.max(1, Math.floor((Date.now() - activeStart.getTime()) / 60000));
    setEntries((prev) => prev.map((e, i) => i === 0 && !e.clockOut ? { ...e, clockOut: timeNow(), durationMinutes: mins } : e));
    setActiveStart(null);
  }

  return (
    <main className="app-shell">
      <section className="app-card">
        <header className="topbar">
          <div>
            <p className="eyebrow">נוכחות בעבודה</p>
            <h1>{tab === "home" ? "היום" : tab === "records" ? "רשומות" : "הקבצים שלי"}</h1>
          </div>
          <button className="icon-button" aria-label="אפשרויות"><Icon name="more" /></button>
        </header>

        {tab === "home" && (
          <div className="screen-content home-screen">
            <div className="date-clock">
              <p>{now.toLocaleDateString("he-IL", { weekday: "long", day: "numeric", month: "long" })}</p>
              <strong>{pad(now.getHours())}:{pad(now.getMinutes())}</strong>
            </div>

            <div className="action-stack">
              <button className="primary-action" onClick={clockIn} disabled={Boolean(activeStart)}>
                <span className="action-dot in" /> כניסה לעבודה
              </button>
              <button className="secondary-action" onClick={clockOut} disabled={!activeStart}>
                <span className="action-dot out" /> יציאה מהעבודה
              </button>
            </div>

            <section className="panel today-panel">
              <div className="panel-title"><h2>היום</h2><span className={activeStart ? "status active" : "status"}>{activeStart ? "בעבודה" : "לא בעבודה"}</span></div>
              <div className="stats-grid">
                <div><span>כניסה</span><b>{entries[0]?.clockIn ?? "--"}</b></div>
                <div><span>יציאה</span><b>{entries[0]?.clockOut ?? "--"}</b></div>
                <div><span>זמן עבודה</span><b>{activeStart ? formatDuration(activeMinutes) : formatDuration(entries[0]?.durationMinutes ?? 0)}</b></div>
              </div>
            </section>

            <section className="panel monthly-panel">
              <div className="panel-title"><h2>אוגוסט</h2><span>{progress}%</span></div>
              <div className="hours-line"><strong>{formatDuration(monthMinutes)}</strong><span>מתוך 120:00 שעות</span></div>
              <div className="progress-track"><div style={{ width: `${progress}%` }} /></div>
              <div className="remaining">נותרו {formatDuration(Math.max(0, targetMinutes - monthMinutes))} שעות</div>
            </section>

            <div className="sync-pill"><Icon name="cloud" /> {driveMode === "google-drive" ? "מסונכרן עם Google Drive" : driveMode === "loading" ? "בודק סנכרון…" : "מצב הדגמה — Drive יתחבר בשלב הבא"}</div>
          </div>
        )}

        {tab === "records" && (
          <div className="screen-content">
            <div className="section-heading"><div><p className="eyebrow">אוגוסט 2026</p><h2>רשומות אחרונות</h2></div><button className="small-button"><Icon name="plus"/> הוסף</button></div>
            <div className="record-list">
              {entries.map((entry) => (
                <article className="record-card" key={entry.id}>
                  <div className="record-date"><strong>{entry.date}</strong><span>{entry.weekday}</span></div>
                  <div className="record-times"><span>{entry.clockIn}</span><i>→</i><span>{entry.clockOut ?? "עכשיו"}</span></div>
                  <strong className="record-total">{entry.clockOut ? formatDuration(entry.durationMinutes) : formatDuration(activeMinutes)}</strong>
                </article>
              ))}
            </div>
          </div>
        )}

        {tab === "files" && (
          <div className="screen-content">
            <div className="section-heading"><div><p className="eyebrow">Google Drive</p><h2>קבצי נוכחות</h2></div><button className="small-button"><Icon name="plus"/> קובץ חדש</button></div>
            {files.map((file) => (
              <article className="file-card" key={file.id}>
                <div className="file-icon"><Icon name="files" /></div>
                <div className="file-info"><strong>{file.name}</strong><span>{file.year} · {file.monthHours} / {file.targetHours} שעות</span></div>
                <span className="sync-dot" title="מסונכרן" />
                <button className="icon-button compact" aria-label="אפשרויות קובץ"><Icon name="more" /></button>
              </article>
            ))}
            <p className="files-note">יצירה, שינוי שם ומחיקה יבוצעו מול אותו קובץ ב־Google Drive. אין עותק נפרד בתוך האפליקציה.</p>
          </div>
        )}

        <nav className="bottom-nav" aria-label="ניווט ראשי">
          <button className={tab === "home" ? "selected" : ""} onClick={() => setTab("home")}><Icon name="home"/><span>בית</span></button>
          <button className={tab === "records" ? "selected" : ""} onClick={() => setTab("records")}><Icon name="records"/><span>רשומות</span></button>
          <button className={tab === "files" ? "selected" : ""} onClick={() => setTab("files")}><Icon name="files"/><span>קבצים</span></button>
        </nav>
      </section>
    </main>
  );
}
