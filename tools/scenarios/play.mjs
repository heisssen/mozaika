/** Full game as the GM-host: setup → dimension → monologue → shards → epilogue → chronicle. */
export default async function run({ page, shot }) {
  const ev = (fn, arg) => page.evaluate(fn, arg);
  const wait = ms => page.waitForTimeout(ms);
  const log = {};

  // Clean slate.
  await ev(async () => {
    await game.settings.set("core", "language", "uk").catch(() => {});
    if (game.user.isGM) {
      await Actor.deleteDocuments(game.actors.filter(a => a.type === "entity").map(a => a.id));
      await JournalEntry.deleteDocuments(game.journal.map(j => j.id));
      await Scene.deleteDocuments(game.scenes.map(s => s.id));
      await ChatMessage.deleteDocuments(game.messages.map(m => m.id));
    }
    await game.user.update({ character: null }).catch(e => console.warn(e.message));
    await game.mozaika.op("reset", {});
    game.mozaika.open();
  });
  await wait(800);
  log.panelOpen = await ev(() => !!document.querySelector("#mozaika-panel"));
  await shot("01-setup-empty");

  // Create my entity through the UI and roll it.
  await page.click("#mozaika-panel [data-action=createEntity][data-mine='1']");
  await wait(1500);
  const sheet = ".moz-sheet";
  await page.waitForSelector(sheet);
  await page.fill(`${sheet} input.moz-name`, "ТРОН");
  await page.press(`${sheet} input.moz-name`, "Tab");
  await wait(400);
  await page.fill(`${sheet} input[name=digits]`, "+380 67 123 45 78");
  await page.click(`${sheet} [data-action=fromDigits]`);
  await wait(800);
  await page.click(`${sheet} [data-action=rollTable][data-key=trait]`);
  await wait(1000);
  log.mine = await ev(() => { const a = game.user.character; return { name: a?.name, summary: a?.system.summary }; });
  await shot("02-sheet");

  // A second entity (another player's, created by the host here).
  await ev(async () => {
    const uuid = await game.mozaika.op("createEntity", { name: "МУМІ-ТУМІ", quality: "класне", form: "химеру", trait: "вивчає *реп*" });
    await game.mozaika.op("writeQuery", { uuid, text: "Як далеко можна зайти?" });
    await game.mozaika.op("writeQuery", { uuid: game.user.character.uuid, text: "Чи зможе він налаштуватися на якийсь канал?" });
    await game.mozaika.op("quest", { text: "Знайти, хто вкрав Місяць" });
    await game.mozaika.op("safety", { ok: "абсурд, реп", notOk: "павуки" });
    await game.mozaika.op("options", { base: 4, decay: false, startShards: 3 });
  });
  await page.evaluate(() => foundry.applications.instances.forEach(a => a.id !== "mozaika-panel" && a.close?.()));
  await wait(800);
  await shot("03-setup-filled");

  await page.click("#mozaika-panel [data-action=start]");
  await wait(1200);
  log.phase = await ev(() => game.mozaika.state().phase);

  // New dimension via the dialog.
  await page.click("#mozaika-panel [data-action=newDimension]");
  await page.waitForSelector(".moz-dialog input[name=t]");
  await page.fill(".moz-dialog input[name=t]", "Маяк під бурею");
  await page.click(".moz-dialog button[data-action=ok]");
  await wait(1500);
  log.dimension = await ev(() => { const s = game.mozaika.state(); return { n: s.dimension.n, title: s.dimension.title, scene: game.scenes.active?.name }; });

  // Monologue: 4 s; add realities as Architect while it runs; the chat gag blocks nobody here (GM is the Architect).
  await page.click("#mozaika-panel [data-action=startMonologue]");
  await wait(400);
  for (const t of ["Скляний маяк, що спирається на портрет бурі", "Поруч плаває коридор"]) {
    await page.fill("#mozaika-panel form.moz-add-reality input", t);
    await page.press("#mozaika-panel form.moz-add-reality input", "Enter");
    await wait(500);
  }
  await shot("04-monologue");
  await wait(4500);
  log.afterMonologue = await ev(() => { const s = game.mozaika.state(); return { timer: s.timer.kind, realities: s.dimension.realities.length, shards: game.user.character.system.shards }; });

  // Shards: award, give, use (change reality), exchange.
  await ev(async () => {
    const s = game.mozaika.state();
    const [me, other] = s.seats;
    await game.mozaika.op("award", { uuid: other, reason: "laughter", note: "реп про круасани" });
    await game.mozaika.op("give", { from: me, to: other, note: "тримай" });
    await game.mozaika.op("useShard", { uuid: me, purpose: "changeReality", realityId: s.dimension.realities[1].id, text: "Коридор тоне і співає" });
    await game.mozaika.op("useShard", { uuid: me, purpose: "changeEntity", target: me, text: "Тепер ТРОН — лампа" });
    await game.mozaika.op("award", { uuid: me, reason: "monologue" });
    await game.mozaika.op("award", { uuid: me, reason: "query" });
    await game.mozaika.op("award", { uuid: me, reason: "realities" });
  });
  await wait(1200);
  log.shards = await ev(() => game.mozaika.state().seats.map(u => { const a = fromUuidSync(u); return [a.name, a.system.shards, a.system.red, a.system.changes.length]; }));
  await shot("05-play");

  // X-card pauses; resume.
  await ev(() => game.mozaika.op("startMonologue"));
  await wait(300);
  await page.click("#mozaika-panel [data-action=xcard]");
  await wait(600);
  log.xcard = await ev(() => game.mozaika.state().timer.paused);
  await ev(() => game.mozaika.op("pause", { pause: false }));
  await wait(4000);

  // Decay: base 4, step 5 → next monologue is 0 s → the Mosaic completes into epilogues.
  await ev(() => game.mozaika.op("options", { decay: true }));
  await ev(() => game.mozaika.op("newDimension", { title: "Кінець" }));
  await wait(500);
  await ev(() => game.mozaika.op("startMonologue"));
  await wait(1000);
  log.decayPhase = await ev(() => game.mozaika.state().phase);
  await ev(async () => {
    for (const u of game.mozaika.state().seats) await game.mozaika.op("epilogueText", { uuid: u, text: "Стала лампою і світить маяку." });
  });
  await shot("06-epilogue");
  await ev(async () => { await game.mozaika.op("nextEpilogue"); await game.mozaika.op("nextEpilogue"); });
  await wait(1500);
  log.end = await ev(() => { const s = game.mozaika.state(); const j = game.journal.get(s.chronicle); return { phase: s.phase, pages: j?.pages.map(p => p.name) }; });
  await shot("07-done");
  await ev(() => game.journal.get(game.mozaika.state().chronicle)?.sheet.render({ force: true }));
  await wait(1200);
  await shot("08-chronicle");
  log.messages = await ev(() => game.messages.contents.length);
  return log;
}
