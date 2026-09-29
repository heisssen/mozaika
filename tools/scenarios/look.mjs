export default async function run({ page, shot }) {
  await page.waitForTimeout(4000);
  await page.evaluate(() => game.journal.getName("Почни тут")?.sheet.render({ force: true }));
  await page.waitForTimeout(2500);
  await shot("look");
  return { lang: game => null, scene: await page.evaluate(() => canvas.scene?.name) };
}
