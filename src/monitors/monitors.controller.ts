import { Body, Controller, Delete, Get, Param, Post } from '@nestjs/common';
import { MonitorsService } from './monitors.service.js';
import { CreateMonitorDto } from './dto/create-monitor.dto.js';

@Controller('monitors')
export class MonitorsController {
  constructor(private readonly monitorsService: MonitorsService) {}

  @Post()
  createMonitor(@Body() dto: CreateMonitorDto) {
    return this.monitorsService.createMonitor(dto);
  }

  @Get(':id')
  getMonitor(@Param('id') id: string) {
    return this.monitorsService.getMonitor(id);
  }

  @Delete(':id')
  deleteMonitor(@Param('id') id: string) {
    return this.monitorsService.deleteMonitor(id);
  }
}
