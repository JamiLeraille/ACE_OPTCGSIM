-- CreateTable
CREATE TABLE "matches" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "seed" INTEGER NOT NULL,
    "p1Name" TEXT NOT NULL,
    "p2Name" TEXT NOT NULL,
    "p1Leader" TEXT NOT NULL,
    "p2Leader" TEXT NOT NULL,
    "winner" TEXT,
    "winReason" TEXT,
    "turns" INTEGER NOT NULL,
    "log" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
