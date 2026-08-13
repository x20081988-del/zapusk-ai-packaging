import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

// Порт и адрес API можно переопределить окружением (.env.local либо переменные
// процесса). Дефолты прежние, так что на чистой машине ничего не меняется. Нужно это
// потому, что 5173 и 4000 на рабочем маке владельца заняты постоянно другим проектом
// (dialot-ai под launchd), и без переопределения dev-сервер кокпита там не поднимается.
//
// loadEnv, а не process.env: .env-файлы Vite подхватывает сам только для клиентского
// import.meta.env, в конфиг они не попадают.
export default defineConfig(({ mode }) => {
  const env = { ...loadEnv(mode, process.cwd(), ''), ...process.env };
  const devPort = Number(env.VITE_DEV_PORT || 5173);
  const devApi = env.VITE_DEV_API || 'http://localhost:4000';

  return {
    plugins: [react()],
    server: {
      port: devPort,
      // Порт занят - падаем, а не переезжаем молча на соседний: тихий переезд
      // означает, что прокси и открытая вкладка смотрят в разные места.
      strictPort: true,
      proxy: {
        '/api': devApi,
        '/uploads': devApi,
      },
    },
  };
});
