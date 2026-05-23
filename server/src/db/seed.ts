import 'dotenv/config';
import { db } from './client.js';
import { ACHIEVEMENTS } from '../lib/achievements.js';

async function main() {
  console.log('Seeding achievements…');
  for (const a of ACHIEVEMENTS) {
    await db.achievement.upsert({
      where: { slug: a.slug },
      create: {
        slug: a.slug,
        title: a.title,
        description: a.description,
        icon: a.icon,
        xpReward: a.xpReward,
      },
      update: {
        title: a.title,
        description: a.description,
        icon: a.icon,
        xpReward: a.xpReward,
      },
    });
    console.log(`  ✓ ${a.slug}`);
  }
  console.log(`Done. Seeded ${ACHIEVEMENTS.length} achievements.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
