import { Injectable, NotFoundException } from '@nestjs/common';
import { Queue } from 'bullmq';
import { randomBytes } from 'crypto';
import { eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import { monitors } from '../db/schema.js';
import { CreateMonitorDto } from './dto/create-monitor.dto.js';

const FREQUENCY_CRONS: Record<string, string> = {
  hourly: '0 * * * *',
  daily: '0 0 * * *',
  weekly: '0 0 * * 0',
};

const REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379';

const monitorQueue = new Queue('monitor', { connection: { url: REDIS_URL } });

@Injectable()
export class MonitorsService {
  async createMonitor(dto: CreateMonitorDto) {
    const monitorId = `mon_${randomBytes(4).toString('hex')}`;
    const frequency = dto.frequency ?? 'daily';
    const cron = FREQUENCY_CRONS[frequency];

    const repeatJobKey = await monitorQueue
      .add(
        'monitor-run',
        { monitorId },
        { repeat: { pattern: cron }, jobId: `monitor:${monitorId}` },
      )
      .then((j) => j.repeatJobKey ?? null);

    await db.insert(monitors).values({
      id: monitorId,
      url: dto.url,
      max_depth: dto['max-depth'] ?? 2,
      max_pages: dto['max-pages'] ?? 100,
      include_patterns: dto['include-patterns'] ?? [],
      exclude_patterns: dto['exclude-patterns'] ?? [],
      frequency,
      webhook_url: dto['webhook-url'],
      repeat_job_key: repeatJobKey,
      goal: dto.goal ?? null,
    });

    return { 'monitor-id': monitorId, status: 'active' };
  }

  async getMonitor(id: string) {
    const [monitor] = await db
      .select()
      .from(monitors)
      .where(eq(monitors.id, id));
    if (!monitor) throw new NotFoundException(`Monitor ${id} not found`);

    return {
      'monitor-id': monitor.id,
      url: monitor.url,
      frequency: monitor.frequency,
      status: monitor.status,
      goal: monitor.goal ?? undefined,
      'last-checked-at': monitor.last_checked_at,
      'last-job-id': monitor.last_job_id,
      'created-at': monitor.created_at,
    };
  }

  async pauseMonitor(id: string) {
    const [monitor] = await db
      .select()
      .from(monitors)
      .where(eq(monitors.id, id));
    if (!monitor) throw new NotFoundException(`Monitor ${id} not found`);

    if (monitor.repeat_job_key) {
      await monitorQueue
        .removeRepeatableByKey(monitor.repeat_job_key)
        .catch(() => {});
    }

    await db
      .update(monitors)
      .set({ status: 'paused' })
      .where(eq(monitors.id, id));
    return { 'monitor-id': id, status: 'paused' };
  }

  async resumeMonitor(id: string) {
    const [monitor] = await db
      .select()
      .from(monitors)
      .where(eq(monitors.id, id));
    if (!monitor) throw new NotFoundException(`Monitor ${id} not found`);

    const cron = FREQUENCY_CRONS[monitor.frequency] ?? FREQUENCY_CRONS.daily;
    const repeatJobKey = await monitorQueue
      .add(
        'monitor-run',
        { monitorId: id },
        { repeat: { pattern: cron }, jobId: `monitor:${id}` },
      )
      .then((j) => j.repeatJobKey ?? null);

    await db
      .update(monitors)
      .set({ status: 'active', repeat_job_key: repeatJobKey })
      .where(eq(monitors.id, id));
    return { 'monitor-id': id, status: 'active' };
  }

  async deleteMonitor(id: string) {
    const [monitor] = await db
      .select()
      .from(monitors)
      .where(eq(monitors.id, id));
    if (!monitor) throw new NotFoundException(`Monitor ${id} not found`);

    if (monitor.repeat_job_key) {
      await monitorQueue
        .removeRepeatableByKey(monitor.repeat_job_key)
        .catch(() => {
          /* already removed */
        });
    }

    await db
      .update(monitors)
      .set({ status: 'deleted' })
      .where(eq(monitors.id, id));
    return { 'monitor-id': id, status: 'deleted' };
  }
}
