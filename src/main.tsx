import React from "react";
import ReactDOM from "react-dom/client";
import { RouterProvider, createBrowserRouter } from "react-router-dom";
import { ThemeProvider } from "@/lib/theme";
import { HomePage } from "@/routes/home-page";
import { PullRequestPage } from "@/routes/pull-request-page";
import { RootLayout } from "@/routes/root-layout";
import "./styles.css";

const router = createBrowserRouter([
  {
    path: "/",
    element: <RootLayout />,
    children: [
      {
        index: true,
        element: <HomePage />
      },
      {
        path: ":owner/:repo/pull/:number",
        element: <PullRequestPage />
      }
    ]
  }
]);

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ThemeProvider>
      <RouterProvider router={router} />
    </ThemeProvider>
  </React.StrictMode>
);
