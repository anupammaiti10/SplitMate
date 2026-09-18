import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { clsx } from "clsx";

interface LayoutProps {
  children: React.ReactNode;
}

const navItems = [
  { to: "/dashboard", label: "Dashboard" },
  { to: "/groups", label: "Groups" },
  { to: "/history", label: "History" },
];

export default function Layout({ children }: LayoutProps) {
  const { user, logout, isLoggingOut } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate("/login");
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white shadow-sm">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex h-16 items-center justify-between">
            <div className="flex items-center gap-8">
              <Link
                to="/dashboard"
                className="text-xl font-bold text-primary-600"
              >
                SplitMate
              </Link>
              <div className="hidden sm:flex sm:gap-4">
                {navItems.map((item) => (
                  <Link
                    key={item.to}
                    to={item.to}
                    className={clsx(
                      "rounded-md px-3 py-2 text-sm font-medium transition-colors",
                      location.pathname.startsWith(item.to)
                        ? "bg-primary-50 text-primary-700"
                        : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                    )}
                  >
                    {item.label}
                  </Link>
                ))}
              </div>
            </div>
            <div className="flex items-center gap-4">
              <span className="hidden text-sm text-gray-600 sm:block">
                {user?.name}
              </span>
              <button
                onClick={handleLogout}
                disabled={isLoggingOut}
                className="rounded-md bg-white px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 hover:text-gray-900 disabled:opacity-50"
              >
                {isLoggingOut ? "Logging out..." : "Logout"}
              </button>
            </div>
          </div>
        </div>
        <div className="sm:hidden">
          <div className="flex justify-around border-t border-gray-200 py-2">
            {navItems.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                className={clsx(
                  "rounded-md px-3 py-1 text-xs font-medium",
                  location.pathname.startsWith(item.to)
                    ? "text-primary-600"
                    : "text-gray-500"
                )}
              >
                {item.label}
              </Link>
            ))}
          </div>
        </div>
      </nav>
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        {children}
      </main>
    </div>
  );
}
