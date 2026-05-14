-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "passwordHash" TEXT,
    "role" TEXT NOT NULL DEFAULT 'FOUNDER',
    "workspaceStatus" TEXT NOT NULL DEFAULT 'lead',
    "lastLoginAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "new_User" ("createdAt", "email", "id", "lastLoginAt", "name", "passwordHash", "role", "workspaceStatus") SELECT "createdAt", "email", "id", "lastLoginAt", "name", "passwordHash", "role", "workspaceStatus" FROM "User";
-- Sprint 25 — переименование старых role в новую RBAC-семантику.
-- admin → ADMIN, client → FOUNDER, manager → MANAGER, sales → MANAGER,
-- demo / viewer / прочее → FOUNDER. Существующих SUPER_ADMIN/INVESTOR ещё
-- нет — они появятся через bootstrap seed.
UPDATE "new_User" SET "role" = 'ADMIN'    WHERE "role" = 'admin';
UPDATE "new_User" SET "role" = 'MANAGER'  WHERE "role" = 'manager';
UPDATE "new_User" SET "role" = 'MANAGER'  WHERE "role" = 'sales';
UPDATE "new_User" SET "role" = 'FOUNDER'  WHERE "role" = 'client';
UPDATE "new_User" SET "role" = 'FOUNDER'  WHERE "role" = 'demo';
UPDATE "new_User" SET "role" = 'FOUNDER'  WHERE "role" = 'viewer';
-- Любые прочие неизвестные значения → FOUNDER (defensive).
UPDATE "new_User" SET "role" = 'FOUNDER'  WHERE "role" NOT IN ('SUPER_ADMIN', 'ADMIN', 'MANAGER', 'FOUNDER', 'INVESTOR');
DROP TABLE "User";
ALTER TABLE "new_User" RENAME TO "User";
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
