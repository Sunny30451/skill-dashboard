import { ArrowLeft, Compass } from "lucide-react";
import { Link } from "react-router-dom";
import { useAuth } from "../contexts/auth";

export default function NotFound() {
  const { isAuthenticated } = useAuth();
  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-900 p-6 text-center">
      <div>
        <Compass className="mx-auto mb-6 h-16 w-16 text-blue-400" />
        <p className="mb-2 text-sm font-semibold uppercase tracking-[0.2em] text-blue-400">
          404
        </p>
        <h1 className="mb-3 text-3xl font-bold text-white">
          Seite nicht gefunden
        </h1>
        <p className="mb-8 text-gray-400">
          Die angeforderte Seite existiert nicht oder wurde verschoben.
        </p>
        <Link
          to={isAuthenticated ? "/dashboard" : "/"}
          className="inline-flex items-center rounded-lg bg-blue-600 px-5 py-3 font-medium text-white hover:bg-blue-700"
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          {isAuthenticated ? "Zum Dashboard" : "Zur Startseite"}
        </Link>
      </div>
    </div>
  );
}
