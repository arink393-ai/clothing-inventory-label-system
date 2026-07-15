"use client";

import { useCallback, useEffect, useState } from "react";

type CloudState = "checking" | "online" | "offline";

export function CloudStatus() {
  const [state, setState] = useState<CloudState>("checking");
  const check = useCallback(async () => {
    if (!navigator.onLine) {
      setState("offline");
      return;
    }
    setState((current) => (current === "online" ? current : "checking"));
    try {
      const response = await fetch("/api/health", { cache: "no-store" });
      setState(response.ok ? "online" : "offline");
    } catch {
      setState("offline");
    }
  }, []);

  useEffect(() => {
    const initial = window.setTimeout(() => void check(), 0);
    const online = () => void check();
    const offline = () => setState("offline");
    window.addEventListener("online", online);
    window.addEventListener("offline", offline);
    const timer = window.setInterval(() => void check(), 30_000);
    return () => {
      window.clearTimeout(initial);
      window.removeEventListener("online", online);
      window.removeEventListener("offline", offline);
      window.clearInterval(timer);
    };
  }, [check]);

  const label = state === "online" ? "雲端已連線" : state === "offline" ? "雲端連線中斷" : "正在確認雲端";
  return (
    <button className={`status status-${state}`} type="button" onClick={() => void check()} title="按一下立即重新檢查">
      <span className="status-dot" />{label}
    </button>
  );
}
