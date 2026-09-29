/** Drag-and-drop an existing entity onto the panel (compendium + world actor). */
export default async function run({ page, shot }) {
  return page.evaluate(async () => {
    await game.mozaika.op("reset", {});
    game.mozaika.open();
    await new Promise(r => setTimeout(r, 800));
    const drop = async uuid => {
      const el = document.querySelector("#mozaika-panel");
      const dt = new DataTransfer();
      dt.setData("text/plain", JSON.stringify({ type: "Actor", uuid }));
      el.dispatchEvent(new DragEvent("drop", { dataTransfer: dt, bubbles: true, cancelable: true }));
      await new Promise(r => setTimeout(r, 1500));
    };
    const pack = game.packs.get("mozaika.entities");
    const idx = await pack.getIndex();
    await drop(idx.find(e => e.name === "ТРОН").uuid);
    const world = game.actors.find(a => a.type === "entity" && !game.mozaika.state().seats.includes(a.uuid)) ?? await Actor.create({ name: "Тест", type: "entity" });
    await drop(world.uuid);
    await drop(world.uuid); // twice → still one seat
    const s = game.mozaika.state();
    return { seats: s.seats.map(u => fromUuidSync(u)?.name), hint: !!document.querySelector("#mozaika-panel .moz-drop-hint") };
  });
}
