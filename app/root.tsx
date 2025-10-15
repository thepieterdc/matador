import {
  Link,
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
} from "react-router";

import type { Route } from "./+types/root";
import "./app.css";

export const links: Route.LinksFunction = () => [
  { rel: "preconnect", href: "https://fonts.googleapis.com" },
  {
    rel: "preconnect",
    href: "https://fonts.gstatic.com",
    crossOrigin: "anonymous",
  },
  {
    rel: "stylesheet",
    href: "https://fonts.googleapis.com/css2?family=Inter:ital,opsz,wght@0,14..32,100..900;1,14..32,100..900&display=swap",
  },
];

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <Meta />
        <Links />
      </head>
      <body className="bg-gray-50 dark:bg-gray-900 min-h-screen flex flex-col">
        <nav className="bg-white dark:bg-gray-800 shadow-sm border-b dark:border-gray-700">
          <div className="container mx-auto px-6 py-4">
            <div className="flex items-center justify-between">
              <Link
                to="/"
                className="text-2xl font-bold text-gray-900 dark:text-white hover:text-gray-700 dark:hover:text-gray-300 flex items-center gap-2"
              >
                <span className="text-red-600 dark:text-red-500">🎯</span>
                <span>
                  Mat<span className="text-red-600 dark:text-red-500">🐂</span>dor
                </span>
              </Link>
            </div>
          </div>
        </nav>
        <div className="flex-1">{children}</div>
        <footer className="bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 py-4 mt-8">
          <div className="container mx-auto px-6 text-center text-sm text-gray-600 dark:text-gray-400">
            made with 🍕
          </div>
        </footer>
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

export default function App() {
  return <Outlet />;
}

export function meta() {
  return [
    { title: "Matador - BullMQ Dashboard" },
    {
      name: "description",
      content: "BullMQ dashboard to list & kill queue jobs",
    },
  ];
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  let message = "Oops!";
  const details = "An unexpected error occurred.";
  let stack: string | undefined;

  if (error instanceof Error) {
    message = error.message;
    stack = error.stack;
  }

  return (
    <main className="container mx-auto p-6">
      <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-6">
        <h1 className="text-2xl font-bold text-red-700 dark:text-red-400 mb-2">{message}</h1>
        <p className="text-red-600 dark:text-red-400 mb-4">{details}</p>
        {stack && (
          <pre className="bg-red-100 dark:bg-red-900/30 p-4 rounded overflow-auto text-sm text-red-900 dark:text-red-200">
            <code>{stack}</code>
          </pre>
        )}
      </div>
    </main>
  );
}
