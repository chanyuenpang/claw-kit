export type JsonValue = null | boolean | number | string | JsonValue[] | {
    [key: string]: JsonValue;
};
export interface DelegationReceiptTransaction {
    get(id: string): Promise<Record<string, JsonValue> | undefined>;
    list(): Promise<Array<Record<string, JsonValue>>>;
    put(id: string, payload: Record<string, JsonValue>): Promise<void>;
}
/** Private per-invocation receipts, not a role database or canonical claw state.
 * The callback is a short IO transaction: NEVER perform SDK/CLI/network work inside it.
 * Each put is atomic; this lock does not promise multi-record rollback on callback failure. */
export declare class DelegationReceiptStore {
    private readonly root;
    constructor(root?: string);
    withParent<T>(parentId: string, workdir: string, callback: (tx: DelegationReceiptTransaction) => Promise<T>): Promise<T>;
}
