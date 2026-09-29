import { describeEntity } from "./rules.mjs";
/** Actor data: a Сутність (entity). It changes a lot during play but is never destroyed (p.1). */
const { fields } = foundry.data;
const str = (initial = "") => new fields.StringField({ required: true, blank: true, initial });
const int = (initial = 0) => new fields.NumberField({ required: true, integer: true, min: 0, initial });

export class EntityData extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    return {
      quality: str(), form: str(), trait: str(),     // «Сутність щось… / …й нагадує… / …до того ж…»
      look: str(),                                     // free description in the player's words
      query: str(),                                    // Запит
      queryFrom: str(),                                // who invented it (name)
      queries: new fields.ArrayField(new fields.SchemaField({ text: str(), answer: str(), date: str() })),
      changes: new fields.ArrayField(new fields.SchemaField({ text: str(), dimension: str(), by: str(), date: str() })),
      shards: int(0),
      red: int(0),
      epilogue: str(),
      notes: new fields.HTMLField({ required: true, blank: true, initial: "" })
    };
  }

  get summary() {
    return describeEntity(this);
  }
}
