import { createEgress, type EgressPort } from "./adapters/egress.ts";
import { createLiveKit, type LiveKitPort } from "./adapters/livekit.ts";
import { createStorage } from "./adapters/storage.ts";
import { broadcastUseCases } from "./application/broadcast.ts";
import { recordingUseCases, type RecordingUseCases } from "./application/recording.ts";

let lk: LiveKitPort | undefined;
let eg: EgressPort | undefined;
let rec: RecordingUseCases | undefined;
export const livekit = () => (lk ??= createLiveKit());
export const egress = () => (eg ??= createEgress());
export const recordings = () => (rec ??= recordingUseCases(egress(), createStorage()));
export const broadcasts = () => broadcastUseCases(livekit(), recordings());
