import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import {
  ContactDraftDto,
  ContactGroupMembershipDto,
  ContactRelationshipDto,
  MergeContactDto,
} from './dto/contact-draft.dto';
import { ContactsService } from './contacts.service';

@Controller('contacts')
export class ContactsController {
  constructor(private readonly contactsService: ContactsService) {}

  @Get()
  listContacts() {
    return this.contactsService.listContacts();
  }

  @Get('graph')
  getGraph() {
    return this.contactsService.getRelationshipGraph();
  }

  @Get('groups')
  listGroups() {
    return this.contactsService.listGroups();
  }

  @Get('export/vcf')
  async exportSelectedContacts(
    @Query('ids') ids = '',
    @Res({ passthrough: true }) res: Response,
  ) {
    const contactIds = ids
      .split(',')
      .map((id) => id.trim())
      .filter(Boolean);
    const vcf = await this.contactsService.exportContactsVcf(contactIds);
    res.setHeader('Content-Type', 'text/vcard; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="contacts.vcf"');
    return vcf;
  }

  @Get(':id')
  getContact(@Param('id') id: string) {
    return this.contactsService.getContact(id);
  }

  @Get(':id/vcf')
  async exportContact(
    @Param('id') id: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    const vcf = await this.contactsService.exportContactsVcf([id]);
    res.setHeader('Content-Type', 'text/vcard; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="contact.vcf"');
    return vcf;
  }

  @Post(':id/merge')
  mergeContact(@Param('id') id: string, @Body() draft: MergeContactDto) {
    return this.contactsService.mergeDraftIntoContact(id, draft);
  }

  @Post(':id/groups')
  addToGroup(
    @Param('id') id: string,
    @Body() group: ContactGroupMembershipDto,
  ) {
    return this.contactsService.addContactToGroup(id, group);
  }

  @Post(':id/relationships')
  createRelationship(
    @Param('id') id: string,
    @Body() relationship: ContactRelationshipDto,
  ) {
    return this.contactsService.createRelationship(id, relationship);
  }

  @Post('duplicates/check')
  checkDuplicates(@Body() draft: ContactDraftDto) {
    return this.contactsService.checkDuplicates(draft);
  }

  @Post()
  createContact(@Body() draft: ContactDraftDto) {
    return this.contactsService.createContact(draft);
  }

  @Delete(':id')
  deleteContact(@Param('id') id: string) {
    return this.contactsService.deleteContact(id);
  }
}
