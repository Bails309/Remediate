import { describe, it, expect, vi, beforeEach } from 'vitest';
const { checkAndFixMigrations } = require('../scripts/migrate');

// Mock fs and path
vi.mock('fs', () => ({
    default: {
        existsSync: vi.fn(),
        readdirSync: vi.fn(),
        statSync: vi.fn(),
    },
    existsSync: vi.fn(),
    readdirSync: vi.fn(),
    statSync: vi.fn(),
}));

describe('checkAndFixMigrations', () => {
    let mockPrisma;
    const fs = require('fs');

    beforeEach(() => {
        vi.resetAllMocks();
        mockPrisma = {
            $queryRawUnsafe: vi.fn(),
            $executeRawUnsafe: vi.fn(),
        };

        // Default mocks for fs
        fs.existsSync.mockReturnValue(true);
        fs.readdirSync.mockReturnValue(['migration1', 'migration2']);
        fs.statSync.mockReturnValue({ isDirectory: () => true });
    });

    it('should delete stale migration records not on disk', async () => {
        // Migration in DB but NOT on disk
        mockPrisma.$queryRawUnsafe.mockResolvedValue([
            { migration_name: 'migration1', finished_at: new Date() },
            { migration_name: 'stale_migration', finished_at: new Date() }
        ]);
        fs.readdirSync.mockReturnValue(['migration1']);

        await checkAndFixMigrations(mockPrisma);

        expect(mockPrisma.$executeRawUnsafe).toHaveBeenCalledWith(
            expect.stringContaining("DELETE FROM _prisma_migrations WHERE migration_name = 'stale_migration'")
        );
    });

    it('should delete blocking failed migrations', async () => {
        // Migration exists on disk but finished_at is NULL
        mockPrisma.$queryRawUnsafe.mockResolvedValue([
            { migration_name: 'failed_migration', finished_at: null }
        ]);
        fs.readdirSync.mockReturnValue(['failed_migration']);

        await checkAndFixMigrations(mockPrisma);

        expect(mockPrisma.$executeRawUnsafe).toHaveBeenCalledWith(
            expect.stringContaining("DELETE FROM _prisma_migrations WHERE migration_name = 'failed_migration'")
        );
    });

    it('should force a repair if rollup exists but schema is incomplete', async () => {
        mockPrisma.$queryRawUnsafe
            .mockResolvedValueOnce([
                { migration_name: '20260309164800_init_rollup', finished_at: new Date() }
            ]) // First call: get migrations
            .mockRejectedValueOnce(new Error('Column authSource does not exist')); // Second call: check column

        await checkAndFixMigrations(mockPrisma);

        expect(mockPrisma.$executeRawUnsafe).toHaveBeenCalledWith(
            expect.stringContaining("DELETE FROM _prisma_migrations WHERE migration_name LIKE '%init_rollup%'")
        );
    });
});
