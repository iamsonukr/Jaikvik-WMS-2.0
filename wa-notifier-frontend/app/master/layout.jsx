// Nested layout for the /master area (messaging/campaign tools, shared by
// the Admin and Master roles) — the root
// app/layout.jsx already supplies <html>/<body> and the global providers
// (Auth/Client/Theme), so this only needs to pass children through. Each
// page under this area wraps itself in <AppShell allowedRoles={[...]}> for
// the actual role-gated chrome (Sidebar + topbar) and redirect-if-wrong-role
// logic.
export default function MasterLayout({ children }) {
  return children;
}
