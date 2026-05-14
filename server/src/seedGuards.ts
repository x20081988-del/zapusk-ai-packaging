// Sprint 29 — safety guards для seed-операций.
//
// Вынесено отдельно от seed.ts, чтобы destructive скрипты (devReset.ts)
// могли импортировать `assertNotProduction` без триггера `main()` side-effect
// у seed.ts на module load.
//
// На прод (NODE_ENV=production) ЗАПРЕЩЕНО:
//   • prisma.X.deleteMany() — затирает реальные данные клиентов
//   • prisma.user.delete на не-bootstrap аккаунтах
//   • prisma.project.delete на проектах с isDemo=false
//   • prisma.inviteToken.delete на не-revoked инвайтах
//
// Production seed обязан быть чисто-upsert. Любая destructive операция
// должна явно вызвать assertNotProduction(...) и упасть на проде.

export const IS_PRODUCTION = process.env.NODE_ENV === 'production';
export const LOG_PREFIX = IS_PRODUCTION ? '[seed:prod]' : '[seed]';

export function seedLog(message: string): void {
  console.log(`${LOG_PREFIX} ${message}`);
}

/** Sprint 29 — guard для destructive операций. Любой код, который собирается
 *  делать deleteMany / mass-delete, обязан позвать этот guard ПЕРВЫМ.
 *  На production бросает Error — деплой не пройдёт. */
export function assertNotProduction(operation: string): void {
  if (IS_PRODUCTION) {
    console.error(`${LOG_PREFIX} BLOCKED destructive operation: ${operation}`);
    throw new Error(`Refusing destructive seed operation "${operation}" in production`);
  }
}
