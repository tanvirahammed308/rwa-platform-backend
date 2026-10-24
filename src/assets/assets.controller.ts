
import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Patch,
  Delete,
} from '@nestjs/common';

import { AssetsService } from './assets.service.js';
import { CreateAssetDto } from './dto/create-asset.dto.js';
import { UpdateAssetDto } from './dto/update-asset.dto.js';
import { UpdateAssetStatusDto } from './dto/update-asset-status.dto.js';

@Controller('assets')
export class AssetsController {
  constructor(private readonly assetsService: AssetsService) {}

  @Get()
  findAll() {
    return this.assetsService.findAll();
  }

  @Post()
  create(@Body() createAssetDto: CreateAssetDto) {
    return this.assetsService.create(createAssetDto);
  }

   @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() updateAssetDto: UpdateAssetDto,
  ) {
    return this.assetsService.update(id, updateAssetDto);
  }

  @Delete(':id')
remove(@Param('id') id: string) {
  return this.assetsService.remove(id);
}


@Patch(':id/status')
updateStatus(
  @Param('id') id: string,
  @Body() updateAssetStatusDto: UpdateAssetStatusDto,
) {
  return this.assetsService.updateStatus(
    id,
    updateAssetStatusDto,
  );
}

}
