import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ContactsModule } from './contacts/contacts.module';
import { DatabaseModule } from './db/database.module';
import { ExtractionsModule } from './extractions/extractions.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    DatabaseModule,
    ContactsModule,
    ExtractionsModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
