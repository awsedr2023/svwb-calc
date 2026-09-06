import { useEffect, useRef, useState } from 'preact/hooks';
import { calculationKey } from './storage';
import type { Config, Result, WorkerMessage } from './types';

type Status =
  'waiting' | 'running' | 'done' | 'error' | 'cancelled' | 'invalid';
interface CalculationState {
  key: string;
  status: Status;
  completed: number;
  result?: Result;
  error?: string;
}

export function useCalculation(
  config: Config,
  enabled = true,
  validationError?: string,
) {
  const key = calculationKey(config);
  const cache = useRef(new Map<string, Result>());
  const active = useRef<(() => void) | undefined>(undefined);
  const [retry, setRetry] = useState(0);
  const [state, setState] = useState<CalculationState>({
    key,
    status: 'waiting',
    completed: 0,
  });

  useEffect(() => {
    if (!enabled) return;
    const cached = cache.current.get(key);
    if (cached) {
      setState({ key, status: 'done', completed: 5, result: cached });
      return;
    }
    let disposed = false;
    let worker: Worker | undefined;
    let watchdog: ReturnType<typeof setTimeout> | undefined;
    setState({ key, status: 'waiting', completed: 0 });
    const finish = () => {
      worker?.terminate();
      clearTimeout(watchdog);
    };
    const fail = (error: string) => {
      if (!disposed) {
        finish();
        setState({ key, status: 'error', completed: 0, error });
      }
    };
    const timer = setTimeout(() => {
      if (disposed) return;
      try {
        worker = new Worker(new URL('./worker.ts', import.meta.url), {
          type: 'module',
        });
        worker.onmessage = ({ data }: MessageEvent<WorkerMessage>) => {
          if (disposed) return;
          if (data.type === 'progress')
            setState({ key, status: 'running', completed: data.completed });
          else if (data.type === 'error') fail(data.message);
          else {
            finish();
            if (cache.current.size >= 3)
              cache.current.delete(cache.current.keys().next().value!);
            cache.current.set(key, data.result);
            setState({
              key,
              status: 'done',
              completed: 5,
              result: data.result,
            });
          }
        };
        worker.onerror = () =>
          fail(
            '計算を開始できませんでした。ページを再読み込みしてお試しください。',
          );
        watchdog = setTimeout(
          () =>
            fail(
              '計算に時間がかかるため停止しました。ドローソースの種類数やドロー枚数を減らしてお試しください。',
            ),
          25000,
        );
        setState({ key, status: 'running', completed: 0 });
        worker.postMessage({ config });
      } catch {
        fail(
          'このブラウザでは計算を開始できません。最新版のブラウザでお試しください。',
        );
      }
    }, 300);
    active.current = () => {
      disposed = true;
      clearTimeout(timer);
      finish();
      setState({ key, status: 'cancelled', completed: 0 });
    };
    return () => {
      disposed = true;
      clearTimeout(timer);
      finish();
      active.current = undefined;
    };
  }, [key, retry, enabled]);

  // Never expose a previous result under new input conditions, even for a frame.
  const current: CalculationState = !enabled
    ? {
        key,
        status: 'invalid',
        completed: 0,
        error: validationError ?? '入力欄の範囲内の整数を指定してください。',
      }
    : state.key === key
      ? state
      : { key, status: 'waiting', completed: 0 };
  return {
    ...current,
    cancel: () => active.current?.(),
    retry: () => setRetry((n) => n + 1),
  };
}
