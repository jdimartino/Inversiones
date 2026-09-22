import { useState, useEffect, useCallback, useRef } from "react";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { db } from "../lib/firebase";

export interface ZenBudgetState {
  monthlyLimit: number;
  spent: number;
  autoReloadThreshold: number;
  updatedAt?: number;
}

const LS_KEY = "opencode-zen-budget";
const FS_DOC_PATH = "monitors/opencode-zen-budget";

const defaultState: ZenBudgetState = {
  monthlyLimit: 0,
  spent: 0,
  autoReloadThreshold: 0,
};

function loadFromLS(): ZenBudgetState {
  try {
    const saved = localStorage.getItem(LS_KEY);
    if (saved) return { ...defaultState, ...JSON.parse(saved) };
  } catch {}
  return { ...defaultState };
}

function saveToLS(s: ZenBudgetState) {
  try { localStorage.setItem(LS_KEY, JSON.stringify(s)); } catch {}
}

export function useOpenCodeZenBudget() {
  const [state, setState] = useState<ZenBudgetState>(loadFromLS);
  const [loading, setLoading] = useState(true);
  const fsReady = useRef(false);

  useEffect(() => {
    const ref = doc(db, FS_DOC_PATH);
    getDoc(ref)
      .then((snap) => {
        if (snap.exists()) {
          const fsState = { ...defaultState, ...snap.data() } as ZenBudgetState;
          const lsUpdated = loadFromLS().updatedAt || 0;
          if ((fsState.updatedAt || 0) >= lsUpdated) {
            setState(fsState);
            saveToLS(fsState);
          }
        }
      })
      .catch(() => {})
      .finally(() => {
        fsReady.current = true;
        setLoading(false);
      });
  }, []);

  const update = useCallback((patch: Partial<ZenBudgetState>) => {
    setState((prev) => {
      const next = { ...prev, ...patch, updatedAt: Date.now() };
      saveToLS(next);
      if (fsReady.current) {
        setDoc(doc(db, FS_DOC_PATH), next, { merge: true }).catch(() => {});
      }
      return next;
    });
  }, []);

  const usedPct = state.monthlyLimit > 0 ? Math.min(100, (state.spent / state.monthlyLimit) * 100) : 0;
  const remaining = Math.max(0, state.monthlyLimit - state.spent);

  return { state, update, loading, usedPct, remaining };
}
