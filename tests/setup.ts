import { afterEach, vi } from "vitest";
import { cleanup } from "@testing-library/react";
import "@testing-library/jest-dom";

// Set required environment variables for tests
process.env.AUTH_SECRET = "test-secret-at-least-32-characters-long-123";
process.env.DATABASE_URL = "postgresql://user:pass@localhost:5432/db";

// Cleanup DOM after each test
afterEach(() => {
    cleanup();
});

// Mock next/navigation
vi.mock("next/navigation", () => ({
    useRouter: () => ({
        push: vi.fn(),
        replace: vi.fn(),
        prefetch: vi.fn(),
        back: vi.fn(),
    }),
    usePathname: () => "",
    useSearchParams: () => new URLSearchParams(),
}));

const Risk = {
    Critical: "Critical",
    High: "High",
    Medium: "Medium",
    Low: "Low",
    None: "None",
};
const VulnerabilityStatus = {
    Open: "Open",
    Remediated: "Remediated",
    FalsePositive: "FalsePositive",
    NoFixAvailable: "NoFixAvailable",
    InProgress: "InProgress",
    InProgressWithCR: "InProgressWithCR",
    Sunset: "Sunset",
};
const UploadStatus = {
    Processing: "Processing",
    Completed: "Completed",
    Failed: "Failed",
};
const UserRole = {
    site_admin: "site_admin",
    web_app_admin: "web_app_admin",
    toolkit_admin: "toolkit_admin",
    web_app_user: "web_app_user",
    toolkit_user: "toolkit_user",
};
const ScannerType = {
    NESSUS: "NESSUS",
    ACR: "ACR",
};
const UploadType = {
    CSV: "CSV",
    PDF: "PDF",
};
const AzureAuthMethod = {
    CONNECTION_STRING: "CONNECTION_STRING",
    ACCOUNT_KEY: "ACCOUNT_KEY",
    SAS_TOKEN: "SAS_TOKEN",
};

const createMockModel = () => {
    const store = new Map<string, any>();
    const findUnique = vi.fn().mockImplementation(async ({ where }) => {
        if (where.id) return store.get(where.id) || null;
        if (where.email) return Array.from(store.values()).find(u => u.email === where.email) || null;
        return null;
    });

    return {
        _store: store,
        findMany: vi.fn().mockImplementation(async (args) => {
            let data = Array.from(store.values());
            if (args?.where?.roles?.has) {
                const role = args.where.roles.has;
                data = data.filter(u => (u.roles || []).includes(role));
            }
            return data;
        }),
        findUnique,
        findFirst: vi.fn().mockImplementation(async () => Array.from(store.values())[0] || null),
        update: vi.fn().mockImplementation(async ({ where, data }) => {
            const id = where.id;
            const existing = store.get(id);
            if (!existing) throw new Error("Not found");
            const updated = { ...existing, ...data };
            store.set(id, updated);
            return updated;
        }),
        updateMany: vi.fn().mockResolvedValue({ count: 0 }),
        create: vi.fn().mockImplementation(async ({ data }) => {
            const id = data.id || "mock-id-" + Math.random().toString(36).substr(2, 9);
            const record = { id, ...data };
            store.set(id, record);
            return record;
        }),
        createMany: vi.fn().mockResolvedValue({ count: 0 }),
        delete: vi.fn().mockImplementation(async ({ where }) => {
            const id = where.id;
            const existing = store.get(id);
            store.delete(id);
            return existing;
        }),
        deleteMany: vi.fn().mockImplementation(async () => {
            const count = store.size;
            store.clear();
            return { count };
        }),
        upsert: vi.fn().mockImplementation(async ({ where, create, update }) => {
            let existing = null;
            if (where.id) existing = store.get(where.id);
            else if (where.email) existing = Array.from(store.values()).find(u => u.email === where.email);
            
            if (existing) {
                const updated = { ...existing, ...update };
                store.set(existing.id, updated);
                return updated;
            } else {
                const id = create.id || "mock-id-" + Math.random().toString(36).substr(2, 9);
                const record = { id, ...create };
                store.set(id, record);
                return record;
            }
        }),
        count: vi.fn().mockImplementation(async (args) => {
            let data = Array.from(store.values());
            if (args?.where?.roles?.has) {
                const role = args.where.roles.has;
                data = data.filter(u => (u.roles || []).includes(role));
            }
            return data.length;
        }),
        aggregate: vi.fn().mockResolvedValue({}),
        groupBy: vi.fn().mockResolvedValue([]),
    };
};

const prismaMock = new Proxy({} as any, {
    get(target, prop) {
        if (typeof prop !== "string") return Reflect.get(target, prop);
        if (prop in target) return target[prop];

        if (prop === "$transaction") {
            target[prop] = vi.fn().mockImplementation(async (arg) => {
                if (Array.isArray(arg)) return Promise.all(arg);
                if (typeof arg === "function") return arg(prismaMock);
                return arg;
            });
            return target[prop];
        }
        if (prop === "$queryRaw" || prop === "$executeRaw" || prop === "$queryRawUnsafe" || prop === "$executeRawUnsafe") {
            target[prop] = vi.fn().mockResolvedValue([]);
            return target[prop];
        }
        if (prop === "$connect" || prop === "$disconnect" || prop === "$on" || prop === "$use") {
            target[prop] = vi.fn().mockResolvedValue(undefined);
            return target[prop];
        }
        if (!prop.startsWith("$")) {
            target[prop] = createMockModel();
            return target[prop];
        }
        target[prop] = vi.fn().mockResolvedValue(undefined);
        return target[prop];
    }
});

// Mock @/lib/prisma to return the same mock client
vi.mock("@/lib/prisma", () => ({
    prisma: prismaMock,
}));

// Mock @prisma/client enums and client
vi.mock("@prisma/client", () => {
    return {
        Risk,
        VulnerabilityStatus,
        UploadStatus,
        UserRole,
        ScannerType,
        UploadType,
        AzureAuthMethod,
        Site: {} as any,
        PrismaClient: class {
            constructor() {
                return prismaMock;
            }
        },
        Prisma: {
            PrismaClientKnownRequestError: class extends Error {
                code = "";
                constructor(message: string, code: string) {
                    super(message);
                    this.code = code;
                }
            },
        },
    };
});

// Mock next-themes
vi.mock("next-themes", () => ({
    useTheme: () => ({
        theme: "light",
        setTheme: vi.fn(),
        systemTheme: "light",
    }),
    ThemeProvider: ({ children }: { children: React.ReactNode }) => children,
}));

// Mock ResizeObserver
global.ResizeObserver = class {
    observe() { }
    unobserve() { }
    disconnect() { }
};
