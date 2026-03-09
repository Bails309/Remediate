import { describe, it, expect, vi, beforeEach } from 'vitest';
import { checkAndFixMigrations } from '../scripts/migrate';
import * as fs from 'fs';

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
    let mockPrisma: any;

    beforeEach(() => {
        vi.resetAllMocks();
        mockPrisma = {
            $queryRawUnsafe: vi.fn(),
            $executeRawUnsafe: vi.fn(),
        };

        // Default mocks for fs
        vi.mocked(fs.existsSync).mockReturnValue(true);
        vi.mocked(fs.readdirSync).mockReturnValue(['migration1' as any, 'migration2' as any]);
        vi.mocked(fs.statSync).mockReturnValue({ isDirectory: () => true } as any);
    });

    it('should delete stale migration records not on disk', async () => {
        // Migration in DB but NOT on disk
        mockPrisma.$queryRawUnsafe.mockResolvedValue([
            { migration_name: 'migration1', finished_at: new Date() },
            { migration_name: 'stale_migration', finished_at: new Date() }
        ]);
        vi.mocked(fs.readdirSync).mockReturnValue(['migration1'] as any);

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
        vi.mocked(fs.readdirSync).mockReturnValue(['failed_migration'] as any);

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
