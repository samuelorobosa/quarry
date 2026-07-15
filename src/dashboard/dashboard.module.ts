import { Module } from '@nestjs/common';
import { MonitorsModule } from '../monitors/monitors.module.js';
import { DashboardController } from './dashboard.controller.js';
import { DashboardService } from './dashboard.service.js';

@Module({
  imports: [MonitorsModule],
  controllers: [DashboardController],
  providers: [DashboardService],
})
export class DashboardModule {}
