import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Contrast, Type, PlusCircle } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";

interface HeaderProps {
  highContrast: boolean;
  dyslexicFont: boolean;
  readableSpacing: boolean;
  onToggleHighContrast: (value: boolean) => void;
  onToggleDyslexicFont: (value: boolean) => void;
  onToggleReadableSpacing: (value: boolean) => void;
}

const links = [
  { href: "/", label: "Home" },
  { href: "/analyze", label: "Analyze Text" },
  { href: "/tools", label: "Tools" },
  { href: "/about", label: "About" },
];

const Header = ({
  highContrast,
  dyslexicFont,
  readableSpacing,
  onToggleHighContrast,
  onToggleDyslexicFont,
  onToggleReadableSpacing,
}: HeaderProps) => {
  const [location, navigate] = useLocation();

  return (
    <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 backdrop-blur">
      <div className="container mx-auto px-4 py-3">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center justify-between gap-3">
            <Link href="/" className="text-xl font-bold tracking-tight text-slate-900">
              DyslexiaSupportCopy
            </Link>
            <Button onClick={() => navigate("/note")} size="sm" className="lg:hidden"><PlusCircle className="mr-1 h-4 w-4" />New</Button>
          </div>

          <nav className="flex flex-wrap gap-3" aria-label="Main navigation">
            {links.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={`rounded-full px-3 py-1.5 text-sm transition ${location === link.href ? "bg-blue-600 text-white" : "text-slate-700 hover:bg-slate-100"}`}
              >
                {link.label}
              </Link>
            ))}
          </nav>

          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            <div className="flex items-center gap-2 rounded-lg border border-slate-200 px-2 py-1.5">
              <Contrast className="h-4 w-4" />
              <Label htmlFor="contrast" className="text-xs">High contrast</Label>
              <Switch id="contrast" checked={highContrast} onCheckedChange={onToggleHighContrast} />
            </div>
            <div className="flex items-center gap-2 rounded-lg border border-slate-200 px-2 py-1.5">
              <Type className="h-4 w-4" />
              <Label htmlFor="font" className="text-xs">Dyslexic font</Label>
              <Switch id="font" checked={dyslexicFont} onCheckedChange={onToggleDyslexicFont} />
            </div>
            <div className="flex items-center gap-2 rounded-lg border border-slate-200 px-2 py-1.5">
              <Label htmlFor="spacing" className="text-xs">Readable spacing</Label>
              <Switch id="spacing" checked={readableSpacing} onCheckedChange={onToggleReadableSpacing} />
            </div>
          </div>
        </div>
      </div>
    </header>
  );
};

export default Header;
