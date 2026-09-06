import { useEffect, useState } from 'preact/hooks';

export function PwaNotice() {
  const [waiting, setWaiting] = useState<ServiceWorker | null>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;
    let disposed = false;
    let registration: ServiceWorkerRegistration | undefined;
    let controlled = Boolean(navigator.serviceWorker.controller);
    const changed = () => {
      if (controlled) location.reload();
      else {
        controlled = true;
        setWaiting(null);
        setReady(true);
      }
    };
    const check = () => {
      registration?.update().catch(() => {});
    };
    navigator.serviceWorker.addEventListener('controllerchange', changed);
    window.addEventListener('online', check);
    window.addEventListener('focus', check);
    navigator.serviceWorker
      .register(new URL('./sw.js', document.baseURI), {
        updateViaCache: 'none',
      })
      .then((r) => {
        registration = r;
        if (disposed) return;
        const inspect = () => {
          if (!disposed && r.waiting && navigator.serviceWorker.controller)
            setWaiting(r.waiting);
        };
        inspect();
        r.addEventListener('updatefound', () =>
          r.installing?.addEventListener('statechange', inspect),
        );
        navigator.serviceWorker.ready.then(() => {
          if (!disposed) setReady(true);
        });
      })
      .catch((error) => {
        console.warn('オフライン登録に失敗しました', error);
      });
    return () => {
      disposed = true;
      navigator.serviceWorker.removeEventListener('controllerchange', changed);
      window.removeEventListener('online', check);
      window.removeEventListener('focus', check);
    };
  }, []);
  return (
    <div class="pwa-notice">
      {waiting ? (
        <>
          <p>
            新しいバージョンがあります。更新すると、開いている他のタブも再読み込みします。未確定の入力と比較用の固定結果は失われます。
          </p>
          <button
            type="button"
            onClick={() => waiting.postMessage('ACTIVATE_UPDATE')}
          >
            更新して再読み込み
          </button>
        </>
      ) : ready ? (
        <small>オフラインで利用できます</small>
      ) : null}
    </div>
  );
}
