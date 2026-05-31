/**
 * One-off migration: re-assign the legacy dev-member-001 user (and all their
 * quests, XP events, achievements, etc.) to a real Clerk user ID after the
 * first Clerk sign-in.
 *
 * Why: when Clerk goes live, signing in creates a brand-new User row with
 * the Clerk-issued `user_xxx` id. The pre-existing dev data is owned by
 * `dev-member-001` and would otherwise be orphaned.
 *
 * Usage:
 *   cd server
 *   npx tsx scripts/migrate-dev-user.ts user_2abc123…
 *
 * Get your new Clerk user id from clerk.com → your app → Users tab → click
 * your user → "User ID" field (looks like `user_2abc…`).
 */
import 'dotenv/config';
import { db } from '../src/db/client.js';

const DEV_CLERK_ID = 'dev-member-001';

async function main() {
  const newClerkId = process.argv[2];
  if (!newClerkId || !newClerkId.startsWith('user_')) {
    console.error('Usage: npx tsx scripts/migrate-dev-user.ts <new-clerk-id>');
    console.error('  <new-clerk-id> should look like "user_2abc123…" — grab it from the Clerk dashboard.');
    process.exit(1);
  }

  const oldUser = await db.user.findUnique({ where: { clerkId: DEV_CLERK_ID } });
  if (!oldUser) {
    console.error(`No user with clerkId="${DEV_CLERK_ID}" found. Nothing to migrate.`);
    process.exit(1);
  }
  console.log(
    `Source: user.id=${oldUser.id} (XP=${oldUser.totalXP}, streak=${oldUser.currentStreak}, level=${oldUser.level})`,
  );

  const stubUser = await db.user.findUnique({ where: { clerkId: newClerkId } });
  if (stubUser) {
    const stubQuestCount = await db.quest.count({ where: { userId: stubUser.id } });
    const stubXPCount = await db.xPEvent.count({ where: { userId: stubUser.id } });
    if (stubQuestCount > 0 || stubXPCount > 0 || stubUser.totalXP > 0) {
      console.error(
        `Refusing to migrate: user ${newClerkId} already has data ` +
          `(quests=${stubQuestCount}, xpEvents=${stubXPCount}, totalXP=${stubUser.totalXP}). ` +
          `Resolve manually before re-running.`,
      );
      process.exit(1);
    }
    console.log(`Deleting empty stub user ${stubUser.id} for ${newClerkId}…`);
    await db.user.delete({ where: { id: stubUser.id } });
  }

  console.log(`Updating user ${oldUser.id} → clerkId="${newClerkId}"…`);
  const updated = await db.user.update({
    where: { id: oldUser.id },
    data: { clerkId: newClerkId },
  });

  console.log(
    `\n✅ Migration complete.\n` +
      `   User row ${updated.id} now has clerkId="${updated.clerkId}".\n` +
      `   Carries over: ${updated.totalXP} XP, ${updated.currentStreak}-day streak, level ${updated.level}.\n` +
      `   All quests/XPEvents/achievements/etc. follow because they FK to User.id, not clerkId.\n`,
  );
}

main()
  .catch((err) => {
    console.error('Migration failed:', err);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
