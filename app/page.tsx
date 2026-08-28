"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import type {
  AttendanceBreak,
  AttendanceEntry,
  AttendanceFile,
  DriveFolder,
  DriveSpreadsheetCandidate,
  DriveStatus,
  OfflineAttendanceEvent,
  PayrollAddition,
} from "@/lib/types";

type Tab = "home" | "summary" | "records" | "files";
type ThemePreference = "system" | "light" | "dark";
type PendingAction =
  | "in"
  | "out"
  | "break-start"
  | "break-end"
  | "manual"
  | "create"
  | "rename"
  | "move"
  | "delete"
  | "edit-entry"
  | "delete-entry"
  | "folder"
  | "logout"
  | "sync"
  | "settings"
  | "adopt"
  | null;

const pad = (n: number) => String(n).padStart(2, "0");
const DEFAULT_TARGET_HOURS = 120;
const MONTHS_HE = ["ינואר", "פברואר", "מרץ", "אפריל", "מאי", "יוני", "יולי", "אוגוסט", "ספטמבר", "אוקטובר", "נובמבר", "דצמבר"];
const QUEUE_KEY = "attendance:offlineQueue:v1";
const FAILED_QUEUE_KEY = "attendance:failedQueue:v1";
const FILES_CACHE_KEY = "attendance:filesCache:v1";
const ENTRY_CACHE_PREFIX = "attendance:entriesCache:v1:";
const ACTIVE_CACHE_PREFIX = "attendance:activeShift:v1:";
const FILES_FRESH_MS = 120_000;
const ENTRIES_FRESH_MS = 45_000;
const ACTIVE_FRESH_MS = 45_000;

function entryCacheKey(workspaceId: string, year: number, month: number) {
  return `${ENTRY_CACHE_PREFIX}${workspaceId}:${year}:${month}`;
}

function formatMoney(value: number) {
  return new Intl.NumberFormat("he-IL", { style: "currency", currency: "ILS", maximumFractionDigits: 0 }).format(Number.isFinite(value) ? value : 0);
}

function formatDuration(minutes: number) {
  const safe = Number.isFinite(minutes) ? Math.max(0, Math.floor(minutes)) : 0;
  return `${Math.floor(safe / 60)}:${pad(safe % 60)}`;
}

function israelParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jerusalem",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    weekday: "long",
  }).formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value || "";
  const year = Number(get("year"));
  const month = Number(get("month"));
  const day = Number(get("day"));
  return {
    year,
    month,
    day,
    dateInput: `${get("year")}-${get("month")}-${get("day")}`,
    dateDisplay: `${get("day")}.${get("month")}.${get("year")}`,
    time: `${get("hour")}:${get("minute")}`,
    weekday: new Intl.DateTimeFormat("he-IL", { timeZone: "Asia/Jerusalem", weekday: "long" }).format(date),
  };
}

function israelInputDate(date = new Date()) {
  return israelParts(date).dateInput;
}

function displayDateToInput(value: string) {
  const match = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(value);
  return match ? `${match[3]}-${match[2]}-${match[1]}` : israelInputDate();
}

function liveBreakMinutes(breaks: AttendanceBreak[] = [], now = new Date()) {
  return breaks.reduce((sum, item) => {
    const start = Date.parse(item.startIso);
    const end = item.endIso ? Date.parse(item.endIso) : now.getTime();
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return sum;
    return sum + Math.max(0, Math.floor((end - start) / 60000));
  }, 0);
}

function creditedMinutes(gross: number, breakMinutes: number, breakAllowanceMinutes = 40) {
  const allowance = Math.max(0, Math.min(600, Math.floor(Number(breakAllowanceMinutes) || 0)));
  return Math.max(0, gross - Math.max(0, breakMinutes - allowance));
}

function parsePath(value: string) {
  return value.split(/[\\/]+/).map((part) => part.trim()).filter(Boolean).slice(0, 10);
}

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function Icon({ name }: { name: "home" | "records" | "files" | "more" | "plus" | "cloud" | "drive" | "trash" | "edit" | "external" | "close" | "coffee" | "clock" | "sun" | "moon" | "system" | "logout" | "folder" | "move" | "sync" | "offline" | "summary" }) {
  const paths = {
    home: <><path d="M3 10.8 12 3l9 7.8"/><path d="M5.5 9.5V21h13V9.5"/><path d="M9.5 21v-7h5v7"/></>,
    records: <><rect x="5" y="3" width="14" height="18" rx="2"/><path d="M8 8h8M8 12h8M8 16h5"/></>,
    summary: <><path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/></>,
    files: <><path d="M3 7a2 2 0 0 1 2-2h5l2 2h7a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z"/></>,
    folder: <><path d="M3 7a2 2 0 0 1 2-2h5l2 2h7a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z"/><path d="M7 12h10"/></>,
    more: <><circle cx="5" cy="12" r="1" fill="currentColor"/><circle cx="12" cy="12" r="1" fill="currentColor"/><circle cx="19" cy="12" r="1" fill="currentColor"/></>,
    plus: <><path d="M12 5v14M5 12h14"/></>,
    cloud: <><path d="M7 18h10a4 4 0 0 0 .7-7.94A6 6 0 0 0 6.2 9.3 4.5 4.5 0 0 0 7 18Z"/><path d="m9 13 2 2 4-4"/></>,
    drive: <><path d="M8.3 3h7.4l5.1 8.8-3.7 6.4H6.9l-3.7-6.4L8.3 3Z"/><path d="m8.3 3 5.1 8.8h7.4M3.2 11.8h10.2l3.7 6.4"/></>,
    trash: <><path d="M4 7h16M9 7V4h6v3M7 7l1 14h8l1-14M10 11v6M14 11v6"/></>,
    edit: <><path d="m4 20 4.5-1 10-10a2.1 2.1 0 0 0-3-3l-10 10L4 20Z"/><path d="m14 7 3 3"/></>,
    move: <><path d="M5 12h14M15 8l4 4-4 4"/><path d="M9 4H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h4"/></>,
    sync: <><path d="M20 7h-5V2"/><path d="M20 7a8 8 0 1 0 1 7"/></>,
    offline: <><path d="M2 2l20 20"/><path d="M7 18h10a4 4 0 0 0 2.1-.6M4.3 14.9A4.5 4.5 0 0 1 6.2 9.3 6 6 0 0 1 8 6.4M13.5 6.1a6 6 0 0 1 4.2 4"/></>,
    external: <><path d="M14 4h6v6M20 4l-9 9"/><path d="M18 13v6a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h6"/></>,
    close: <><path d="m6 6 12 12M18 6 6 18"/></>,
    coffee: <><path d="M4 8h12v5a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5Z"/><path d="M16 10h2a2 2 0 0 1 0 4h-2M7 3v2M11 3v2"/></>,
    clock: <><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></>,
    sun: <><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/></>,
    moon: <><path d="M20 15.4A8 8 0 0 1 8.6 4 8.5 8.5 0 1 0 20 15.4Z"/></>,
    system: <><rect x="3" y="4" width="18" height="13" rx="2"/><path d="M8 21h8M12 17v4"/></>,
    logout: <><path d="M10 17l5-5-5-5M15 12H3"/><path d="M14 4h5a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-5"/></>,
  };
  return <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{paths[name]}</svg>;
}


function HoldActionButton({
  className,
  disabled,
  onComplete,
  children,
  holdMs = 700,
  ariaLabel,
}: {
  className: string;
  disabled?: boolean;
  onComplete: () => void | Promise<void>;
  children: ReactNode;
  holdMs?: number;
  ariaLabel: string;
}) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [holding, setHolding] = useState(false);
  const completedRef = useRef(false);

  const clearHold = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
    if (!completedRef.current) setHolding(false);
    completedRef.current = false;
  }, []);

  const startHold = useCallback(() => {
    if (disabled || timerRef.current) return;
    completedRef.current = false;
    setHolding(true);
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      completedRef.current = true;
      setHolding(false);
      if (typeof navigator !== "undefined" && "vibrate" in navigator) navigator.vibrate?.(24);
      void onComplete();
    }, holdMs);
  }, [disabled, holdMs, onComplete]);

  useEffect(() => () => {
    if (timerRef.current) clearTimeout(timerRef.current);
  }, []);

  return (
    <button
      type="button"
      className={`${className} hold-action${holding ? " is-holding" : ""}`}
      disabled={disabled}
      aria-label={ariaLabel}
      onPointerDown={(event) => { event.currentTarget.setPointerCapture?.(event.pointerId); startHold(); }}
      onPointerUp={clearHold}
      onPointerCancel={clearHold}
      onLostPointerCapture={clearHold}
      onKeyDown={(event) => {
        if ((event.key === "Enter" || event.key === " ") && !event.repeat) {
          event.preventDefault();
          startHold();
        }
      }}
      onKeyUp={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          clearHold();
        }
      }}
      onContextMenu={(event) => event.preventDefault()}
    >
      <span className="hold-action-content">{children}</span>
      <span className="hold-action-hint">החזק לשמירה</span>
      <span className="hold-action-progress" aria-hidden="true" />
    </button>
  );
}

class ApiRequestError extends Error {
  network: boolean;
  status: number;
  constructor(message: string, network = false, status = 0) {
    super(message);
    this.network = network;
    this.status = status;
  }
}

const inFlightGets = new Map<string, Promise<unknown>>();

async function api<T>(input: RequestInfo | URL, init?: RequestInit): Promise<T> {
  const method = (init?.method || "GET").toUpperCase();
  const requestKey = method === "GET" ? String(input) : null;
  if (requestKey) {
    const existing = inFlightGets.get(requestKey);
    if (existing) return existing as Promise<T>;
  }

  const request = (async () => {
    let response: Response;
    try {
      response = await fetch(input, { ...init, cache: "no-store", credentials: "include" });
    } catch {
      throw new ApiRequestError("אין כרגע חיבור לרשת", true);
    }
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new ApiRequestError(data.error || "משהו השתבש", false, response.status);
    return data as T;
  })();

  if (requestKey) {
    inFlightGets.set(requestKey, request);
    void request.then(
      () => inFlightGets.delete(requestKey),
      () => inFlightGets.delete(requestKey),
    );
  }
  return request;
}

function eventEndpoint(event: OfflineAttendanceEvent) {
  if (event.type === "manual") return "/api/attendance/manual";
  return `/api/attendance/${event.type}`;
}

function eventBody(event: OfflineAttendanceEvent) {
  if (event.type === "manual") {
    return { workspaceId: event.workspaceId, entryId: event.entryId, ...(event.payload || {}) };
  }
  return {
    workspaceId: event.workspaceId,
    entryId: event.entryId,
    atIso: event.atIso,
    breakId: event.breakId,
    year: event.year,
    month: event.month,
  };
}

