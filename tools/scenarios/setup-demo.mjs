/** Populate a fresh world for showing the system: compendium content, a start journal, a landing scene, player seats. */
export default async function run({ page }) {
  await page.evaluate(() => game.settings.set("core", "language", "uk"));
  return page.evaluate(async () => {
    const OBS = CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER;
    const log = {};
    const folder = (name, type, color, sort) => game.folders.find(f => f.name === name && f.type === type)
      ?? Folder.create({ name, type, color, sort });

    // Compendium content → world, readable by everyone.
    const importAll = async (packId, type, folderName, color) => {
      const f = await folder(folderName, type, color, 0);
      const pack = game.packs.get(packId);
      const docs = await pack.getDocuments();
      const cls = getDocumentClass(type);
      const existing = cls.collection ?? game.collections.get(type);
      const data = docs.filter(d => !existing.getName(d.name)).map(d => {
        const o = game.collections.get(type).fromCompendium(d);
        o.folder = f.id; o.ownership = { default: OBS };
        return o;
      });
      await cls.createDocuments(data);
      return data.length;
    };
    log.rules = await importAll("mozaika.rules", "JournalEntry", "Правила", "#1d2b7a");
    log.tables = await importAll("mozaika.tables", "RollTable", "Таблиці сутностей", "#1d2b7a");
    log.entities = await importAll("mozaika.entities", "Actor", "Приклади сутностей", "#e98fb0");

    // Start-here journal.
    if (!game.journal.getName("Почни тут")) {
      const p = (name, html, sort) => ({ name, type: "text", sort, text: { format: 1, content: html } });
      await JournalEntry.create({
        name: "Почни тут", ownership: { default: OBS }, sort: -1000,
        pages: [
          p("Ласкаво просимо", `
<p><img src="systems/mozaika/assets/ui/cover.webp" style="max-width:100%;border:none"></p>
<p><strong>Мозаїка: Нашвидкуруч!</strong> — кооперативна настільна рольова гра серед яскравого сюрреалізму й абсурду.
Без ведучого, без підготовки та без граників.</p>
<p>Цей світ Foundry VTT зібраний, щоб грати в Мозаїку онлайн: усе, що на папері роблять таймер, олівці й жетони,
тут робить одна спільна <strong>панель Мозаїки</strong>. Вона відкривається сама; якщо закрили — кнопка з фігурками в лівій панелі
(або <code>game.mozaika.open()</code>).</p>
<p>Гра © 2025 <strong>Стасів Андрій «Дячок»</strong> (текст і верстка), ілюстрації — <strong>Суцільний Максим</strong>,
ліцензія <a href="https://creativecommons.org/licenses/by/4.0/">CC BY 4.0</a>. Оригінал: <a href="https://firstfloor.itch.io/mosaic">firstfloor.itch.io/mosaic</a>.</p>`, 100),
          p("Як зіграти", `
<h2>1. Налаштування (панель, 5 кроків)</h2>
<ol><li><strong>Безпека</strong> — що ок і що не ок.</li>
<li><strong>Сутності</strong> — «Створити мою сутність»: кубики біля трьох таблиць, «3d10» або будь-які цифри (номер телефону, чек…), ім'я, картинка.</li>
<li><strong>Запити</strong> — кожен пише Запит для сутності гравця праворуч.</li>
<li><strong>Забава</strong> — спільна абсурдна мета.</li>
<li><strong>Налаштування</strong> — уламки на старті, секунди Архітектора, «Розпад Мозаїки», сцена для кожного виміру.</li></ol>
<p>«Починаємо!»</p>
<h2>2. Гра</h2>
<ul><li><strong>«Новий вимір!»</strong> — обрати Архітектора й назву виміру.</li>
<li><strong>«Говорити»</strong> — таймер (60 с) для всіх; говорить лише Архітектор, чат інших мовчить, реалії записує він.</li>
<li>Далі всі доповнюють вимір <strong>реаліями</strong>. Змінити сказане — тільки за <strong>уламок</strong> (чарівна паличка біля реалії).</li>
<li>Уламки: 💎+ — вручити іншому (з причиною), паличка — витратити, рука — подарувати.</li>
<li><strong>X</strong> — X-картка: пауза, без пояснень.</li></ul>
<h2>3. Кінець</h2>
<p>«Завершити Мозаїку» — епілоги по 30 секунд, далі журнал-<strong>хроніка</strong> з усіма вимірами, реаліями й епілогами.</p>`, 200),
          p("Що автоматизовано", `
<table><thead><tr><th>У зіні</th><th>У Foundry</th></tr></thead><tbody>
<tr><td>Створення сутності по таблицях / цифрах</td><td>Аркуш сутності: d10 біля кожної таблиці, 3d10, поле «з останніх 3 цифр»</td></tr>
<tr><td>Запит від гравця ліворуч</td><td>Панель сама показує кожному, чий Запит він пише; архів знайдених відповідей</td></tr>
<tr><td>Таймер 60 с, «лише він говорить»</td><td>Спільний таймер для всіх, чат не-Архітекторів заблоковано на час монологу</td></tr>
<tr><td>Реалії — безперечні факти</td><td>Список реалій виміру; монолог позначено ♛; зміна за уламок закреслює стару</td></tr>
<tr><td>Уламки: за що отримати, на що витратити</td><td>Вручити з причиною, подарувати, витратити; зміна чужої сутності — запит згоди власнику; усе картками в чаті</td></tr>
<tr><td>«Новий вимір!», передача ролі</td><td>Кнопка, вибір Архітектора, окрема сцена на вимір (опційно)</td></tr>
<tr><td>Розпад Мозаїки (опційно)</td><td>−5 с кожному новому Архітектору, на 0 — перехід до епілогів</td></tr>
<tr><td>Епілоги по 30 с</td><td>Черга з таймером, тексти потрапляють у хроніку</td></tr>
<tr><td>«Домовтесь, що для вас ок»</td><td>Списки Ок / Не ок і X-картка</td></tr></tbody></table>
<p>Єдине додане від себе: обмін 5 уламків на червоний — у зіні це закреслена жартівлива примітка, тут вона просто є кнопкою.</p>`, 300)
        ]
      });
    }

    // Landing scene with the cover.
    let scene = game.scenes.getName("Мозаїка");
    if (!scene) {
      scene = await Scene.create({
        name: "Мозаїка", navigation: true, backgroundColor: "#e98fb0", width: 1626, height: 1224, padding: 0.05,
        background: { src: "systems/mozaika/assets/ui/cover.webp" }, grid: { type: 0 }, tokenVision: false,
        ownership: { default: OBS }
      });
    }
    await scene.activate();

    // Seats for players (passwords are set by the owner).
    for (const n of [1, 2, 3, 4, 5]) {
      const name = `Гравець ${n}`;
      if (!game.users.getName(name)) await User.create({ name, role: CONST.USER_ROLES.PLAYER });
    }

    await game.mozaika.op("reset", {});
    log.users = game.users.map(u => u.name);
    log.journal = game.journal.map(j => j.name);
    return log;
  });
}
