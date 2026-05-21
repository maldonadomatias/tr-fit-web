// Root — wires shell + pages + dark/light tweak.

const { useState, useEffect } = React;

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "theme": "light"
}/*EDITMODE-END*/;

function App() {
  const [tweaks, setTweak] = window.useTweaks(TWEAK_DEFAULTS);
  const [route, setRoute] = useState({ page: "dashboard" });

  // Apply theme
  useEffect(() => {
    document.documentElement.classList.toggle("dark", tweaks.theme === "dark");
  }, [tweaks.theme]);

  function navigate(next) { setRoute(next); }

  return (
    <div className="shell">
      <Sidebar route={route} navigate={navigate} />
      <Topbar
        route={route} navigate={navigate}
        theme={tweaks.theme}
        setTheme={(t) => setTweak("theme", t)}
      />
      <main className="main">
        <div className="main-inner">
          {route.page === "dashboard" && <PageDashboard navigate={navigate} />}
          {route.page === "pending" && <PagePending navigate={navigate} />}
          {route.page === "users" && <PageUsers navigate={navigate} />}
          {route.page === "user" && <PageUserDetail navigate={navigate} userId={route.userId} />}
          {route.page === "subscriptions" && <PageSubscriptions navigate={navigate} />}
          {route.page === "activity" && <PageActivity navigate={navigate} />}
        </div>
      </main>

      <window.TweaksPanel title="Tweaks">
        <window.TweakSection title="Apariencia">
          <window.TweakRadio
            label="Tema"
            value={tweaks.theme}
            onChange={(v) => setTweak("theme", v)}
            options={[
              { value: "light", label: "Claro" },
              { value: "dark",  label: "Oscuro" },
            ]}
          />
        </window.TweakSection>
        <window.TweakSection title="Demo">
          <div style={{ fontSize: 12, color: "var(--fg-muted)", lineHeight: 1.5 }}>
            Toggleá el tema con el icono ☀/🌙 de la barra superior o desde acá.
            El estado se guarda en el archivo.
          </div>
        </window.TweakSection>
      </window.TweaksPanel>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
