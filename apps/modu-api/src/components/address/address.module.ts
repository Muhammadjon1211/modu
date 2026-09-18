import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import AddressSchema from '../../schemas/Address.model';
import { AddressResolver } from './address.resolver';
import { AddressService } from './address.service';
import { AuthModule } from '../auth/auth.module';

@Module({
	imports: [MongooseModule.forFeature([{ name: 'Address', schema: AddressSchema }]), AuthModule],
	providers: [AddressResolver, AddressService],
	exports: [AddressService],
})
export class AddressModule {}
