import {
  IsArray,
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

class ContactPhoneDraftDto {
  @IsString()
  label!: string;

  @IsString()
  number!: string;

  @IsOptional()
  @IsString()
  normalizedNumber?: string;
}

export class ContactDraftDto {
  @IsOptional()
  @IsString()
  fullName?: string;

  @IsOptional()
  @IsString()
  designation?: string;

  @IsOptional()
  @IsString()
  company?: string;

  @IsOptional()
  @IsString()
  relationshipToUser?: string;

  @IsOptional()
  @IsArray()
  @IsEmail({}, { each: true })
  @IsString({ each: true })
  emails?: string[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ContactPhoneDraftDto)
  phones?: ContactPhoneDraftDto[];

  @IsOptional()
  @IsString()
  website?: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsIn(['business_card', 'voice', 'manual'])
  sourceType!: 'business_card' | 'voice' | 'manual';
}

export class MergeContactDto extends ContactDraftDto {}

export class ContactRelationshipDto {
  @IsString()
  toContactId!: string;

  @IsIn([
    'referral',
    'relative',
    'father',
    'mother',
    'son',
    'daughter',
    'guardian',
    'work_partner',
  ])
  relationshipType!:
    | 'referral'
    | 'relative'
    | 'father'
    | 'mother'
    | 'son'
    | 'daughter'
    | 'guardian'
    | 'work_partner';
}

export class ContactGroupMembershipDto {
  @IsString()
  name!: string;

  @IsOptional()
  @IsString()
  role?: string;
}
