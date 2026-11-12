import "server-only";
import { broadcasts } from "@nabi/core";
import { adminOpsUseCases } from "@nabi/core/application/adminOps.ts";
import { honey } from "@nabi/core/application/honey.ts";

export const adminOpsServer = () => adminOpsUseCases(broadcasts().end, honey().reconcileCancel);
