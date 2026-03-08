import type { ReactNode } from "react";
import { cn } from "@/components/cn";

type Props = {
  title: string;
  description?: string;
  icon?: ReactNode;
  className?: string;
};

export function EmptyState({ title, description, icon, className }: Props) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-200 p-12 text-center",
        "dark:border-gray-700",
        className
      )}
    >
      {icon ? <div className="text-slate-400 dark:text-gray-500">{icon}</div> : null}
      <p className="text-lg font-medium text-slate-700 dark:text-gray-300">{title}</p>
      {description ? (
        <p className="max-w-md text-sm text-slate-500 dark:text-gray-400">{description}</p>
      ) : null}
    </div>
  );
}
