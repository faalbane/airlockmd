import { addDoc, collection, limit, onSnapshot, orderBy, query, serverTimestamp } from "firebase/firestore";
import type { AuditRecord } from "../logic/auditRecord";
import type { FirebaseHandle } from "./init";

export async function writeAudit(handle: FirebaseHandle, uid: string, record: AuditRecord): Promise<void> {
  await addDoc(collection(handle.db, "audits", uid, "events"), {
    ...record,
    timestamp: serverTimestamp(),
  });
}

export function watchAudits(
  handle: FirebaseHandle,
  uid: string,
  onRows: (rows: AuditRecord[]) => void,
  onError: () => void,
): () => void {
  const events = query(collection(handle.db, "audits", uid, "events"), orderBy("timestamp", "desc"), limit(20));
  return onSnapshot(
    events,
    (snapshot) => {
      onRows(
        snapshot.docs.map((doc) => {
          const data = doc.data();
          return {
            step: data.step,
            mode: data.mode,
            inferenceSource: data.inferenceSource,
            entityCounts: data.entityCounts ?? {},
            injectionBlocked: Boolean(data.injectionBlocked),
            policyVersion: String(data.policyVersion ?? ""),
            payloadHash: String(data.payloadHash ?? ""),
          } as AuditRecord;
        }),
      );
    },
    () => onError(),
  );
}
