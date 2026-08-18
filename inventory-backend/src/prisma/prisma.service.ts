import { Injectable, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit {
  async onModuleInit() {
    await this.$connect();
  }

  /**
   * Return product ids whose JSONB `attributes` contain the search term in
   * any key or value (Prisma has no native cross-key JSON filter).
   */
  async findProductIdsByAttributes(search: string): Promise<number[]> {
    const escaped = search.replace(/[\\%_]/g, (m) => `\\${m}`);
    const rows = await this.$queryRaw<{ id: number }[]>`
      SELECT id FROM "Product"
      WHERE CAST("attributes" AS TEXT) ILIKE ${`%${escaped}%`}
    `;
    return rows.map((r) => r.id);
  }
}
