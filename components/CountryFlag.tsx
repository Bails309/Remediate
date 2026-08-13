import CN from "country-flag-icons/react/3x2/CN";
import RU from "country-flag-icons/react/3x2/RU";
import IR from "country-flag-icons/react/3x2/IR";
import KP from "country-flag-icons/react/3x2/KP";
import KR from "country-flag-icons/react/3x2/KR";
import VN from "country-flag-icons/react/3x2/VN";
import IN from "country-flag-icons/react/3x2/IN";
import PK from "country-flag-icons/react/3x2/PK";
import BY from "country-flag-icons/react/3x2/BY";
import TR from "country-flag-icons/react/3x2/TR";
import NG from "country-flag-icons/react/3x2/NG";
import { cn } from "@/components/cn";

// Only the countries the ATT&CK attribution heuristics can produce, so the
// bundle stays small instead of pulling in every flag.
const FLAGS: Record<string, typeof CN> = {
  China: CN,
  Russia: RU,
  Iran: IR,
  "North Korea": KP,
  "South Korea": KR,
  Vietnam: VN,
  India: IN,
  Pakistan: PK,
  Belarus: BY,
  Turkey: TR,
  Nigeria: NG,
};

export function CountryFlag({ country, className }: { country: string; className?: string }) {
  const Flag = FLAGS[country];
  if (!Flag) return null;
  return (
    <Flag
      title={country}
      className={cn("h-3.5 w-5 shrink-0 rounded-[2px] ring-1 ring-black/10 dark:ring-white/15", className)}
    />
  );
}
