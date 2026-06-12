import * as fs from "fs";
import path from "path";

// Load via tsx - imports are relative to diag file in repo root
import { OfficeState } from "./src/office/engine/officeState.js";
import { buildDynamicCatalog } from "./src/office/layout/furnitureCatalog.js";
import { ensureProjectRoomsForAgents } from "./src/office/projectRoomGeneration.js";
import type { OfficeLayout } from "./src/office/types.js";

// ... rest of the file
console.log("Loaded modules");
