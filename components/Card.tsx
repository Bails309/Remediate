import { cn } from "@/components/cn";

export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "glass glass-edge rounded-3xl p-6 transition-all hover:shadow-md",
        className
      )}
      {...props}
    />
  );
}
