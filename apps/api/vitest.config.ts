import { defineConfig } from 'vitest/config';

/**
 * fileParallelism dimatikan: beberapa suite (order, finance) memakai delta omzet/hak produsen
 * terhadap database bersama, sehingga berjalan paralel membuat angka finance berlomba.
 */
export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    exclude: ['dist/**'],
    environment: 'node',
    fileParallelism: false,
    coverage: { reporter: ['text'] },
  },
});
