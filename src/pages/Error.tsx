import { useSearchParams, Link } from "react-router-dom";

export default function ErrorPage() {
  const [searchParams] = useSearchParams();
  const message = searchParams.get("message") ?? "An unexpected error occurred.";

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="bg-white rounded-lg shadow-lg p-8 max-w-md w-full text-center">
        <h1 className="text-2xl font-bold text-red-600 mb-4">Error</h1>
        <p className="text-gray-600 mb-6">{message}</p>
        <Link
          to="/login"
          className="text-blue-600 hover:text-blue-700 font-medium"
        >
          Back to sign in
        </Link>
      </div>
    </div>
  );
}
