"use client";

import { useEffect, useState } from "react";
import { SidebarLink } from "./SidebarLink";

export function StickyAtlas() {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const header = document.querySelector("header");
    if (!header) return;

    const observer = new IntersectionObserver(
      ([entry]) => setIsVisible(!entry.isIntersecting),
      { threshold: 0.1 }
    );

    observer.observe(header);
    return () => observer.disconnect();
  }, []);

  return (
    <aside
      className={`hidden lg:block transition-all duration-500 ${
        isVisible ? "sticky top-10 opacity-100 translate-y-0" : "opacity-0 -translate-y-3 pointer-events-none"
      } self-start h-[calc(100vh-4rem)] w-64 flex-none overflow-y-auto`}
    >
      <div className="rounded-3xl border border-white/10 bg-white/5 p-5 text-xs text-slate-300 shadow-lg backdrop-blur-sm">
        <p className="font-semibold uppercase tracking-[0.3em] text-indigo-200">Meeting atlas</p>
        <p className="mt-3 text-slate-300/80">
          Jump to any section of the recap without losing your place.
        </p>
      </div>
      <div className="mt-4 flex flex-col gap-3">
        <SidebarLink href="#summary" label="Summary" icon="document" />
        <SidebarLink href="#transcript" label="Transcript" icon="wave" />
        <SidebarLink href="#insights" label="Insights" icon="spark" />
        <SidebarLink href="#actions" label="Actions" icon="check" />
        <SidebarLink href="#timeline" label="Timeline" icon="clock" />
      </div>
    </aside>
  );
}
