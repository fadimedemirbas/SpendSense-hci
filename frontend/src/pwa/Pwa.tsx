import {
  createContext,
  useContext,
  useEffect,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { registerSW } from "virtual:pwa-register";
import { Button, Card, LangCtx } from "../ui";
import { pendingNetwork, subscribeNetwork } from "./network";

type InstallEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: string }>;
};
const InstallContext = createContext({
  mode: "manual" as "manual" | "prompt" | "installed",
  install: async () => false,
});
export const usePwa = () => useContext(InstallContext);

const copy = {
  en: {
    offline: "You’re offline",
    returned: "Connection restored",
    hidden:
      "Financial information is hidden. Signing in, saving, and other online actions are unavailable without a connection. No financial changes are stored offline.",
    fresh: "Reload to fetch current information before continuing.",
    retry: "Reconnect and reload",
    update: "A new SpendSense version is available.",
    updateInfo:
      "Finish your work first. Updating reloads this tab and discards unsaved inputs. Other open tabs keep their current screen until reloaded.",
    apply: "Update",
    later: "Later",
    failed: "The app could not check or apply an update. Try again when connected.",
    confirm:
      "Reload SpendSense? Unsaved inputs in this tab will be lost. Finish or save your work first.",
    busy: "Please wait until the current request finishes.",
    checking: "Updating…",
  },
  tr: {
    offline: "Çevrimdışısınız",
    returned: "Bağlantı yeniden kuruldu",
    hidden:
      "Finansal bilgiler gizlendi. Bağlantı olmadan giriş yapma, kaydetme ve diğer çevrimiçi işlemler kullanılamaz. Finansal değişiklikler çevrimdışı saklanmaz.",
    fresh: "Devam etmeden önce güncel bilgileri almak için yeniden yükleyin.",
    retry: "Bağlan ve yeniden yükle",
    update: "SpendSense’in yeni bir sürümü mevcut.",
    updateInfo:
      "Önce işleminizi tamamlayın. Güncelleme bu sekmeyi yeniden yükler ve kaydedilmemiş girişleri siler. Diğer açık sekmeler yeniden yüklenene kadar mevcut ekranlarını korur.",
    apply: "Güncelle",
    later: "Daha sonra",
    failed: "Güncelleme kontrol edilemedi veya uygulanamadı. Bağlantı kurulduğunda tekrar deneyin.",
    confirm:
      "SpendSense yeniden yüklensin mi? Bu sekmedeki kaydedilmemiş girişler kaybolacak. Önce işleminizi tamamlayın veya kaydedin.",
    busy: "Lütfen mevcut istek tamamlanana kadar bekleyin.",
    checking: "Güncelleniyor…",
  },
};

