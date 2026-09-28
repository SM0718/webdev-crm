import { useState } from "react";
import { Link, NavLink, Outlet, useNavigate } from "react-router-dom";
import {
  Chart2,
  Grid1,
  Logout,
  Menu,
  Moon,
  People,
  Sun,
  CloseSquare,
} from "iconsax-react";
import { toast } from "sonner";

import { useAuth } from "@/context/AuthContext";
import { useTheme } from "@/context/ThemeContext";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { initialsOf } from "@/lib/format";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { to: "/dashboard", label: "Dashboard", icon: Chart2, adminOnly: false },
  { to: "/leads", label: "Leads", icon: Grid1, adminOnly: false },
  { to: "/team", label: "Team", icon: People, adminOnly: true },
];

export default function AppLayout() {
  const { user, isAdmin, logout } = useAuth();
  const { theme, toggle } = useTheme();
  const navigate = useNavigate();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  const items = NAV_ITEMS.filter((item) => !item.adminOnly || isAdmin);

  const handleLogout = () => {
    logout();
    toast.success("Signed out.");
    navigate("/login", { replace: true });
  };

  const navLinkClass = ({ isActive }) =>
    cn(
      "flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
      isActive
        ? "bg-primary/12 text-primary"
        : "text-muted-foreground hover:bg-accent hover:text-foreground",
    );

  return (
    <div className="flex min-h-screen bg-background">
      {/* ------------------------------------------------ desktop sidebar */}
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r bg-card/40 lg:flex">
        <SidebarBrand />
        <Separator />
        <nav className="flex-1 space-y-1 p-3">
          {items.map((item) => (
            <NavLink key={item.to} to={item.to} className={navLinkClass}>
              <item.icon className="h-4.5 w-4.5" />
              {item.label}
            </NavLink>
          ))}
        </nav>
        <Separator />
        <UserPanel user={user} onLogout={handleLogout} />
      </aside>

      {/* ------------------------------------------------- mobile sidebar */}
      {mobileNavOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div
            className="absolute inset-0 bg-black/60"
            onClick={() => setMobileNavOpen(false)}
            aria-hidden
          />
          <aside className="absolute left-0 top-0 flex h-full w-64 flex-col border-r bg-background shadow-2xl">
            <div className="flex items-center justify-between px-4 py-3.5">
              <Brand />
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => setMobileNavOpen(false)}
              >
                <CloseSquare className="h-4 w-4" />
              </Button>
            </div>
            <Separator />
            <nav className="flex-1 space-y-1 p-3">
              {items.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className={navLinkClass}
                  onClick={() => setMobileNavOpen(false)}
                >
                  <item.icon className="h-4.5 w-4.5" />
                  {item.label}
                </NavLink>
              ))}
            </nav>
            <Separator />
            <UserPanel user={user} onLogout={handleLogout} />
          </aside>
        </div>
      )}

      {/* ------------------------------------------------------- main area */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-[66px] items-center gap-3 border-b bg-background/85 px-4 backdrop-blur md:px-6">
          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden"
            onClick={() => setMobileNavOpen(true)}
            aria-label="Open navigation"
          >
            <Menu className="h-5 w-5" />
          </Button>

          <div className="lg:hidden">
            <Brand compact />
          </div>

          <div className="ml-auto flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              onClick={toggle}
              aria-label="Toggle colour theme"
            >
              {theme === "dark" ? (
                <Sun className="h-4.5 w-4.5" />
              ) : (
                <Moon className="h-4.5 w-4.5" />
              )}
            </Button>
          </div>
        </header>

        <main className="flex-1 px-4 py-6 md:px-6 lg:px-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

function Brand({ compact = false }) {
  return (
    <Link to="/dashboard" className="flex items-center gap-2.5">
      <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
        <Grid1 className="h-4.5 w-4.5" variant="bold" />
      </span>
      {!compact && (
        <span className="flex flex-col leading-tight">
          <span className="text-sm font-semibold tracking-tight">
            WebDev CRM
          </span>
          <span className="text-[10px] uppercase tracking-widest text-muted-foreground">
            Lead Manager
          </span>
        </span>
      )}
    </Link>
  );
}

function SidebarBrand() {
  return (
    <div className="px-5 py-4">
      <Brand />
    </div>
  );
}

function UserPanel({ user, onLogout }) {
  if (!user) return null;

  return (
    <div className="space-y-3 p-3">
      <div className="flex items-center gap-2.5 rounded-lg bg-accent/60 px-2.5 py-2">
        <Avatar>
          <AvatarFallback>{initialsOf(user.name)}</AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-semibold">{user.name}</p>
          <p className="truncate text-[10px] text-muted-foreground">
              {user.username}
          </p>
        </div>
        <Badge
          variant={user.role === "admin" ? "default" : "muted"}
          className="shrink-0 capitalize"
        >
          {user.role}
        </Badge>
      </div>
      <Button variant="outline" size="sm" className="w-full" onClick={onLogout}>
        <Logout className="h-4 w-4" />
        Sign out
      </Button>
    </div>
  );
}
