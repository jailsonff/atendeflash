import { Link, useLocation } from "wouter";
import { cn } from "@/lib/utils";

const navigation = [
  { name: "Dashboard", href: "/dashboard", icon: "fas fa-tachometer-alt" },
  { name: "Conexões WhatsApp", href: "/conexoes", icon: "fab fa-whatsapp" },
  { name: "Conversas", href: "/conversas", icon: "fas fa-comments" },
  { name: "Agentes IA", href: "/agentes", icon: "fas fa-robot" },
  { name: "Config. ChatGPT", href: "/chatgpt", icon: "fas fa-cog" },
];

export default function Sidebar() {
  const [location] = useLocation();

  return (
    <div className="w-64 bg-card border-r border-border flex flex-col">
      {/* Logo/Brand */}
      <div className="p-6 border-b border-border">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 bg-gradient-to-br from-[hsl(180,100%,41%)] to-[hsl(328,100%,54%)] rounded-lg flex items-center justify-center">
            <i className="fas fa-fire text-white text-lg"></i>
          </div>
          <div>
            <h1 className="text-xl font-bold text-white">Aquecedor</h1>
            <p className="text-xs text-[hsl(180,100%,41%)] font-medium">TURBO</p>
          </div>
        </div>
      </div>

      {/* Navigation Menu */}
      <nav className="flex-1 p-4 space-y-2">
        {navigation.map((item) => {
          const isActive = location === item.href || (item.href === "/dashboard" && location === "/");
          
          return (
            <Link key={item.name} href={item.href}>
              <div
                className={cn(
                  "flex items-center space-x-3 px-4 py-3 rounded-lg transition-all cursor-pointer",
                  isActive
                    ? "bg-primary/20 text-primary border border-primary/30 glow-turquoise"
                    : "hover:bg-muted text-muted-foreground hover:text-foreground"
                )}
              >
                <i className={item.icon}></i>
                <span className={isActive ? "font-medium" : ""}>{item.name}</span>
              </div>
            </Link>
          );
        })}
      </nav>

      {/* System Status */}
      <div className="p-4 border-t border-border">
        <div className="flex items-center space-x-2 text-sm">
          <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
          <span className="text-muted-foreground">Sistema Online</span>
        </div>
      </div>
    </div>
  );
}