// Registration lives above all screens, so installation/update events are not
// lost when the user leaves the landing page. Never prompt automatically.
export function Pwa({ children }: { children: ReactNode }) {
  const { lang } = useContext(LangCtx);
  const t = copy[lang];
  const busy = useSyncExternalStore(subscribeNetwork, pendingNetwork);
  const [online, setOnline] = useState(navigator.onLine);
  const [blocked, setBlocked] = useState(!navigator.onLine);
  const [installEvent, setInstallEvent] = useState<InstallEvent | null>(null);
  const standalone = () =>
    matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true;
  const [installed, setInstalled] = useState(standalone);
  const [dismissed, setDismissed] = useState(
    () => Number(localStorage.getItem("ss.pwaDismissedUntil") || 0) > Date.now(),
  );
  const [waiting, setWaiting] = useState(false);
  const [later, setLater] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [failure, setFailure] = useState(false);

  useEffect(() => {
    const offline = () => {
      setOnline(false);
      setBlocked(true);
    };
    const back = () => setOnline(true); // Never expose a stale workspace on reconnect.
    const restore = (event: PageTransitionEvent) => {
      if (event.persisted) setBlocked(true);
    };
    const install = (event: Event) => {
      event.preventDefault();
      setInstallEvent(event as InstallEvent);
    };
    const done = () => {
      setInstalled(true);
      setInstallEvent(null);
    };
    addEventListener("offline", offline);
    addEventListener("online", back);
    addEventListener("pageshow", restore);
    addEventListener("beforeinstallprompt", install);
    addEventListener("appinstalled", done);
    return () => {
      removeEventListener("offline", offline);
      removeEventListener("online", back);
      removeEventListener("pageshow", restore);
      removeEventListener("beforeinstallprompt", install);
      removeEventListener("appinstalled", done);
    };
  }, []);

  useEffect(() => {
    if (!import.meta.env.PROD || !("serviceWorker" in navigator)) return;
    let registration: ServiceWorkerRegistration | undefined;
    let live = true;
    registerSW({
      immediate: true,
      onNeedRefresh: () => {
        if (live) {
          setWaiting(true);
          setLater(false);
        }
      },
      // Workbox's default reload callback would also reload other open tabs.
      onNeedReload: () => {
        if (live) {
          setWaiting(true);
          setLater(false);
        }
      },
      onRegisteredSW: (_url, value) => {
        registration = value;
      },
      onRegisterError: () => {
        if (live) setFailure(true);
      },
    });
    let lastCheck = Date.now();
    const check = () => {
      if (
        navigator.onLine &&
        document.visibilityState === "visible" &&
        Date.now() - lastCheck >= 15 * 60 * 1000
      ) {
        lastCheck = Date.now();
        void registration?.update().catch(() => {
          if (live) setFailure(true);
        });
      }
    };
    const timer = setInterval(check, 60 * 60 * 1000);
    addEventListener("online", check);
    document.addEventListener("visibilitychange", check);
    return () => {
      live = false;
      clearInterval(timer);
      removeEventListener("online", check);
      document.removeEventListener("visibilitychange", check);
    };
  }, []);

  async function install() {
    if (!installEvent || dismissed) return false;
    try {
      await installEvent.prompt();
      const choice = await installEvent.userChoice;
      setInstallEvent(null);
      if (choice.outcome !== "accepted") {
        localStorage.setItem("ss.pwaDismissedUntil", String(Date.now() + 30 * 86400000));
        setDismissed(true);
      }
      return true;
    } catch {
      setInstallEvent(null);
      return false;
    }
  }

  async function update() {
    if (busy || !online || !window.confirm(t.confirm)) return;
    setUpdating(true);
    setFailure(false);
    try {
      const registration = await navigator.serviceWorker.getRegistration();
      if (!registration?.waiting) {
        window.location.reload();
        return;
      }
      // Only this consenting tab reloads. No global controllerchange reload,
      // which could erase forms in other tabs without their users' permission.
      const worker = registration.waiting;
      const activated = new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          worker.removeEventListener("statechange", changed);
          reject(new Error("Update timeout"));
        }, 15000);
        const changed = () => {
          if (worker.state === "activated" || worker.state === "redundant") {
            clearTimeout(timeout);
            worker.removeEventListener("statechange", changed);
            worker.state === "activated" ? resolve() : reject(new Error("Update failed"));
          }
        };
        worker.addEventListener("statechange", changed);
        worker.postMessage({ type: "SKIP_WAITING" });
      });
      await activated;
      window.location.reload();
    } catch {
      setFailure(true);
      setUpdating(false);
    }
  }

  return (
    <InstallContext.Provider
      value={{
        mode: installed ? "installed" : installEvent && !dismissed ? "prompt" : "manual",
        install,
      }}
    >
      {blocked && (
        <section className="pwa-offline" aria-label={t.offline}>
          <div className="max-w-xl mx-auto px-5 py-6">
            <Card>
              <div role="status">
                <h1 className="text-2xl font-semibold">{online ? t.returned : t.offline}</h1>
              </div>
              <p>{t.hidden}</p>
              <p>{t.fresh}</p>
              <Button
                disabled={!online || busy > 0}
                onClick={() => {
                  if (!busy && navigator.onLine && window.confirm(t.confirm)) location.reload();
                }}
              >
                {t.retry}
              </Button>
              {busy > 0 && <p role="status">{t.busy}</p>}
            </Card>
          </div>
        </section>
      )}
      <div hidden={blocked} inert={blocked || undefined}>
        {children}
      </div>
      {waiting && (
        <aside className="pwa-update" aria-label={t.update}>
          <p role="status">{t.update}</p>
          {!later && <p>{t.updateInfo}</p>}
          <div className="flex gap-2 flex-wrap">
            <Button disabled={!online || busy > 0 || updating} onClick={() => void update()}>
              {updating ? t.checking : t.apply}
            </Button>
            {!later && <Button onClick={() => setLater(true)}>{t.later}</Button>}
          </div>
          {busy > 0 && <p role="status">{t.busy}</p>}
        </aside>
      )}
      {failure && (
        <p role="status" className="pwa-update-error">
          {t.failed}
        </p>
      )}
    </InstallContext.Provider>
  );
}
