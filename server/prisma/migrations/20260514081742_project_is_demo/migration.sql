-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Project" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "inn" TEXT,
    "website" TEXT,
    "industry" TEXT,
    "legalStatus" TEXT,
    "stage" TEXT,
    "raiseAmount" REAL,
    "currency" TEXT NOT NULL DEFAULT 'RUB',
    "minCheck" REAL,
    "equityOffered" REAL,
    "raiseDeadline" DATETIME,
    "investorType" TEXT,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "investmentTrack" TEXT,
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Project_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Project" ("createdAt", "currency", "equityOffered", "id", "industry", "inn", "investmentTrack", "investorType", "legalStatus", "minCheck", "name", "raiseAmount", "raiseDeadline", "stage", "status", "updatedAt", "userId", "website") SELECT "createdAt", "currency", "equityOffered", "id", "industry", "inn", "investmentTrack", "investorType", "legalStatus", "minCheck", "name", "raiseAmount", "raiseDeadline", "stage", "status", "updatedAt", "userId", "website" FROM "Project";
DROP TABLE "Project";
ALTER TABLE "new_Project" RENAME TO "Project";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
