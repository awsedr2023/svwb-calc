import { calculateAll } from './engine';
import type { Config, WorkerMessage } from './types';

const send = (message: WorkerMessage) => self.postMessage(message);

self.onmessage = ({ data }: MessageEvent<{ config: Config }>) => {
  try {
    const result = calculateAll(data.config, (progress) =>
      send({ type: 'progress', ...progress }),
    );
    send({ type: 'result', result });
  } catch (error) {
    send({
      type: 'error',
      message: error instanceof Error ? error.message : '計算に失敗しました。',
    });
  }
};
