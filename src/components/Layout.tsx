import { Outlet, Link, useNavigate } from "react-router-dom";
import UserMenu from "./UserMenu";

export default function Layout() {
  const navigate = useNavigate();

  return (
    <div className="h-screen flex flex-col bg-gray-50">
      <header className="flex-none bg-white border-b border-gray-200 shadow">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <Link to="/" className="text-2xl font-bold text-gray-900 no-underline">
            Vibe Aid
          </Link>
          <div className="flex items-center gap-4">
            <UserMenu />
            <button
              onClick={() => navigate("/logout")}
              className="text-sm text-gray-600 hover:text-gray-900 cursor-pointer"
            >
              Sign out
            </button>
          </div>
        </div>
      </header>
      <main className="flex-1 min-h-0 overflow-hidden">
        <Outlet />
      </main>
    </div>
  );
}
