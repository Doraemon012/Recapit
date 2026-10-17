"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

const iconMap = {
	document: "M5 3.5h7l3 3v10.5a1.5 1.5 0 0 1-1.5 1.5h-8A1.5 1.5 0 0 1 4 17V5a1.5 1.5 0 0 1 1.5-1.5Z M12 3.5V7h3",
	wave: "M4 12c2.5-4 5.5 4 8 0s5.5 4 8 0",
	spark: "M10 3.5 11.6 8l4.4 1.5-4.4 1.5L10 15.5 8.4 11 4 9.5 8.4 8 10 3.5Z",
	check: "M5.5 12l3 3 6-7",
	clock: "M12 4.5a7.5 7.5 0 1 1 0 15 7.5 7.5 0 0 1 0-15Zm0 3v4l2.5 1.5",
	link: "M9.5 13.5L8 15a3 3 0 0 1-4.24-4.24l2-2A3 3 0 0 1 9 9h1m1.5-2.5L13 5a3 3 0 1 1 4.24 4.24l-2 2A3 3 0 0 1 12 13h-1",
} as const;

export type SidebarLinkIcon = keyof typeof iconMap;

export interface SidebarLinkProps {
	href: string;
	label: string;
	icon: SidebarLinkIcon;
}

export function SidebarLink({ href, label, icon }: SidebarLinkProps) {
	const pathname = usePathname();
	const [activeHash, setActiveHash] = useState("");

	useEffect(() => {
		if (!pathname?.includes("/meetings/")) {
			return;
		}

		const updateHash = () => {
			setActiveHash(window.location.hash || "");
		};

		updateHash();
		window.addEventListener("hashchange", updateHash);

		return () => {
			window.removeEventListener("hashchange", updateHash);
		};
	}, [pathname]);

	const isActive = pathname?.includes("/meetings/") && activeHash === href;

	return (
		<Link
			href={href}
			className={`group inline-flex items-center gap-3 rounded-2xl border border-white/10 px-4 py-3 text-sm font-medium transition ${
				isActive
					? "border-indigo-400/60 bg-indigo-500/20 text-white"
					: "bg-white/5 text-slate-200 hover:border-indigo-300/60 hover:bg-indigo-500/15"
			}`}
		>
			<span className="flex h-8 w-8 items-center justify-center rounded-full bg-white/10 text-indigo-200">
				<svg
					viewBox="0 0 20 20"
					fill="none"
					className="h-4 w-4"
					stroke="currentColor"
					strokeWidth={1.4}
				>
					<path
						d={iconMap[icon]}
						strokeLinecap="round"
						strokeLinejoin="round"
					/>
				</svg>
			</span>
			<span>{label}</span>
		</Link>
	);
}

export default SidebarLink;