function optimisticEvent(entries: AttendanceEntry[], event: OfflineAttendanceEvent, breakAllowanceMinutes = 40) {
  const copy = entries.map((entry) => ({ ...entry, breaks: entry.breaks ? [...entry.breaks] : [] }));
  const at = event.atIso ? new Date(event.atIso) : new Date();
  const local = israelParts(at);

  if (event.type === "clock-in") {
    if (copy.some((entry) => entry.id === event.entryId)) return copy;
    return [{
      id: event.entryId,
      date: local.dateDisplay,
      weekday: local.weekday,
      clockIn: local.time,
      durationMinutes: 0,
      grossDurationMinutes: 0,
      breakMinutes: 0,
      breaks: [],
      source: "quick" as const,
      clockInIso: at.toISOString(),
      year: event.year || local.year,
      month: event.month || local.month,
    }, ...copy];
  }

  if (event.type === "manual" && event.payload?.date && event.payload.clockIn && event.payload.clockOut) {
    if (copy.some((entry) => entry.id === event.entryId)) return copy;
    const [y, m, d] = event.payload.date.split("-").map(Number);
    const start = new Date(`${event.payload.date}T${event.payload.clockIn}:00`);
    let end = new Date(`${event.payload.date}T${event.payload.clockOut}:00`);
    if (end <= start) end = new Date(end.getTime() + 86400000);
    const gross = Math.max(1, Math.floor((end.getTime() - start.getTime()) / 60000));
    const breaks = Number(event.payload.breakMinutes || 0);
    return [{
      id: event.entryId,
      date: `${pad(d)}.${pad(m)}.${y}`,
      weekday: new Intl.DateTimeFormat("he-IL", { weekday: "long" }).format(start),
      clockIn: event.payload.clockIn,
      clockOut: event.payload.clockOut,
      durationMinutes: creditedMinutes(gross, breaks, breakAllowanceMinutes),
      grossDurationMinutes: gross,
      breakMinutes: breaks,
      breaks: [],
      source: "manual" as const,
      note: event.payload.note,
      year: y,
      month: m,
    }, ...copy];
  }

  const index = copy.findIndex((entry) => entry.id === event.entryId);
  if (index < 0) return copy;
  const entry = copy[index];

  if (event.type === "break-start") {
    if (entry.breaks?.some((item) => item.id === event.breakId)) return copy;
    entry.breaks = [...(entry.breaks || []), { id: event.breakId, start: local.time, startIso: at.toISOString() }];
    entry.breakMinutes = liveBreakMinutes(entry.breaks, at);
  } else if (event.type === "break-end") {
    const breaks = [...(entry.breaks || [])];
    let breakIndex = event.breakId ? breaks.findIndex((item) => item.id === event.breakId) : -1;
    if (breakIndex < 0) breakIndex = breaks.findLastIndex((item) => !item.endIso);
    if (breakIndex >= 0 && !breaks[breakIndex].endIso) breaks[breakIndex] = { ...breaks[breakIndex], end: local.time, endIso: at.toISOString() };
    entry.breaks = breaks;
    entry.breakMinutes = liveBreakMinutes(breaks, at);
  } else if (event.type === "clock-out" && !entry.clockOut) {
    const breaks = [...(entry.breaks || [])];
    const activeBreak = breaks.findLastIndex((item) => !item.endIso);
    if (activeBreak >= 0) breaks[activeBreak] = { ...breaks[activeBreak], end: local.time, endIso: at.toISOString() };
    const startMs = Date.parse(entry.clockInIso || "");
    const gross = Number.isFinite(startMs) ? Math.max(1, Math.floor((at.getTime() - startMs) / 60000)) : entry.grossDurationMinutes || 0;
    const breakMinutes = liveBreakMinutes(breaks, at);
    entry.clockOut = local.time;
    entry.clockOutIso = at.toISOString();
    entry.breaks = breaks;
    entry.breakMinutes = breakMinutes;
    entry.grossDurationMinutes = gross;
    entry.durationMinutes = creditedMinutes(gross, breakMinutes, breakAllowanceMinutes);
  }
  return copy;
}

