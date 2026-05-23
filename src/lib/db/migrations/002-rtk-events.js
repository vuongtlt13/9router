import { TABLES, buildCreateTableSql } from "../schema.js";

export default {
  version: 2,
  name: "rtk-events",
  up(db) {
    const def = TABLES.rtkEvents;
    db.exec(buildCreateTableSql("rtkEvents", def));
    for (const idx of def.indexes || []) db.exec(idx);
  },
};
