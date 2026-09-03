import { Routes, Route, Navigate } from "react-router-dom";
import { Toaster } from "sonner";
import { UserProvider } from "./contexts/UserContext";
import { ProjectsProvider } from "./contexts/ProjectsContext";
import { useTheme } from "./contexts/ThemeContext";
import HomePage from "./pages/HomePage";
import ProjectPage from "./pages/ProjectPage";
import DocPage from "./pages/DocPage";

function App() {
  const { resolvedTheme } = useTheme();

  return (
    <UserProvider>
      <ProjectsProvider>
        <div className="min-h-screen bg-background">
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/doc" element={<DocPage />} />
            <Route path="/projects/:projectId" element={<ProjectPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
          <Toaster
            position="bottom-right"
            theme={resolvedTheme}
            toastOptions={{
              style: {
                background: "var(--color-bg-elevated)",
                border: "1px solid var(--color-border)",
                borderRadius: "8px",
                boxShadow: "var(--shadow-md)",
                color: "var(--color-text-primary)",
              },
            }}
          />
        </div>
      </ProjectsProvider>
    </UserProvider>
  );
}

export default App;