export default function Page() {
  const [tab, setTab] = useState<Tab>("home");
  const [now, setNow] = useState(new Date());
  const [status, setStatus] = useState<DriveStatus | null>(null);
  const [files, setFiles] = useState<AttendanceFile[]>([]);
  const [folders, setFolders] = useState<DriveFolder[]>([]);
  const [selectedFileId, setSelectedFileId] = useState<string | null>(null);
  const [entries, setEntries] = useState<AttendanceEntry[]>([]);
  const [activeShift, setActiveShift] = useState<AttendanceEntry | null>(null);
  const initialPeriod = israelParts();
  const [viewYear, setViewYear] = useState(initialPeriod.year);
  const [viewMonth, setViewMonth] = useState(initialPeriod.month);
  const [loadingFiles, setLoadingFiles] = useState(false);
  const [loadingEntries, setLoadingEntries] = useState(false);
  const [pendingAction, setPendingAction] = useState<PendingAction>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [online, setOnline] = useState(true);
  const [queue, setQueue] = useState<OfflineAttendanceEvent[]>([]);
  const [bootLoading, setBootLoading] = useState(true);
  const [pageLoading, setPageLoading] = useState(false);
  const [refreshLoading, setRefreshLoading] = useState(false);
  const [pullDistance, setPullDistance] = useState(0);
  const [pullReady, setPullReady] = useState(false);
  const filesFetchedAtRef = useRef(0);
  const entriesFetchedAtRef = useRef(new Map<string, number>());
  const activeFetchedAtRef = useRef(new Map<string, number>());
  const didRenderTabRef = useRef(false);
  const queueFlushPromiseRef = useRef<Promise<void> | null>(null);
  const [queueSyncing, setQueueSyncing] = useState(false);
  const refreshBusyRef = useRef(false);
  const shellRef = useRef<HTMLElement | null>(null);
  const pullStartYRef = useRef<number | null>(null);
  const pullReadyRef = useRef(false);

  const [createOpen, setCreateOpen] = useState(false);
  const [createName, setCreateName] = useState("");
  const [createFolderName, setCreateFolderName] = useState("");
  const [createSubfolderName, setCreateSubfolderName] = useState("");
  const [menuFile, setMenuFile] = useState<AttendanceFile | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [theme, setTheme] = useState<ThemePreference>("system");
  const [breakAllowanceInput, setBreakAllowanceInput] = useState("40");
  const [targetHoursInput, setTargetHoursInput] = useState(String(DEFAULT_TARGET_HOURS));
  const [hourlyRateInput, setHourlyRateInput] = useState("0");
  const [pensionPercentInput, setPensionPercentInput] = useState("0");
  const [trainingFundPercentInput, setTrainingFundPercentInput] = useState("0");
  const [nationalHealthPercentInput, setNationalHealthPercentInput] = useState("0");
  const [payrollAdditions, setPayrollAdditions] = useState<PayrollAddition[]>([]);

  const [manualOpen, setManualOpen] = useState(false);
  const [manualDate, setManualDate] = useState(() => israelInputDate());
  const [manualStart, setManualStart] = useState("");
  const [manualEnd, setManualEnd] = useState("");
  const [manualBreakMinutes, setManualBreakMinutes] = useState("0");
  const [manualNote, setManualNote] = useState("");

  const [editingEntry, setEditingEntry] = useState<AttendanceEntry | null>(null);
  const [editDate, setEditDate] = useState("");
  const [editStart, setEditStart] = useState("");
  const [editEnd, setEditEnd] = useState("");
  const [editBreakMinutes, setEditBreakMinutes] = useState("0");
  const [editNote, setEditNote] = useState("");

  const [pathFile, setPathFile] = useState<AttendanceFile | null>(null);
  const [pathValue, setPathValue] = useState("");
  const [folderManagerOpen, setFolderManagerOpen] = useState(false);
  const [newFolderPath, setNewFolderPath] = useState("");
  const [currentFolderSubfolderOpen, setCurrentFolderSubfolderOpen] = useState(false);
  const [currentFolderSubfolderName, setCurrentFolderSubfolderName] = useState("");
  const [existingDriveOpen, setExistingDriveOpen] = useState(false);
  const [driveCandidates, setDriveCandidates] = useState<DriveSpreadsheetCandidate[]>([]);
  const [loadingDriveCandidates, setLoadingDriveCandidates] = useState(false);
  const [overwriteCandidate, setOverwriteCandidate] = useState<DriveSpreadsheetCandidate | null>(null);

  useEffect(() => {
    setOnline(navigator.onLine);
    setQueue(readJson<OfflineAttendanceEvent[]>(QUEUE_KEY, []));
    const cachedFiles = readJson<AttendanceFile[]>(FILES_CACHE_KEY, []);
    if (cachedFiles.length) setFiles(cachedFiles);
    const savedWorkspace = window.localStorage.getItem("attendance:selectedWorkspace");
    if (savedWorkspace) setSelectedFileId(savedWorkspace);
    const onOnline = () => setOnline(true);
    const onOffline = () => setOnline(false);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, []);

  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 15000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const saved = window.localStorage.getItem("attendance:theme") as ThemePreference | null;
    if (saved === "light" || saved === "dark" || saved === "system") setTheme(saved);
  }, []);

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () => {
      const actual = theme === "system" ? (media.matches ? "dark" : "light") : theme;
      document.documentElement.dataset.theme = actual;
      document.documentElement.style.colorScheme = actual;
      document.querySelector('meta[name="theme-color"]')?.setAttribute("content", actual === "dark" ? "#0b0f16" : "#f5f7fb");
    };
    window.localStorage.setItem("attendance:theme", theme);
    apply();
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, [theme]);

  const loadStatus = useCallback(async () => {
    try {
      const data = await api<DriveStatus>("/api/drive/status");
      setStatus(data);
      return data;
    } catch (error) {
      if (error instanceof ApiRequestError && error.network) {
        const fallback: DriveStatus = { configured: true, connected: false, mode: "disconnected" };
        setStatus(fallback);
        return fallback;
      }
      const fallback: DriveStatus = { configured: false, connected: false, mode: "not-configured" };
      setStatus(fallback);
      return fallback;
    }
  }, []);

  const loadFolders = useCallback(async () => {
    if (!navigator.onLine) return;
    try {
      const data = await api<{ folders: DriveFolder[] }>("/api/drive/folders");
      setFolders(data.folders);
    } catch {
      // Folder management is secondary; file reconciliation can still succeed.
    }
  }, []);

  const loadFiles = useCallback(async (force = false) => {
    if (!navigator.onLine) return;
    const nowMs = Date.now();
    if (!force && nowMs - filesFetchedAtRef.current < FILES_FRESH_MS) return;
    setLoadingFiles(true);
    try {
      const data = await api<{ files: AttendanceFile[] }>("/api/drive/files");
      filesFetchedAtRef.current = Date.now();
      setFiles(data.files);
      window.localStorage.setItem(FILES_CACHE_KEY, JSON.stringify(data.files));
      setSelectedFileId((current) => {
        const saved = window.localStorage.getItem("attendance:selectedWorkspace");
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

  const loadEntries = useCallback(async (workspaceId: string, year: number, month: number, force = false) => {
    const key = entryCacheKey(workspaceId, year, month);
    const cached = readJson<AttendanceEntry[]>(key, []);
    setEntries(cached);
    if (!navigator.onLine || !status?.connected) return;

    const fetchedAt = entriesFetchedAtRef.current.get(key) || 0;
    if (!force && Date.now() - fetchedAt < ENTRIES_FRESH_MS) return;

    setLoadingEntries(true);
    try {
      const data = await api<{ entries: AttendanceEntry[] }>(`/api/attendance?workspaceId=${encodeURIComponent(workspaceId)}&year=${year}&month=${month}`);
      entriesFetchedAtRef.current.set(key, Date.now());
      setEntries(data.entries);
      window.localStorage.setItem(key, JSON.stringify(data.entries));
    } catch (error) {
      if (cached.length) setEntries(cached);
      setMessage(error instanceof Error ? error.message : "לא ניתן לקרוא רשומות");
    } finally {
      setLoadingEntries(false);
    }
  }, [status?.connected]);

  const activeCacheKey = useCallback((workspaceId: string) => `${ACTIVE_CACHE_PREFIX}${workspaceId}`, []);

  const loadActiveShift = useCallback(async (workspaceId: string, force = false) => {
    const key = activeCacheKey(workspaceId);
    const cached = readJson<AttendanceEntry | null>(key, null);
    setActiveShift(cached);
    if (!navigator.onLine || !status?.connected) return cached;

    const fetchedAt = activeFetchedAtRef.current.get(workspaceId) || 0;
    if (!force && Date.now() - fetchedAt < ACTIVE_FRESH_MS) return cached;

    try {
      const data = await api<{ entry: AttendanceEntry | null }>(`/api/attendance/active?workspaceId=${encodeURIComponent(workspaceId)}`);
      activeFetchedAtRef.current.set(workspaceId, Date.now());
      setActiveShift(data.entry);
      if (data.entry) window.localStorage.setItem(key, JSON.stringify(data.entry));
      else window.localStorage.removeItem(key);
      return data.entry;
    } catch (error) {
      setActiveShift(cached);
      if (error instanceof Error) setMessage(error.message);
      return cached;
    }
  }, [activeCacheKey, status?.connected]);

  const saveQueue = useCallback((events: OfflineAttendanceEvent[]) => {
    setQueue(events);
    window.localStorage.setItem(QUEUE_KEY, JSON.stringify(events));
  }, []);

  const applyConfirmedEntry = useCallback((confirmed: AttendanceEntry, event: OfflineAttendanceEvent) => {
    const entryYear = confirmed.year || event.year || viewYear;
    const entryMonth = confirmed.month || event.month || viewMonth;
    const key = entryCacheKey(event.workspaceId, entryYear, entryMonth);
    const cached = readJson<AttendanceEntry[]>(key, []);
    const without = cached.filter((item) => item.id !== confirmed.id);
    let updated = [confirmed, ...without];

    // If the user already pressed another button while this request was in flight,
    // replay those still-pending events over the server-confirmed row. This avoids
    // visible "jumps backwards" (for example: break starts, then briefly vanishes).
    const allowance = files.find((file) => file.id === event.workspaceId)?.breakAllowanceMinutes ?? 40;
    const pendingAfterThis = readJson<OfflineAttendanceEvent[]>(QUEUE_KEY, []).filter((item) => item.id !== event.id && item.workspaceId === event.workspaceId);
    for (const pending of pendingAfterThis) {
      const pendingYear = pending.year || (pending.payload?.date ? Number(pending.payload.date.slice(0, 4)) : entryYear);
      const pendingMonth = pending.month || (pending.payload?.date ? Number(pending.payload.date.slice(5, 7)) : entryMonth);
      if (pendingYear === entryYear && pendingMonth === entryMonth) updated = optimisticEvent(updated, pending, allowance);
    }

    window.localStorage.setItem(key, JSON.stringify(updated));
    if (event.workspaceId === selectedFileId && entryYear === viewYear && entryMonth === viewMonth) setEntries(updated);

    if (event.type !== "manual") {
      const activeKey = activeCacheKey(event.workspaceId);
      const currentEntry = updated.find((item) => item.id === confirmed.id) || confirmed;
      if (currentEntry.clockOut) {
        if (event.workspaceId === selectedFileId) setActiveShift(null);
        window.localStorage.removeItem(activeKey);
      } else {
        if (event.workspaceId === selectedFileId) setActiveShift(currentEntry);
        window.localStorage.setItem(activeKey, JSON.stringify(currentEntry));
      }
    }
  }, [activeCacheKey, files, selectedFileId, viewMonth, viewYear]);

  const flushQueue = useCallback(async () => {
    if (!status?.connected || !navigator.onLine) return;
    if (queueFlushPromiseRef.current) return queueFlushPromiseRef.current;

    const worker = (async () => {
      setQueueSyncing(true);
      let synced = 0;
      let rejected = 0;
      try {
        while (navigator.onLine && status?.connected) {
          const current = readJson<OfflineAttendanceEvent[]>(QUEUE_KEY, []);
          if (!current.length) break;
          const event = current[0];
          try {
            const data = await api<{ entry: AttendanceEntry }>(eventEndpoint(event), {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(eventBody(event)),
            });
            applyConfirmedEntry(data.entry, event);

            // Remove only the event that just succeeded from the *latest* queue.
            // New button presses may have been appended while this request was in flight.
            const latest = readJson<OfflineAttendanceEvent[]>(QUEUE_KEY, []);
            saveQueue(latest.filter((item) => item.id !== event.id));
            synced++;
          } catch (error) {
            if (error instanceof ApiRequestError && error.network) throw error;

            // A 4xx response is a permanent validation/conflict failure. Keeping it
            // at the head of a FIFO queue would block every newer clock action forever.
            // Move it aside, preserve it locally for recovery/debugging, and continue.
            if (error instanceof ApiRequestError && error.status >= 400 && error.status < 500) {
              const failed = readJson<Array<{ event: OfflineAttendanceEvent; reason: string; failedAt: string }>>(FAILED_QUEUE_KEY, []);
              window.localStorage.setItem(FAILED_QUEUE_KEY, JSON.stringify([
                ...failed,
                { event, reason: error.message, failedAt: new Date().toISOString() },
              ].slice(-50)));
              const latest = readJson<OfflineAttendanceEvent[]>(QUEUE_KEY, []);
              saveQueue(latest.filter((item) => item.id !== event.id));
              rejected++;
              continue;
            }

            throw error;
          }
        }
        if (rejected) {
          setMessage(synced
            ? `${synced} פעולות סונכרנו · ${rejected} פעולה ישנה לא הייתה תקינה והועברה הצידה`
            : `${rejected} פעולה ישנה לא הייתה תקינה והועברה הצידה`);
        } else if (synced) {
          setMessage(`${synced} פעולות סונכרנו ברקע`);
        }
      } catch (error) {
        // Network/temporary server errors keep the event at the head of the queue
        // so the app can retry later without losing the user's action.
        if (!(error instanceof ApiRequestError && error.network)) {
          setMessage(error instanceof Error ? `הסנכרון ינסה שוב בהמשך: ${error.message}` : "הסנכרון ינסה שוב בהמשך");
        }
      } finally {
        setQueueSyncing(false);
      }
    })();

    queueFlushPromiseRef.current = worker;
    try {
      await worker;
    } finally {
      queueFlushPromiseRef.current = null;
    }
  }, [applyConfirmedEntry, saveQueue, status?.connected]);

  useEffect(() => {
    let cancelled = false;
    const startedAt = Date.now();
    void (async () => {
      const currentStatus = await loadStatus();
      const finishBoot = () => { if (!cancelled) setBootLoading(false); };
      const remaining = Math.max(0, 420 - (Date.now() - startedAt));
      window.setTimeout(finishBoot, remaining);
      if (currentStatus.connected && navigator.onLine) void loadFiles(true);
    })();
    return () => { cancelled = true; };
  }, [loadFiles, loadStatus]);

  useEffect(() => {
    if (!didRenderTabRef.current) {
      didRenderTabRef.current = true;
      return;
    }
    setPageLoading(true);
    const id = window.setTimeout(() => setPageLoading(false), 260);
    return () => window.clearTimeout(id);
  }, [tab]);

  useEffect(() => {
    if (!selectedFileId) {
      setEntries([]);
      setActiveShift(null);
      return;
    }
    window.localStorage.setItem("attendance:selectedWorkspace", selectedFileId);
    void loadActiveShift(selectedFileId);
  }, [selectedFileId, loadActiveShift]);

  useEffect(() => {
    if (!selectedFileId) {
      setEntries([]);
      return;
    }
    void loadEntries(selectedFileId, viewYear, viewMonth);
  }, [selectedFileId, viewYear, viewMonth, loadEntries]);

  useEffect(() => {
    if (folderManagerOpen && status?.connected && online) void loadFolders();
  }, [folderManagerOpen, loadFolders, online, status?.connected]);

  useEffect(() => {
    if (online && status?.connected) void flushQueue();
  }, [online, status?.connected, flushQueue]);

  useEffect(() => {
    if (!status?.connected || !online) return;

    // Background reconciliation is intentionally Drive-only. Reading the active
    // Google Sheet every few seconds can exhaust the Sheets per-user read quota,
    // especially while schema migrations or multiple tabs are active.
    const backgroundSync = () => {
      void loadFiles();
      void flushQueue();
    };

    // When the user actually returns to the app, refresh the visible attendance
    // data as well. focus + visibilitychange often fire together, so debounce them.
    let lastForegroundSync = 0;
    const foregroundSync = () => {
      const now = Date.now();
      if (now - lastForegroundSync < 10000) return;
      lastForegroundSync = now;
      void loadFiles();
      if (selectedFileId) {
        void loadEntries(selectedFileId, viewYear, viewMonth);
        void loadActiveShift(selectedFileId);
      }
      void flushQueue();
    };

    const interval = window.setInterval(backgroundSync, 180000);
    const onVisible = () => document.visibilityState === "visible" && foregroundSync();
    window.addEventListener("focus", foregroundSync);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", foregroundSync);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [status?.connected, online, selectedFileId, viewYear, viewMonth, loadActiveShift, loadEntries, loadFiles, flushQueue]);

  useEffect(() => {
    if (tab !== "home" && tab !== "summary") return;
    const current = israelParts();
    if (viewYear !== current.year || viewMonth !== current.month) {
      setViewYear(current.year);
      setViewMonth(current.month);
    }
  }, [tab, viewMonth, viewYear]);

  useEffect(() => {
    if (!message) return;
    const id = window.setTimeout(() => setMessage(null), 4800);
    return () => window.clearTimeout(id);
  }, [message]);

  const selectedFile = files.find((file) => file.id === selectedFileId) || null;
  const breakAllowanceMinutes = selectedFile?.breakAllowanceMinutes ?? 40;
  const payrollSettings = selectedFile?.payrollSettings || {
    targetHours: DEFAULT_TARGET_HOURS,
    hourlyRate: 0,
    pensionPercent: 0,
    trainingFundPercent: 0,
    nationalInsuranceHealthPercent: 0,
    additions: [] as PayrollAddition[],
  };

  useEffect(() => {
    setBreakAllowanceInput(String(breakAllowanceMinutes));
  }, [breakAllowanceMinutes, selectedFileId]);

  useEffect(() => {
    setTargetHoursInput(String(payrollSettings.targetHours));
    setHourlyRateInput(String(payrollSettings.hourlyRate));
    setPensionPercentInput(String(payrollSettings.pensionPercent));
    setTrainingFundPercentInput(String(payrollSettings.trainingFundPercent));
    setNationalHealthPercentInput(String(payrollSettings.nationalInsuranceHealthPercent));
    setPayrollAdditions(payrollSettings.additions.map((item, index) => ({ ...item, id: item.id || `addition-${index + 1}` })));
  }, [selectedFileId, selectedFile?.payrollSettings, selectedFile?.modifiedTime]);

  const activeEntry = activeShift || entries.find((entry) => !entry.clockOut) || null;
  const activeBreak = activeEntry?.breaks?.find((item) => !item.endIso) || null;

  const liveGross = useMemo(() => {
    if (!activeEntry?.clockInIso) return activeEntry?.grossDurationMinutes || 0;
    const start = Date.parse(activeEntry.clockInIso);
    if (!Number.isFinite(start)) return 0;
    return Math.max(0, Math.floor((now.getTime() - start) / 60000));
  }, [activeEntry, now]);
  const liveBreak = activeEntry ? liveBreakMinutes(activeEntry.breaks || [], now) : 0;
  const liveCredited = activeEntry ? creditedMinutes(liveGross, liveBreak, breakAllowanceMinutes) : 0;
  const monthMinutes = useMemo(
    () => entries.reduce((sum, entry) => sum + (entry.clockOut ? entry.durationMinutes : entry.id === activeEntry?.id ? liveCredited : 0), 0),
    [activeEntry?.id, entries, liveCredited],
  );
  const dailyMinutesByDate = useMemo(() => {
    const totals = new Map<string, number>();
    for (const entry of entries) {
      const minutes = entry.clockOut
        ? entry.durationMinutes
        : entry.id === activeEntry?.id
          ? liveCredited
          : 0;
      totals.set(entry.date, (totals.get(entry.date) || 0) + Math.max(0, minutes));
    }
    return totals;
  }, [activeEntry?.id, entries, liveCredited]);
  const targetMinutes = Math.max(60, Math.round((payrollSettings.targetHours || DEFAULT_TARGET_HOURS) * 60));
  const remaining = Math.max(0, targetMinutes - monthMinutes);
  const progress = Math.min(100, (monthMinutes / targetMinutes) * 100);
  const additionsTotal = payrollSettings.additions.reduce((sum, item) => sum + Math.max(0, Number(item.amount) || 0), 0);
  const estimatedGross = Math.max(0, (monthMinutes / 60) * Math.max(0, payrollSettings.hourlyRate || 0) + additionsTotal);
  const deductionPercent = Math.max(0, payrollSettings.pensionPercent || 0) + Math.max(0, payrollSettings.trainingFundPercent || 0) + Math.max(0, payrollSettings.nationalInsuranceHealthPercent || 0);
  const estimatedNet = Math.max(0, estimatedGross - (estimatedGross * deductionPercent) / 100);

  const refreshCurrent = useCallback(async () => {
    if (!selectedFileId) return;
    await Promise.all([
      loadEntries(selectedFileId, viewYear, viewMonth, true),
      loadActiveShift(selectedFileId, true),
    ]);
  }, [loadActiveShift, loadEntries, selectedFileId, viewMonth, viewYear]);

  const refreshAll = useCallback(async (showMessage = true) => {
    if (refreshBusyRef.current) return;
    refreshBusyRef.current = true;
    setRefreshLoading(true);
    const startedAt = Date.now();
    try {
      const currentStatus = await loadStatus();
      if (currentStatus.connected && navigator.onLine) {
        // Writes go first, then we pull the authoritative Drive/Sheets state.
        await flushQueue();
        await loadFiles(true);
        if (selectedFileId) await Promise.all([
          loadEntries(selectedFileId, viewYear, viewMonth, true),
          loadActiveShift(selectedFileId, true),
        ]);
        if (showMessage) setMessage("הנתונים רועננו וסונכרנו");
      } else if (showMessage) {
        setMessage(navigator.onLine ? "Google Drive מנותק" : "אין חיבור לרשת — מוצג המטמון האחרון");
      }
    } finally {
      // Avoid a flash that is too short to read while still ending exactly after
      // the refresh work is complete (with a tiny minimum for visual continuity).
      const delay = Math.max(0, 360 - (Date.now() - startedAt));
      window.setTimeout(() => {
        setRefreshLoading(false);
        refreshBusyRef.current = false;
      }, delay);
    }
  }, [flushQueue, loadActiveShift, loadEntries, loadFiles, loadStatus, selectedFileId, viewMonth, viewYear]);

  const syncNow = useCallback(async () => {
    await refreshAll(true);
  }, [refreshAll]);

  useEffect(() => {
    const target = shellRef.current;
    if (!target) return;

    const resetPull = () => {
      pullStartYRef.current = null;
      pullReadyRef.current = false;
      setPullDistance(0);
      setPullReady(false);
    };

    const onTouchStart = (event: TouchEvent) => {
      if (refreshLoading || bootLoading || window.scrollY > 1 || document.querySelector(".modal-backdrop, .drawer-backdrop")) return;
      pullStartYRef.current = event.touches[0]?.clientY ?? null;
      pullReadyRef.current = false;
    };

    const onTouchMove = (event: TouchEvent) => {
      if (pullStartYRef.current === null || !event.touches[0]) return;
      const delta = event.touches[0].clientY - pullStartYRef.current;
      if (delta <= 0 || window.scrollY > 1) { resetPull(); return; }
      if (delta > 8) event.preventDefault();
      const distance = Math.min(86, delta * 0.42);
      const ready = delta >= 105;
      pullReadyRef.current = ready;
      setPullReady(ready);
      setPullDistance(distance);
    };

    const onTouchEnd = () => {
      const shouldRefresh = pullReadyRef.current;
      resetPull();
      if (shouldRefresh) {
        if (typeof navigator !== "undefined" && "vibrate" in navigator) navigator.vibrate?.(18);
        void refreshAll(true);
      }
    };

    target.addEventListener("touchstart", onTouchStart, { passive: true });
    target.addEventListener("touchmove", onTouchMove, { passive: false });
    target.addEventListener("touchend", onTouchEnd, { passive: true });
    target.addEventListener("touchcancel", resetPull, { passive: true });
    return () => {
      target.removeEventListener("touchstart", onTouchStart);
      target.removeEventListener("touchmove", onTouchMove);
      target.removeEventListener("touchend", onTouchEnd);
      target.removeEventListener("touchcancel", resetPull);
    };
  }, [bootLoading, refreshAll, refreshLoading]);

  function enqueueAndApply(event: OfflineAttendanceEvent) {
    const current = readJson<OfflineAttendanceEvent[]>(QUEUE_KEY, []);
    if (!current.some((item) => item.id === event.id)) saveQueue([...current, event]);

    const targetYear = event.year || (event.payload?.date ? Number(event.payload.date.slice(0, 4)) : viewYear);
    const targetMonth = event.month || (event.payload?.date ? Number(event.payload.date.slice(5, 7)) : viewMonth);
    const targetKey = entryCacheKey(event.workspaceId, targetYear, targetMonth);
    const targetIsVisible = event.workspaceId === selectedFileId && targetYear === viewYear && targetMonth === viewMonth;

    setEntries((before) => {
      const source = targetIsVisible ? before : readJson<AttendanceEntry[]>(targetKey, []);
      const updated = optimisticEvent(source, event, breakAllowanceMinutes);
      window.localStorage.setItem(targetKey, JSON.stringify(updated));
      return targetIsVisible ? updated : before;
    });

    if (event.type !== "manual") {
      setActiveShift((before) => {
        let next: AttendanceEntry | null = before;
        if (event.type === "clock-in") {
          next = optimisticEvent([], event, breakAllowanceMinutes)[0] || null;
        } else if (event.type === "clock-out" && before?.id === event.entryId) {
          next = null;
        } else if (before?.id === event.entryId) {
          next = optimisticEvent([before], event, breakAllowanceMinutes)[0] || before;
        }
        const key = activeCacheKey(event.workspaceId);
        if (next) window.localStorage.setItem(key, JSON.stringify(next));
        else window.localStorage.removeItem(key);
        return next;
      });
    }
  }

  function sendOrQueue(event: OfflineAttendanceEvent, success: string) {
    // Optimistic by design: the UI advances immediately and the durable local
    // queue performs the Google write in the background, in strict order.
    enqueueAndApply(event);
    setMessage(status?.connected && navigator.onLine ? `${success} · מסתנכרן ברקע` : `${success} · נשמר מקומית לסנכרון`);
    if (status?.connected && navigator.onLine) void flushQueue();
  }

  async function quickAction(action: "in" | "out") {
    if (!selectedFileId) return;
    const at = new Date();
    const local = israelParts(at);
    if (action === "in") {
      const event: OfflineAttendanceEvent = {
        id: crypto.randomUUID(), type: "clock-in", workspaceId: selectedFileId,
        entryId: crypto.randomUUID(), atIso: at.toISOString(), year: local.year, month: local.month,
      };
      sendOrQueue(event, "הכניסה נשמרה");
    } else if (activeEntry) {
      const event: OfflineAttendanceEvent = {
        id: crypto.randomUUID(), type: "clock-out", workspaceId: selectedFileId,
        entryId: activeEntry.id, atIso: at.toISOString(), year: activeEntry.year || local.year, month: activeEntry.month || local.month,
      };
      sendOrQueue(event, "היציאה נשמרה");
    }
  }

  async function breakAction(action: "start" | "end") {
    if (!selectedFileId || !activeEntry) return;
    const at = new Date();
    const local = israelParts(at);
    const breakId = action === "start" ? crypto.randomUUID() : activeBreak?.id || crypto.randomUUID();
    const event: OfflineAttendanceEvent = {
      id: crypto.randomUUID(), type: action === "start" ? "break-start" : "break-end", workspaceId: selectedFileId,
      entryId: activeEntry.id, breakId, atIso: at.toISOString(), year: activeEntry.year || local.year, month: activeEntry.month || local.month,
    };
    sendOrQueue(event, action === "start" ? "יצאת להפסקה" : "חזרת מהפסקה");
  }

  async function addManual() {
    if (!selectedFileId || !manualDate || !manualStart || !manualEnd) return;
    const [manualYear, manualMonth] = manualDate.split("-").map(Number);
    const event: OfflineAttendanceEvent = {
      id: crypto.randomUUID(), type: "manual", workspaceId: selectedFileId, entryId: crypto.randomUUID(),
      year: manualYear, month: manualMonth,
      payload: { date: manualDate, clockIn: manualStart, clockOut: manualEnd, breakMinutes: Number(manualBreakMinutes || 0), note: manualNote },
    };
    sendOrQueue(event, "המשמרת הידנית נשמרה");
    setManualOpen(false);
    setManualStart(""); setManualEnd(""); setManualBreakMinutes("0"); setManualNote("");
    setViewYear(manualYear);
    setViewMonth(manualMonth);
    setTab("records");
  }

  async function createFile() {
    const name = createName.trim();
    const folderName = createFolderName.trim();
    const subfolderName = createSubfolderName.trim();
    if (!name || !folderName || pendingAction || !status?.connected || !online) return;
    setPendingAction("create");
    try {
      const data = await api<{ file: AttendanceFile }>("/api/drive/files", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, folderName, subfolderName: subfolderName || undefined }),
      });
      setCreateOpen(false); setCreateName(""); setCreateFolderName(""); setCreateSubfolderName("");
      await loadFiles(true); setSelectedFileId(data.file.id); setTab("home");
      setMessage("התיקייה וקובץ הנוכחות נוצרו ב-Google Drive");
    } catch (error) { setMessage(error instanceof Error ? error.message : "לא ניתן ליצור קובץ"); }
    finally { setPendingAction(null); }
  }

  async function renameFile(file: AttendanceFile) {
    if (!status?.connected || !online) return setMessage("שינוי שם דורש חיבור ל-Drive כדי למנוע התנגשות");
    const name = window.prompt("שם חדש", file.name)?.trim();
    if (!name || name === file.name) return;
    setPendingAction("rename");
    try {
      await api(`/api/drive/files/${encodeURIComponent(file.id)}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name }) });
      setMenuFile(null); await loadFiles(true); setMessage("השם עודכן גם ב-Google Drive");
    } catch (error) { setMessage(error instanceof Error ? error.message : "לא ניתן לשנות שם"); }
    finally { setPendingAction(null); }
  }

  function openMove(file: AttendanceFile) {
    setMenuFile(null); setPathFile(file); setPathValue((file.folderPath || []).join(" / "));
  }

  async function moveFile() {
    if (!pathFile || !status?.connected || !online || pendingAction) return;
    setPendingAction("move");
    try {
      await api(`/api/drive/files/${encodeURIComponent(pathFile.id)}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ folderPath: parsePath(pathValue) }),
      });
      setPathFile(null); await loadFiles(true); setMessage("הנתיב עודכן ב-Google Drive");
    } catch (error) { setMessage(error instanceof Error ? error.message : "לא ניתן להעביר את הקובץ"); }
    finally { setPendingAction(null); }
  }

  async function deleteFile(file: AttendanceFile) {
    if (!status?.connected || !online) return setMessage("מחיקה דורשת חיבור ל-Drive");
    if (!window.confirm(`להעביר את “${file.name}” וכל התוכן שלו לאשפה ב-Google Drive?`)) return;
    setPendingAction("delete");
    try {
      await api(`/api/drive/files/${encodeURIComponent(file.id)}`, { method: "DELETE" });
      setMenuFile(null); window.localStorage.removeItem(activeCacheKey(file.id)); if (selectedFileId === file.id) setSelectedFileId(null); await loadFiles(true);
      setMessage("קובץ הנוכחות הועבר לאשפה ב-Google Drive");
    } catch (error) { setMessage(error instanceof Error ? error.message : "לא ניתן למחוק"); }
    finally { setPendingAction(null); }
  }

  function openEditEntry(entry: AttendanceEntry) {
    setEditingEntry(entry);
    setEditDate(displayDateToInput(entry.date));
    setEditStart(entry.clockIn || "");
    setEditEnd(entry.clockOut || "");
    setEditBreakMinutes(String(entry.breakMinutes || 0));
    setEditNote(entry.note || "");
  }

  async function saveEntryEdit() {
    if (!editingEntry || !selectedFileId || !status?.connected || !online || pendingAction) return;
    setPendingAction("edit-entry");
    try {
      await api(`/api/attendance/${encodeURIComponent(editingEntry.id)}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workspaceId: selectedFileId, year: editingEntry.year, month: editingEntry.month,
          date: editDate, clockIn: editStart, clockOut: editEnd || undefined,
          breakMinutes: Number(editBreakMinutes || 0), note: editNote,
        }),
      });
      setEditingEntry(null); await refreshCurrent(); setMessage("הרשומה עודכנה וסונכרנה");
    } catch (error) { setMessage(error instanceof Error ? error.message : "לא ניתן לערוך רשומה"); }
    finally { setPendingAction(null); }
  }

  async function deleteEntry(entry: AttendanceEntry) {
    if (!selectedFileId || !status?.connected || !online) return setMessage("מחיקת רשומה דורשת חיבור ל-Drive");
    if (!window.confirm(`למחוק את הרשומה של ${entry.date}? הפעולה תמחק את השורה מה-Google Sheet.`)) return;

    // Optimistic delete: remove the card immediately. The Drive/Sheets write runs
    // in the background, so the UI never waits for Google's round-trip latency.
    const workspaceId = selectedFileId;
    const year = entry.year || viewYear;
    const month = entry.month || viewMonth;
    const key = entryCacheKey(workspaceId, year, month);
    const previous = readJson<AttendanceEntry[]>(key, entries);
    const next = previous.filter((item) => item.id !== entry.id);
    window.localStorage.setItem(key, JSON.stringify(next));
    entriesFetchedAtRef.current.set(key, Date.now());
    if (year === viewYear && month === viewMonth) setEntries(next);
    if (activeShift?.id === entry.id) {
      setActiveShift(null);
      window.localStorage.removeItem(activeCacheKey(workspaceId));
    }
    setMessage("הרשומה נמחקה · מסנכרן ברקע");

    try {
      const params = new URLSearchParams({ workspaceId, year: String(year), month: String(month) });
      await api(`/api/attendance/${encodeURIComponent(entry.id)}?${params.toString()}`, { method: "DELETE" });
      // No full refresh here: the optimistic cache is already the desired state.
      setMessage("הרשומה נמחקה וסונכרנה");
    } catch (error) {
      // A failed Google write must never silently lose a row. Restore the snapshot.
      window.localStorage.setItem(key, JSON.stringify(previous));
      entriesFetchedAtRef.current.delete(key);
      if (year === viewYear && month === viewMonth) setEntries(previous);
      if (activeShift?.id === entry.id) {
        setActiveShift(entry);
        window.localStorage.setItem(activeCacheKey(workspaceId), JSON.stringify(entry));
      }
      setMessage(error instanceof Error ? `המחיקה לא סונכרנה: ${error.message}` : "לא ניתן למחוק רשומה");
    }
  }

  async function createFolderPath() {
    if (!newFolderPath.trim() || !status?.connected || !online || pendingAction) return;
    setPendingAction("folder");
    try {
      await api("/api/drive/folders", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ path: parsePath(newFolderPath) }) });
      setNewFolderPath(""); await loadFolders(); setMessage("התיקייה נוצרה ב-Google Drive");
    } catch (error) { setMessage(error instanceof Error ? error.message : "לא ניתן ליצור תיקייה"); }
    finally { setPendingAction(null); }
  }

  async function createSubfolderAtCurrentLocation() {
    if (!selectedFileId || !currentFolderSubfolderName.trim() || !status?.connected || !online || pendingAction) return;
    setPendingAction("folder");
    try {
      await api("/api/drive/folders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspaceId: selectedFileId, name: currentFolderSubfolderName.trim() }),
      });
      const name = currentFolderSubfolderName.trim();
      setCurrentFolderSubfolderName("");
      setCurrentFolderSubfolderOpen(false);
      setMenuFile(null);
      await loadFolders();
      setMessage(`התיקייה “${name}” נוצרה ליד קובץ הנוכחות הנוכחי`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "לא ניתן ליצור תת־תיקייה");
    } finally {
      setPendingAction(null);
    }
  }

  async function openExistingDriveFiles() {
    if (!status?.connected || !online || pendingAction) return;
    setExistingDriveOpen(true);
    setLoadingDriveCandidates(true);
    try {
      const data = await api<{ files: DriveSpreadsheetCandidate[] }>("/api/drive/spreadsheets");
      setDriveCandidates(data.files);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "לא ניתן לקרוא קבצים מ-Google Drive");
    } finally {
      setLoadingDriveCandidates(false);
    }
  }

  async function adoptExistingDriveFile(candidate: DriveSpreadsheetCandidate, confirmOverwrite = false) {
    if (!status?.connected || !online || pendingAction) return;
    setPendingAction("adopt");
    try {
      const data = await api<{ requiresConfirmation: boolean; file?: AttendanceFile; spreadsheetName: string }>("/api/drive/spreadsheets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: candidate.id, confirmOverwrite }),
      });
      if (data.requiresConfirmation) {
        setOverwriteCandidate(candidate);
        return;
      }
      if (!data.file) throw new Error("לא התקבל קובץ נוכחות חדש");
      setOverwriteCandidate(null);
      setExistingDriveOpen(false);
      setDriveCandidates([]);
      await loadFiles(true);
      setSelectedFileId(data.file.id);
      setTab("home");
      setMessage("קובץ Google Sheets הותאם לאפליקציה ונבחר לעבודה");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "לא ניתן להשתמש בקובץ שנבחר");
    } finally {
      setPendingAction(null);
    }
  }

  async function renameFolder(folder: DriveFolder) {
    if (!status?.connected || !online || pendingAction) return;
    const name = window.prompt("שם חדש לתיקייה", folder.name)?.trim();
    if (!name || name === folder.name) return;
    setPendingAction("folder");
    try {
      await api("/api/drive/folders", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: folder.id, name }) });
      await loadFiles(true); await loadFolders(); setMessage("שם התיקייה עודכן ב-Google Drive");
    } catch (error) { setMessage(error instanceof Error ? error.message : "לא ניתן לשנות שם תיקייה"); }
    finally { setPendingAction(null); }
  }

  async function deleteFolder(folder: DriveFolder) {
    if (!status?.connected || !online) return;
    const warning = folder.containsWorkspaces ? `בתיקייה יש ${folder.containsWorkspaces} קבצי נוכחות ישירים. כל התוכן יעבור לאשפה.` : "כל התוכן שבתיקייה יעבור איתה לאשפה.";
    if (!window.confirm(`למחוק את “${folder.path.join(" / ")}”?\n${warning}`)) return;
    setPendingAction("folder");
    try {
      await api(`/api/drive/folders?id=${encodeURIComponent(folder.id)}`, { method: "DELETE" });
      await loadFiles(true); await loadFolders(); setMessage("התיקייה הועברה לאשפה ב-Google Drive");
    } catch (error) { setMessage(error instanceof Error ? error.message : "לא ניתן למחוק תיקייה"); }
    finally { setPendingAction(null); }
  }

  async function saveBreakAllowance() {
    if (!selectedFileId || !status?.connected || !online || pendingAction) return;
    const minutes = Math.max(0, Math.min(600, Math.floor(Number(breakAllowanceInput))));
    if (!Number.isFinite(minutes)) return setMessage("מספר הדקות לא תקין");
    setPendingAction("settings");
    setDrawerOpen(false);
    setTab("home");
    window.scrollTo({ top: 0, behavior: "smooth" });
    try {
      await api(`/api/drive/files/${encodeURIComponent(selectedFileId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ breakAllowanceMinutes: minutes }),
      });
      await loadFiles(true);
      await refreshCurrent();
      setBreakAllowanceInput(String(minutes));
      setMessage(`כלל ההפסקה עודכן ל-${minutes} דקות. הרשומות הקיימות חושבו מחדש.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "לא ניתן לעדכן את כלל ההפסקה");
    } finally {
      setPendingAction(null);
    }
  }

  async function savePayrollSettings() {
    if (!selectedFileId || !status?.connected || !online || pendingAction) return;
    const numberValue = (value: string, fallback = 0) => {
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : fallback;
    };
    const payload = {
      targetHours: Math.max(1, Math.min(1000, numberValue(targetHoursInput, DEFAULT_TARGET_HOURS))),
      hourlyRate: Math.max(0, Math.min(10000, numberValue(hourlyRateInput))),
      pensionPercent: Math.max(0, Math.min(100, numberValue(pensionPercentInput))),
      trainingFundPercent: Math.max(0, Math.min(100, numberValue(trainingFundPercentInput))),
      nationalInsuranceHealthPercent: Math.max(0, Math.min(100, numberValue(nationalHealthPercentInput))),
      additions: payrollAdditions
        .map((item) => ({ ...item, name: item.name.trim(), amount: Math.max(0, Number(item.amount) || 0) }))
        .filter((item) => item.name && item.amount > 0)
        .slice(0, 8),
    };
    setPendingAction("settings");
    setDrawerOpen(false);
    setTab("home");
    window.scrollTo({ top: 0, behavior: "smooth" });
    try {
      await api(`/api/drive/files/${encodeURIComponent(selectedFileId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ payrollSettings: payload }),
      });
      await loadFiles(true);
      setMessage("הגדרות השכר נשמרו וסונכרנו ל-Google Drive");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "לא ניתן לשמור את הגדרות השכר");
    } finally {
      setPendingAction(null);
    }
  }

  function addPayrollAddition() {
    if (payrollAdditions.length >= 8) return setMessage("אפשר להוסיף עד 8 תוספות חודשיות");
    setPayrollAdditions((items) => [...items, { id: crypto.randomUUID(), name: "", amount: 0 }]);
  }

  async function disconnect() {
    if (pendingAction) return;
    setPendingAction("logout");
    try {
      await fetch("/api/auth/logout", { method: "POST" });
      setStatus({ configured: true, connected: false, mode: "disconnected" });
      setDrawerOpen(false);
      setTab("home");
      window.scrollTo({ top: 0, behavior: "smooth" });
      setMessage("התנתקת מ-Google Drive. התחבר מחדש כדי להמשיך לעבוד מול Drive.");
    } finally { setPendingAction(null); }
  }

  const connected = Boolean(status?.connected);
  const configured = Boolean(status?.configured);
  const disconnectedOnline = Boolean(status && configured && !connected && online);
  const hasWorkspace = Boolean(selectedFile);
  const syncText = queue.length
    ? queueSyncing ? `מסנכרן ${queue.length} פעולות ברקע…` : `${queue.length} פעולות ממתינות לסנכרון`
    : !online
      ? "Offline — הנתונים נשמרים מקומית"
      : connected
        ? "מסונכרן מול Google Drive"
        : "Drive מנותק — מוצג המטמון האחרון";

  return (
    <main ref={shellRef} className="app-shell">
      {pullDistance > 2 && !refreshLoading && (
        <div className={`pull-refresh-indicator ${pullReady ? "ready" : ""}`} style={{ transform: `translate3d(-50%, ${Math.round(pullDistance)}px, 0)`, opacity: Math.min(1, pullDistance / 42) }} aria-hidden="true">
          <img src="/icon-192.png" alt="" />
          <span>{pullReady ? "שחרר לרענון" : "משוך לרענון"}</span>
        </div>
      )}
      {(bootLoading || pageLoading || refreshLoading) && (
        <div className={`app-loading-overlay ${bootLoading ? "boot" : refreshLoading ? "refresh" : "page"}`} role="status" aria-live="polite">
          <div className="brand-loader">
            <div className="brand-loader-icon"><img src="/icon-192.png" alt="" /></div>
            <span>{bootLoading ? "פותח את יומן הנוכחות…" : refreshLoading ? "מרענן ומסנכרן…" : "טוען…"}</span>
          </div>
        </div>
      )}
      <section className="app-card">
        <header className="topbar">
          <button className="icon-button menu-trigger" aria-label="פתח תפריט" aria-expanded={drawerOpen} onClick={() => setDrawerOpen(true)}><Icon name="more" /></button>
          <div className="topbar-copy">
            <p className="eyebrow">{selectedFile?.name || "נוכחות בעבודה"}</p>
            <h1>{tab === "home" ? "היום" : tab === "summary" ? "סיכום" : tab === "records" ? "רשומות" : "הקבצים שלי"}</h1>
          </div>
        </header>

        {tab === "home" && (
          <div className="screen-content home-screen">
            {!disconnectedOnline && <div className="date-clock">
              <p>{now.toLocaleDateString("he-IL", { timeZone: "Asia/Jerusalem", weekday: "long", day: "numeric", month: "long" })}</p>
              <strong>{now.toLocaleTimeString("he-IL", { timeZone: "Asia/Jerusalem", hour: "2-digit", minute: "2-digit", hour12: false })}</strong>
            </div>}

            {!status && <section className="panel center-panel"><div className="spinner"/><p>בודק חיבור ל-Google Drive…</p></section>}

            {status && !configured && online && (
              <section className="panel connect-panel"><div className="large-icon"><Icon name="drive" /></div><h2>צריך להגדיר Google OAuth</h2><p>הוסף את פרטי Google Cloud למשתני הסביבה והפעל מחדש.</p></section>
            )}

            {disconnectedOnline && (
              <section className="panel connect-panel public-home-card disconnected-connect-card">
                <img className="app-logo" src="/icon-192.png" alt="Attendance App" width={84} height={84} />
                <div>
                  <p className="eyebrow">Attendance App</p>
                  <h2>נוכחות, משמרות והפסקות במקום אחד</h2>
                </div>
                <p>אפליקציית נוכחות אישית לניהול כניסה ויציאה, משמרות והפסקות. הנתונים מסונכרנים עם Google Drive ו-Google Sheets שלך, ו-Drive נשאר מקור האמת.</p>
                <div className="legal-inline-links"><a href="/privacy">מדיניות פרטיות</a><span>·</span><a href="/terms">תנאי שימוש</a></div>
                <a className="primary-link" href="/api/auth/google">חבר Google Drive</a>
                <small className="consent-note">בהתחברות תתבקש לאשר גישה ל-Google Drive ול-Google Sheets לצורך הסנכרון בלבד.</small>
              </section>
            )}

            {connected && !selectedFile && (
              <section className="panel connect-panel"><div className="large-icon"><Icon name="files" /></div><h2>אין קובץ נוכחות זמין</h2><p>{connected ? "צור קובץ ראשון או סנכרן מחדש את Drive." : "התחבר מחדש ל-Drive כדי לשחזר את מבנה הקבצים."}</p>{connected && <button className="primary-link button-link" onClick={() => setCreateOpen(true)}>צור קובץ ראשון</button>}</section>
            )}

            {hasWorkspace && (connected || !online) && (
              <>
                <div className="action-stack quick-actions">
                  {!activeEntry ? (
                    <HoldActionButton className="primary-action" disabled={pendingAction === "logout"} onComplete={() => quickAction("in")} ariaLabel="לחיצה ארוכה לכניסה מהירה"><span className="action-dot in"/>כניסה מהירה</HoldActionButton>
                  ) : (
                    <>
                      <button className="secondary-action break-action" disabled={pendingAction === "logout"} onClick={() => void breakAction(activeBreak ? "end" : "start")}><Icon name="coffee" />{activeBreak ? "חזרה מהפסקה" : "יציאה להפסקה"}</button>
                      <HoldActionButton className="danger-action" disabled={pendingAction === "logout"} onComplete={() => quickAction("out")} ariaLabel="לחיצה ארוכה ליציאה מהירה"><span className="action-dot out"/>יציאה מהירה</HoldActionButton>
                    </>
                  )}
                  <button className="secondary-action manual-button" onClick={() => setManualOpen(true)}><Icon name="clock" />הוספת משמרת ידנית</button>
                </div>

                {activeEntry && <div className={`active-shift-banner ${activeBreak ? "on-break" : ""}`}><span className="active-pulse"/><div><strong>{activeBreak ? "ההפסקה פעילה" : "המשמרת מחכה לך"}</strong><span>כניסה ב־{activeEntry.clockIn}. אפשר לסגור את האפליקציה ולחזור אחר כך — המשמרת תישאר פתוחה עד שתבצע יציאה.</span></div><b>{formatDuration(liveGross)}</b></div>}

                <section className="panel">
                  <div className="panel-title"><h2>המשמרת הנוכחית</h2><span className={`status ${activeEntry ? activeBreak ? "break" : "active" : ""}`}>{activeEntry ? activeBreak ? "בהפסקה" : "פעילה" : "לא התחילה"}</span></div>
                  <div className="stats-grid today-stats">
                    <div><span>כניסה</span><b>{activeEntry?.clockIn || "--:--"}</b></div>
                    <div><span>יציאה</span><b>{activeEntry?.clockOut || "--:--"}</b></div>
                    <div><span>הפסקות</span><b>{formatDuration(activeEntry ? liveBreak : 0)}</b></div>
                    <div><span>לחיוב</span><b>{formatDuration(activeEntry ? liveCredited : 0)}</b></div>
                  </div>
                  <div className="break-rule"><Icon name="coffee" /><span>{breakAllowanceMinutes === 0 ? "כל זמן ההפסקה מנוכה מהשעות." : `${breakAllowanceMinutes} הדקות הראשונות של סך ההפסקות במשמרת לא מורידות שעות. רק הזמן שמעבר לכך מנוכה.`}</span></div>
                </section>

              </>
            )}

            {!disconnectedOnline && <div className={`sync-pill ${queue.length ? "sync-warning" : ""}`}><Icon name={!online ? "offline" : queue.length ? "sync" : "cloud"}/><span>{syncText}</span></div>}
          </div>
        )}

        {tab === "summary" && (
          <div className="screen-content summary-screen">
            <div className="section-heading summary-heading">
              <div><p className="eyebrow">{selectedFile?.name || "סיכום חודשי"}</p><h2>{MONTHS_HE[viewMonth - 1]} {viewYear}</h2></div>
              <span className="live-label">{loadingEntries ? "מעדכן…" : online && connected ? "מסונכרן" : "מטמון"}</span>
            </div>
            {!selectedFile && <div className="empty-state">בחר קובץ נוכחות כדי לראות סיכום חודשי.</div>}
            {selectedFile && (
              <>
                <section className="panel summary-target-card">
                  <div className="panel-title"><h2>יעד שעות חודשי</h2><span>{payrollSettings.targetHours} שעות</span></div>
                  <div className="summary-hours-line"><strong>{formatDuration(monthMinutes)}</strong><span>מתוך {formatDuration(targetMinutes)}</span></div>
                  <div className="progress-track"><div style={{ width: `${progress}%` }}/></div>
                  <div className="summary-target-footer"><span>{remaining > 0 ? `נותרו ${formatDuration(remaining)}` : "היעד הושלם"}</span><b>{Math.round(progress)}%</b></div>
                </section>
                <div className="salary-summary-grid">
                  <section className="panel salary-card gross">
                    <span>ברוטו משוער</span>
                    <strong>{formatMoney(estimatedGross)}</strong>
                    <small>{formatDuration(monthMinutes)} × {formatMoney(payrollSettings.hourlyRate)} לשעה{additionsTotal > 0 ? ` + ${formatMoney(additionsTotal)} תוספות` : ""}</small>
                  </section>
                  <section className="panel salary-card net">
                    <span>נטו משוער</span>
                    <strong>{formatMoney(estimatedNet)}</strong>
                    <small>לאחר ניכויים שהוגדרו בתפריט הצד</small>
                  </section>
                </div>
                <p className="summary-disclaimer">הנטו הוא אומדן לפי שיעורי הניכוי שהגדרת בלבד. בשלב הזה הוא לא מחשב מס הכנסה או רכיבי תלוש שלא הוגדרו.</p>
              </>
            )}
          </div>
        )}

        {tab === "records" && (
          <div className="screen-content">
            <div className="section-heading records-heading"><div><p className="eyebrow">יומן נוכחות</p><h2>{MONTHS_HE[viewMonth - 1]} {viewYear}</h2></div><div className="heading-actions"><span className="live-label">{loadingEntries ? "מסנכרן…" : online && connected ? "מסונכרן" : "מטמון"}</span><button className="small-button" disabled={!selectedFile} onClick={() => setManualOpen(true)}><Icon name="plus"/>משמרת</button></div></div>
            <div className="period-controls">
              <select className="period-picker" value={viewMonth} onChange={(e) => setViewMonth(Number(e.target.value))} aria-label="בחר חודש">
                {MONTHS_HE.map((month, index) => <option key={month} value={index + 1}>{month}</option>)}
              </select>
              <select className="period-picker" value={viewYear} onChange={(e) => setViewYear(Number(e.target.value))} aria-label="בחר שנה">
                {Array.from({ length: 9 }, (_, index) => israelParts().year - 4 + index).map((year) => <option key={year} value={year}>{year}</option>)}
              </select>
            </div>
            {!selectedFile && <div className="empty-state">בחר קובץ נוכחות במסך הקבצים.</div>}
            {selectedFile && entries.length === 0 && !loadingEntries && <div className="empty-state">אין עדיין רשומות בחודש הזה.</div>}
            <div className="record-list">
              {entries.map((entry) => {
                const live = !entry.clockOut && entry.clockInIso;
                const total = live
                  ? creditedMinutes(
                      Math.max(0, Math.floor((now.getTime() - Date.parse(entry.clockInIso!)) / 60000)),
                      liveBreakMinutes(entry.breaks || [], now),
                      breakAllowanceMinutes,
                    )
                  : entry.durationMinutes;
                return (
                  <article className="record-card record-card-actions" key={entry.id}>
                    <div className="record-date">
                      <strong>{entry.date}</strong><span>{entry.weekday}</span>
                      <b className="record-daily-pay" title="שכר יומי משוער לפי השכר השעתי, ללא תוספות חודשיות">
                        {formatMoney(((dailyMinutesByDate.get(entry.date) || 0) / 60) * Math.max(0, payrollSettings.hourlyRate || 0))}
                      </b>
                    </div>
                    <div className="record-summary" aria-label="פרטי המשמרת">
                      <div><span>כניסה</span><strong>{entry.clockIn}</strong></div>
                      <div><span>יציאה</span><strong>{entry.clockOut || "פעיל"}</strong></div>
                      <div className="record-summary-total"><span>סה״כ</span><strong>{formatDuration(total)}</strong></div>
                    </div>
                    <div className="record-tools">
                      <button className="record-edit-button" aria-label="ערוך רשומה" title="ערוך רשומה" onClick={() => openEditEntry(entry)}><Icon name="edit"/></button>
                      <button aria-label="מחק רשומה" title="מחק רשומה" className="record-delete-button" onClick={() => void deleteEntry(entry)}><Icon name="trash"/></button>
                    </div>
                  </article>
                );
              })}
            </div>
          </div>
        )}

        {tab === "files" && (
          <div className="screen-content">
            {connected && <div className="drive-account"><div className="drive-badge"><Icon name="drive"/></div><div><strong>{status?.name || "Google Drive"}</strong><span>{status?.email || "מחובר"}</span></div><button className="text-button" onClick={() => void syncNow()}>{loadingFiles ? "מסנכרן…" : "סנכרן"}</button></div>}
            {!connected && <section className="panel compact-connect"><div><strong>{online ? "Google Drive מנותק" : "מצב Offline"}</strong><span>הקבצים האחרונים נשארים זמינים מהמטמון. בהתחברות הבאה תתבצע התאמה מלאה מול Drive.</span></div>{online && configured && <a className="small-button connect-small" href="/api/auth/google">התחבר</a>}</section>}
            <div className="section-heading"><div><p className="eyebrow">Drive-first</p><h2>קבצי נוכחות</h2></div><div className="heading-actions"><button className="small-button" disabled={!connected || !online} onClick={() => void openExistingDriveFiles()}><Icon name="drive"/>קובץ קיים</button><button className="small-button" disabled={!connected || !online} onClick={() => setFolderManagerOpen(true)}><Icon name="folder"/>תיקיות</button><button className="small-button" disabled={!connected || !online} onClick={() => setCreateOpen(true)}><Icon name="plus"/>חדש</button></div></div>
            {files.length === 0 && !loadingFiles && <div className="empty-state">אין קבצי נוכחות במטמון/Drive.</div>}
            {files.map((file) => (
              <article className={`file-card ${selectedFileId === file.id ? "selected-file" : ""}`} key={file.id} onClick={() => { setSelectedFileId(file.id); setTab("home"); }}>
                <div className="file-icon"><Icon name="files"/></div>
                <div className="file-info"><strong>{file.name}</strong><span className="file-path">{file.insideRoot === false ? "מחוץ לתיקיית האפליקציה · " : ""}{(file.folderPath || []).join(" / ") || "שורש האפליקציה"}</span></div>
                <span className="sync-dot"/>
                <button className="icon-button compact" aria-label="אפשרויות" onClick={(event) => { event.stopPropagation(); setMenuFile(file); }}><Icon name="more"/></button>
              </article>
            ))}
            <p className="files-note">האפליקציה מזהה קבצים לפי metadata קבוע ולא לפי השם. שינוי שם, העברה או מחיקה ידנית ב-Drive ייקלטו בסריקה הבאה, גם אחרי התנתקות והתחברות מחדש.</p>
          </div>
        )}
      </section>

      {!disconnectedOnline && <nav className="bottom-nav" aria-label="ניווט ראשי">
        <button className={tab === "home" ? "selected" : ""} onClick={() => setTab("home")}><Icon name="home"/>בית</button>
        <button className={tab === "summary" ? "selected" : ""} onClick={() => setTab("summary")}><Icon name="summary"/>סיכום</button>
        <button className={tab === "records" ? "selected" : ""} onClick={() => setTab("records")}><Icon name="records"/>רשומות</button>
        <button className={tab === "files" ? "selected" : ""} onClick={() => setTab("files")}><Icon name="files"/>קבצים</button>
      </nav>}

      {message && <div className="toast">{message}</div>}

      {createOpen && <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && setCreateOpen(false)}><div className="modal-card"><div className="modal-title"><div><p className="eyebrow">Google Drive</p><h2>קובץ נוכחות חדש</h2></div><button className="icon-button compact" onClick={() => setCreateOpen(false)}><Icon name="close"/></button></div><label className="field-label">שם קובץ הנוכחות</label><input className="text-input" value={createName} onChange={(e) => setCreateName(e.target.value)} placeholder="לדוגמה: מס הכנסה" autoFocus/><label className="field-label">שם התיקייה</label><input className="text-input" value={createFolderName} onChange={(e) => setCreateFolderName(e.target.value)} placeholder="לדוגמה: עבודה"/><label className="field-label">תת־תיקייה <span className="optional-label">אופציונלי</span></label><input className="text-input" value={createSubfolderName} onChange={(e) => setCreateSubfolderName(e.target.value)} placeholder="לדוגמה: רשות המסים"/><div className="drive-preview"><span>הנתיב שייווצר</span><strong>נוכחות בעבודה / {createFolderName || "תיקייה"}{createSubfolderName ? ` / ${createSubfolderName}` : ""} / {createName || "קובץ נוכחות"}</strong></div><button className="primary-action modal-action" disabled={!createName.trim() || !createFolderName.trim() || pendingAction === "create"} onClick={() => void createFile()}>{pendingAction === "create" ? "יוצר ב-Drive…" : "צור וסנכרן"}</button></div></div>}

      {manualOpen && <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && setManualOpen(false)}><div className="modal-card manual-modal"><div className="modal-title"><div><p className="eyebrow">משמרת ידנית</p><h2>הוספת שעות</h2></div><button className="icon-button compact" onClick={() => setManualOpen(false)}><Icon name="close"/></button></div><label className="field-label">תאריך</label><input className="text-input ltr-input" type="date" value={manualDate} onChange={(e) => setManualDate(e.target.value)}/><div className="two-fields"><div><label className="field-label">כניסה</label><input className="text-input ltr-input" type="time" value={manualStart} onChange={(e) => setManualStart(e.target.value)}/></div><div><label className="field-label">יציאה</label><input className="text-input ltr-input" type="time" value={manualEnd} onChange={(e) => setManualEnd(e.target.value)}/></div></div><label className="field-label">סה״כ דקות הפסקה</label><input className="text-input ltr-input" type="number" min="0" max="600" value={manualBreakMinutes} onChange={(e) => setManualBreakMinutes(e.target.value)}/><label className="field-label">הערה <span className="optional-label">אופציונלי</span></label><input className="text-input" value={manualNote} onChange={(e) => setManualNote(e.target.value)} placeholder="לדוגמה: עבודה מהבית"/><div className="break-policy-card"><Icon name="coffee"/><div><strong>כלל ההפסקה: {breakAllowanceMinutes} דקות</strong><span>{breakAllowanceMinutes === 0 ? "כל דקות ההפסקה ינוכו מזמן העבודה." : `רק דקות ההפסקה שמעבר ל־${breakAllowanceMinutes} דקות ינוכו מזמן העבודה.`}</span></div></div><button className="primary-action modal-action" disabled={!manualStart || !manualEnd} onClick={() => void addManual()}>{connected && online ? "שמור משמרת" : "שמור מקומית לסנכרון"}</button></div></div>}

      {editingEntry && <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && setEditingEntry(null)}><div className="modal-card"><div className="modal-title"><div><p className="eyebrow">עריכת רשומה</p><h2>{editingEntry.date}</h2></div><button className="icon-button compact" onClick={() => setEditingEntry(null)}><Icon name="close"/></button></div><label className="field-label">תאריך</label><input className="text-input ltr-input" type="date" value={editDate} onChange={(e) => setEditDate(e.target.value)}/><div className="two-fields"><div><label className="field-label">כניסה</label><input className="text-input ltr-input" type="time" value={editStart} onChange={(e) => setEditStart(e.target.value)}/></div><div><label className="field-label">יציאה {editingEntry.clockOut ? "" : "(אופציונלי)"}</label><input className="text-input ltr-input" type="time" value={editEnd} onChange={(e) => setEditEnd(e.target.value)}/></div></div><label className="field-label">דקות הפסקה</label><input className="text-input ltr-input" type="number" min="0" value={editBreakMinutes} onChange={(e) => setEditBreakMinutes(e.target.value)}/><label className="field-label">הערה</label><input className="text-input" value={editNote} onChange={(e) => setEditNote(e.target.value)}/><p className="modal-note">עריכה מתבצעת ישירות מול שורת ה-Google Sheet. שינוי חודש/שנה יעביר את הרשומה לגיליון המתאים.</p><button className="primary-action modal-action" disabled={!connected || !online || !editDate || !editStart || Boolean(pendingAction)} onClick={() => void saveEntryEdit()}>שמור שינויים</button></div></div>}

      {pathFile && <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && setPathFile(null)}><div className="modal-card"><div className="modal-title"><div><p className="eyebrow">ניהול נתיב</p><h2>{pathFile.name}</h2></div><button className="icon-button compact" onClick={() => setPathFile(null)}><Icon name="close"/></button></div><label className="field-label">נתיב תחת תיקיית נוכחות בעבודה</label><input className="text-input" value={pathValue} onChange={(e) => setPathValue(e.target.value)} placeholder="עבודה / רשות המסים"/><p className="modal-note">אפשר לכתוב כמה רמות עם /. תיקיות חסרות ייווצרו אוטומטית. שדה ריק מעביר את קובץ הנוכחות ישירות לשורש האפליקציה.</p><div className="drive-preview"><span>נתיב יעד</span><strong>נוכחות בעבודה{parsePath(pathValue).length ? ` / ${parsePath(pathValue).join(" / ")}` : ""} / {pathFile.name}</strong></div><button className="primary-action modal-action" disabled={!connected || !online || Boolean(pendingAction)} onClick={() => void moveFile()}>העבר ב-Google Drive</button></div></div>}

      {folderManagerOpen && <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && setFolderManagerOpen(false)}><div className="modal-card folder-manager"><div className="modal-title"><div><p className="eyebrow">Google Drive</p><h2>ניהול תיקיות</h2></div><button className="icon-button compact" onClick={() => setFolderManagerOpen(false)}><Icon name="close"/></button></div><label className="field-label">צור נתיב חדש</label><div className="inline-create"><input className="text-input" value={newFolderPath} onChange={(e) => setNewFolderPath(e.target.value)} placeholder="עבודה / 2026 / פרויקט"/><button className="small-button" disabled={!newFolderPath.trim() || Boolean(pendingAction)} onClick={() => void createFolderPath()}><Icon name="plus"/>צור</button></div><div className="folder-list">{folders.length === 0 && <div className="empty-state">אין תיקיות משנה.</div>}{folders.map((folder) => <div className="folder-row" key={folder.id}><div><strong>{folder.name}</strong><span>{folder.path.join(" / ")}{folder.containsWorkspaces ? ` · ${folder.containsWorkspaces} קבצי נוכחות` : ""}</span></div><div className="folder-actions"><button className="icon-button compact" aria-label="שנה שם תיקייה" onClick={() => void renameFolder(folder)}><Icon name="edit"/></button><button className="icon-button compact danger-icon" aria-label="מחק תיקייה" onClick={() => void deleteFolder(folder)}><Icon name="trash"/></button></div></div>)}</div><p className="modal-note">מחיקת תיקייה מעבירה אותה לאשפה ב-Drive יחד עם התוכן שבתוכה. אפשר לשחזר מהאשפה של Google Drive.</p></div></div>}

      {menuFile && <div className="modal-backdrop bottom-sheet-backdrop" onMouseDown={(e) => e.target === e.currentTarget && setMenuFile(null)}><div className="bottom-sheet"><div className="sheet-grabber"/><div className="sheet-file-title"><strong>{menuFile.name}</strong><span>{(menuFile.folderPath || []).join(" / ") || "שורש האפליקציה"}</span></div>{menuFile.webViewLink && <a className="sheet-action" href={menuFile.webViewLink} target="_blank" rel="noreferrer"><Icon name="external"/>פתח ב-Google Drive</a>}<button className="sheet-action" onClick={() => { setSelectedFileId(menuFile.id); setMenuFile(null); setCurrentFolderSubfolderOpen(true); }}><Icon name="folder"/>צור תת־תיקייה במיקום הזה</button><button className="sheet-action" onClick={() => void renameFile(menuFile)}><Icon name="edit"/>שנה שם</button><button className="sheet-action" onClick={() => openMove(menuFile)}><Icon name="move"/>שנה נתיב / העבר</button><button className="sheet-action danger" onClick={() => void deleteFile(menuFile)}><Icon name="trash"/>העבר לאשפה</button><button className="sheet-cancel" onClick={() => setMenuFile(null)}>ביטול</button></div></div>}

      {currentFolderSubfolderOpen && selectedFile && <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && setCurrentFolderSubfolderOpen(false)}><div className="modal-card"><div className="modal-title"><div><p className="eyebrow">מיקום נוכחי</p><h2>תת־תיקייה חדשה</h2></div><button className="icon-button compact" onClick={() => setCurrentFolderSubfolderOpen(false)}><Icon name="close"/></button></div><p className="modal-note">התיקייה תיווצר בתוך אותה תיקייה ב-Google Drive שבה נמצא כרגע “{selectedFile.name}”.</p><div className="drive-preview"><span>המיקום הנוכחי</span><strong>{(selectedFile.folderPath || []).join(" / ") || "שורש האפליקציה"}</strong></div><label className="field-label">שם תת־התיקייה</label><input className="text-input" value={currentFolderSubfolderName} onChange={(e) => setCurrentFolderSubfolderName(e.target.value)} placeholder="לדוגמה: מסמכים" autoFocus/><button className="primary-action modal-action" disabled={!currentFolderSubfolderName.trim() || Boolean(pendingAction)} onClick={() => void createSubfolderAtCurrentLocation()}>{pendingAction === "folder" ? "יוצר ב-Drive…" : "צור תת־תיקייה"}</button></div></div>}

      {existingDriveOpen && <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && !overwriteCandidate && setExistingDriveOpen(false)}><div className="modal-card drive-file-picker"><div className="modal-title"><div><p className="eyebrow">Google Drive</p><h2>בחר קובץ קיים</h2></div><button className="icon-button compact" onClick={() => setExistingDriveOpen(false)}><Icon name="close"/></button></div><p className="modal-note">מוצגים קבצי Google Sheets שעדיין אינם מנוהלים על ידי האפליקציה. קובץ ריק יותאם מיד למבנה הנוכחות.</p><div className="existing-drive-list">{loadingDriveCandidates && <div className="empty-state">טוען קבצים מ-Drive…</div>}{!loadingDriveCandidates && driveCandidates.length === 0 && <div className="empty-state">לא נמצאו קבצי Google Sheets זמינים.</div>}{driveCandidates.map((candidate) => <button className="existing-drive-row" key={candidate.id} disabled={pendingAction === "adopt"} onClick={() => void adoptExistingDriveFile(candidate)}><span className="existing-drive-icon"><Icon name="drive"/></span><span className="existing-drive-copy"><strong>{candidate.name}</strong><small>{candidate.modifiedTime ? `עודכן ${new Date(candidate.modifiedTime).toLocaleDateString("he-IL")}` : "Google Sheets"}</small></span><Icon name="move"/></button>)}</div><p className="modal-note">האפליקציה תיצור עבור הקובץ תיק נוכחות מסודר באותו מיקום ב-Drive ותשתמש בקובץ כקובץ השנה הנוכחית.</p></div></div>}

      {overwriteCandidate && <div className="modal-backdrop destructive-backdrop"><div className="modal-card destructive-confirm"><div className="danger-modal-icon"><Icon name="trash"/></div><h2>הקובץ מכיל נתונים</h2><p>הקובץ “{overwriteCandidate.name}” אינו ריק. אם תמשיך, <strong>כל הגיליונות וכל הנתונים הקיימים בו יימחקו</strong>, והקובץ ייבנה מחדש לפי מבנה אפליקציית הנוכחות.</p><div className="warning-box">הפעולה משנה את אותו קובץ ב-Google Drive. ודא שאין בו מידע שאתה צריך לפני ההמשך.</div><div className="confirm-actions"><button className="sheet-cancel" disabled={pendingAction === "adopt"} onClick={() => setOverwriteCandidate(null)}>ביטול</button><button className="danger-action" disabled={pendingAction === "adopt"} onClick={() => void adoptExistingDriveFile(overwriteCandidate, true)}>{pendingAction === "adopt" ? "מוחק ובונה מחדש…" : "מחק ובנה מחדש"}</button></div></div></div>}

      {drawerOpen && (
        <div className="drawer-backdrop" onMouseDown={(e) => e.target === e.currentTarget && setDrawerOpen(false)}>
          <aside className="side-drawer">
            <div className="drawer-header">
              <div><p className="eyebrow">הגדרות</p><h2>אפליקציית נוכחות</h2></div>
              <button className="icon-button compact" onClick={() => setDrawerOpen(false)}><Icon name="close"/></button>
            </div>

            <section className="drawer-section">
              <h3>מראה</h3>
              <div className="theme-picker">
                <button className={theme === "system" ? "selected" : ""} onClick={() => setTheme("system")}><Icon name="system"/>מערכת</button>
                <button className={theme === "light" ? "selected" : ""} onClick={() => setTheme("light")}><Icon name="sun"/>בהיר</button>
                <button className={theme === "dark" ? "selected" : ""} onClick={() => setTheme("dark")}><Icon name="moon"/>חשוך</button>
              </div>
            </section>

            {selectedFile && (
              <details className="drawer-section payroll-settings">
                <summary>שכר, ניכויים ותוספות</summary>
                <p>ההגדרות נשמרות עם “{selectedFile.name}” ב-Google Drive ומשמשות למסך הסיכום.</p>

                <div className="payroll-subsection">
                  <h4>יעד ושכר</h4>
                  <div className="payroll-grid two">
                    <label><span>יעד חודשי</span><div className="payroll-input"><input type="number" min="1" step="1" inputMode="decimal" value={targetHoursInput} onChange={(e) => setTargetHoursInput(e.target.value)}/><b>שעות</b></div></label>
                    <label><span>שכר שעתי</span><div className="payroll-input"><input type="number" min="0" step="0.01" inputMode="decimal" value={hourlyRateInput} onChange={(e) => setHourlyRateInput(e.target.value)}/><b>₪</b></div></label>
                  </div>
                </div>

                <div className="payroll-subsection">
                  <h4>ניכויים באחוזים</h4>
                  <div className="payroll-deduction-list">
                    <label><span>הפקדת עובד לפנסיה</span><div className="percent-input"><input type="number" min="0" max="100" step="0.01" inputMode="decimal" value={pensionPercentInput} onChange={(e) => setPensionPercentInput(e.target.value)}/><b>%</b></div></label>
                    <label><span>הפקדת עובד לקרן השתלמות</span><div className="percent-input"><input type="number" min="0" max="100" step="0.01" inputMode="decimal" value={trainingFundPercentInput} onChange={(e) => setTrainingFundPercentInput(e.target.value)}/><b>%</b></div></label>
                    <label><span>ביטוח לאומי + בריאות</span><div className="percent-input"><input type="number" min="0" max="100" step="0.01" inputMode="decimal" value={nationalHealthPercentInput} onChange={(e) => setNationalHealthPercentInput(e.target.value)}/><b>%</b></div></label>
                  </div>
                </div>

                <div className="payroll-subsection">
                  <div className="payroll-subtitle"><h4>תוספות חודשיות</h4><button className="text-button add-payroll-button" type="button" onClick={addPayrollAddition}><Icon name="plus"/>הוסף</button></div>
                  {payrollAdditions.length === 0 && <div className="payroll-empty">אין תוספות מוגדרות.</div>}
                  <div className="payroll-additions">
                    {payrollAdditions.map((addition) => (
                      <div className="payroll-addition-row" key={addition.id}>
                        <input className="text-input" value={addition.name} onChange={(e) => setPayrollAdditions((items) => items.map((item) => item.id === addition.id ? { ...item, name: e.target.value } : item))} placeholder="לדוגמה: נסיעות" aria-label="שם התוספת"/>
                        <div className="payroll-input compact"><input type="number" min="0" step="0.01" inputMode="decimal" value={addition.amount || ""} onChange={(e) => setPayrollAdditions((items) => items.map((item) => item.id === addition.id ? { ...item, amount: Number(e.target.value) || 0 } : item))}/><b>₪</b></div>
                        <button className="icon-button compact danger-icon" type="button" aria-label="מחק תוספת" onClick={() => setPayrollAdditions((items) => items.filter((item) => item.id !== addition.id))}><Icon name="trash"/></button>
                      </div>
                    ))}
                  </div>
                </div>

                <button className="small-button drawer-wide payroll-save" disabled={!connected || !online || pendingAction === "settings"} onClick={() => void savePayrollSettings()}>{pendingAction === "settings" ? "שומר…" : "שמור הגדרות שכר"}</button>
                <small>הנטו המשוער מחושב כרגע מהברוטו פחות שלושת שיעורי הניכוי שהוגדרו. מס הכנסה אינו מחושב בשלב הזה.</small>
              </details>
            )}

            {selectedFile && (
              <details className="drawer-section break-settings">
                <summary>כלל הפסקה · {selectedFile.name}</summary>
                <p>כמה דקות הפסקה מותרות לפני שמתחיל ניכוי מהשעות. ההגדרה נשמרת ב-Drive ומסתנכרנת בין מכשירים.</p>
                <div className="break-presets">{[0, 20, 30, 40, 60].map((value) => <button key={value} className={Number(breakAllowanceInput) === value ? "selected" : ""} onClick={() => setBreakAllowanceInput(String(value))}>{value}</button>)}</div>
                <div className="break-setting-row"><div className="minutes-input"><input type="number" min="0" max="600" inputMode="numeric" value={breakAllowanceInput} onChange={(e) => setBreakAllowanceInput(e.target.value)}/><span>דקות</span></div><button className="small-button" disabled={!connected || !online || pendingAction === "settings" || Number(breakAllowanceInput) === breakAllowanceMinutes} onClick={() => void saveBreakAllowance()}>{pendingAction === "settings" ? "שומר…" : "שמור"}</button></div>
                <small>שינוי הכלל מחשב מחדש גם רשומות שכבר נסגרו.</small>
              </details>
            )}

            <section className="drawer-section sync-section">
              <h3>סנכרון</h3>
              <div className="sync-summary"><Icon name={online ? "sync" : "offline"}/><div><strong>{syncText}</strong><span>Drive הוא מקור האמת. בהתחברות מחדש מתבצעת סריקה מלאה לפי metadata.</span></div></div>
              {queue.length > 0 && <><button className="small-button drawer-wide" disabled={!connected || !online || queueSyncing} onClick={() => void flushQueue()}><Icon name="sync"/>{queueSyncing ? "מסנכרן…" : `סנכרן ${queue.length} פעולות`}</button><button className="text-button danger-text" onClick={() => { if (confirm("למחוק את כל הפעולות שעדיין לא סונכרנו?")) saveQueue([]); }}>מחק פעולות ממתינות</button></>}
            </section>

            {connected ? (
              <section className="drawer-section account-section"><h3>Google Drive</h3><div className="drawer-account"><div className="drive-badge"><Icon name="drive"/></div><div><strong>{status?.name || "Google"}</strong><span>{status?.email || "מחובר"}</span></div></div><button className="logout-button" disabled={pendingAction === "logout"} onClick={() => void disconnect()}><Icon name="logout"/>{pendingAction === "logout" ? "מתנתק…" : "התנתק מ-Google Drive"}</button></section>
            ) : configured && online ? <a className="primary-link" href="/api/auth/google">התחבר מחדש ל-Google Drive</a> : null}
            <div className="drawer-legal-links"><a href="/privacy">מדיניות פרטיות</a><a href="/terms">תנאי שימוש</a></div>
            <p className="drawer-note">התנתקות מבטלת את הרשאת Google. המטמון המקומי נשאר לקריאה, ופעולות נוכחות יכולות להמתין עד לחיבור הבא.</p>
          </aside>
        </div>
      )}
    </main>
  );
}
