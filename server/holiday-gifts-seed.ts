import { db } from "./db";
import { holidayGiftPrizes } from "@shared/schema";

const PRIZES = [
  {
    name: "Безкоштовний реліз синглу",
    description: "Опублікуйте пісню на стрімінгових майданчиках без оплати за дистрибуцію.",
    totalLimit: 30,
    weight: 30,
  },
  {
    name: "Доступ до Full-версії Muz Base",
    description: "Професійна база контактів індустрії: ЗМІ, радіо, пабліки, лейбли, YouTube-канали, Facebook-групи, TikTok-блогери та куратори плейлистів.",
    totalLimit: 10,
    weight: 10,
  },
  {
    name: "Доступ до Full-версії Muz Pack",
    description: "Набір інструментів для операційної діяльності артиста: планування релізів, менеджмент, документи, робочі процеси.",
    totalLimit: 3,
    weight: 3,
  },
  {
    name: "Доступ до лекції з музичної дистрибуції",
    description: "Практична лекція про релізи, стрімінги, роялті та типові помилки артистів.",
    totalLimit: 40,
    weight: 40,
  },
  {
    name: "Індивідуальна 40-хвилинна консультація",
    description: "Стратегія розвитку, релізи, монетизація, позиціонування — без води.",
    totalLimit: 3,
    weight: 3,
  },
  {
    name: "Безкоштовний запуск YouTube реклами",
    description: "Ви оплачуєте лише рекламний бюджет. Налаштування та запуск — за нами.",
    totalLimit: 3,
    weight: 3,
  },
  {
    name: "70% знижки на наступний реліз",
    description: "Використайте бонус для майбутнього релізу на платформі.",
    totalLimit: 40,
    weight: 40,
  },
];

export async function seedHolidayGiftPrizes() {
  const existing = await db.select().from(holidayGiftPrizes);
  
  if (existing.length > 0) {
    console.log("Holiday gift prizes already seeded, skipping...");
    return;
  }

  console.log("Seeding holiday gift prizes...");
  
  for (const prize of PRIZES) {
    await db.insert(holidayGiftPrizes).values({
      name: prize.name,
      description: prize.description,
      totalLimit: prize.totalLimit,
      claimedCount: 0,
      weight: prize.weight,
      isActive: true,
      seasonId: "2024-christmas",
    });
  }

  console.log(`Seeded ${PRIZES.length} holiday gift prizes`);
}
