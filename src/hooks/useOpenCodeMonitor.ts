import { useState, useEffect, useCallback, useRef } from "react";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { db } from "../lib/firebase";

export interface MonitorState {
  contPct: number;
  contH: number;
  contM: number;
  weekPct: number;
  weekD: number;
  weekH: number;
  monthPct: number;
  monthD: number;
  monthH: number;
  updatedAt?: number;
}

export interface HistoryEntry {
  date: string;
  type?: "usage" | "models";
  cont?: number;
  week?: number;
  month?: number;
  summary?: string;
}

const LS_STATE_KEY = "opencode-v3-state";
const LS_HISTORY_KEY = "opencode-v3-history";
const FS_DOC_PATH = "opencode-monitor/state";

const defaultState: MonitorState = {
  contPct: 0, contH: 5, contM: 0,
  weekPct: 0, weekD: 7, weekH: 0,
  monthPct: 0, monthD: 30, monthH: 0,
};

function loadFromLS(): MonitorState {
  try {
    const saved = localStorage.getItem(LS_STATE_KEY);
    if (saved) return { ...defaultState, ...JSON.parse(saved) };
  } catch {}
  return { ...defaultState };
}

function saveToLS(s: MonitorState) {
  try { localStorage.setItem(LS_STATE_KEY, JSON.stringify(s)); } catch {}
}

function loadHistoryLS(): HistoryEntry[] {
  try { return JSON.parse(localStorage.getItem(LS_HISTORY_KEY) || "[]"); } catch { return []; }
}

function saveHistoryLS(h: HistoryEntry[]) {
  try { localStorage.setItem(LS_HISTORY_KEY, JSON.stringify(h)); } catch {}
}

export type SyncStatus = "idle" | "syncing" | "synced" | "offline";

export function useOpenCodeMonitor() {
  const [state, setState] = useState<MonitorState>(loadFromLS);
  const [history, setHistory] = useState<HistoryEntry[]>(loadHistoryLS);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>("idle");
  const fsReady = useRef(false);
  const stateRef = useRef(state);
  stateRef.current = state;

  // Background sync from Firestore
  useEffect(() => {
    setSyncStatus("syncing");
    const ref = doc(db, FS_DOC_PATH);
    getDoc(ref)
      .then((snap) => {
        if (snap.exists()) {
          const data = snap.data();
          const fsState = { ...defaultState, ...data } as MonitorState;
          const fsHistory = (data.history as HistoryEntry[]) || [];
          const fsUpdated = data.updatedAt as number || 0;
          const lsState = loadFromLS();
          const lsUpdated = lsState.updatedAt || 0;

          if (fsUpdated > lsUpdated) {
            setState(fsState);
            saveToLS(fsState);
          }

          if (fsHistory.length > 0) {
            setHistory(fsHistory);
            saveHistoryLS(fsHistory);
          }
        }
        setSyncStatus("synced");
        fsReady.current = true;
      })
      .catch(() => {
        setSyncStatus("offline");
        fsReady.current = true;
      });
  }, []);

  const persist = useCallback((next: MonitorState) => {
    saveToLS(next);
    if (fsReady.current) {
      setDoc(doc(db, FS_DOC_PATH), next, { merge: true }).catch(() => {});
    }
  }, []);

  const update = useCallback(
    (patch: Partial<MonitorState>) => {
      setState((prev) => {
        const next = { ...prev, ...patch, updatedAt: Date.now() };
        persist(next);
        return next;
      });
    },
    [persist],
  );

  const saveHistoryEntry = useCallback(() => {
    const current = stateRef.current;
    setHistory((prev) => {
      const today = new Date().toLocaleDateString();
      if (prev.length > 0 && prev[prev.length - 1].date === today) return prev;
      const entry: HistoryEntry = { date: today, cont: current.contPct, week: current.weekPct, month: current.monthPct };
      const next = [...prev, entry];
      saveHistoryLS(next);
      if (fsReady.current) {
        setDoc(doc(db, FS_DOC_PATH), { history: next }, { merge: true }).catch(() => {});
      }
      return next;
    });
  }, []);

  const setHistoryEntries = useCallback((entries: HistoryEntry[]) => {
    setHistory(entries);
    saveHistoryLS(entries);
    if (fsReady.current) {
      setDoc(doc(db, FS_DOC_PATH), { history: entries }, { merge: true }).catch(() => {});
    }
  }, []);

  const saveModelChangeEntry = useCallback((summary: string) => {
    setHistory((prev) => {
      const entry: HistoryEntry = {
        date: new Date().toLocaleString(),
        type: "models",
        summary,
      };
      const next = [...prev, entry];
      saveHistoryLS(next);
      if (fsReady.current) {
        setDoc(doc(db, FS_DOC_PATH), { history: next }, { merge: true }).catch(() => {});
      }
      return next;
    });
  }, []);

  const resetState = useCallback(() => {
    const fresh = { ...defaultState, updatedAt: Date.now() };
    setState(fresh);
    saveToLS(fresh);
    if (fsReady.current) {
      setDoc(doc(db, FS_DOC_PATH), fresh, { merge: true }).catch(() => {});
    }
  }, []);

  return { state, syncStatus, update, history, setHistory: setHistoryEntries, saveHistoryEntry, saveModelChangeEntry, resetState };
}