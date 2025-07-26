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
    <div className="w-64 bg-dark-secondary border-r border-gray-800 flex flex-col">
      {/* Logo/Brand */}
      <div className="p-6 border-b border-gray-800">
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
                    ? "bg-[hsl(180,100%,41%)]/20 text-[hsl(180,100%,41%)] border border-[hsl(180,100%,41%)]/30 glow-turquoise"
                    : "hover:bg-gray-800 text-gray-300 hover:text-white"
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
      <div className="p-4 border-t border-gray-800">
        <div className="flex items-center space-x-2 text-sm">
          <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
          <span className="text-gray-400">Sistema Online</span>
        </div>
      </div>
    </div>
  );
}